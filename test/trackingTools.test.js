const test = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../src/services/orderService');
const { definitions, implementations } = require('../src/tools/trackingTools');

test('exposes exactly the three expected tool definitions', () => {
  const names = definitions.map((d) => d.name).sort();
  assert.deepEqual(names, [
    'get_order_by_number',
    'get_order_by_tracking_number',
    'get_orders_by_email',
  ]);
});

test('get_order_by_number implementation delegates to orderService', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async (orderNumber) => {
    assert.equal(orderNumber, 'ORD-1001');
    return { order_number: 'ORD-1001' };
  });

  const result = await implementations.get_order_by_number({ orderNumber: 'ORD-1001' });
  assert.equal(result.order_number, 'ORD-1001');
});

test('get_orders_by_email implementation delegates to orderService', async (t) => {
  t.mock.method(orderService, 'getOrdersByEmail', async (email) => {
    assert.equal(email, 'jane.doe@example.com');
    return [{ order_number: 'ORD-1001' }];
  });

  const result = await implementations.get_orders_by_email({ email: 'jane.doe@example.com' });
  assert.equal(result.length, 1);
});

test('get_order_by_tracking_number implementation delegates to orderService', async (t) => {
  t.mock.method(orderService, 'getOrderByTrackingNumber', async (trackingNumber) => {
    assert.equal(trackingNumber, '1Z999AA10123456784');
    return { tracking_number: '1Z999AA10123456784' };
  });

  const result = await implementations.get_order_by_tracking_number({
    trackingNumber: '1Z999AA10123456784',
  });
  assert.equal(result.tracking_number, '1Z999AA10123456784');
});
