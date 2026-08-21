const { logger } = require('../config/logger');

function logError(label, err) {
  logger.error({ err }, label);
}

module.exports = { logError };
