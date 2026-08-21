const autocannon = require('autocannon');

const EMAIL = 'jane.doe@example.com';

const TARGET = process.env.LOADTEST_TARGET || 'http://127.0.0.1:3000';
const DURATION = Number(process.env.LOADTEST_DURATION) || 15;
const CONNECTIONS = Number(process.env.LOADTEST_CONNECTIONS) || 20;

async function getToken() {
  const requestRes = await fetch(`${TARGET}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL }),
  });
  if (!requestRes.ok) {
    throw new Error(`Setup failed: POST /api/auth/otp/request returned ${requestRes.status}`);
  }

  const { devCode } = await requestRes.json();
  if (!devCode) {
    throw new Error('Setup failed: no devCode in response - is SMTP configured or NODE_ENV=production?');
  }

  const verifyRes = await fetch(`${TARGET}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, code: devCode }),
  });
  if (!verifyRes.ok) {
    throw new Error(`Setup failed: POST /api/auth/otp/verify returned ${verifyRes.status}`);
  }
  const { token } = await verifyRes.json();
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

  const ordersResult = await autocannon({
    url: `${TARGET}/api/orders?limit=20`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: authHeaders,
  });

  const orderDetailResult = await autocannon({
    url: `${TARGET}/api/orders/${ORDER_NUMBER}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: authHeaders,
  });

  const ordersOk = summarize('GET /api/orders (paginated list)', ordersResult);
  const orderDetailOk = summarize('GET /api/orders/:id', orderDetailResult);

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
