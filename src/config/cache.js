const { LRUCache } = require('lru-cache');

// Orders were originally read-only here - migrations seed the table and
// nothing else wrote to it - but adminOrderService.updateOrderStatus now
// does (an admin changing an order's status). That function deletes its
// own `order:${orderNumber}` cache entry immediately after a successful
// write, so a stale row is never served past that point; the bounded TTL
// below still matters for two reasons independent of that write path: (1)
// list-shaped cache entries (getOrdersByEmail's `list:*` keys) aren't
// individually invalidated by a status change, so a customer's own order
// list can serve a pre-update status for up to this TTL, and (2)
// order_number/trackingNumber are still client-supplied and unauthenticated
// at this layer, so an attacker probing many nonexistent values shouldn't
// be able to grow this cache without bound.
const orderCache = new LRUCache({ max: 500, ttl: 60_000 });

module.exports = { orderCache };
