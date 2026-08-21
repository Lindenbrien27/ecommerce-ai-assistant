const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const adminOrderService = require('../src/services/adminOrderService');

test.beforeEach(() => orderCache.clear());

test('getAdminOrders queries across all customers with no email filter', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    assert.doesNotMatch(sql, /customer_email = \$/);
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '1' }] };
    assert.match(sql, /ORDER BY created_at DESC, id DESC/);
    return { rows: [{ order_number: 'ORD-1001' }] };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders();
  assert.equal(orders.length, 1);
  assert.equal(total, 1);
  assert.equal(page, 1);
  assert.equal(pageSize, 20);
});

test('getAdminOrders filters by status when provided', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /status = \$1/);
    assert.equal(params[0], 'shipped');
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminOrderService.getAdminOrders({ status: 'shipped' });
});

test('getAdminOrders rejects a status that is not one of the five real values', async (t) => {
  await assert.rejects(adminOrderService.getAdminOrders({ status: 'pending' }));
});

test('getAdminOrders searches order_number and customer_email with q', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /order_number ILIKE/);
    assert.match(sql, /customer_email ILIKE/);
    assert.ok(params.includes('%ORD-1001%'));
    return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
  });

  await adminOrderService.getAdminOrders({ q: 'ORD-1001' });
});

test('getAdminOrders paginates using LIMIT/OFFSET derived from page and pageSize', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '5' }] };
    assert.match(sql, /LIMIT \$3 OFFSET \$4/);
    assert.deepEqual(params.slice(2), [2, 2]);
    return {
      rows: [
        { order_number: 'ORD-1002', created_at: '2026-01-02T00:00:00Z', id: 2 },
        { order_number: 'ORD-1001', created_at: '2026-01-01T00:00:00Z', id: 1 },
      ],
    };
  });

  const { orders, total, page, pageSize } = await adminOrderService.getAdminOrders({ page: 2, pageSize: 2 });
  assert.equal(orders.length, 2);
  assert.equal(total, 5);
  assert.equal(page, 2);
  assert.equal(pageSize, 2);
});

test('getAdminOrders clamps pageSize to MAX_PAGE_SIZE and page to at least 1', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: '0' }] };
    assert.deepEqual(params.slice(2), [100, 0]);
    return { rows: [] };
  });

  const { page, pageSize } = await adminOrderService.getAdminOrders({ page: 0, pageSize: 999 });
  assert.equal(page, 1);
  assert.equal(pageSize, 100);
});

test('getAdminOrders is not cached - two identical calls query the database four times (count + select, twice)', async (t) => {
  const query = t.mock.method(pool, 'query', async (sql) =>
    (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] })
  );

  await adminOrderService.getAdminOrders();
  await adminOrderService.getAdminOrders();

  assert.equal(query.mock.callCount(), 4);
});

test('updateOrderStatus rejects a status outside the five real values', async (t) => {
  await assert.rejects(adminOrderService.updateOrderStatus('ORD-1001', 'pending'));
});

test('updateOrderStatus runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET status = \$1 WHERE order_number = \$2/);
    assert.deepEqual(params, ['shipped', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', status: 'shipped' }] };
  });

  const order = await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');
  assert.equal(order.status, 'shipped');
});

test('updateOrderStatus returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderStatus('NOPE', 'shipped');
  assert.equal(order, null);
});

test('updateOrderStatus invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'processing' });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped' }],
  }));

  await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');

  assert.equal(orderCache.has('order:ORD-1001'), false);
});

test('updateOrderStatus also invalidates that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'processing' });
  orderCache.set('list:jane.doe@example.com:20:', { orders: [{ order_number: 'ORD-1001', status: 'processing' }], nextCursor: null });
  orderCache.set('list:someone.else@example.com:20:', { orders: [], nextCursor: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', status: 'shipped', customer_email: 'jane.doe@example.com' }],
  }));

  await adminOrderService.updateOrderStatus('ORD-1001', 'shipped');

  assert.equal(orderCache.has('list:jane.doe@example.com:20:'), false);
  assert.equal(orderCache.has('list:someone.else@example.com:20:'), true);
});

test('updateOrderShipping runs the UPDATE and returns the updated row', async (t) => {
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /UPDATE orders SET carrier = \$1, tracking_number = \$2 WHERE order_number = \$3/);
    assert.deepEqual(params, ['UPS', '1Z999AA10123456784', 'ORD-1001']);
    return { rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }] };
  });

  const order = await adminOrderService.updateOrderShipping('ORD-1001', {
    carrier: 'UPS',
    trackingNumber: '1Z999AA10123456784',
  });
  assert.equal(order.carrier, 'UPS');
});

test('updateOrderShipping returns null when the order number does not exist', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const order = await adminOrderService.updateOrderShipping('NOPE', { carrier: 'UPS', trackingNumber: '123' });
  assert.equal(order, null);
});

test('updateOrderShipping invalidates the shared orderCache entry for that order number', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', carrier: null, tracking_number: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999AA10123456784' }],
  }));

  await adminOrderService.updateOrderShipping('ORD-1001', { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' });

  assert.equal(orderCache.has('order:ORD-1001'), false);
});

