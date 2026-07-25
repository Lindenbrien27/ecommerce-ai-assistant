require('dotenv').config();
const { logger } = require('./src/config/logger');
const { getMissingRequiredEnvVars } = require('./src/config/requiredEnv');

// Fail fast and loud on a misconfigured environment - without this, a
// missing JWT_SECRET in particular would let the process start and
// /health report ok, only to break opaquely on the first real login.
const missingEnvVars = getMissingRequiredEnvVars();
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variable(s): ${missingEnvVars.join(', ')}. Refusing to start.`);
  process.exit(1);
}

const app = require('./src/app');
const { initSchema } = require('./src/config/db');
const { logError } = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`E-commerce assistant running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logError('Failed to initialize database schema', err);
    process.exit(1);
  });
