const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database.sql');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
}

module.exports = { pool, initSchema };