test('updateOrderShipping also invalidates that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('list:jane.doe@example.com:20:', { orders: [{ order_number: 'ORD-1001', carrier: null }], nextCursor: null });
  t.mock.method(pool, 'query', async () => ({
    rows: [{ order_number: 'ORD-1001', carrier: 'UPS', tracking_number: '1Z999', customer_email: 'jane.doe@example.com' }],
  }));

  await adminOrderService.updateOrderShipping('ORD-1001', { carrier: 'UPS', trackingNumber: '1Z999' });

  assert.equal(orderCache.has('list:jane.doe@example.com:20:'), false);
});

test("ORDER_STATUSES deliberately excludes 'returned' so the status-PATCH dropdown can never set it", () => {

  assert.ok(!adminOrderService.ORDER_STATUSES.includes('returned'));
});

const EXISTING_ORDER = {
  order_number: 'ORD-1001',
  customer_email: 'jane@example.com',
  product_name: 'Sneakers',
  status: 'delivered',
  unit_price_cents: 5000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
  refunded_at: null,
};

const REFUNDED_ORDER_ROW = {
  ...EXISTING_ORDER,
  status: 'returned',
  refund_amount_cents: 5500,
  restocked: false,
  refunded_at: '2026-01-02T00:00:00Z',
};

function mockRefundTransaction(t, handler) {
  const tx = { statements: [], began: false, committed: false, rolledBack: false, released: false };
  const client = {
    query: async (sql, params) => {
      const trimmed = sql.trim();
      if (trimmed === 'BEGIN') {
        tx.began = true;
        return { rows: [] };
      }
      if (trimmed === 'COMMIT') {
        tx.committed = true;
        return { rows: [] };
      }
      if (trimmed === 'ROLLBACK') {
        tx.rolledBack = true;
        return { rows: [] };
      }
      tx.statements.push(trimmed);
      return handler(trimmed, params);
    },
    release: () => {
      tx.released = true;
    },
  };
  t.mock.method(pool, 'connect', async () => client);
  return tx;
}

function defaultRefundHandler(sql) {
  if (/AND refunded_at IS NULL/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW }] };
  if (/^UPDATE products/.test(sql)) return { rows: [{ slug: 'sneakers' }] };
  if (/restocked = true/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW, restocked: true }] };
  return { rows: [] };
}

function mockOrderSelect(t, row = EXISTING_ORDER) {
  return t.mock.method(pool, 'query', async (sql) => {
    assert.match(sql.trim(), /^SELECT \* FROM orders/, `refundOrder should only use pool.query for the initial SELECT, got: ${sql}`);
    return { rows: row ? [row] : [] };
  });
}

test('refundOrder returns null for an unknown order number', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  const result = await adminOrderService.refundOrder('NOPE', { amountCents: 100, restock: false, reason: null });
  assert.equal(result, null);
});

test('refundOrder rejects a second refund on an already-refunded order', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rows: [{ ...EXISTING_ORDER, refunded_at: '2026-01-01T00:00:00Z' }],
  }));

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 100, restock: false, reason: null }),
    adminOrderService.ConflictError
  );
});

test('refundOrder rejects refunding a cancelled order', async (t) => {
  mockOrderSelect(t, { ...EXISTING_ORDER, status: 'cancelled' });
  t.mock.method(pool, 'connect', async () => assert.fail('should never open a transaction for a cancelled order'));

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null }),
    (err) => err instanceof adminOrderService.ValidationError && /cancelled/i.test(err.message)
  );
});

test('refundOrder rejects an amount that exceeds the order total', async (t) => {
  mockOrderSelect(t);

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5501, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder rejects a non-positive amount', async (t) => {
  mockOrderSelect(t);

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 0, restock: false, reason: null }),
    adminOrderService.ValidationError
  );
});

test('refundOrder restocks when the product name still matches a live row', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, (sql, params) => {
    if (/AND refunded_at IS NULL/.test(sql)) {
      assert.match(sql, /status = 'returned'/);
      return { rows: [{ ...REFUNDED_ORDER_ROW }] };
    }
    if (/^UPDATE products/.test(sql)) {
      assert.match(sql, /stock_quantity = stock_quantity \+ 1/);
      assert.deepEqual(params, ['Sneakers']);
      return { rows: [{ slug: 'sneakers' }] };
    }
    if (/restocked = true/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW, restocked: true }] };
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: 'Item damaged' });
  assert.equal(updated.status, 'returned');
  assert.equal(updated.restocked, true);

  assert.equal(tx.statements.length, 3);
});

