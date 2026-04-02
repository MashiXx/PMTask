const session = require('express-session');
const crypto = require('crypto');

// Generate a strong random secret if not provided
const secret = process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'your-session-secret-here'
  ? process.env.SESSION_SECRET
  : crypto.randomBytes(64).toString('hex');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-session-secret-here') {
  console.warn('WARNING: SESSION_SECRET is not set or using default. A random secret has been generated. Set a strong SESSION_SECRET in .env for production.');
}

module.exports = session({
  secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
