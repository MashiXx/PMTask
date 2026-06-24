# Task Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add markdown comments to tasks (with a single level of replies) so users can record progress notes, shown in both the task preview modal and the task detail page.

**Architecture:** A new self-referential `TaskComment` Prisma model (parentId = null for top-level, set for a reply). A REST controller + routes under `/api/comments` mirroring the existing subtask controller. A vanilla-JS IIFE module `comment.js` exposing `window.TaskComments.mount(...)`, rendered into a container in the preview modal and the detail page.

**Tech Stack:** Express, Prisma (MySQL), EJS, vanilla JS. Markdown via `marked` + `DOMPurify` (already loaded in `partials/foot.ejs`).

## Global Constraints

- Prisma scripts run via npm wrappers only: `npm run migrate -- --name <name>`, `npm run generate` (they assemble `DATABASE_URL` from `DB_*`). Never call `npx prisma` directly.
- No automated test framework exists. Verify with: `node --check <file>` for syntax, `npm run migrate`/`npm run generate` for the DB, an integration script that calls controller functions with mock `req`/`res` against the dev DB, and puppeteer renders for UI. Do NOT add jest/mocha.
- Posting permission rule = creator OR assignee OR admin (same as `subtask.controller.js`'s `canModifyTask`). Edit/delete a comment = author OR admin.
- 2 levels only: a reply may attach to a top-level comment only; reject deeper nesting server-side with HTTP 400.
- Content: trim; reject empty/whitespace-only; max length 5000 chars.
- Public/guest (when `project.publicTasks`) may READ comments only.
- Follow existing module style: IIFE, `window.TaskX`, mirror `task-attachments.js`.

---

## File Structure

- Create `src/controllers/comment.controller.js` — comment CRUD + permission + 2-level enforcement.
- Create `src/routes/comment.routes.js` — REST routes.
- Modify `src/app.js` — mount `/api/comments`.
- Modify `prisma/schema.prisma` — `TaskComment` model + relations on `Task` and `User`.
- Create `src/public/js/comment.js` — `window.TaskComments` UI module.
- Modify `src/views/partials/modals/task-preview-modal.ejs` — Comments block.
- Modify `src/public/js/modal.js` — mount comments in `openTaskPreview`.
- Modify `src/public/css/main.css` — comment styles.
- Modify `src/views/dashboard.ejs`, `src/views/mindmaps/canvas.ejs` — load `comment.js`, expose `CURRENT_USER_ID`/`IS_ADMIN`.
- Modify `src/views/task-detail.ejs` — Comments section + load `comment.js` + mount + expose globals.

---

## Task 1: Data model + migration

**Files:**
- Modify: `prisma/schema.prisma` (Task model, User model, new TaskComment model)

**Interfaces:**
- Produces: `TaskComment { id, content, taskId, authorId, parentId?, createdAt, updatedAt, author, parent, replies }`; `Task.comments`; `User.comments`.

- [ ] **Step 1: Add the `comments` relation to the Task model.** In `prisma/schema.prisma`, inside `model Task`, add to the relation list (next to `attachments TaskAttachment[]`):

```prisma
  comments    TaskComment[]
```

- [ ] **Step 2: Add the `comments` relation to the User model.** Inside `model User`, add (next to `attachments TaskAttachment[] @relation("AttachmentUploader")`):

```prisma
  comments  TaskComment[] @relation("CommentAuthor")
```

- [ ] **Step 3: Add the `TaskComment` model.** Append to `prisma/schema.prisma`:

```prisma
model TaskComment {
  id        Int      @id @default(autoincrement())
  content   String   @db.Text
  taskId    Int
  authorId  Int
  parentId  Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  task    Task          @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author  User          @relation("CommentAuthor", fields: [authorId], references: [id])
  parent  TaskComment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies TaskComment[] @relation("CommentReplies")

  @@index([taskId])
  @@index([parentId])
}
```

- [ ] **Step 4: Create and apply the migration.**

Run: `npm run migrate -- --name add_task_comments`
Expected: a new migration folder under `prisma/migrations/`, "Your database is now in sync" / migration applied, and the Prisma client regenerates.

- [ ] **Step 5: Verify the model is queryable.**

Run:
```bash
node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.taskComment.count().then(n=>{console.log('taskComment count:',n);return p.\$disconnect();}).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: prints `taskComment count: 0` with no error.

- [ ] **Step 6: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(comments): add TaskComment model + migration"
```

---

## Task 2: Backend controller + routes

**Files:**
- Create: `src/controllers/comment.controller.js`
- Create: `src/routes/comment.routes.js`
- Modify: `src/app.js` (mount route, near the other `/api/*` mounts ~line 75)
- Verify with: `scratchpad/verify-comments.js` (throwaway, not committed)

**Interfaces:**
- Consumes: `TaskComment` model (Task 1); `isAuthenticated` from `src/middleware/auth.js`.
- Produces: `GET /api/comments/task/:taskId`, `POST /api/comments/task/:taskId` `{content, parentId?}`, `PUT /api/comments/:id` `{content}`, `DELETE /api/comments/:id`. GET returns an array of top-level comments each shaped `{ id, content, author:{id,name,avatar,updatedAt}, parentId, createdAt, updatedAt, replies:[ {same shape, no replies} ] }`.

- [ ] **Step 1: Create the controller.** Create `src/controllers/comment.controller.js`:

```js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_LEN = 5000;

// Posting access: admin, task creator, or an assignee (mirrors subtask.controller).
async function canModifyTask(taskId, user) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });
  if (!task) return null;
  if (user.role === 'admin') return task;
  if (task.createdById === user.id) return task;
  if (task.assignees.some((a) => a.userId === user.id)) return task;
  return false;
}

const authorShape = { select: { id: true, name: true, avatar: true, updatedAt: true } };

function serialize(c) {
  return {
    id: c.id,
    content: c.content,
    author: c.author,
    parentId: c.parentId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    replies: (c.replies || []).map((r) => ({
      id: r.id,
      content: r.content,
      author: r.author,
      parentId: r.parentId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

function cleanContent(raw) {
  const content = (raw || '').trim();
  if (!content) return { error: 'Comment cannot be empty' };
  if (content.length > MAX_LEN) return { error: 'Comment too long' };
  return { content };
}

// GET /api/comments/task/:taskId
exports.getComments = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!req.user) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { project: { select: { publicTasks: true } } },
      });
      if (!task || !task.project.publicTasks) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const comments = await prisma.taskComment.findMany({
      where: { taskId, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: authorShape,
        replies: { orderBy: { createdAt: 'asc' }, include: { author: authorShape } },
      },
    });
    res.json(comments.map(serialize));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get comments' });
  }
};

// POST /api/comments/task/:taskId  body: { content, parentId? }
exports.createComment = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const { content, error } = cleanContent(req.body.content);
    if (error) return res.status(400).json({ error });

    let parentId = null;
    if (req.body.parentId != null && req.body.parentId !== '') {
      parentId = parseInt(req.body.parentId);
      const parent = await prisma.taskComment.findUnique({ where: { id: parentId } });
      if (!parent || parent.taskId !== taskId) {
        return res.status(400).json({ error: 'Invalid parent comment' });
      }
      if (parent.parentId !== null) {
        return res.status(400).json({ error: 'Replies cannot be nested further' });
      }
    }

    const comment = await prisma.taskComment.create({
      data: { content, taskId, authorId: req.user.id, parentId },
      include: { author: authorShape, replies: { include: { author: authorShape } } },
    });
    res.status(201).json(serialize(comment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

// PUT /api/comments/:id  body: { content }
exports.updateComment = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comment = await prisma.taskComment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { content, error } = cleanContent(req.body.content);
    if (error) return res.status(400).json({ error });

    const updated = await prisma.taskComment.update({
      where: { id },
      data: { content },
      include: { author: authorShape, replies: { include: { author: authorShape } } },
    });
    res.json(serialize(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
};

// DELETE /api/comments/:id  (cascade removes replies)
exports.deleteComment = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comment = await prisma.taskComment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.taskComment.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};
```

- [ ] **Step 2: Create the routes.** Create `src/routes/comment.routes.js`:

```js
const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const comment = require('../controllers/comment.controller');

router.get('/task/:taskId', comment.getComments);
router.post('/task/:taskId', isAuthenticated, comment.createComment);
router.put('/:id', isAuthenticated, comment.updateComment);
router.delete('/:id', isAuthenticated, comment.deleteComment);

module.exports = router;
```

- [ ] **Step 3: Mount the route in `src/app.js`.** After the line `app.use('/api/subtasks', require('./routes/subtask.routes'));` add:

```js
app.use('/api/comments', require('./routes/comment.routes'));
```

- [ ] **Step 4: Syntax check.**

Run: `node --check src/controllers/comment.controller.js && node --check src/routes/comment.routes.js && node --check src/app.js`
Expected: no output (all valid).

- [ ] **Step 5: Write the integration verification script.** Create `scratchpad/verify-comments.js` (throwaway — uses the dev DB, mock req/res, then cleans up):

```js
const { PrismaClient } = require('@prisma/client');
const ctrl = require('../src/controllers/comment.controller');
const prisma = new PrismaClient();

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

(async () => {
  // Use the first existing project + user from the seeded dev DB.
  const user = await prisma.user.findFirst({ where: { role: 'admin' } });
  const project = await prisma.project.findFirst();
  const task = await prisma.task.create({ data: { title: 'comment-verify', projectId: project.id, createdById: user.id, slug: 'comment-verify' } });

  // create top-level
  let res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: '  hello  ' }, user }, res);
  assert(res.statusCode === 201, 'create top-level returns 201');
  assert(res.body.content === 'hello', 'content trimmed');
  const parentId = res.body.id;

  // reject empty
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: '   ' }, user }, res);
  assert(res.statusCode === 400, 'empty content rejected with 400');

  // create reply (valid)
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: 'a reply', parentId }, user }, res);
  assert(res.statusCode === 201, 'reply to top-level returns 201');
  const replyId = res.body.id;

  // reject 2nd-level reply
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: 'deep', parentId: replyId }, user }, res);
  assert(res.statusCode === 400, 'reply-to-reply rejected with 400');

  // GET returns nested
  res = mockRes();
  await ctrl.getComments({ params: { taskId: String(task.id) }, user }, res);
  assert(Array.isArray(res.body) && res.body.length === 1, 'GET returns 1 top-level');
  assert(res.body[0].replies.length === 1, 'top-level has 1 reply');

  // delete parent cascades reply
  res = mockRes();
  await ctrl.deleteComment({ params: { id: String(parentId) }, user }, res);
  assert(res.statusCode === 200, 'delete parent ok');
  const remaining = await prisma.taskComment.count({ where: { taskId: task.id } });
  assert(remaining === 0, 'deleting parent cascades reply (0 remaining)');

  // cleanup
  await prisma.task.delete({ where: { id: task.id } });
  await prisma.$disconnect();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run the verification script.**

Run: `node scratchpad/verify-comments.js`
Expected: all lines start with `ok:`, ends with `done`, exit code 0. (Requires the dev DB seeded — run `npm run seed` first if empty.)

- [ ] **Step 7: Commit.**

```bash
git add src/controllers/comment.controller.js src/routes/comment.routes.js src/app.js
git commit -m "feat(comments): add comment REST API (CRUD, 2-level, permissions)"
```

---

## Task 3: Frontend module `comment.js`

**Files:**
- Create: `src/public/js/comment.js`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/comments/...` (Task 2); global `marked`, `DOMPurify`.
- Produces: `window.TaskComments.mount({ container, taskId, canEdit, currentUserId, isAdmin })` and `window.TaskComments.reload(container)`. Renders into the element whose id is `container`.

- [ ] **Step 1: Create the module.** Create `src/public/js/comment.js`:

```js
(function () {
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(marked.parse(text || ''));
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    const s = Math.round((Date.now() - then) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' minute' + (m > 1 ? 's' : '') + ' ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hour' + (h > 1 ? 's' : '') + ' ago';
    const d = Math.round(h / 24);
    if (d < 30) return d + ' day' + (d > 1 ? 's' : '') + ' ago';
    return new Date(iso).toLocaleDateString();
  }

  function avatarInner(u) {
    if (u && u.avatar) {
      const src = /^https?:\/\//i.test(u.avatar)
        ? u.avatar
        : '/users/' + u.id + '/avatar' + (u.updatedAt ? '?v=' + new Date(u.updatedAt).getTime() : '');
      return '<img src="' + escapeHtml(src) + '" alt="">';
    }
    return u && u.name ? u.name.charAt(0).toUpperCase() : '?';
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json(); });
  }

  const instances = {};

  function mount(opts) {
    const root = document.getElementById(opts.container);
    if (!root) return;
    const state = {
      container: opts.container,
      taskId: opts.taskId,
      canEdit: !!opts.canEdit,
      currentUserId: opts.currentUserId,
      isAdmin: !!opts.isAdmin,
      root: root,
      raw: {},
      bound: instances[opts.container] ? instances[opts.container].bound : false,
    };
    instances[opts.container] = state;
    if (!state.bound) { bind(state); state.bound = true; }
    load(state);
  }

  function load(state) {
    state.root.innerHTML = '<div class="comment-loading">Loading…</div>';
    api('GET', '/api/comments/task/' + state.taskId)
      .then(function (data) { render(state, Array.isArray(data) ? data : []); })
      .catch(function () { state.root.innerHTML = '<div class="comment-empty">Failed to load comments.</div>'; });
  }

  function render(state, comments) {
    state.raw = {};
    state.root.innerHTML = '';
    if (state.canEdit) state.root.appendChild(composer(state, null));
    if (!comments.length) {
      const empty = document.createElement('div');
      empty.className = 'comment-empty';
      empty.textContent = 'No comments yet.';
      state.root.appendChild(empty);
      return;
    }
    comments.forEach(function (c) { state.root.appendChild(itemEl(state, c, false)); });
  }

  function itemEl(state, c, isReply) {
    state.raw[c.id] = c.content;
    const wrap = document.createElement('div');
    wrap.className = 'comment-item' + (isReply ? ' comment-reply' : '');
    wrap.dataset.commentId = c.id;
    const edited = new Date(c.updatedAt) > new Date(c.createdAt);
    const manage = state.canEdit && (state.isAdmin || (c.author && c.author.id === state.currentUserId));

    const row = document.createElement('div');
    row.className = 'comment-row';
    row.innerHTML =
      '<div class="comment-avatar" title="' + escapeHtml(c.author.name) + '">' + avatarInner(c.author) + '</div>' +
      '<div class="comment-main">' +
        '<div class="comment-head">' +
          '<span class="comment-author">' + escapeHtml(c.author.name) + '</span>' +
          '<span class="comment-time" title="' + escapeHtml(new Date(c.createdAt).toLocaleString()) + '">' +
            escapeHtml(relativeTime(c.createdAt)) + (edited ? ' (edited)' : '') +
          '</span>' +
        '</div>' +
        '<div class="comment-body markdown-body">' + renderMarkdown(c.content) + '</div>' +
        '<div class="comment-actions">' +
          (!isReply && state.canEdit ? '<button type="button" class="comment-link-btn" data-act="reply">Reply</button>' : '') +
          (manage ? '<button type="button" class="comment-link-btn" data-act="edit">Edit</button>' : '') +
          (manage ? '<button type="button" class="comment-link-btn danger" data-act="delete">Delete</button>' : '') +
        '</div>' +
      '</div>';
    wrap.appendChild(row);

    if (!isReply) {
      const sub = document.createElement('div');
      sub.className = 'comment-sub';
      (c.replies || []).forEach(function (r) { sub.appendChild(itemEl(state, r, true)); });
      wrap.appendChild(sub);
    }
    return wrap;
  }

  function composer(state, parentId) {
    const box = document.createElement('div');
    box.className = 'comment-composer' + (parentId ? ' comment-composer-reply' : '');
    const ta = document.createElement('textarea');
    ta.className = 'comment-input';
    ta.rows = parentId ? 2 : 3;
    ta.placeholder = parentId ? 'Write a reply…' : 'Write a comment…';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comment-submit-btn';
    btn.textContent = parentId ? 'Reply' : 'Comment';
    btn.addEventListener('click', function () {
      const content = ta.value.trim();
      if (!content) return;
      btn.disabled = true;
      api('POST', '/api/comments/task/' + state.taskId, { content: content, parentId: parentId })
        .then(function () { load(state); })
        .catch(function () { btn.disabled = false; });
    });
    box.appendChild(ta);
    box.appendChild(btn);
    return box;
  }

  function startEdit(state, itemWrap, id) {
    const main = itemWrap.querySelector('.comment-row .comment-main');
    if (!main || main.querySelector('.comment-edit')) return;
    const body = main.querySelector('.comment-body');
    const actions = main.querySelector('.comment-actions');

    const editBox = document.createElement('div');
    editBox.className = 'comment-edit';
    const ta = document.createElement('textarea');
    ta.className = 'comment-input';
    ta.rows = 3;
    ta.value = state.raw[id] || '';
    const bar = document.createElement('div');
    bar.className = 'comment-edit-bar';
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'comment-submit-btn'; save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'comment-link-btn'; cancel.textContent = 'Cancel';
    save.addEventListener('click', function () {
      const content = ta.value.trim();
      if (!content) return;
      save.disabled = true;
      api('PUT', '/api/comments/' + id, { content: content }).then(function () { load(state); });
    });
    cancel.addEventListener('click', function () { load(state); });
    bar.appendChild(save); bar.appendChild(cancel);
    editBox.appendChild(ta); editBox.appendChild(bar);

    body.style.display = 'none';
    actions.style.display = 'none';
    main.insertBefore(editBox, actions);
    ta.focus();
  }

  function bind(state) {
    state.root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn || !state.root.contains(btn)) return;
      const itemWrap = btn.closest('.comment-item');
      if (!itemWrap) return;
      const id = parseInt(itemWrap.dataset.commentId);
      const act = btn.dataset.act;

      if (act === 'reply') {
        const sub = itemWrap.querySelector('.comment-sub');
        const existing = sub.querySelector('.comment-composer-reply');
        if (existing) { existing.remove(); return; }
        const c = composer(state, id);
        sub.appendChild(c);
        c.querySelector('.comment-input').focus();
      } else if (act === 'edit') {
        startEdit(state, itemWrap, id);
      } else if (act === 'delete') {
        if (!confirm('Delete this comment?')) return;
        api('DELETE', '/api/comments/' + id).then(function () { load(state); });
      }
    });
  }

  window.TaskComments = {
    mount: mount,
    reload: function (container) { const s = instances[container]; if (s) load(s); },
  };
})();
```

- [ ] **Step 2: Syntax check.**

Run: `node --check src/public/js/comment.js`
Expected: no output.

- [ ] **Step 3: Commit.**

```bash
git add src/public/js/comment.js
git commit -m "feat(comments): add TaskComments frontend module"
```

---

## Task 4: Preview-modal integration + styles

**Files:**
- Modify: `src/views/partials/modals/task-preview-modal.ejs` (add Comments block in `.preview-main`, after the Attachments `.preview-block`)
- Modify: `src/public/js/modal.js` (`openTaskPreview`, after the attachments mount)
- Modify: `src/public/css/main.css` (append comment styles)
- Modify: `src/views/dashboard.ejs` and `src/views/mindmaps/canvas.ejs` (load `comment.js`, expose globals)

**Interfaces:**
- Consumes: `window.TaskComments.mount` (Task 3); `window.IS_GUEST`, new `window.CURRENT_USER_ID`, `window.IS_ADMIN`.

- [ ] **Step 1: Add the Comments container to the modal.** In `src/views/partials/modals/task-preview-modal.ejs`, inside `.preview-main`, immediately after the Attachments `.preview-block` (the one containing `previewAttachmentsList`), add:

```html
        <!-- Comments -->
        <div class="preview-block">
          <p class="label-meta">Comments</p>
          <div id="previewComments" class="comment-list"></div>
        </div>
```

- [ ] **Step 2: Expose user globals in `dashboard.ejs`.** In `src/views/dashboard.ejs`, in the inline `<script>` where `window.IS_GUEST` is set (~line 26), add right after it:

```html
window.CURRENT_USER_ID = <%= typeof currentUser !== 'undefined' && currentUser ? currentUser.id : 'null' %>;
window.IS_ADMIN = <%= typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin' ? 'true' : 'false' %>;
```

- [ ] **Step 3: Load `comment.js` in `dashboard.ejs`.** After the `<script src="/js/subtask.js"></script>` line (~line 39) add:

```html
<script src="/js/comment.js"></script>
```

- [ ] **Step 4: Same wiring in `mindmaps/canvas.ejs`.** After `<script src="/js/subtask.js"></script>` (~line 40) add `<script src="/js/comment.js"></script>`. If `window.IS_GUEST` is set in this view's inline script, add the same two `CURRENT_USER_ID`/`IS_ADMIN` lines next to it; if there is no such inline script, add one before the module scripts:

```html
<script>
window.CURRENT_USER_ID = <%= typeof currentUser !== 'undefined' && currentUser ? currentUser.id : 'null' %>;
window.IS_ADMIN = <%= typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin' ? 'true' : 'false' %>;
</script>
```

- [ ] **Step 5: Mount comments in `openTaskPreview`.** In `src/public/js/modal.js`, find the attachments mount block (`if (window.TaskAttachments) { window.TaskAttachments.mount({ ... }); }`) inside `openTaskPreview`. Immediately after that block's closing `}`, add:

```js
    if (window.TaskComments) {
      window.TaskComments.mount({
        container: 'previewComments',
        taskId: task.id,
        canEdit: !isGuest,
        currentUserId: window.CURRENT_USER_ID,
        isAdmin: window.IS_ADMIN,
      });
    }
```

- [ ] **Step 6: Append comment styles to `main.css`:**

```css
/* ── Task Comments ── */
.comment-list { display: flex; flex-direction: column; gap: 14px; }

.comment-composer { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
.comment-composer-reply { margin-top: 10px; }
.comment-input {
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  font-family: inherit;
  font-size: 0.8rem;
  color: var(--text);
  line-height: 1.5;
  outline: none;
  resize: vertical;
  min-height: 38px;
}
.comment-input:focus { border-color: var(--accent); }
.comment-submit-btn {
  align-self: flex-start;
  padding: 7px 14px;
  background: var(--accent);
  color: #fff;
  border-radius: 7px;
  font-size: 0.75rem;
  font-weight: 600;
  transition: filter 0.15s ease;
}
.comment-submit-btn:hover { filter: brightness(1.12); }
.comment-submit-btn:disabled { opacity: 0.6; cursor: default; }

.comment-item { display: flex; flex-direction: column; }
.comment-row { display: flex; gap: 10px; align-items: flex-start; }
.comment-avatar {
  flex-shrink: 0;
  width: 30px; height: 30px;
  border-radius: 50%;
  background: var(--border-light);
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  overflow: hidden;
}
.comment-avatar img { width: 100%; height: 100%; object-fit: cover; }
.comment-main { flex: 1 1 auto; min-width: 0; }
.comment-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 3px; }
.comment-author { font-size: 0.8rem; font-weight: 600; color: var(--text); }
.comment-time { font-size: 0.65rem; font-family: var(--font-mono); color: var(--text-dim); }
.comment-body { font-size: 0.8rem; color: var(--text-muted); line-height: 1.6; word-break: break-word; }
.comment-body p { margin: 0 0 6px; }
.comment-body p:last-child { margin-bottom: 0; }
.comment-actions { display: flex; gap: 12px; margin-top: 5px; }
.comment-link-btn {
  background: none; border: none; padding: 0;
  font-size: 0.68rem; font-weight: 600; color: var(--text-dim);
  cursor: pointer; transition: color 0.15s ease;
}
.comment-link-btn:hover { color: var(--text); }
.comment-link-btn.danger:hover { color: var(--coral); }
.comment-edit { display: flex; flex-direction: column; gap: 8px; margin: 4px 0; }
.comment-edit-bar { display: flex; gap: 10px; align-items: center; }
.comment-sub {
  margin-top: 12px; margin-left: 40px;
  display: flex; flex-direction: column; gap: 12px;
  border-left: 2px solid var(--border); padding-left: 12px;
}
.comment-empty, .comment-loading {
  font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); padding: 4px 0;
}
```

- [ ] **Step 7: Syntax check JS + render the modal with comments.**

Run: `node --check src/public/js/modal.js`
Then render the modal with two stubbed comments (one with a reply) by extending the existing scratchpad render harness: in a puppeteer page that loads the modal partial + `main.css`, inject `<script src=".../comment.js">` is not needed — instead set `#previewComments` innerHTML via the real module by loading `comment.js` content and calling `render`. Minimum check: confirm `#previewComments` exists and the CSS classes style a stubbed structure:

```bash
node -e "const ejs=require('ejs'),path=require('path');ejs.renderFile('src/views/partials/modals/task-preview-modal.ejs',{currentUser:{id:1}},{root:'src/views/partials'}).then(h=>{if(!h.includes('id=\"previewComments\"')){console.error('MISSING previewComments');process.exit(1)}console.log('previewComments present OK')}).catch(e=>{console.error(e);process.exit(1)})"
```
Expected: `previewComments present OK`.

- [ ] **Step 8: Commit.**

```bash
git add src/views/partials/modals/task-preview-modal.ejs src/public/js/modal.js src/public/css/main.css src/views/dashboard.ejs src/views/mindmaps/canvas.ejs
git commit -m "feat(comments): show comments in task preview modal"
```

---

## Task 5: Detail-page integration

**Files:**
- Modify: `src/views/task-detail.ejs` (Comments section in `.task-detail-main`, load script, expose globals, mount)

**Interfaces:**
- Consumes: `window.TaskComments.mount` (Task 3); `window.TASK_DATA` (already defined with `id`, `canEdit`).

- [ ] **Step 1: Add the Comments section markup.** In `src/views/task-detail.ejs`, inside `.task-detail-main`, after the last existing section (e.g. attachments/subtasks section), add:

```html
        <div class="task-detail-section">
          <p class="label-meta">Comments</p>
          <div id="detailComments" class="comment-list"></div>
        </div>
```

- [ ] **Step 2: Load `comment.js`.** After `<script src="/js/task-attachments.js"></script>` (~line 263) add:

```html
<script src="/js/comment.js"></script>
```

- [ ] **Step 3: Expose user fields + mount.** In the inline script where `window.TASK_DATA` is built (~line 251), add `currentUserId` and `isAdmin` to the object:

```js
    currentUserId: <%= typeof currentUser !== 'undefined' && currentUser ? currentUser.id : 'null' %>,
    isAdmin: <%= typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin' ? 'true' : 'false' %>,
```

Then, in the block that mounts attachments (`if (window.TaskAttachments && window.TASK_DATA) { ... }`), after it add:

```js
  if (window.TaskComments && window.TASK_DATA) {
    window.TaskComments.mount({
      container: 'detailComments',
      taskId: window.TASK_DATA.id,
      canEdit: window.TASK_DATA.canEdit,
      currentUserId: window.TASK_DATA.currentUserId,
      isAdmin: window.TASK_DATA.isAdmin,
    });
  }
```

- [ ] **Step 4: Verify the markup renders.**

Run: `grep -c 'id="detailComments"' src/views/task-detail.ejs`
Expected: `1`.

- [ ] **Step 5: Commit.**

```bash
git add src/views/task-detail.ejs
git commit -m "feat(comments): show comments on task detail page"
```

---

## Task 6: End-to-end manual verification

**Files:** none (manual run)

- [ ] **Step 1: Ensure DB is seeded.** Run `npm run seed` if the dev DB has no sample task. Login: `admin@pmtask.com` / `demo123`.

- [ ] **Step 2: Start the app.** Run `npm run dev`. Open the dashboard, click a task to open the preview modal.

- [ ] **Step 3: Exercise the flows and confirm each:**
  - Add a top-level comment → it appears with your name + "just now".
  - Click **Reply** on it, submit → reply appears indented; the reply has **no** Reply button.
  - **Edit** your comment (markdown like `**bold**`) → renders bold, shows "(edited)".
  - **Delete** the parent → it and its reply both disappear.
  - Open the same task's detail page (`Expand`) → the same comments render and are editable.
  - Log out (or open a public task as guest) → comments are visible but the composer / Reply / Edit / Delete are hidden.

- [ ] **Step 4: Final commit (if any tweaks were needed during verification).**

```bash
git add -A
git commit -m "fix(comments): verification adjustments"
```

---

## Self-Review Notes

- **Spec coverage:** data model + 2-level enforcement (Task 1–2), permissions creator/assignee/admin + author/admin edit-delete (Task 2), public read-only (Task 2 GET + frontend `canEdit`), markdown + relative time + "(edited)" (Task 3), preview modal + detail page placement (Task 4–5). All covered.
- **Placeholders:** none — every step has concrete code/commands.
- **Type consistency:** GET/serialize shape `{id, content, author{id,name,avatar,updatedAt}, parentId, createdAt, updatedAt, replies[]}` is consistent across controller, verify script, and `comment.js`. `window.TaskComments.mount({container,taskId,canEdit,currentUserId,isAdmin})` matches both mount call sites.
