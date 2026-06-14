// ===========================================================================
// Prisma CLI wrapper
// ---------------------------------------------------------------------------
// The Prisma CLI reads DATABASE_URL literally and cannot assemble it from the
// individual DB_* components. This wrapper builds DATABASE_URL first (via the
// shared database config) and then forwards all arguments to the local Prisma
// CLI. We resolve and run Prisma's entry point directly so it does not depend
// on `npx`/PATH resolution.
//
//   npm run prisma -- migrate dev --name add_thing
//   npm run migrate
//   npm run studio
// ===========================================================================

require('../src/config/database'); // sets process.env.DATABASE_URL

const { spawn } = require('child_process');
const prismaCli = require.resolve('prisma/build/index.js');

const child = spawn(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => process.exit(code ?? 0));
