const { pool } = require('../config/db');
const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('./orderService');

const REQUIRED_FIELDS = ['slug', 'name', 'category', 'price_cents', 'sku'];

// slug is both the primary key and the literal path segment in
// /api/products/:slug, /admin/products/:slug/edit, and /shop/:productId -
// lowercase alphanumeric segments joined by single hyphens, matching every
// existing seeded slug (e.g. 'cloud-shift-runner'). Anything else (a `/`,
// whitespace, `?`, `#`, `%`, uppercase, ...) would create a row that's
// permanently unreachable through any of those routes.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class ValidationError extends Error {}
class ConflictError extends Error {
  constructor(field) {
    super(`${field} already exists`);
    this.field = field;
  }
}

function validateCreateFields(fields) {
  for (const key of REQUIRED_FIELDS) {
    if (fields[key] === undefined || fields[key] === null || fields[key] === '') {
      throw new ValidationError(`${key} is required.`);
    }
  }
  if (!SLUG_PATTERN.test(fields.slug)) {
    throw new ValidationError("slug must be lowercase alphanumeric with hyphens (e.g. 'my-product')");
  }
  validateNumericFields(fields);
}

function validateNumericFields(fields) {
  if (fields.price_cents !== undefined && (!Number.isInteger(fields.price_cents) || fields.price_cents < 0)) {
    throw new ValidationError('price_cents must be a non-negative integer.');
  }
  if (
    fields.stock_quantity !== undefined &&
    (!Number.isInteger(fields.stock_quantity) || fields.stock_quantity < 0)
  ) {
    throw new ValidationError('stock_quantity must be a non-negative integer.');
  }
}

// A UNIQUE-violation's constraint name tells us which column collided -
// "products_pkey" is the slug's primary key, anything else with "sku" in
// its name is the sku's own UNIQUE constraint - so a create/update against
// either can surface a specific, distinguishable error rather than a
// generic "something already exists".
function mapUniqueViolation(err) {
  if (err.code === '23505') {
    if (err.constraint && err.constraint.includes('sku')) return new ConflictError('sku');
    return new ConflictError('slug');
  }
  return err;
}

// Admin-only, paginated - deliberately separate from productService.js's
// getProducts(), which the storefront needs to return the *entire*
// catalog unpaginated (ProductsContext resolves arbitrary productIds
// against it for the cart/wishlist, ShopPage needs every category
// present for its own filter). Sharing one function between "give me
// everything" and "give me a page" callers would force one of them to
// compromise.
async function getAdminProducts({ q = null, category = null, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const clampedPageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const clampedPage = Math.max(1, page);
  const offset = (clampedPage - 1) * clampedPageSize;
  const searchTerm = q ? `%${q}%` : null;

  // No WHERE clause here, deliberately - the category filter dropdown
  // should always offer every real category, not just the ones that
  // happen to survive whatever filter is currently applied.
  const categoriesResult = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
  const categories = categoriesResult.rows.map((row) => row.category);

  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2 OR category ILIKE $2)`,
    [category, searchTerm]
  );
  const total = Number(countResult.rows[0].total);

  const { rows: products } = await pool.query(
    `SELECT * FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE $2 OR sku ILIKE $2 OR category ILIKE $2)
     ORDER BY name ASC, slug ASC
     LIMIT $3 OFFSET $4`,
    [category, searchTerm, clampedPageSize, offset]
  );

  return { products, total, page: clampedPage, pageSize: clampedPageSize, categories };
}

async function createProduct(fields) {
  validateCreateFields(fields);
  try {
    const { rows } = await pool.query(
      `INSERT INTO products (slug, name, description, category, price_cents, original_price_cents, cover_image_url, icon, sku, stock_quantity, colorways)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        fields.slug,
        fields.name,
        fields.description ?? null,
        fields.category,
        fields.price_cents,
        fields.original_price_cents ?? null,
        fields.cover_image_url ?? null,
        fields.icon ?? null,
        fields.sku,
        fields.stock_quantity ?? 0,
        JSON.stringify(fields.colorways ?? []),
      ]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

// Fetches the current row first and merges - PATCH accepts any subset of
// fields, and a plain SQL UPDATE with unconditional SET clauses would
// overwrite every unlisted field with NULL/undefined. slug itself is never
// updatable (it's the URL/primary-key identifier); a PATCH changes a
// product's other attributes, not its identity.
async function updateProduct(slug, fields) {
  validateNumericFields(fields);

  const existing = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  if (existing.rows.length === 0) return null;
  const current = existing.rows[0];

  const merged = {
    name: fields.name ?? current.name,
    description: fields.description !== undefined ? fields.description : current.description,
    category: fields.category ?? current.category,
    price_cents: fields.price_cents ?? current.price_cents,
    original_price_cents:
      fields.original_price_cents !== undefined ? fields.original_price_cents : current.original_price_cents,
    cover_image_url: fields.cover_image_url !== undefined ? fields.cover_image_url : current.cover_image_url,
    icon: fields.icon !== undefined ? fields.icon : current.icon,
    sku: fields.sku ?? current.sku,
    stock_quantity: fields.stock_quantity ?? current.stock_quantity,
    colorways: fields.colorways !== undefined ? fields.colorways : current.colorways,
  };

  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = $1, description = $2, category = $3, price_cents = $4, original_price_cents = $5,
         cover_image_url = $6, icon = $7, sku = $8, stock_quantity = $9, colorways = $10, updated_at = now()
       WHERE slug = $11
       RETURNING *`,
      [
        merged.name,
        merged.description,
        merged.category,
        merged.price_cents,
        merged.original_price_cents,
        merged.cover_image_url,
        merged.icon,
        merged.sku,
        merged.stock_quantity,
        JSON.stringify(merged.colorways),
        slug,
      ]
    );
    return rows[0];
  } catch (err) {
    throw mapUniqueViolation(err);
  }
}

async function deleteProduct(slug) {
  const { rows } = await pool.query('DELETE FROM products WHERE slug = $1 RETURNING slug', [slug]);
  return rows.length > 0;
}

module.exports = { createProduct, updateProduct, deleteProduct, getAdminProducts, ValidationError, ConflictError };
