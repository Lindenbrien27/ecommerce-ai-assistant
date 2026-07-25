const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { logError } = require('../utils/logger');

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database.sql');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Without this, an error on an idle client (e.g. Neon dropping a connection)
// is an unhandled 'error' event and crashes the process - see node-postgres docs.
pool.on('error', (err) => {
  logError('Unexpected idle database client error', err);
});

async function initSchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
}

module.exports = { pool, initSchema };
