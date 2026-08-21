const pino = require('pino');

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

      redact: {
        paths: ['req.headers["x-api-key"]', 'req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
    },
    destination
  );
}

module.exports = { createLogger, logger: createLogger() };
