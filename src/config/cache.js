const { LRUCache } = require('lru-cache');

// Orders are effectively read-only in this app - migrations seed the table
// once, and nothing exposed here ever writes to it - so there's no
// invalidation problem to solve. A bounded TTL (not indefinite) is still
// the responsible default rather than assuming that stays true forever if
// this app ever grows a real order-status-update path (a carrier webhook,
// an admin tool). max caps memory regardless of key churn - order_number/
// trackingNumber are client-supplied (the auth-verify and order-lookup
// endpoints both accept arbitrary values before any ownership check runs),
// so an attacker probing many nonexistent values shouldn't be able to grow
// this without bound.
const orderCache = new LRUCache({ max: 500, ttl: 60_000 });

module.exports = { orderCache };
