const { pool } = require('../config/db');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

// status/available/days_of_cover are derived per row, never stored - same
// reasoning as adminProductService's own stockBadge equivalent on the
// frontend, just computed here in SQL since every one of the 3 endpoints
// below needs it (the frontend's per-page stockBadge() only had one caller).
const ITEM_COLUMNS = `
  i.id, i.product_slug, p.name AS product_name, p.category, p.icon, p.price_cents,
  l.id AS location_id, l.name AS location_name,
  i.sku_code, i.on_hand, i.allocated, (i.on_hand - i.allocated) AS available,
  i.reorder_point, i.avg_daily_units_sold,
  CASE WHEN i.avg_daily_units_sold > 0 THEN i.on_hand / i.avg_daily_units_sold ELSE NULL END AS days_of_cover,
  CASE
    WHEN i.on_hand = 0 THEN 'out_of_stock'
    WHEN (i.on_hand - i.allocated) <= i.reorder_point THEN 'low_stock'
    ELSE 'in_stock'
  END AS status,
  s.id AS supplier_id, s.name AS supplier_name, s.lead_time_days
`;

const ITEM_JOINS = `
  FROM inventory_items i
  JOIN products p ON p.slug = i.product_slug
  JOIN inventory_locations l ON l.id = i.location_id
  LEFT JOIN suppliers s ON s.id = i.supplier_id
`;

function clamp({ page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE),
  };
}

async function getStockLedger({ q = null, category = null, location = null, supplier = null, status = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const categoriesResult = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  const locationsResult = await pool.query('SELECT id, name FROM inventory_locations ORDER BY name');
  const suppliersResult = await pool.query('SELECT id, name FROM suppliers ORDER BY name');

  const where = `
    WHERE ($1::text IS NULL OR p.category = $1)
      AND ($2::int IS NULL OR l.id = $2)
      AND ($3::int IS NULL OR s.id = $3)
      AND ($4::text IS NULL OR p.name ILIKE $4 OR i.sku_code ILIKE $4)
      AND (
        $5::text IS NULL
        OR ($5 = 'out_of_stock' AND i.on_hand = 0)
        OR ($5 = 'low_stock' AND i.on_hand > 0 AND (i.on_hand - i.allocated) <= i.reorder_point)
        OR ($5 = 'in_stock' AND i.on_hand > 0 AND (i.on_hand - i.allocated) > i.reorder_point)
      )
  `;
  const params = [category, location, supplier, searchTerm, status];

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${ITEM_JOINS} ${where}`, params);
  const total = Number(countResult.rows[0].total);

  const { rows: items } = await pool.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_JOINS} ${where} ORDER BY p.name ASC, l.name ASC LIMIT $6 OFFSET $7`,
    [...params, clamped.pageSize, offset]
  );

  // Stats are computed over the *entire* inventory_items table, not the
  // filtered set - the reference design's stat cards don't move when the
  // table below them is filtered, same as AdminProductsPage's category
  // dropdown always listing every real category regardless of the current
  // filter (see that file's own comment on why).
  const statsResult = await pool.query(`
    SELECT
      COALESCE(SUM(on_hand) FILTER (WHERE avg_daily_units_sold > 0), 0) / NULLIF(SUM(avg_daily_units_sold) FILTER (WHERE avg_daily_units_sold > 0), 0) AS days_of_cover,
      COUNT(*) FILTER (WHERE (on_hand - allocated) <= reorder_point) AS reorder_risk_count,
      COUNT(*) AS total_skus,
      COALESCE(SUM(on_hand), 0) AS units_on_hand,
      COALESCE(SUM(allocated), 0) AS allocated,
      COUNT(*) FILTER (WHERE on_hand = 0) AS out_of_stock_count,
      COUNT(*) FILTER (WHERE on_hand > 0 AND (on_hand - allocated) <= reorder_point) AS low_stock_count,
      COUNT(*) FILTER (WHERE on_hand > 0 AND (on_hand - allocated) > reorder_point) AS in_stock_count
    FROM inventory_items
  `);
  const statsRow = statsResult.rows[0];
  const stockValueResult = await pool.query(`
    SELECT COALESCE(SUM(i.on_hand * p.price_cents), 0) AS total_stock_value_cents
    FROM inventory_items i JOIN products p ON p.slug = i.product_slug
  `);
  const avgLeadTimeResult = await pool.query('SELECT COALESCE(AVG(lead_time_days), 0) AS avg_lead_time_days FROM suppliers');

  return {
    items,
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    categories: categoriesResult.rows.map((r) => r.category),
    locations: locationsResult.rows,
    suppliers: suppliersResult.rows,
    stats: {
      days_of_cover: statsRow.days_of_cover === null ? null : Number(statsRow.days_of_cover),
      avg_lead_time_days: Number(avgLeadTimeResult.rows[0].avg_lead_time_days),
      reorder_risk_count: Number(statsRow.reorder_risk_count),
      total_skus: Number(statsRow.total_skus),
      units_on_hand: Number(statsRow.units_on_hand),
      allocated: Number(statsRow.allocated),
      total_stock_value_cents: Number(stockValueResult.rows[0].total_stock_value_cents),
      out_of_stock_count: Number(statsRow.out_of_stock_count),
      low_stock_count: Number(statsRow.low_stock_count),
      in_stock_count: Number(statsRow.in_stock_count),
    },
  };
}

