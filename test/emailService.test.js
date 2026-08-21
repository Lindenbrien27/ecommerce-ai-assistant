const test = require('node:test');
const assert = require('node:assert/strict');

const RESEND_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM'];
let saved;
test.beforeEach(() => {
  saved = Object.fromEntries(RESEND_KEYS.map((k) => [k, process.env[k]]));
  RESEND_KEYS.forEach((k) => delete process.env[k]);
});
test.afterEach(() => {
  RESEND_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  delete require.cache[require.resolve('../src/services/emailService')];
});

test('isConfigured is false when no RESEND_* vars are set', () => {
  const { isConfigured } = require('../src/services/emailService');
  assert.equal(isConfigured(), false);
});

test('isConfigured is false when only one RESEND_* var is set', () => {
  process.env.RESEND_API_KEY = 're_test_key';

  const { isConfigured } = require('../src/services/emailService');
  assert.equal(isConfigured(), false);
});

test('isConfigured is true when both RESEND_* vars are set', () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'noreply@example.com';
  const { isConfigured } = require('../src/services/emailService');
  assert.equal(isConfigured(), true);
});

test('sendOtpEmail returns false without attempting to send when not configured', async () => {
  const { sendOtpEmail } = require('../src/services/emailService');
  const sent = await sendOtpEmail('jane@example.com', '123456');
  assert.equal(sent, false);
});

test('sendShippingUpdateEmail returns false without attempting to send when not configured', async () => {
  const { sendShippingUpdateEmail } = require('../src/services/emailService');
  const sent = await sendShippingUpdateEmail('jane@example.com', {
    order_number: 'ORD-1001',
    product_name: 'Wireless Headphones',
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
  });
  assert.equal(sent, false);
});

test('sendShippingUpdateEmail sends with the right recipient and subject when configured', async (t) => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'noreply@example.com';

  const { Resend } = require('resend');
  const Emails = new Resend('x').emails.constructor;
  const send = t.mock.method(Emails.prototype, 'send', async () => ({ data: { id: 'email_123' }, error: null }));

  const { sendShippingUpdateEmail } = require('../src/services/emailService');
  const sent = await sendShippingUpdateEmail('jane@example.com', {
    order_number: 'ORD-1001',
    product_name: 'Wireless Headphones',
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
  });

  assert.equal(sent, true);
  assert.equal(send.mock.callCount(), 1);
  const args = send.mock.calls[0].arguments[0];
  assert.equal(args.to, 'jane@example.com');
  assert.match(args.subject, /ORD-1001/);
  assert.match(args.text, /1Z999AA10123456784/);
});
