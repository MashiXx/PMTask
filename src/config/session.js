const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const crypto = require('crypto');

// Generate a strong random secret if not provided
const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'your-session-secret-here'
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(64).toString('hex');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-session-secret-here') {
  // IMPORTANT: when the secret is random it changes on every restart, which
  // invalidates all existing session cookies and forces every user to log in
  // again. Always set a fixed, strong SESSION_SECRET in .env for any real
  // deployment so sessions survive restarts/deploys.
  console.warn('WARNING: SESSION_SECRET is not set or using default. A random secret has been generated; sessions will NOT survive a restart. Set a strong SESSION_SECRET in .env for production.');
}

// How long a session stays valid. With `rolling` enabled below this is a
// sliding window: the clock resets on every authenticated request, so users are
// only logged out after this much continuous inactivity (not this long after login).
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

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
  // Match the cookie maxAge below.
  expiration: SESSION_TTL_MS,
});

module.exports = session({
  secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  // Renew the cookie (and its expiry in the store) on every response for a
  // logged-in user, turning the TTL into a sliding "inactivity" window.
  rolling: true,
  cookie: {
    maxAge: SESSION_TTL_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
