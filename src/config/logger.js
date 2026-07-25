const pino = require('pino');

// Only ever serializes type/message/stack for a logged error - never its
// other enumerable properties. Some HTTP client libraries attach request
// config or headers directly to thrown errors; pino's default error
// serializer includes those by default, which would print an API key or
// Authorization header straight into structured logs.
function serializeError(err) {
  return {
    type: err?.name,
    message: err?.message,
    stack: err?.stack,
  };
}

function createLogger(destination) {
  return pino(
    {
      level: process.env.LOG_LEVEL || 'info',
      serializers: { err: serializeError },
      // pino-http logs req.headers by default, which would otherwise print
      // our X-API-Key (or any future Authorization/cookie header) verbatim.
      redact: {
        paths: ['req.headers["x-api-key"]', 'req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    },
    destination
  );
}

module.exports = { createLogger, logger: createLogger() };
