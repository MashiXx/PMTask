require('dotenv').config();
require('./config/database'); // assemble DATABASE_URL from DB_* components
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PMTask running on http://localhost:${PORT}`);
});
