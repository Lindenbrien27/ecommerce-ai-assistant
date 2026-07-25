require('dotenv').config();
const app = require('./src/app');
const { initSchema } = require('./src/config/db');
const { logError } = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`E-commerce assistant running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logError('Failed to initialize database schema', err);
    process.exit(1);
  });
