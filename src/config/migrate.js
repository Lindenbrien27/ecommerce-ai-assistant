const path = require('path');
const { runner } = require('node-pg-migrate');
const { ssl } = require('./db');
const { logger } = require('./logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function runMigrations() {
  await runner({
    databaseUrl: { connectionString: process.env.DATABASE_URL, ssl },
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    singleTransaction: true,
    // Routes node-pg-migrate's own messages through pino instead of raw
    // console lines, so migration output stays structured JSON like every
    // other log this app produces.
    logger: {
      debug: (msg) => logger.debug(msg),
      info: (msg) => logger.info(msg),
      warn: (msg) => logger.warn(msg),
      error: (msg) => logger.error(msg),
    },
  });
}

module.exports = { runMigrations };
