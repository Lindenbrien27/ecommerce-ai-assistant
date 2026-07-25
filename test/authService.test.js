const test = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../src/services/orderService');
const { verifyCustomer, issueToken, verifyToken } = require('../src/services/authService');

test('verifyCustomer returns the canonical stored email when order number + email match', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async () => ({
    order_number: 'ORD-1001',
    customer_email: 'Jane@Example.com',
  }));

  const result = await verifyCustomer('ORD-1001', 'jane@example.com');
  assert.equal(result, 'Jane@Example.com');
});

test('verifyCustomer returns null when the email does not match', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async () => ({
    order_number: 'ORD-1001',
    customer_email: 'jane@example.com',
  }));

  const result = await verifyCustomer('ORD-1001', 'someone-else@example.com');
  assert.equal(result, null);
});

test('verifyCustomer returns null when the order does not exist', async (t) => {
  t.mock.method(orderService, 'getOrderByNumber', async () => null);

  const result = await verifyCustomer('NOPE', 'jane@example.com');
  assert.equal(result, null);
});

test('issueToken/verifyToken round-trip carries the email', () => {
  const token = issueToken('jane@example.com');
  const payload = verifyToken(token);
  assert.equal(payload.email, 'jane@example.com');
});

test('verifyToken throws on a tampered token', () => {
  const token = issueToken('jane@example.com');
  assert.throws(() => verifyToken(`${token}tampered`));
});
