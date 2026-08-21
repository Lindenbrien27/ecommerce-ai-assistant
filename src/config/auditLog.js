const { logger } = require('./logger');

const auditLogger = logger.child({ audit: true });

function auditLog(event, details = {}) {
  auditLogger.info(details, event);
}

module.exports = { auditLog, auditLogger };
