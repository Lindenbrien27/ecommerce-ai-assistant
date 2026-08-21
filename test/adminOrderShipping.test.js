
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { orderCache } = require('../src/config/cache');
const { issueAdminToken } = require('../src/services/adminAuthService');
const app = require('../src/app');

const RESEND_KEYS = ['RESEND_API_KEY', 'EMAIL_FROM'];

test.beforeEach(() => orderCache.clear());

async function withServer(t, run) {
  const server = app.listen(0);
  t.after(() => server.close());
  const { port } = server.address();
  await run(`http://localhost:${port}`);
}

function adminCookie() {
  return `adminToken=${issueAdminToken({ id: 1, email: 'lindenbrien27@gmail.com' })}`;
}

const ORDER_WITH_ADDRESS = {
  order_number: 'ORD-1001',
  customer_email: 'jane.doe@example.com',
  product_name: 'Wireless Headphones',
  created_at: '2026-07-24T00:00:00Z',
  carrier: null,
  tracking_number: null,
  unit_price_cents: 40000,
  delivery_cost_cents: 500,
  vat_cents: 0,
  voucher_cents: 0,
  voucher_code: null,
  recipient_name: 'Jane Doe',
  address_line1: '482 Maple Street',
  address_line2: null,
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  country: 'US',
};

test('GET /api/admin/orders/:orderNumber/invoice.pdf requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`);
    assert.equal(res.status, 401);
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns a PDF for an order with an address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [ORDER_WITH_ADDRESS] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 404);
  });
});

test('GET /api/admin/orders/:orderNumber/invoice.pdf returns 409 when there is no shipping address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ ...ORDER_WITH_ADDRESS, address_line1: null }] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/invoice.pdf`, { headers: { Cookie: adminCookie() } });
    assert.equal(res.status, 409);
  });
});

test('GET /api/admin/orders/:orderNumber/packing-slip.pdf returns a PDF for an order with an address', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [ORDER_WITH_ADDRESS] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/packing-slip.pdf`, {
      headers: { Cookie: adminCookie() },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping requires admin auth', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '123' }),
    });
    assert.equal(res.status, 401);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping updates carrier and tracking number', async (t) => {
  t.mock.method(pool, 'query', async (sql) => {
    if (/UPDATE orders/.test(sql)) {
      return { rows: [{ ...ORDER_WITH_ADDRESS, carrier: 'UPS', tracking_number: '1Z999AA10123456784' }] };
    }
    return { rows: [ORDER_WITH_ADDRESS] };
  });

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.carrier, 'UPS');

    assert.equal(body.emailed, false);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping rejects a missing carrier with 400', async (t) => {
  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ trackingNumber: '123' }),
    });
    assert.equal(res.status, 400);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping returns 404 for an unknown order', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [] }));

  await withServer(t, async (base) => {
    const res = await fetch(`${base}/api/admin/orders/NOPE/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '123' }),
    });
    assert.equal(res.status, 404);
  });
});

test('PATCH /api/admin/orders/:orderNumber/shipping only re-emails the customer on an actual carrier/tracking change, not a no-op re-save', async (t) => {
  const saved = Object.fromEntries(RESEND_KEYS.map((k) => [k, process.env[k]]));
  RESEND_KEYS.forEach((k) => delete process.env[k]);
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.EMAIL_FROM = 'noreply@example.com';
  t.after(() => {
    RESEND_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  const { Resend } = require('resend');
  const Emails = new Resend('x').emails.constructor;
  const sendMail = t.mock.method(Emails.prototype, 'send', async () => ({ data: { id: 'email_123' }, error: null }));

  let currentOrder = { ...ORDER_WITH_ADDRESS };
  t.mock.method(pool, 'query', async (sql, params) => {
    if (/UPDATE orders/.test(sql)) {
      currentOrder = { ...currentOrder, carrier: params[0], tracking_number: params[1] };
      return { rows: [currentOrder] };
    }
    return { rows: [currentOrder] };
  });

  await withServer(t, async (base) => {

    const res1 = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.emailed, true);
    assert.equal(sendMail.mock.callCount(), 1);

    const res2 = await fetch(`${base}/api/admin/orders/ORD-1001/shipping`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie() },
      body: JSON.stringify({ carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.emailed, false);
    assert.equal(sendMail.mock.callCount(), 1);
  });
});
