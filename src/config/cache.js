const { LRUCache } = require('lru-cache');

const orderCache = new LRUCache({ max: 500, ttl: 60_000 });

module.exports = { orderCache };
