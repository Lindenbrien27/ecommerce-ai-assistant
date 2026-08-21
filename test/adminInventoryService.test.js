const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const adminInventoryService = require('../src/services/adminInventoryService');

function sequentialMock(t, steps) {
  let i = 0;
  return t.mock.method(pool, 'query', async (sql, params) => {
    const step = steps[i];
    i += 1;
    assert.ok(step, `unexpected extra pool.query call #${i}: ${sql}`);
    if (step.match) assert.match(sql, step.match);
    if (step.assertParams) step.assertParams(params);
    return step.result;
  });
}

function stockLedgerSteps({ items = [], total = '0', category = null, location = null, supplier = null, searchTerm = null, status = null, pageSize, offset } = {}) {
  return [
    { match: /DISTINCT category/, result: { rows: [{ category: 'Audio' }, { category: 'Footwear' }] } },
    { match: /FROM inventory_locations/, result: { rows: [{ id: 1, name: 'Warehouse A' }, { id: 2, name: 'Warehouse B' }] } },
    { match: /SELECT id, name FROM suppliers/, result: { rows: [{ id: 1, name: 'Acme Supplies' }, { id: 2, name: 'Globex' }] } },
    {
      match: /COUNT\(\*\) AS total/,
      assertParams: (params) => {
        assert.deepEqual(params, [category, location, supplier, searchTerm, status]);
      },
      result: { rows: [{ total }] },
    },
    {
      match: /LIMIT \$6 OFFSET \$7/,
      assertParams: (params) => {
        assert.deepEqual(params, [category, location, supplier, searchTerm, status, pageSize, offset]);
      },
      result: { rows: items },
    },
    {
      match: /reorder_risk_count/,
      result: {
        rows: [{
          days_of_cover: '7.5',
          reorder_risk_count: '4',
          total_skus: '12',
          units_on_hand: '300',
          allocated: '50',
          out_of_stock_count: '2',
          low_stock_count: '3',
          in_stock_count: '7',
        }],
      },
    },
    { match: /total_stock_value_cents/, result: { rows: [{ total_stock_value_cents: '1234500' }] } },
    { match: /avg_lead_time_days/, result: { rows: [{ avg_lead_time_days: '6.5' }] } },
  ];
}

test('getStockLedger returns items, stats, categories/locations/suppliers unfiltered', async (t) => {

  const items = [
    { id: 1, sku_code: 'A-1', on_hand: 50, allocated: 10, available: 40, reorder_point: 20, avg_daily_units_sold: 5, days_of_cover: 10, status: 'in_stock' },
    { id: 2, sku_code: 'B-1', on_hand: 15, allocated: 5, available: 10, reorder_point: 20, avg_daily_units_sold: 3, days_of_cover: 5, status: 'low_stock' },
    { id: 3, sku_code: 'C-1', on_hand: 0, allocated: 0, available: 0, reorder_point: 10, avg_daily_units_sold: null, days_of_cover: null, status: 'out_of_stock' },
  ];
  sequentialMock(t, stockLedgerSteps({ items, total: '3', pageSize: 20, offset: 0 }));

  const result = await adminInventoryService.getStockLedger();

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].status, 'in_stock');
  assert.equal(result.items[0].available, 40);
  assert.equal(result.items[0].days_of_cover, 10);
  assert.equal(result.items[1].status, 'low_stock');
  assert.equal(result.items[1].available, 10);
  assert.equal(result.items[2].status, 'out_of_stock');
  assert.equal(result.items[2].days_of_cover, null);

  assert.equal(result.total, 3);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.deepEqual(result.categories, ['Audio', 'Footwear']);
  assert.deepEqual(result.locations, [{ id: 1, name: 'Warehouse A' }, { id: 2, name: 'Warehouse B' }]);
  assert.deepEqual(result.suppliers, [{ id: 1, name: 'Acme Supplies' }, { id: 2, name: 'Globex' }]);

  assert.deepEqual(result.stats, {
    days_of_cover: 7.5,
    avg_lead_time_days: 6.5,
    reorder_risk_count: 4,
    total_skus: 12,
    units_on_hand: 300,
    allocated: 50,
    total_stock_value_cents: 1234500,
    out_of_stock_count: 2,
    low_stock_count: 3,
    in_stock_count: 7,
  });
});

test('getStockLedger passes category/location/supplier/status/q filters through to query params', async (t) => {
  sequentialMock(t, stockLedgerSteps({
    total: '0',
    category: 'Audio',
    location: 2,
    supplier: 1,
    searchTerm: '%keyboard%',
    status: 'low_stock',
    pageSize: 20,
    offset: 0,
  }));

  await adminInventoryService.getStockLedger({ category: 'Audio', location: 2, supplier: 1, q: 'keyboard', status: 'low_stock' });
});

test('getStockLedger clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  sequentialMock(t, stockLedgerSteps({ total: '0', pageSize: 100, offset: 0 }));

  const result = await adminInventoryService.getStockLedger({ page: 0, pageSize: 999 });
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
});

test('getStockLedger derives LIMIT/OFFSET from page and pageSize', async (t) => {

  sequentialMock(t, stockLedgerSteps({ total: '30', pageSize: 5, offset: 10 }));

  const result = await adminInventoryService.getStockLedger({ page: 3, pageSize: 5 });
  assert.equal(result.page, 3);
  assert.equal(result.pageSize, 5);
});

