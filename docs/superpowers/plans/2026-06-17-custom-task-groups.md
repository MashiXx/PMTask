# Custom Task Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the board's status/tag grouping with per-project user-defined task groups; the kanban/list board is organized into columns = custom groups (plus a fixed "Ungrouped" column), while status remains a task attribute shown/edited on the card.

**Architecture:** New `TaskGroup` Prisma model (per project) + nullable `Task.groupId` (one group per task, `onDelete: SetNull`). The dashboard controller loads a project's groups and buckets tasks into ordered columns via a pure `buildGroupColumns()` helper. The board/list EJS partials render those columns; drag-drop calls `PATCH /api/tasks/:id/move` with `{groupId, position}`. Status changes move to a dedicated `PATCH /api/tasks/:id/status` endpoint driven by a dropdown on the card. Group CRUD lives in a new `group.controller.js` + `/api/groups` routes, available to any authenticated user (the app already lets developers see all projects).

**Tech Stack:** Express 5, EJS, Prisma 5 (MySQL), vanilla JS + Sortable.js, no test framework (pragmatic verification: Prisma node scripts, EJS render asserts, curl smoke, manual browser check).

## Global Constraints

- Groups are **per-project**; group name unique within a project (`@@unique([name, projectId])`).
- **Exactly one group per task**; `Task.groupId` nullable, `null` = ungrouped.
- Deleting a group must **never delete its tasks** — `onDelete: SetNull` (tasks become ungrouped).
- The **"Ungrouped" column is always shown, first** on the board/list.
- **Status is retained** as a task attribute (`todo|inprogress|review|done`); `Hide completed` still filters status `done`; board drag changes group, NOT status.
- Group management is allowed for **any authenticated user** (no `isAdmin` gate), consistent with developers already seeing all projects.
- Migration must be **non-destructive**: existing tasks keep all data and become ungrouped.
- Match existing code style: `PrismaClient` per-controller, JSON `{ error }` on failure, ID-prefixed slugs via `parseIdFromSlug`.
- Run the app/DB against the real configured MySQL (no separate test DB). Verification scripts must clean up any rows they create.

---

## File Structure

**Created:**
- `src/utils/groupColumns.js` — pure `buildGroupColumns(groups, tasks)` helper
- `src/controllers/group.controller.js` — group CRUD + reorder
- `src/routes/group.routes.js` — `/api/groups` routes
- `src/public/js/group-manage.js` — group manager modal logic (CRUD + reorder)
- `src/public/js/task-status.js` — `changeTaskStatus()` for the card status dropdown
- `src/views/partials/modals/group-modal.ejs` — "Manage groups" modal

**Modified:**
- `prisma/schema.prisma` — `TaskGroup` model, `Task.groupId`, `Project.groups`
- `src/controllers/task.controller.js` — `moveTask` (groupId), new `setTaskStatus`, include `group` in queries
- `src/routes/task.routes.js` — add `PATCH /:id/status`
- `src/app.js` — wire `/api/groups`
- `src/controllers/dashboard.controller.js` — load groups, build `groupColumns`
- `src/views/partials/kanban.ejs` — render group columns
- `src/views/partials/list-view.ejs` — render group sections
- `src/views/partials/task-card.ejs` — status badge + dropdown + `data-group-id`
- `src/public/js/kanban.js` — drag sends `groupId`
- `src/public/js/view-toggle.js` — drop tag-view branches; keep board/list + hide-completed
- `src/views/dashboard.ejs` — include group modal + new scripts

**Removed:**
- `src/views/partials/kanban-tag.ejs`, `src/views/partials/list-view-tag.ejs` (obsolete tag-grouping views)

---

## Task 1: Schema + migration (TaskGroup, Task.groupId)

**Files:**
- Modify: `prisma/schema.prisma`
- Verify: ad-hoc node script (temp)

**Interfaces:**
- Produces: `TaskGroup { id, name, color, position, projectId, createdAt, updatedAt }`; `Task.groupId Int?` with relation `group` (`onDelete: SetNull`); `Project.groups TaskGroup[]`.

- [ ] **Step 1: Add the `TaskGroup` model** to `prisma/schema.prisma` (after the `Tag`/`TaskTag` block):

```prisma
model TaskGroup {
  id        Int      @id @default(autoincrement())
  name      String
  color     String   @default("#6C63FF")
  position  Int      @default(0)
  projectId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     Task[]

  @@unique([name, projectId])
}
```

- [ ] **Step 2: Add `groupId` + relation to `Task`** (inside `model Task`, alongside `projectId`):

```prisma
  groupId     Int?
  group       TaskGroup? @relation(fields: [groupId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Add the relation to `Project`** (inside `model Project`, alongside `tags Tag[]`):

```prisma
  groups    TaskGroup[]
