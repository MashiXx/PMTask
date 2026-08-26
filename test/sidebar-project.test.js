const test = require('node:test');
const assert = require('node:assert');

// Stand in for the real client so requiring the middleware doesn't construct a
// PrismaClient (or reach for a database).
const calls = [];
let stored = null;
const fakePrisma = {
  project: {
    findUnique: async (args) => { calls.push(args); return stored; },
  },
};
const prismaPath = require.resolve('../src/config/prisma');
require.cache[prismaPath] = {
  id: prismaPath, filename: prismaPath, loaded: true, exports: fakePrisma,
};

const sidebarProject = require('../src/middleware/sidebar-project');

const PROJECT = { id: 4, name: 'Mashi', slug: 'mashi', userId: 7 };
const OWNER = { id: 7, role: 'developer' };
const OTHER = { id: 8, role: 'developer' };
const ADMIN = { id: 9, role: 'admin' };

async function run(req, project = PROJECT) {
  stored = project;
  calls.length = 0;
  const res = { locals: {} };
  let nexted = false;
  await sidebarProject({ method: 'GET', path: '/notes', ...req }, res, () => { nexted = true; });
  return { locals: res.locals, nexted, queries: calls.length };
}

const session = (id) => ({ lastProjectId: id });

test('attaches the last project so the sidebar keeps the project menu', async () => {
  const r = await run({ user: OWNER, session: session(4) });
  assert.strictEqual(r.locals.activeProjectId, 4);
  assert.strictEqual(r.locals.activeProject.name, 'Mashi');
  assert.ok(r.nexted, 'always continues the chain');
});

test('an admin gets any project attached', async () => {
  const r = await run({ user: ADMIN, session: session(4) });
  assert.strictEqual(r.locals.activeProjectId, 4);
});

test("a stale session pointing at someone else's project attaches nothing", async () => {
  const r = await run({ user: OTHER, session: session(4) });
  assert.deepStrictEqual(r.locals, {});
  assert.ok(r.nexted);
});

test('a project that no longer exists attaches nothing', async () => {
  const r = await run({ user: OWNER, session: session(4) }, null);
  assert.deepStrictEqual(r.locals, {});
  assert.ok(r.nexted);
});

test('no session project, no lookup', async () => {
  const r = await run({ user: OWNER, session: {} });
  assert.deepStrictEqual(r.locals, {});
  assert.strictEqual(r.queries, 0, 'must not hit the database');
});

test('logged-out requests do no lookup', async () => {
  const r = await run({ user: null, session: session(4) });
  assert.deepStrictEqual(r.locals, {});
  assert.strictEqual(r.queries, 0);
});

test('only page renders pay for the lookup', async () => {
  // JSON endpoints and mutations have no sidebar to keep stable.
  for (const req of [
    { method: 'POST', path: '/notes' },
    { method: 'GET', path: '/notes/api/labels' },
    { method: 'PATCH', path: '/notes/api/reorder' },
    { method: 'GET', path: '/api/tasks/3' },
  ]) {
    const r = await run({ user: OWNER, session: session(4), ...req });
    assert.strictEqual(r.queries, 0, `${req.method} ${req.path} must not query`);
    assert.ok(r.nexted, `${req.method} ${req.path} must continue`);
  }
});

test('a database failure never breaks the page', async () => {
  const orig = fakePrisma.project.findUnique;
  fakePrisma.project.findUnique = async () => { throw new Error('db down'); };
  const origErr = console.error; console.error = () => {};
  try {
    const r = await run({ user: OWNER, session: session(4) });
    assert.ok(r.nexted, 'still renders the page');
    assert.deepStrictEqual(r.locals, {});
  } finally {
    fakePrisma.project.findUnique = orig;
    console.error = origErr;
  }
});