test('refundOrder restocks exactly one product when two share the same name', async (t) => {

  const products = [
    { slug: 'sneakers-white', name: 'Sneakers', stock_quantity: 7 },
    { slug: 'sneakers-black', name: 'Sneakers', stock_quantity: 3 },
  ];

  mockOrderSelect(t);
  mockRefundTransaction(t, (sql, params) => {
    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW }] };
    if (/^UPDATE products/.test(sql)) {

      assert.match(sql, /WHERE slug = \(SELECT slug FROM products WHERE name = \$1 ORDER BY slug LIMIT 1\)/);
      const matched = products
        .filter((p) => p.name === params[0])
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .slice(0, 1);
      for (const p of matched) p.stock_quantity += 1;
      return { rows: matched.map((p) => ({ slug: p.slug })) };
    }
    if (/restocked = true/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW, restocked: true }] };
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });
  assert.equal(updated.restocked, true);
  assert.deepEqual(
    products.map((p) => p.stock_quantity),
    [7, 4]
  );
});

test('refundOrder reports restocked:false without erroring when the product name matches nothing', async (t) => {
  mockOrderSelect(t);
  mockRefundTransaction(t, (sql) => {
    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW }] };
    if (/^UPDATE products/.test(sql)) return { rows: [] };
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });
  assert.equal(updated.restocked, false);
});

test('refundOrder does not attempt to restock when restock is false', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, (sql) => {
    assert.doesNotMatch(sql, /UPDATE products/);
    return { rows: [{ ...REFUNDED_ORDER_ROW, refund_amount_cents: 2000 }] };
  });

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });
  assert.equal(tx.statements.length, 1);
});

test('refundOrder wraps its writes in a committed transaction and always releases the client', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, defaultRefundHandler);

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });

  assert.equal(tx.began, true);
  assert.equal(tx.committed, true);
  assert.equal(tx.rolledBack, false);
  assert.equal(tx.released, true);
});

test('refundOrder rolls back (and releases) when a write inside the transaction fails', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, (sql) => {
    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW }] };
    if (/^UPDATE products/.test(sql)) throw new Error('connection reset mid-restock');
    return { rows: [] };
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null }),
    /connection reset mid-restock/
  );

  assert.equal(tx.committed, false);
  assert.equal(tx.rolledBack, true);
  assert.equal(tx.released, true);
});

test('refundOrder invalidates the order cache and that customer\'s cached order-history list entries', async (t) => {
  orderCache.set('order:ORD-1001', { order_number: 'ORD-1001', status: 'delivered' });
  orderCache.set('list:jane@example.com:20:', { orders: [], nextCursor: null });
  orderCache.set('list:someone.else@example.com:20:', { orders: [], nextCursor: null });

  mockOrderSelect(t);
  mockRefundTransaction(t, defaultRefundHandler);

  await adminOrderService.refundOrder('ORD-1001', { amountCents: 2000, restock: false, reason: null });

  assert.equal(orderCache.has('order:ORD-1001'), false);
  assert.equal(orderCache.has('list:jane@example.com:20:'), false);
  assert.equal(orderCache.has('list:someone.else@example.com:20:'), true);
});

test('refundOrder guards the UPDATE with refunded_at IS NULL to prevent concurrent refunds', async (t) => {
  mockOrderSelect(t);
  mockRefundTransaction(t, (sql) => {

    assert.match(sql, /AND refunded_at IS NULL/);
    return { rows: [{ ...REFUNDED_ORDER_ROW }] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: false, reason: null });
  assert.equal(updated.status, 'returned');
});

test('refundOrder throws ConflictError and rolls back when the guarded UPDATE matches 0 rows (concurrent refund)', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, (sql) => {

    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [] };
    return { rows: [] };
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: false, reason: null }),
    adminOrderService.ConflictError
  );

  assert.equal(tx.committed, false);
  assert.equal(tx.rolledBack, true);
  assert.equal(tx.released, true);
});

test('refundOrder does not attempt to restock if the guarded order UPDATE fails (concurrent refund)', async (t) => {
  mockOrderSelect(t);
  const tx = mockRefundTransaction(t, (sql) => {
    if (/AND refunded_at IS NULL/.test(sql)) return { rows: [] };

    assert.fail(`Unexpected query after guarded UPDATE failure: ${sql}`);
  });

  await assert.rejects(
    adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null }),
    adminOrderService.ConflictError
  );

  assert.equal(tx.statements.length, 1);
});

test('refundOrder issues the products UPDATE only after the guarded order UPDATE succeeds', async (t) => {
  mockOrderSelect(t);
  let orderUpdateSeen = false;
  const tx = mockRefundTransaction(t, (sql) => {
    if (/AND refunded_at IS NULL/.test(sql)) {
      orderUpdateSeen = true;
      return { rows: [{ ...REFUNDED_ORDER_ROW }] };
    }
    if (/^UPDATE products/.test(sql)) {
      assert.ok(orderUpdateSeen, 'products UPDATE must run after guarded order UPDATE');
      return { rows: [{ slug: 'sneakers' }] };
    }
    if (/restocked = true/.test(sql)) return { rows: [{ ...REFUNDED_ORDER_ROW, restocked: true }] };
    return { rows: [] };
  });

  const updated = await adminOrderService.refundOrder('ORD-1001', { amountCents: 5500, restock: true, reason: null });
  assert.equal(updated.restocked, true);

  assert.equal(tx.statements.length, 3);
});
