-- Up Migration

CREATE TABLE inventory_locations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  lead_time_days INTEGER NOT NULL
);

CREATE TABLE inventory_items (
  id SERIAL PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  sku_code TEXT NOT NULL UNIQUE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  allocated INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  avg_daily_units_sold NUMERIC NOT NULL DEFAULT 0,
  supplier_id INTEGER REFERENCES suppliers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_slug, location_id)
);

CREATE TABLE purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  receive_into_location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'received', 'cancelled')),
  expected_date DATE,
  received_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  quantity INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL
);

INSERT INTO inventory_locations (id, name) VALUES
  (1, 'Main Warehouse'), (2, 'East DC'), (3, 'Store-Brooklyn');
SELECT setval('inventory_locations_id_seq', 3);

INSERT INTO suppliers (id, name, lead_time_days) VALUES
  (1, 'Atlas Wholesale', 16), (2, 'Cedar Logistics', 12), (3, 'Harbor Supply Co.', 20);
SELECT setval('suppliers_id_seq', 3);

INSERT INTO inventory_items (id, product_slug, location_id, sku_code, on_hand, allocated, reorder_point, avg_daily_units_sold, supplier_id) VALUES
  (1, 'headphones', 1, 'AUD-HP-001-MW', 42, 4, 20, 1.8, 1),
  (2, 'headphones', 2, 'AUD-HP-001-EDC', 6, 1, 15, 1.2, 2),
  (3, 'keyboard', 1, 'PER-KB-002-MW', 18, 0, 12, 0.9, 1),
  (4, 'keyboard', 3, 'PER-KB-002-SB', 0, 0, 8, 0.5, 2),
  (5, 'chair', 1, 'WRK-CH-003-MW', 7, 1, 6, 0.3, 3),
  (6, 'chair', 2, 'WRK-CH-003-EDC', 12, 0, 5, 0.2, 3),
  (7, 'monitor', 1, 'DIS-MN-004-MW', 23, 3, 10, 0.8, 1),
  (8, 'monitor', 3, 'DIS-MN-004-SB', 0, 0, 6, 0.4, 2),
  (9, 'cable', 1, 'ACC-CB-005-MW', 156, 10, 40, 5.5, 3),
  (10, 'cable', 2, 'ACC-CB-005-EDC', 30, 2, 35, 3.0, 3),
  (11, 'cloud-shift-runner', 1, 'SNK-CS-006-MW', 31, 5, 15, 1.5, 1),
  (12, 'cloud-shift-runner', 3, 'SNK-CS-006-SB', 2, 0, 10, 0.7, 1);
SELECT setval('inventory_items_id_seq', 12);

INSERT INTO purchase_orders (id, po_number, supplier_id, receive_into_location_id, status, expected_date, received_date) VALUES
  (1, 'PO-1001', 1, 1, 'draft', '2026-09-05', NULL),
  (2, 'PO-1002', 2, 3, 'draft', '2026-09-02', NULL),
  (3, 'PO-1003', 3, 2, 'received', NULL, '2026-08-10'),
  (4, 'PO-1004', 2, 1, 'cancelled', '2026-08-15', NULL);
SELECT setval('purchase_orders_id_seq', 4);

INSERT INTO purchase_order_items (purchase_order_id, inventory_item_id, quantity, unit_cost_cents) VALUES
  (1, 2, 40, 9000),
  (1, 12, 30, 6200),
  (2, 4, 60, 5000),
  (3, 8, 20, 18000),
  (4, 10, 100, 800);

-- Down Migration

DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;
DROP TABLE IF EXISTS inventory_items;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS inventory_locations;