```

- [ ] **Step 4: Create + apply the migration**

Run: `npm run migrate -- --name add_task_groups`
Expected: Prisma prints "Your database is now in sync with your schema" and generates the client. A new folder appears under `prisma/migrations/*_add_task_groups/`.

- [ ] **Step 5: Verify the model + SetNull behavior** with a temporary script

Create `tmp-verify-groups.js`:

```js
require('./src/config/database');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const project = await prisma.project.findFirst();
  if (!project) { console.log('NO PROJECT — seed first'); process.exit(1); }
  const g = await prisma.taskGroup.create({ data: { name: '__verify__', projectId: project.id, position: 99 } });
  const t = await prisma.task.create({ data: { title: '__verify_task__', projectId: project.id, createdById: project.userId, groupId: g.id } });
  await prisma.taskGroup.delete({ where: { id: g.id } });
  const after = await prisma.task.findUnique({ where: { id: t.id } });
  console.log('groupId after group delete (expect null):', after.groupId);
  await prisma.task.delete({ where: { id: t.id } });
  await prisma.$disconnect();
})();
```

Run: `node tmp-verify-groups.js`
Expected: `groupId after group delete (expect null): null`

- [ ] **Step 6: Remove the temp script and commit**

```bash
rm tmp-verify-groups.js
git add prisma/schema.prisma prisma/migrations
git commit -m "Add TaskGroup model and Task.groupId (onDelete: SetNull)"
```

---

## Task 2: `buildGroupColumns` pure helper

**Files:**
- Create: `src/utils/groupColumns.js`
- Verify: ad-hoc node script (temp)

**Interfaces:**
- Produces: `buildGroupColumns(groups, tasks)` → ordered array of columns `{ id, name, color, tasks: [] }`. First column is always `{ id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks }`, followed by one column per group **in the order `groups` is passed**. A task goes to its `groupId` column if that group is present, else to `ungrouped`.

- [ ] **Step 1: Create `src/utils/groupColumns.js`**

```js
// Build ordered board columns from a project's groups and its tasks.
// Always returns an "Ungrouped" column first, then one column per group
// in the order provided. Tasks keep their incoming order within a column.
function buildGroupColumns(groups, tasks) {
  const ungrouped = { id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] };
  const byId = new Map(
    groups.map(g => [g.id, { id: g.id, name: g.name, color: g.color, tasks: [] }])
  );
  for (const task of tasks) {
    const col = task.groupId != null && byId.has(task.groupId) ? byId.get(task.groupId) : ungrouped;
    col.tasks.push(task);
  }
  return [ungrouped, ...groups.map(g => byId.get(g.id))];
}

module.exports = { buildGroupColumns };
```

- [ ] **Step 2: Verify with a temporary script**

Create `tmp-verify-cols.js`:

```js
const assert = require('assert');
const { buildGroupColumns } = require('./src/utils/groupColumns');
const groups = [{ id: 2, name: 'B', color: '#111' }, { id: 1, name: 'A', color: '#222' }];
const tasks = [
  { id: 10, groupId: 1 }, { id: 11, groupId: null }, { id: 12, groupId: 2 },
  { id: 13, groupId: 999 }, // stale group -> ungrouped
];
const cols = buildGroupColumns(groups, tasks);
assert.strictEqual(cols[0].id, 'ungrouped');
assert.deepStrictEqual(cols[0].tasks.map(t => t.id), [11, 13]);
assert.deepStrictEqual(cols.map(c => c.id), ['ungrouped', 2, 1]); // preserves group order
assert.deepStrictEqual(cols[1].tasks.map(t => t.id), [12]);
assert.deepStrictEqual(cols[2].tasks.map(t => t.id), [10]);
console.log('OK buildGroupColumns');
```

Run: `node tmp-verify-cols.js`
Expected: `OK buildGroupColumns`

- [ ] **Step 3: Remove temp script and commit**

```bash
rm tmp-verify-cols.js
git add src/utils/groupColumns.js
git commit -m "Add buildGroupColumns board-column helper"
```

---

## Task 3: Group controller + routes + app wiring

**Files:**
- Create: `src/controllers/group.controller.js`
- Create: `src/routes/group.routes.js`
- Modify: `src/app.js` (add `app.use('/api/groups', ...)`)
- Verify: curl smoke with an authenticated cookie

**Interfaces:**
- Consumes: Prisma `taskGroup`.
- Produces HTTP API:
  - `GET /api/groups?projectId=<id>` → `[{ id, name, color, position, _count:{tasks} }]`
  - `POST /api/groups` `{ projectId, name, color? }` → `{ success, group }`
  - `PUT /api/groups/:id` `{ name?, color? }` → `{ success, group }`
  - `DELETE /api/groups/:id` → `{ success }`
  - `PATCH /api/groups/reorder` `{ order: [{ id, position }] }` → `{ success }`

- [ ] **Step 1: Create `src/controllers/group.controller.js`**

```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getGroupsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const groups = await prisma.taskGroup.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get groups' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, color, projectId } = req.body;
    if (!name || !projectId) return res.status(400).json({ error: 'name and projectId are required' });
    const pid = parseInt(projectId);
    const max = await prisma.taskGroup.aggregate({ where: { projectId: pid }, _max: { position: true } });
    const group = await prisma.taskGroup.create({
      data: { name: name.trim(), color: color || '#6C63FF', projectId: pid, position: (max._max.position || 0) + 1 },
    });
    res.json({ success: true, group });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A group with that name already exists in this project' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    const group = await prisma.taskGroup.update({
      where: { id: parseInt(id) },
      data: { ...(name ? { name: name.trim() } : {}), ...(color ? { color } : {}) },
    });
    res.json({ success: true, group });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A group with that name already exists in this project' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.taskGroup.delete({ where: { id: parseInt(id) } }); // onDelete: SetNull -> tasks become ungrouped
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

exports.reorderGroups = async (req, res) => {
  try {
    const { order } = req.body; // [{ id, position }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    await prisma.$transaction(
      order.map(o => prisma.taskGroup.update({ where: { id: parseInt(o.id) }, data: { position: parseInt(o.position) } }))
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
};
```

- [ ] **Step 2: Create `src/routes/group.routes.js`**

```js
const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const group = require('../controllers/group.controller');

router.use(isAuthenticated);

router.get('/', group.getGroupsByProject);
router.post('/', group.createGroup);
router.patch('/reorder', group.reorderGroups); // before /:id-style handlers (none here, but explicit)
router.put('/:id', group.updateGroup);
router.delete('/:id', group.deleteGroup);

module.exports = router;
```

- [ ] **Step 3: Wire the route in `src/app.js`** (after the tags route, near line 70):

```js
app.use('/api/tags', require('./routes/tag.routes'));
app.use('/api/groups', require('./routes/group.routes'));
```

- [ ] **Step 4: Verify with curl (needs an active account)**

Ensure an active account exists. If the DB has none, run `npm run seed` (creates `admin@pmtask.com` / `demo123`). Then:

```bash
# start server in background
(node src/server.js > /tmp/pm.log 2>&1 &) && sleep 3
# log in, save cookie (use an active account)
curl -s -c /tmp/cj.txt -X POST http://localhost:3000/auth/login \
  --data-urlencode "email=admin@pmtask.com" --data-urlencode "password=demo123" -o /dev/null
# discover a projectId
PID=$(node -e "require('./src/config/database');const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.project.findFirst().then(x=>{console.log(x.id);process.exit(0)})")
# create
curl -s -b /tmp/cj.txt -H 'Content-Type: application/json' -X POST http://localhost:3000/api/groups \
  -d "{\"projectId\":$PID,\"name\":\"Frontend\",\"color\":\"#6C63FF\"}"
# list
curl -s -b /tmp/cj.txt "http://localhost:3000/api/groups?projectId=$PID"
```

Expected: POST returns `{"success":true,"group":{...}}`; GET returns an array containing the `Frontend` group with `_count.tasks: 0`. Unauthenticated requests (omit `-b /tmp/cj.txt`) redirect to `/auth/login`.

- [ ] **Step 5: Clean up the verify group and commit**

```bash
# delete the verify group via API (replace <id> from the GET output), then:
pkill -f "node src/server.js"
git add src/controllers/group.controller.js src/routes/group.routes.js src/app.js
git commit -m "Add group CRUD API (/api/groups)"
```

---

## Task 4: `moveTask` → groupId; new `setTaskStatus` endpoint

**Files:**
- Modify: `src/controllers/task.controller.js:145-183` (`moveTask`), add `setTaskStatus`
- Modify: `src/routes/task.routes.js` (add `PATCH /:id/status`)
- Verify: Prisma node script (no auth) + curl smoke

**Interfaces:**
- Consumes: `canModifyTask(taskId, user)` (returns the task incl. `projectId`, or `null`/`false`).
- Produces:
  - `PATCH /api/tasks/:id/move` body `{ groupId, position }` (groupId may be `null`/`'ungrouped'`/numeric) → `{ success }`. No longer changes status.
  - `PATCH /api/tasks/:id/status` body `{ status }` → `{ success, task }`; recalculates progress (done → 100, else subtask ratio).

- [ ] **Step 1: Replace `moveTask`** (`src/controllers/task.controller.js`, the whole `exports.moveTask` block):

```js
exports.moveTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { groupId, position } = req.body;

    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    // Normalize groupId: null / '' / 'ungrouped' => null (the Ungrouped column)
    let normGroupId = null;
    if (groupId != null && groupId !== '' && groupId !== 'ungrouped') {
      normGroupId = parseInt(groupId);
      if (Number.isNaN(normGroupId)) return res.status(400).json({ error: 'Invalid groupId' });
      const group = await prisma.taskGroup.findUnique({ where: { id: normGroupId } });
      if (!group || group.projectId !== access.projectId) {
        return res.status(400).json({ error: 'Group does not belong to this project' });
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { groupId: normGroupId, position: parseInt(position) || 0 },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

// Change only a task's status (the board no longer changes status via drag).
exports.setTaskStatus = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: { subtasks: true },
    });

    if (task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      const calc = status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);
      await prisma.task.update({ where: { id: taskId }, data: { progress: calc } });
      task.progress = calc;
    } else if (status === 'done') {
      await prisma.task.update({ where: { id: taskId }, data: { progress: 100 } });
      task.progress = 100;
    }

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set status' });
  }
};
```

- [ ] **Step 2: Add the status route** in `src/routes/task.routes.js` (next to the move route):

```js
router.patch('/:id/move', isAuthenticated, task.moveTask);
router.patch('/:id/status', isAuthenticated, task.setTaskStatus);
```

- [ ] **Step 3: Verify move semantics with a Prisma script**

Create `tmp-verify-move.js`:

```js
require('./src/config/database');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const project = await prisma.project.findFirst();
  const g = await prisma.taskGroup.create({ data: { name: '__mv__', projectId: project.id, position: 50 } });
  const t = await prisma.task.create({ data: { title: '__mv_task__', projectId: project.id, createdById: project.userId } });
  // simulate move into group then back to ungrouped
  await prisma.task.update({ where: { id: t.id }, data: { groupId: g.id, position: 3 } });
  let cur = await prisma.task.findUnique({ where: { id: t.id } });
  console.log('after move-in groupId/pos:', cur.groupId, cur.position);
  await prisma.task.update({ where: { id: t.id }, data: { groupId: null, position: 0 } });
  cur = await prisma.task.findUnique({ where: { id: t.id } });
  console.log('after move-out groupId (expect null):', cur.groupId);
  await prisma.task.delete({ where: { id: t.id } });
  await prisma.taskGroup.delete({ where: { id: g.id } });
  await prisma.$disconnect();
})();
```

Run: `node tmp-verify-move.js`
Expected: `after move-in groupId/pos: <g.id> 3` then `after move-out groupId (expect null): null`

- [ ] **Step 4: Remove temp script and commit**

```bash
rm tmp-verify-move.js
git add src/controllers/task.controller.js src/routes/task.routes.js
git commit -m "moveTask uses groupId; add PATCH /tasks/:id/status"
```

---

## Task 5: Dashboard controller — load groups, build columns

**Files:**
- Modify: `src/controllers/dashboard.controller.js`
- Verify: Prisma node script reproducing the query + helper

**Interfaces:**
- Consumes: `buildGroupColumns(groups, tasks)` (Task 2); existing `parseIdFromSlug`.
- Produces (render locals): adds `groups` (raw, ordered by position) and `groupColumns` (from `buildGroupColumns`) to the `dashboard` render. Existing `tasks` (by status), `stats`, `projectTags`, `boardView` stay unchanged.

- [ ] **Step 1: Import the helper** at the top of `src/controllers/dashboard.controller.js`:

```js
const { parseIdFromSlug } = require('../utils/slug');
const { buildGroupColumns } = require('../utils/groupColumns');
```

- [ ] **Step 2: Include `group` in the task query** (the `prisma.task.findMany` include near line 63):

```js
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
        group: true,
      },
```

- [ ] **Step 3: Load groups + build columns** — insert just before the final `res.render('dashboard', {` (after `projectTags` is computed):

```js
    const groups = await prisma.taskGroup.findMany({
      where: { projectId: activeProjectId },
      orderBy: { position: 'asc' },
    });
    const groupColumns = buildGroupColumns(groups, allTasks);
```

- [ ] **Step 4: Pass them to the view** — add to the render locals object:

```js
      projectTags,
      groups,
      groupColumns,
      isGuest,
      boardView: true,
```

- [ ] **Step 5: Also pass empty arrays in the guest no-project render** (the early `res.render('dashboard', {` near line 44) so the view never sees undefined:

```js
          projectTags: [],
          groups: [],
          groupColumns: [{ id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] }],
          isGuest: true,
```

- [ ] **Step 6: Verify the data shape with a Prisma script**

Create `tmp-verify-dash.js`:

```js
require('./src/config/database');
const { PrismaClient } = require('@prisma/client');
const { buildGroupColumns } = require('./src/utils/groupColumns');
const prisma = new PrismaClient();
(async () => {
  const project = await prisma.project.findFirst();
  const tasks = await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } });
  const groups = await prisma.taskGroup.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } });
  const cols = buildGroupColumns(groups, tasks);
  console.log('columns:', cols.map(c => `${c.name}(${c.tasks.length})`).join(', '));
  console.log('first column is Ungrouped:', cols[0].id === 'ungrouped');
  await prisma.$disconnect();
})();
```

Run: `node tmp-verify-dash.js`
Expected: prints a columns summary starting with `Ungrouped(...)`; `first column is Ungrouped: true`.

- [ ] **Step 7: Remove temp script and commit**

```bash
rm tmp-verify-dash.js
git add src/controllers/dashboard.controller.js
git commit -m "Dashboard loads groups and builds board columns"
```

---

## Task 6: `kanban.ejs` — render group columns

**Files:**
- Modify: `src/views/partials/kanban.ejs` (full rewrite)
- Verify: EJS render assert

**Interfaces:**
- Consumes: `groupColumns` (Task 5) — `[{ id, name, color, tasks }]`, `id` is `'ungrouped'` or a numeric group id.
- Produces: `.tasks-list` elements carry `data-group-id="<id>"` (used by Task 8 drag). Renders `task-card` per task.

- [ ] **Step 1: Replace `src/views/partials/kanban.ejs`** entirely:

```ejs
<div class="kanban-board">
  <% groupColumns.forEach(col => { %>
    <% const accent = col.color || '#6B6B8E'; %>
    <div class="kanban-column">
      <div class="column-header">
        <div class="column-title-group">
          <span class="column-dot" style="background: <%= accent %>; box-shadow: 0 0 6px <%= accent %>55;"></span>
          <span class="column-label"><%= col.name %></span>
          <span class="column-count" style="background: <%= accent %>22; color: <%= accent %>"><%= col.tasks.length %></span>
        </div>
        <% if (typeof currentUser !== 'undefined' && currentUser) { %>
          <button class="column-add-btn" onclick="openTaskModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        <% } %>
      </div>

      <div class="column-divider" style="background: linear-gradient(90deg, <%= accent %>88, transparent)"></div>

      <div class="tasks-list" id="col-<%= col.id %>" data-group-id="<%= col.id %>">
        <% col.tasks.forEach(task => { %>
          <%- include('task-card', { task }) %>
        <% }) %>

        <% if (typeof currentUser !== 'undefined' && currentUser) { %>
          <button class="add-task-btn" onclick="openTaskModal()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add task
          </button>
        <% } %>
      </div>
    </div>
  <% }) %>
</div>
```

- [ ] **Step 2: Verify with an EJS render assert**

Create `tmp-verify-kanban.js`:

```js
const ejs = require('ejs'); const assert = require('assert');
const groupColumns = [
  { id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] },
  { id: 7, name: 'Frontend', color: '#6C63FF', tasks: [
    { id: 1, title: 'T1', status: 'todo', priority: 'medium', progress: 0, tags: [], assignees: [], subtasks: [], groupId: 7 },
  ] },
];
ejs.renderFile('src/views/partials/kanban.ejs', { groupColumns, currentUser: { id: 1 } }).then(h => {
  assert(h.includes('data-group-id="ungrouped"'), 'ungrouped column present');
  assert(h.includes('data-group-id="7"'), 'group column present');
  assert(h.includes('Frontend'), 'group name shown');
  assert(h.includes('>T1<') || h.includes('T1'), 'task rendered');
  console.log('OK kanban render');
}).catch(e => { console.error(e); process.exit(1); });
```

Run: `node tmp-verify-kanban.js`
Expected: `OK kanban render`

- [ ] **Step 3: Remove the obsolete tag-board includes** from `src/views/dashboard.ejs` so no stale board shows. Delete these two lines (keep `partials/kanban` and `partials/list-view`):

```ejs
  <%- include('partials/kanban-tag') %>
  <%- include('partials/list-view-tag') %>
```

- [ ] **Step 4: Remove temp script and commit**

```bash
rm tmp-verify-kanban.js
git add src/views/partials/kanban.ejs src/views/dashboard.ejs
git commit -m "Render board columns by custom group"
```

---

## Task 7: `task-card.ejs` status badge + dropdown; `task-status.js`

**Files:**
- Modify: `src/views/partials/task-card.ejs`
- Create: `src/public/js/task-status.js`
- Verify: EJS render assert

**Interfaces:**
- Consumes: `PATCH /api/tasks/:id/status` (Task 4).
- Produces: each card has `data-group-id`, a visible status badge, and (for logged-in users) a status dropdown calling `changeTaskStatus(id, status)`.

- [ ] **Step 1: Add a status map + badge to `task-card.ejs`.** In the top `<% %>` block (after `pLabel`), add:

```js
  const statusLabels = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Completed' };
  const statusColors = { todo: '#6B6B8E', inprogress: '#00D9FF', review: '#FFB347', done: '#00F5A0' };
  const sLabel = statusLabels[task.status] || 'To Do';
  const sColor = statusColors[task.status] || '#6B6B8E';
```

- [ ] **Step 2: Add `data-group-id` to the card root.** Change the opening `<div class="task-card" ...>` to include it:

```ejs
<div class="task-card" data-task-id="<%= task.id %>" data-status="<%= task.status %>" data-group-id="<%= task.groupId == null ? '' : task.groupId %>" data-tags="<%= task.tags.map(tt => tt.tag.name).join(',') %>" onclick="openTaskPreview(<%= task.id %>)">
```

- [ ] **Step 3: Add the status badge + dropdown.** Insert right after the closing `</div>` of `.task-header` (before `<p class="task-title ...">`):

```ejs
  <div class="task-status-wrap" onclick="event.stopPropagation()">
    <button class="task-status-badge" style="color:<%= sColor %>; border-color:<%= sColor %>55; background:<%= sColor %>14;"
            <% if (typeof currentUser !== 'undefined' && currentUser) { %>onclick="toggleStatusMenu(<%= task.id %>)"<% } else { %>disabled<% } %>>
      <span class="task-status-dot" style="background:<%= sColor %>"></span><%= sLabel %>
    </button>
    <% if (typeof currentUser !== 'undefined' && currentUser) { %>
      <div class="task-status-menu" id="status-menu-<%= task.id %>">
        <% Object.keys(statusLabels).forEach(s => { %>
          <button class="task-status-option" onclick="changeTaskStatus(<%= task.id %>, '<%= s %>')">
            <span class="task-status-dot" style="background:<%= statusColors[s] %>"></span><%= statusLabels[s] %>
          </button>
        <% }) %>
      </div>
    <% } %>
  </div>
```

- [ ] **Step 4: Create `src/public/js/task-status.js`**

```js
// Open/close the per-card status dropdown
function toggleStatusMenu(taskId) {
  const menu = document.getElementById(`status-menu-${taskId}`);
  if (!menu) return;
  const open = menu.classList.contains('open');
  document.querySelectorAll('.task-status-menu.open').forEach(m => m.classList.remove('open'));
  if (!open) menu.classList.add('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-status-wrap')) {
    document.querySelectorAll('.task-status-menu.open').forEach(m => m.classList.remove('open'));
  }
});

async function changeTaskStatus(taskId, status) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('status update failed');
    window.location.reload();
  } catch (err) {
    console.error('Failed to change status:', err);
    window.location.reload();
  }
}
```

- [ ] **Step 5: Add minimal styles** to `src/public/css/main.css` (append):

```css
.task-status-wrap { position: relative; margin: 4px 0 6px; }
.task-status-badge { display:inline-flex; align-items:center; gap:5px; font-family:var(--font-mono); font-size:0.66rem; font-weight:600; padding:3px 8px; border-radius:6px; border:1px solid; cursor:pointer; }
.task-status-badge[disabled] { cursor:default; }
.task-status-dot { width:7px; height:7px; border-radius:50%; display:inline-block; }
.task-status-menu { display:none; position:absolute; z-index:20; top:100%; left:0; margin-top:4px; background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:4px; box-shadow:0 8px 24px rgba(0,0,0,.25); }
.task-status-menu.open { display:block; }
.task-status-option { display:flex; align-items:center; gap:6px; width:100%; padding:6px 10px; background:none; border:none; color:var(--text); font-size:0.72rem; cursor:pointer; border-radius:6px; white-space:nowrap; }
.task-status-option:hover { background:var(--surface-hover, rgba(255,255,255,.06)); }
```

- [ ] **Step 6: Verify with an EJS render assert**

Create `tmp-verify-card.js`:

```js
const ejs = require('ejs'); const assert = require('assert');
const task = { id: 5, title: 'Card', status: 'inprogress', priority: 'high', progress: 0, groupId: 7, tags: [], assignees: [], subtasks: [] };
ejs.renderFile('src/views/partials/task-card.ejs', { task, currentUser: { id: 1 } }).then(h => {
  assert(h.includes('data-group-id="7"'), 'group id on card');
  assert(h.includes('task-status-badge'), 'status badge present');
  assert(h.includes("changeTaskStatus(5, 'done')"), 'status option present');
  console.log('OK card render');
}).catch(e => { console.error(e); process.exit(1); });
```

Run: `node tmp-verify-card.js`
Expected: `OK card render`

- [ ] **Step 7: Remove temp script and commit**

```bash
rm tmp-verify-card.js
git add src/views/partials/task-card.ejs src/public/js/task-status.js src/public/css/main.css
git commit -m "Add status badge + dropdown to task cards"
```

---

## Task 8: `kanban.js` drag sends groupId; `view-toggle.js` cleanup

**Files:**
- Modify: `src/public/js/kanban.js`
- Modify: `src/public/js/view-toggle.js`
- Verify: read-back + app smoke (manual drag in Task 11)

**Interfaces:**
- Consumes: `.tasks-list[data-group-id]` (Task 6), `PATCH /api/tasks/:id/move` `{groupId, position}` (Task 4).

- [ ] **Step 1: Update the Sortable `onEnd`** in `src/public/js/kanban.js` (replace the body of `onEnd`):

```js
    onEnd: async function(evt) {
      const taskId = evt.item.dataset.taskId;
      const groupId = evt.to.dataset.groupId; // 'ungrouped' or numeric string
      const newIndex = evt.newIndex;
      try {
        await fetch(`/api/tasks/${taskId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId, position: newIndex }),
        });
        evt.item.dataset.groupId = groupId === 'ungrouped' ? '' : groupId;
        updateColumnCounts();
      } catch (err) {
        console.error('Failed to move task:', err);
        window.location.reload();
      }
    },
```

(The old `if (newStatus === 'done')` progress-DOM block is removed — drag no longer changes status.)

- [ ] **Step 2: Simplify `switchView` in `view-toggle.js`** to board/list only (no tag variants). Replace the `switchView` function:

```js
function switchView(mode) {
  const board = document.querySelector('.kanban-board');
  const list = document.getElementById('listView');
  if (!board || !list) return;

  board.classList.toggle('hidden', mode === 'list');
  list.classList.toggle('hidden', mode !== 'list');

  document.querySelectorAll('.view-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  localStorage.setItem('pmtask-view', mode);
}
```

- [ ] **Step 3: Trim the restore IIFE** in `view-toggle.js` — remove the group-by restore (lines that read `pmtask-group`, toggle `.sidebar-groupby-btn`, and show/hide `#sidebarTagFilters`/`#sidebarStatusFilters`). Keep only view + hide-completed restore:

```js
// Restore saved state on load
(function() {
  const savedView = localStorage.getItem('pmtask-view') || 'board';
  switchView(savedView);

  const hideCompleted = localStorage.getItem('pmtask-hide-completed') === 'true';
  const checkbox = document.getElementById('hideCompletedCheck');
  if (checkbox) checkbox.checked = hideCompleted;
  if (hideCompleted) applyCompletedFilter(true);
})();
```

Also delete the now-unused `setGroupBy` function (no callers remain after the menu removal).

- [ ] **Step 4: Verify no stale references**

Run: `grep -rn "kanbanTagView\|listViewTag\|setGroupBy\|pmtask-group" src/public/js/ src/views/`
Expected: no matches (all removed).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/kanban.js src/public/js/view-toggle.js
git commit -m "Drag updates task group; simplify view toggle to board/list"
```

---

## Task 9: `list-view.ejs` — group sections

**Files:**
- Modify: `src/views/partials/list-view.ejs` (full rewrite)
- Verify: EJS render assert

**Interfaces:**
- Consumes: `groupColumns` (Task 5).

- [ ] **Step 1: Replace `src/views/partials/list-view.ejs`** entirely:

```ejs
<%
  const priorityColors = { high: '#FF5C7A', medium: '#FFB347', low: '#00F5A0' };
  const priorityLabels = { high: 'HIGH', medium: 'MED', low: 'LOW' };
%>

<div class="list-view hidden" id="listView">
  <% groupColumns.forEach(col => { %>
    <% const gColor = col.color || '#6B6B8E'; %>
    <div class="list-group" data-group-id="<%= col.id %>">
      <div class="list-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div class="list-group-title">
          <span class="list-group-dot" style="background:<%= gColor %>; width:9px; height:9px; border-radius:50%; display:inline-block;"></span>
          <span class="list-group-label"><%= col.name %></span>
          <span class="list-group-count" style="background:color-mix(in srgb, <%= gColor %> 15%, transparent); color:<%= gColor %>"><%= col.tasks.length %></span>
        </div>
        <svg class="list-group-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </div>

      <div class="list-group-body">
        <div class="list-group-table-header">
          <div class="list-col list-col-title">Task</div>
          <div class="list-col list-col-priority">Priority</div>
          <div class="list-col list-col-progress">Progress</div>
          <div class="list-col list-col-due">Due</div>
          <div class="list-col list-col-tags">Tags</div>
        </div>

        <% if (col.tasks.length === 0) { %>
          <div class="list-empty-row">No tasks</div>
        <% } %>

        <% col.tasks.forEach(task => { %>
          <% const pColor = priorityColors[task.priority] || '#FFB347'; %>
          <% const progColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347'; %>
          <div class="list-row" data-task-id="<%= task.id %>" data-status="<%= task.status %>" data-tags="<%= task.tags.map(tt => tt.tag.name).join(',') %>" onclick="openTaskPreview(<%= task.id %>)">
            <div class="list-col list-col-title">
              <div class="list-priority-dot" style="background:<%= pColor %>;"></div>
              <div class="list-task-name"><%= task.title %></div>
            </div>
            <div class="list-col list-col-priority">
              <div style="color:<%= pColor %>; font-weight:600;"><%= priorityLabels[task.priority] %></div>
            </div>
            <div class="list-col list-col-progress">
              <div class="list-progress-track">
                <div class="list-progress-fill" style="width:<%= task.progress %>%; background:<%= progColor %>;"></div>
              </div>
              <div style="color:<%= progColor %>; font-weight:600; min-width:30px; text-align:right; padding-right:5px;"><%= task.progress %>%</div>
            </div>
            <div class="list-col list-col-due">
              <% if (task.dueDate) { %><%= task.dueDate %><% } else { %>—<% } %>
            </div>
            <div class="list-col list-col-tags">
              <% task.tags.forEach(tt => { %>
                <% const tColor = tt.tag.color || '#6B6B8E'; %>
                <div class="list-tag-dot" style="background:<%= tColor %>;" title="<%= tt.tag.name %>"></div>
              <% }) %>
            </div>
          </div>
        <% }) %>
      </div>
    </div>
  <% }) %>
</div>
```

- [ ] **Step 2: Verify with an EJS render assert**

Create `tmp-verify-list.js`:

```js
const ejs = require('ejs'); const assert = require('assert');
const groupColumns = [
  { id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] },
  { id: 3, name: 'Backend', color: '#00D9FF', tasks: [
    { id: 9, title: 'L1', status: 'todo', priority: 'low', progress: 50, dueDate: null, tags: [] } ] },
];
ejs.renderFile('src/views/partials/list-view.ejs', { groupColumns }).then(h => {
  assert(h.includes('data-group-id="ungrouped"'), 'ungrouped section');
  assert(h.includes('Backend'), 'group section');
  assert(h.includes('L1'), 'task row');
  console.log('OK list render');
}).catch(e => { console.error(e); process.exit(1); });
```

Run: `node tmp-verify-list.js`
Expected: `OK list render`

- [ ] **Step 3: Remove temp script and commit**

```bash
rm tmp-verify-list.js
git add src/views/partials/list-view.ejs
git commit -m "Render list view grouped by custom group"
```

---

## Task 10: Group manager modal + JS + header button

**Files:**
- Create: `src/views/partials/modals/group-modal.ejs`
- Create: `src/public/js/group-manage.js`
- Modify: `src/views/partials/header.ejs` (add "Manage groups" button)
- Modify: `src/views/dashboard.ejs` (include modal + scripts)
- Verify: EJS render assert + curl smoke

**Interfaces:**
- Consumes: `/api/groups` API (Task 3); the hidden `#taskProjectId` field already present in the task modal (carries `activeProjectId`).

- [ ] **Step 1: Confirm the project-id source.** `tag-manage.js` reads `document.getElementById('taskProjectId').value`. Verify it exists:

Run: `grep -rn "taskProjectId" src/views/`
Expected: a hidden input `id="taskProjectId"` in `partials/modals/task-modal.ejs`. `group-manage.js` will reuse it. (If absent, add `<input type="hidden" id="taskProjectId" value="<%= activeProjectId %>">` to `dashboard.ejs` inside the main content.)

- [ ] **Step 2: Create `src/views/partials/modals/group-modal.ejs`**

```ejs
<div class="modal-overlay" id="groupManagerModal">
  <div class="modal modal-sm" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2 class="modal-title">Manage Groups</h2>
      <button class="modal-close" onclick="closeGroupManager()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="group-add-row">
        <input type="text" id="newGroupName" class="form-input" placeholder="New group name" autocomplete="off">
        <input type="color" id="newGroupColor" value="#6C63FF" title="Group color">
        <button class="btn-primary" onclick="addNewGroup()">Add</button>
      </div>
      <div id="groupList" class="group-manager-list"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Create `src/public/js/group-manage.js`**

```js
// Group manager (modeled on tag-manage.js)
function groupProjectId() {
  const pid = document.getElementById('taskProjectId');
  return pid ? pid.value : null;
}

function openGroupManager() {
  if (!groupProjectId()) return;
  loadGroupList();
  document.getElementById('groupManagerModal').classList.add('active');
  document.getElementById('newGroupName').value = '';
}

function closeGroupManager() {
  document.getElementById('groupManagerModal').classList.remove('active');
  window.location.reload(); // re-render board columns
}

async function loadGroupList() {
  try {
    const res = await fetch(`/api/groups?projectId=${groupProjectId()}`);
    const groups = await res.json();
    const list = document.getElementById('groupList');
    if (!groups.length) {
      list.innerHTML = '<p class="group-empty">No groups yet</p>';
      return;
    }
    list.innerHTML = groups.map(g => `
      <div class="group-manager-item" id="group-item-${g.id}">
        <span class="tag-dot" style="background:${g.color};"></span>
        <span class="group-manager-name">${g.name}</span>
        ${g._count.tasks > 0 ? `<span class="group-count-hint">${g._count.tasks} task${g._count.tasks > 1 ? 's' : ''}</span>` : ''}
        <button class="column-add-btn group-del" onclick="deleteGroupItem(${g.id}, ${g._count.tasks})" title="Delete">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`).join('');
  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}

async function addNewGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  if (!name) return;
  const color = document.getElementById('newGroupColor').value || '#6C63FF';
  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, projectId: groupProjectId() }),
    });
    if (res.status === 409) { alert('A group with that name already exists.'); return; }
    document.getElementById('newGroupName').value = '';
    loadGroupList();
  } catch (err) {
    console.error('Failed to add group:', err);
  }
}

async function deleteGroupItem(id, taskCount) {
  if (taskCount > 0 && !confirm(`This group has ${taskCount} task${taskCount > 1 ? 's' : ''}. They will move to "Ungrouped". Delete the group?`)) return;
  try {
    await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    const el = document.getElementById(`group-item-${id}`);
    if (el) el.remove();
  } catch (err) {
    console.error('Failed to delete group:', err);
  }
}
```

- [ ] **Step 4: Add a "Manage groups" button to `header.ejs`** — inside `<% if (currentUser) { %>`, before the `btn-new-task`:

```ejs
    <button class="btn-secondary" onclick="openGroupManager()" title="Manage groups">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      Groups
    </button>
```

(If `.btn-secondary` is not defined in CSS, add a minimal rule mirroring `.btn-new-task` with a muted background.)

- [ ] **Step 5: Include modal + scripts in `dashboard.ejs`.** Add the modal near the other modal includes, and the scripts near the other `<script src>` tags:

```ejs
<%- include('partials/modals/group-modal') %>
```
```ejs
<script src="/js/group-manage.js"></script>
<script src="/js/task-status.js"></script>
```

- [ ] **Step 6: Verify modal render + script load**

Run:
```bash
node -e "require('ejs').renderFile('src/views/partials/modals/group-modal.ejs', {}).then(h=>{const a=require('assert');a(h.includes('groupManagerModal'));a(h.includes('addNewGroup'));console.log('OK group modal')}).catch(e=>{console.error(e);process.exit(1)})"
grep -c "group-manage.js\|group-modal\|task-status.js" src/views/dashboard.ejs
```
Expected: `OK group modal`; grep count `3`.

- [ ] **Step 7: Commit**

```bash
git add src/views/partials/modals/group-modal.ejs src/public/js/group-manage.js src/views/partials/header.ejs src/views/dashboard.ejs
git commit -m "Add group manager modal and header entry point"
```

---

## Task 11: Cleanup obsolete tag-grouping + full integration check

**Files:**
- Remove: `src/views/partials/kanban-tag.ejs`, `src/views/partials/list-view-tag.ejs` (orphaned; includes already dropped in Task 6)
- Verify: app boots, board renders, drag + status + group CRUD work end-to-end (browser)

- [ ] **Step 1: Delete the orphaned tag-grouping partials** (their `dashboard.ejs` includes were removed in Task 6):

```bash
git rm src/views/partials/kanban-tag.ejs src/views/partials/list-view-tag.ejs
```

- [ ] **Step 2: Confirm no dangling references**

Run: `grep -rn "kanban-tag\|list-view-tag\|tasks\[col" src/views/`
Expected: no matches.

- [ ] **Step 3: Boot + render smoke** (logged-in session via an active account / seed admin)

```bash
(node src/server.js > /tmp/pm.log 2>&1 &) && sleep 3
curl -s -c /tmp/cj.txt -X POST http://localhost:3000/auth/login --data-urlencode "email=admin@pmtask.com" --data-urlencode "password=demo123" -o /dev/null
curl -s -b /tmp/cj.txt http://localhost:3000/dashboard -o /tmp/dash.html -w "HTTP %{http_code}\n"
grep -c "kanban-board\|data-group-id" /tmp/dash.html
```
Expected: HTTP 200; grep count ≥ 1 (board with group columns rendered). Check `/tmp/pm.log` has no render errors.

- [ ] **Step 4: Manual browser verification** (the one interactive check)

With the server running, log in and on the board:
1. Click **Groups** → add two groups (e.g. "Frontend", "Backend"); they appear as columns after closing the modal.
2. Drag a task from "Ungrouped" into "Frontend" → reload → it stays in Frontend.
3. Click a card's **status badge** → pick "Completed" → card shows Completed; toggle **Hide completed** → it hides.
4. Open **Groups** → delete "Frontend" (confirm prompt) → its tasks return to "Ungrouped" (none lost).
5. Switch **List** view → same group sections shown.

Expected: all five behaviors work; no console errors (re-check the earlier "X is not defined" class of errors is gone).

- [ ] **Step 5: Stop server and commit**

```bash
pkill -f "node src/server.js"
git add -A
git commit -m "Remove obsolete tag-grouping views; finalize custom groups"
```

---

## Notes for the implementer

- **Auth for verification:** endpoints under `/api/groups` and `/api/tasks` require login. Use an active account; `npm run seed` provides `admin@pmtask.com` / `demo123`. The login rate limiter allows 10 attempts / 15 min per IP — don't loop logins.
- **Shared DB:** migrations and scripts run against the real configured MySQL. Every temp script here deletes the rows it creates; don't leave `__verify__` groups/tasks behind.
- **Status vs group:** dragging changes group + position only; status changes go through the card dropdown (`PATCH /tasks/:id/status`) or the task detail/edit modal (unchanged).
- **Out of scope (per spec):** group picker inside the create/edit task modal (new tasks start ungrouped), drag-reordering of group columns in the manager (a `reorder` endpoint exists but wiring the drag UI is optional follow-up), project-membership permissions.
