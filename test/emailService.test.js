const test = require('node:test');
const assert = require('node:assert/strict');

// Snapshot/restore the four SMTP_* vars around every test - other suites in
// this run (and a real local .env) may or may not have them set, and this
// file needs to control that directly rather than inherit whatever state
// happened to exist first.
const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM'];
let saved;
test.beforeEach(() => {
  saved = Object.fromEntries(SMTP_KEYS.map((k) => [k, process.env[k]]));
  SMTP_KEYS.forEach((k) => delete process.env[k]);
});
test.afterEach(() => {
  SMTP_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  });
  delete require.cache[require.resolve('../src/services/emailService')];
});

test('isConfigured is false when no SMTP_* vars are set', () => {
  const { isConfigured } = require('../src/services/emailService');
  assert.equal(isConfigured(), false);
});

test('isConfigured is false when only some SMTP_* vars are set', () => {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_USER = 'user';
  // SMTP_PASS and EMAIL_FROM deliberately left unset
  const { isConfigured } = require('../src/services/emailService');
  assert.equal(isConfigured(), false);
});

test('isConfigured is true when all four SMTP_* vars are set', () => {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
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
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'user';
  process.env.SMTP_PASS = 'pass';
  process.env.EMAIL_FROM = 'noreply@example.com';

  const sendMail = t.mock.fn(async () => {});
  const nodemailer = require('nodemailer');
  t.mock.method(nodemailer, 'createTransport', () => ({ sendMail }));

  const { sendShippingUpdateEmail } = require('../src/services/emailService');
  const sent = await sendShippingUpdateEmail('jane@example.com', {
    order_number: 'ORD-1001',
    product_name: 'Wireless Headphones',
    carrier: 'UPS',
    tracking_number: '1Z999AA10123456784',
  });

  assert.equal(sent, true);
  assert.equal(sendMail.mock.callCount(), 1);
  const args = sendMail.mock.calls[0].arguments[0];
  assert.equal(args.to, 'jane@example.com');
  assert.match(args.subject, /ORD-1001/);
  assert.match(args.text, /1Z999AA10123456784/);
});
