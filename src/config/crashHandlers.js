const Sentry = require('./sentry');
const { logger } = require('./logger');

// Neither of these gets an application-level record by default: an
// unhandled rejection crashes the process (Node >=15) with nothing beyond a
// console dump, and an uncaught exception leaves it running in a
// potentially corrupted state if nothing else intervenes. Both cases get
// logged and reported to Sentry (if configured) here, then exit
// deliberately - Docker/Render restarts the container - rather than risk
// continuing on with broken invariants.
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
