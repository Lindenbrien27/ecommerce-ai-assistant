require('dotenv').config();

require('./src/config/sentry');
const { registerCrashHandlers } = require('./src/config/crashHandlers');
const { logger } = require('./src/config/logger');
const { getMissingRequiredEnvVars } = require('./src/config/requiredEnv');

registerCrashHandlers();

const missingEnvVars = getMissingRequiredEnvVars();
if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variable(s): ${missingEnvVars.join(', ')}. Refusing to start.`);
  process.exit(1);
}

const app = require('./src/app');
const { runMigrations } = require('./src/config/migrate');
const { logError } = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`E-commerce assistant running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logError('Failed to run database migrations', err);
    process.exit(1);
  });
