const { logger } = require('../config/logger');

// Structured wrapper around pino - the "err" serializer configured in
// src/config/logger.js guarantees only type/message/stack ever get logged,
// regardless of what other properties the error object happens to carry.
function logError(label, err) {
  logger.error({ err }, label);
}

module.exports = { logError };
