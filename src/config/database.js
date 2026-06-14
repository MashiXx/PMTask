// ===========================================================================
// Database configuration
// ---------------------------------------------------------------------------
// The individual DB_* components in `.env` are the source of truth. This
// module assembles them into the single connection string Prisma expects
// (DATABASE_URL) and exposes it on process.env so that both the application's
// PrismaClient and the Prisma CLI (via prisma/prisma-cli.js) can read it.
//
// A full DATABASE_URL, if explicitly provided, always takes precedence — handy
// for managed/hosted databases that give you a ready-made connection string.
// ===========================================================================

require('dotenv').config();

function buildDatabaseUrl() {
  // Explicit override wins.
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const {
    DB_HOST = 'localhost',
    DB_PORT = '3306',
    DB_USER = 'root',
    DB_PASSWORD = '',
    DB_NAME = 'pmtask',
  } = process.env;

  // URL-encode credentials so special characters (@ : / ? # ...) are safe.
  const user = encodeURIComponent(DB_USER);
  const auth = DB_PASSWORD
    ? `${user}:${encodeURIComponent(DB_PASSWORD)}`
    : user;

  return `mysql://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

const databaseUrl = buildDatabaseUrl();

// Make the assembled URL available to Prisma (client + CLI).
process.env.DATABASE_URL = databaseUrl;

module.exports = { databaseUrl, buildDatabaseUrl };