function reorderQueueSteps({ items = [], total = '0', supplier = null, searchTerm = null, urgency = null, pageSize, offset } = {}) {
  return [
    { match: /SELECT id, name FROM suppliers/, result: { rows: [{ id: 1, name: 'Acme Supplies' }] } },
    {
      match: /COUNT\(\*\) AS total/,
      assertParams: (params) => {
        assert.deepEqual(params, [supplier, searchTerm, urgency]);
      },
      result: { rows: [{ total }] },
    },
    {
      match: /LIMIT \$4 OFFSET \$5/,
      assertParams: (params) => {
        assert.deepEqual(params, [supplier, searchTerm, urgency, pageSize, offset]);
      },
      result: { rows: items },
    },
    {
      match: /needing_action_count/,
      result: {
        rows: [{
          needing_action_count: '3',
          out_of_stock_count: '1',
          low_stock_count: '2',
          at_risk_value_cents: '98765',
        }],
      },
    },
  ];
}

test('getReorderQueue computes deficit and suggested_po_qty from reorder_point/available', async (t) => {

  const items = [
    { id: 1, sku_code: 'A-1', reorder_point: 20, available: 5, status: 'low_stock' },
    { id: 2, sku_code: 'B-1', reorder_point: 10, available: 10, status: 'low_stock' },
    { id: 3, sku_code: 'C-1', reorder_point: 50, available: -10, status: 'out_of_stock' },
  ];
  sequentialMock(t, reorderQueueSteps({ items, total: '3', pageSize: 20, offset: 0 }));

  const result = await adminInventoryService.getReorderQueue();

  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].deficit, 15);
  assert.equal(result.items[0].suggested_po_qty, 40);
  assert.equal(result.items[1].deficit, 0);
  assert.equal(result.items[1].suggested_po_qty, 10);
  assert.equal(result.items[2].deficit, 60);
  assert.equal(result.items[2].suggested_po_qty, 110);

  assert.equal(result.total, 3);
  assert.deepEqual(result.suppliers, [{ id: 1, name: 'Acme Supplies' }]);
  assert.deepEqual(result.stats, {
    needing_action_count: 3,
    out_of_stock_count: 1,
    low_stock_count: 2,
    at_risk_value_cents: 98765,
  });
});

test('getReorderQueue passes urgency/supplier/q filters through to query params', async (t) => {
  sequentialMock(t, reorderQueueSteps({
    total: '0',
    supplier: 2,
    searchTerm: '%widget%',
    urgency: 'out_of_stock',
    pageSize: 20,
    offset: 0,
  }));

  await adminInventoryService.getReorderQueue({ supplier: 2, q: 'widget', urgency: 'out_of_stock' });
});

test('getReorderQueue clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  sequentialMock(t, reorderQueueSteps({ total: '0', pageSize: 100, offset: 0 }));

  const result = await adminInventoryService.getReorderQueue({ page: -5, pageSize: 500 });
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
});

function purchaseOrdersSteps({ purchaseOrders = [], total = '0', status = null, searchTerm = null, pageSize, offset, openCount = '0' } = {}) {
  return [
    {
      match: /COUNT\(\*\) AS total/,
      assertParams: (params) => {
        assert.deepEqual(params, [status, searchTerm]);
      },
      result: { rows: [{ total }] },
    },
    {
      match: /LIMIT \$3 OFFSET \$4/,
      assertParams: (params) => {
        assert.deepEqual(params, [status, searchTerm, pageSize, offset]);
      },
      result: { rows: purchaseOrders },
    },
    { match: /status = 'draft'/, result: { rows: [{ total: openCount }] } },
  ];
}

test('getPurchaseOrders sums item_count/total_units/total_cents from line items', async (t) => {

  const purchaseOrders = [
    {
      id: 1,
      po_number: 'PO-1001',
      supplier_name: 'Acme Supplies',
      receive_into_location: 'Warehouse A',
      status: 'draft',
      item_count: '2',
      total_units: '15',
      total_cents: '250000',
    },
  ];
  sequentialMock(t, purchaseOrdersSteps({ purchaseOrders, total: '1', pageSize: 20, offset: 0, openCount: '2' }));

  const result = await adminInventoryService.getPurchaseOrders();

  assert.equal(result.purchaseOrders.length, 1);
  assert.equal(result.purchaseOrders[0].item_count, 2);
  assert.equal(result.purchaseOrders[0].total_units, 15);
  assert.equal(result.purchaseOrders[0].total_cents, 250000);
  assert.equal(result.total, 1);
  assert.equal(result.openCount, 2);
});

test('getPurchaseOrders passes status/q filters through to query params', async (t) => {
  sequentialMock(t, purchaseOrdersSteps({
    total: '0',
    status: 'ordered',
    searchTerm: '%acme%',
    pageSize: 20,
    offset: 0,
  }));

  await adminInventoryService.getPurchaseOrders({ status: 'ordered', q: 'acme' });
});

test('getPurchaseOrders clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  sequentialMock(t, purchaseOrdersSteps({ total: '0', pageSize: 100, offset: 0 }));

  const result = await adminInventoryService.getPurchaseOrders({ page: 0, pageSize: 250 });
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
});
