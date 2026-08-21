const Sentry = require('./sentry');
const { logger } = require('./logger');

function registerCrashHandlers() {
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception - exiting');
    Sentry.captureException(err);
    Sentry.flush(2000).finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.fatal({ err }, 'Unhandled promise rejection - exiting');
    Sentry.captureException(err);
    Sentry.flush(2000).finally(() => process.exit(1));
  });
}

module.exports = { registerCrashHandlers };
