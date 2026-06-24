require('dotenv').config();
require('./config/database'); // assemble DATABASE_URL from DB_* components
const app = require('./app');
const prisma = require('./config/prisma');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PMTask running on http://localhost:${PORT}`);
  // Warm the DB connection pool at boot so the first user request doesn't pay
  // the (remote DB) cold-connect cost. Non-fatal if it fails — queries retry.
  prisma.$connect()
    .then(() => console.log('Database connection pool warmed'))
    .catch((err) => console.warn('DB warm-up failed (will connect on demand):', err.message));
});
