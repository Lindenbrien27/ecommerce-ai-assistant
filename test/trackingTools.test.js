const test = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../src/services/orderService');
const { definitions, implementations } = require('../src/tools/trackingTools');

test('exposes exactly the three expected tool definitions', () => {
  const names = definitions.map((d) => d.name).sort();
  assert.deepEqual(names, ['get_my_orders', 'get_order_by_number', 'get_order_by_tracking_number']);
});

test('get_order_by_number returns the order when it belongs to the authenticated customer', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async (orderNumber) => {
    assert.equal(orderNumber, 'ORD-1001');
    return { order_number: 'ORD-1001', customer_email: 'jane@example.com' };
  });

  const result = await implementations.get_order_by_number(
    { orderNumber: 'ORD-1001' },
    { customerEmail: 'jane@example.com' }
  );
  assert.equal(result.order_number, 'ORD-1001');
});

test('get_order_by_number returns null when the order belongs to a different customer', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async () => ({
    order_number: 'ORD-1001',
    customer_email: 'jane@example.com',
  }));

  const result = await implementations.get_order_by_number(
    { orderNumber: 'ORD-1001' },
    { customerEmail: 'someone-else@example.com' }
  );
  assert.equal(result, null);
});

test('get_order_by_number returns null when the order does not exist', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async () => null);

  const result = await implementations.get_order_by_number(
    { orderNumber: 'NOPE' },
    { customerEmail: 'jane@example.com' }
  );
  assert.equal(result, null);
});

test("get_my_orders always uses the authenticated customer's email, ignoring any model input", async (t) => {
  t.mock.method(orderService, 'getOrdersByEmail', async (email) => {
    assert.equal(email, 'jane@example.com');
    return [{ order_number: 'ORD-1001' }];
  });

  const result = await implementations.get_my_orders({}, { customerEmail: 'jane@example.com' });
  assert.equal(result.length, 1);
});

test('get_order_by_tracking_number returns the order when it belongs to the authenticated customer', async (t) => {
  t.mock.method(orderService, 'getOrderByTrackingNumber', async (trackingNumber) => {
    assert.equal(trackingNumber, '1Z999AA10123456784');
    return { tracking_number: '1Z999AA10123456784', customer_email: 'jane@example.com' };
  });

  const result = await implementations.get_order_by_tracking_number(
    { trackingNumber: '1Z999AA10123456784' },
    { customerEmail: 'jane@example.com' }
  );
  assert.equal(result.tracking_number, '1Z999AA10123456784');
});

test('get_order_by_tracking_number returns null when the order belongs to a different customer', async (t) => {
  t.mock.method(orderService, 'getOrderByTrackingNumber', async () => ({
    tracking_number: '1Z999AA10123456784',
    customer_email: 'jane@example.com',
  }));

  const result = await implementations.get_order_by_tracking_number(
    { trackingNumber: '1Z999AA10123456784' },
    { customerEmail: 'someone-else@example.com' }
  );
  assert.equal(result, null);
});
