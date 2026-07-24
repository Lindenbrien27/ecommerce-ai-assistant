require('dotenv').config();
const app = require('./src/app');
const { initSchema } = require('./src/config/db');

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`E-commerce assistant running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database schema:', err);
    process.exit(1);
  });
