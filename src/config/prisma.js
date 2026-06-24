// Single shared PrismaClient for the whole app.
//
// Previously every controller did its own `new PrismaClient()` (14 instances),
// each opening its own connection pool to the (remote) database. Sharing one
// client means a single warm pool is reused across all requests.
//
// Requires DATABASE_URL to be assembled first — src/server.js loads
// src/config/database.js before anything that pulls in this module.
const { PrismaClient } = require('@prisma/client');

const prisma = global.__pmtaskPrisma || new PrismaClient();

// Reuse across nodemon/dev reloads so we don't leak pools.
if (process.env.NODE_ENV !== 'production') {
  global.__pmtaskPrisma = prisma;
}

module.exports = prisma;
