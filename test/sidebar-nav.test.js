const test = require('node:test');
const assert = require('node:assert');
const ejs = require('ejs');
const path = require('path');

// The sidebar renders one of two menus. Which one it picks, and which item it
// highlights, is what makes the left nav feel stable (or not) as the user moves
// between pages -- so it is pinned here.

const VIEWS = path.join(__dirname, '..', 'src', 'views');
const SIDEBAR = path.join(VIEWS, 'partials', 'sidebar.ejs');

const PROJECT = { id: 4, name: 'Mashi', slug: 'mashi', color: '#6C63FF', publicDocuments: false };
const ADMIN = { id: 1, name: 'Mashi', role: 'admin', avatar: null };

function render(locals) {
  return ejs.renderFile(SIDEBAR, {
    t: (k) => k,
    currentUser: ADMIN,
    ...locals,
  }, { async: false });
}

// Grab each nav link as { href, active }.
function navLinks(html) {
  const out = [];
  const re = /<a href="([^"]+)" class="nav-btn([^"]*)"/g;
  let m;
  while ((m = re.exec(html))) out.push({ href: m[1], active: m[2].includes('active') });
  return out;
}

const hrefs = (html) => navLinks(html).map((l) => l.href);
const activeHrefs = (html) => navLinks(html).filter((l) => l.active).map((l) => l.href);

test('with a project active, the sidebar shows the project menu', async () => {
  const html = await render({ activeProject: PROJECT, activeProjectId: PROJECT.id });
  const links = hrefs(html);
  assert.ok(links.includes('/dashboard/4-mashi'), 'Tasks');
  assert.ok(links.includes('/projects/4-mashi/documents'), 'Documents');
  assert.ok(links.includes('/projects/4-mashi/diagrams'), 'Diagrams');
  assert.ok(links.includes('/notes'), 'Notes');
  assert.ok(links.includes('/admin/users'), 'Users');
  assert.ok(html.includes('sidebar-active-project'), 'project switcher is shown');
});

test('with no project, the sidebar falls back to the general menu', async () => {
  const html = await render({});
  const links = hrefs(html);
  assert.deepStrictEqual(links, ['/dashboard', '/projects', '/notes', '/admin/users', '/profile']);
  assert.ok(!html.includes('sidebar-active-project'), 'no project switcher');
});

// Pages that genuinely have no project (the project list, a dashboard for a
// user with none yet) pass explicit nulls, which override the session project
// the sidebar middleware attaches. Both halves must switch together, or the
// page ends up with a project switcher above a general menu.
test('explicit nulls override an attached project, switcher included', async () => {
  const html = await render({ activeProject: null, activeProjectId: null });
  assert.deepStrictEqual(hrefs(html), ['/dashboard', '/projects', '/notes', '/admin/users', '/profile']);
  assert.ok(!html.includes('sidebar-active-project'), 'no project switcher');
});

// The regression: Notes and Users are not project pages, but as long as a
// project is active they must keep rendering the SAME menu as the project's own
// pages -- otherwise the left nav visibly changes shape when they are clicked.
for (const page of ['notes', 'users', 'documents', 'diagrams', 'profile']) {
  test(`the ${page} page keeps the project menu when a project is active`, async () => {
    const html = await render({ activeProject: PROJECT, activeProjectId: PROJECT.id, activePage: page });
    assert.ok(hrefs(html).includes('/dashboard/4-mashi'), 'still the project menu');
    assert.ok(html.includes('sidebar-active-project'), 'project switcher stays');
  });
}

// Exactly one item may be highlighted, or the nav reads as if two pages are open.
const EXPECTED_ACTIVE = {
  undefined: '/dashboard/4-mashi',            // task board sets no activePage
  tasks: '/dashboard/4-mashi',
  documents: '/projects/4-mashi/documents',
  diagrams: '/projects/4-mashi/diagrams',
  notes: '/notes',
  users: '/admin/users',
};

for (const [page, href] of Object.entries(EXPECTED_ACTIVE)) {
  test(`only ${href} is highlighted for activePage=${page}`, async () => {
    const locals = { activeProject: PROJECT, activeProjectId: PROJECT.id };
    if (page !== 'undefined') locals.activePage = page;
    assert.deepStrictEqual(activeHrefs(await render(locals)), [href]);
  });
}

test('a non-admin never sees the Users link', async () => {
  const html = await render({
    activeProject: PROJECT, activeProjectId: PROJECT.id,
    currentUser: { id: 2, name: 'Dev', role: 'developer', avatar: null },
  });
  assert.ok(!hrefs(html).includes('/admin/users'));
});