async function getReorderQueue({ q = null, urgency = null, supplier = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const suppliersResult = await pool.query('SELECT id, name FROM suppliers ORDER BY name');

  const where = `
    WHERE (i.on_hand - i.allocated) <= i.reorder_point
      AND ($1::int IS NULL OR s.id = $1)
      AND ($2::text IS NULL OR p.name ILIKE $2 OR i.sku_code ILIKE $2)
      AND (
        $3::text IS NULL
        OR ($3 = 'out_of_stock' AND i.on_hand = 0)
        OR ($3 = 'low_stock' AND i.on_hand > 0)
      )
  `;
  const params = [supplier, searchTerm, urgency];

  const countResult = await pool.query(`SELECT COUNT(*) AS total ${ITEM_JOINS} ${where}`, params);
  const total = Number(countResult.rows[0].total);

  const { rows: rawItems } = await pool.query(
    `SELECT ${ITEM_COLUMNS} ${ITEM_JOINS} ${where}
     ORDER BY (i.reorder_point - (i.on_hand - i.allocated)) DESC, p.name ASC
     LIMIT $4 OFFSET $5`,
    [...params, clamped.pageSize, offset]
  );
  const items = rawItems.map((item) => {
    const deficit = Math.max(0, item.reorder_point - item.available);
    const rawSuggested = item.reorder_point * 2 - item.available;
    const suggested_po_qty = Math.max(10, Math.round(rawSuggested / 10) * 10);
    return { ...item, deficit, suggested_po_qty };
  });

  const statsResult = await pool.query(`
    SELECT
      COUNT(*) AS needing_action_count,
      COUNT(*) FILTER (WHERE i.on_hand = 0) AS out_of_stock_count,
      COUNT(*) FILTER (WHERE i.on_hand > 0) AS low_stock_count,
      COALESCE(SUM((i.on_hand - i.allocated) * p.price_cents), 0) AS at_risk_value_cents
    ${ITEM_JOINS}
    WHERE (i.on_hand - i.allocated) <= i.reorder_point
  `);
  const statsRow = statsResult.rows[0];

  return {
    items,
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    suppliers: suppliersResult.rows,
    stats: {
      needing_action_count: Number(statsRow.needing_action_count),
      out_of_stock_count: Number(statsRow.out_of_stock_count),
      low_stock_count: Number(statsRow.low_stock_count),
      at_risk_value_cents: Number(statsRow.at_risk_value_cents),
    },
  };
}

async function getPurchaseOrders({ q = null, status = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clamped = clamp({ page, pageSize });
  const offset = (clamped.page - 1) * clamped.pageSize;
  const searchTerm = q ? `%${q}%` : null;

  const where = `
    WHERE ($1::text IS NULL OR po.status = $1)
      AND ($2::text IS NULL OR po.po_number ILIKE $2 OR s.name ILIKE $2)
  `;
  const params = [status, searchTerm];

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const { rows: purchaseOrders } = await pool.query(
    `SELECT
       po.id, po.po_number, s.name AS supplier_name, l.name AS receive_into_location,
       po.status, po.expected_date, po.received_date, po.created_at,
       COUNT(poi.id) AS item_count,
       COALESCE(SUM(poi.quantity), 0) AS total_units,
       COALESCE(SUM(poi.quantity * poi.unit_cost_cents), 0) AS total_cents
     FROM purchase_orders po
     JOIN suppliers s ON s.id = po.supplier_id
     JOIN inventory_locations l ON l.id = po.receive_into_location_id
     LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
     ${where}
     GROUP BY po.id, s.name, l.name
     ORDER BY po.created_at DESC
     LIMIT $3 OFFSET $4`,
    [...params, clamped.pageSize, offset]
  );

  const openCountResult = await pool.query("SELECT COUNT(*) AS total FROM purchase_orders WHERE status = 'draft'");

  return {
    purchaseOrders: purchaseOrders.map((po) => ({
      ...po,
      item_count: Number(po.item_count),
      total_units: Number(po.total_units),
      total_cents: Number(po.total_cents),
    })),
    total,
    page: clamped.page,
    pageSize: clamped.pageSize,
    openCount: Number(openCountResult.rows[0].total),
  };
}

module.exports = { getStockLedger, getReorderQueue, getPurchaseOrders };
