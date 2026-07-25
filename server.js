require('dotenv').config();
const app = require('./src/app');
const { initSchema } = require('./src/config/db');
const { logger } = require('./src/config/logger');
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
