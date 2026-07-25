const autocannon = require('autocannon');

// Same seed customer test/e2e already use (migrations/1784973065584_initial-schema.sql).
const ORDER_NUMBER = 'ORD-1001';
const EMAIL = 'jane.doe@example.com';

const TARGET = process.env.LOADTEST_TARGET || 'http://127.0.0.1:3000';
const DURATION = Number(process.env.LOADTEST_DURATION) || 15;
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS) || 20;

// This measures the backend/database's real throughput headroom under
// concurrency - not the rate limiter, which already has its own dedicated,
// deterministic coverage in test/rateLimiter.test.js. Run this against a
// server with RATE_LIMIT_ORDERS_MAX set high (see
// .github/workflows/loadtest.yml) or every request past the first ~30/min
// just measures 429s instead of real backend latency.
async function getToken() {
  const res = await fetch(`${TARGET}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber: ORDER_NUMBER, email: EMAIL }),
  });
  if (!res.ok) {
    throw new Error(`Setup failed: POST /api/auth/verify returned ${res.status}`);
  }
  const { token } = await res.json();
  return token;
}

function summarize(label, result) {
  const { latency, requests, errors, timeouts, non2xx } = result;
  console.log(`\n--- ${label} ---`);
  console.log(`requests/sec: ${requests.average} (${requests.sent} sent)`);
  console.log(
    `latency ms: p50=${latency.p50} p90=${latency.p90} p99=${latency.p99} max=${latency.max}`
  );
  console.log(`errors: ${errors}  timeouts: ${timeouts}  non-2xx: ${non2xx}`);
  return errors === 0 && timeouts === 0 && non2xx === 0;
}

async function run() {
  console.log(`Load testing ${TARGET} (${CONNECTIONS} connections, ${DURATION}s per scenario)`);

  const token = await getToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  // GET /api/orders - the keyset-paginated list endpoint (see README >
  // Pagination). Real seed data only has 2 orders for this customer, well
  // under the default page size, so this exercises the common case: a
  // single page, no cursor.
  const ordersResult = await autocannon({
    url: `${TARGET}/api/orders?limit=20`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: authHeaders,
  });

  // GET /api/orders/:id - single-row lookup by order_number, the other
  // shape of read traffic this app actually serves.
  const orderDetailResult = await autocannon({
    url: `${TARGET}/api/orders/${ORDER_NUMBER}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: authHeaders,
  });

  const ordersOk = summarize('GET /api/orders (paginated list)', ordersResult);
  const orderDetailOk = summarize('GET /api/orders/:id', orderDetailResult);

  // Latency numbers are printed for a human to read, not gated on - they're
  // a function of whatever hardware happened to run this, which varies a
  // lot on shared CI runners. Any error/timeout/non-2xx response is not:
  // that's the server actually failing under load, not the environment
  // being slow, so that's what fails the run.
  if (!ordersOk || !orderDetailOk) {
    console.error('\nLoad test failed: at least one scenario had errors, timeouts, or non-2xx responses.');
    process.exitCode = 1;
  } else {
    console.log('\nLoad test passed: no errors, timeouts, or non-2xx responses in either scenario.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
