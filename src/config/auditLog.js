const { logger } = require('./logger');

// A separate, filterable trail of security-relevant events (auth
// failures/successes, cross-customer access attempts, rate limit trips) -
// distinct from pino-http's per-request access log, which records that a
// request happened but not what it meant. Tagged `audit: true` so these
// can be searched/alerted on separately from routine traffic in whatever
// reads the logs (e.g. Render's log viewer).
const auditLogger = logger.child({ audit: true });

function auditLog(event, details = {}) {
  auditLogger.info(details, event);
}

// auditLogger is also exported (not just auditLog) so tests can
// t.mock.method(auditLogger, 'info', ...) and intercept every call site
// that uses auditLog(), regardless of which module called it - mocking a
// method on this shared object works across module boundaries; mocking
// the destructured auditLog function itself would not, since each caller
// already holds its own reference to the original function.
module.exports = { auditLog, auditLogger };
