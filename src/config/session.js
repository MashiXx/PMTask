const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const crypto = require('crypto');

// Generate a strong random secret if not provided
const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'your-session-secret-here'
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(64).toString('hex');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-session-secret-here') {
  console.warn('WARNING: SESSION_SECRET is not set or using default. A random secret has been generated. Set a strong SESSION_SECRET in .env for production.');
}

// Persist sessions in MySQL so they survive application restarts.
// Reuses the same DB_* components as the rest of the app (see config/database.js).
const {
  DB_HOST = 'localhost',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'pmtask',
} = process.env;

const sessionStore = new MySQLStore({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  // Auto-create the `sessions` table if it does not exist.
  createDatabaseTable: true,
  // Purge expired sessions every 15 minutes.
  clearExpired: true,
  checkExpirationInterval: 1000 * 60 * 15,
  // Match the cookie maxAge below (24h).
  expiration: 1000 * 60 * 60 * 24,
});

module.exports = session({
  secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
