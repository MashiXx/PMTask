# Mindmap (Bản đồ tư duy) — Design Spec

**Date:** 2026-06-18
**Status:** Approved (brainstorming) — ready for implementation plan

## Goal

Add a **mindmap** feature to PMTask: per-project, free-form mind maps where each node
is a text idea that **may optionally be linked to a task**. A node that is not yet a
task can be **converted into a real task** in the project; a node already linked to a
task shows the task's status and can open it.

## Scope

**In scope (MVP):**
- Multiple **named mindmaps per project** (list + create/rename/delete).
- Node tree per mindmap: create child, edit label, set color, delete (deletes its subtree),
  collapse/expand a branch.
- **Hybrid layout:** nodes without manual coordinates are auto-positioned (tidy tree);
  a node that the user drags gets its `x/y` persisted and keeps that position.
- Canvas with **pan** and **zoom** (wheel / +,−, fit).
- **Task linking:** convert a node to a task (creates a Task in the project), and open the
  linked task. Linked nodes display the task's status.
- Node color (optional accent).

**Out of scope (later):**
- Real-time collaboration, undo/redo, image/export, cross-links (non-tree edges),
  drag-to-reparent (structure changes happen via add-child / delete in the MVP).
- Guest access — mindmaps are for authenticated users only (mirrors Groups).

## Architecture

Follows the existing MVC pattern: Routes → Controllers → Prisma → MySQL, server-rendered
EJS pages, vanilla JS on the client. **No new front-end dependency** — the canvas is built
with HTML node cards + an SVG connector overlay + vanilla JS (chosen so nodes can carry rich
task UI — status badge, "Create task"/"Open task" — and match the existing design tokens; also
keeps the CSP tight / works offline).

### Data model (Prisma)

```prisma
model Mindmap {
  id        Int      @id @default(autoincrement())
  name      String
  projectId Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  project   Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  nodes     MindmapNode[]
}

model MindmapNode {
  id        Int      @id @default(autoincrement())
  mindmapId Int
  parentId  Int?     // null = root node
  label     String
  color     String?
  x         Float?   // null = auto-layout; set = manually positioned
  y         Float?
  position  Int      @default(0)     // order among siblings
  collapsed Boolean  @default(false)
  taskId    Int?     // null = not linked to a task
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  mindmap   Mindmap       @relation(fields: [mindmapId], references: [id], onDelete: Cascade)
  parent    MindmapNode?  @relation("NodeChildren", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children  MindmapNode[] @relation("NodeChildren")
  task      Task?         @relation(fields: [taskId], references: [id], onDelete: SetNull)
}
```

- `Project` gains `mindmaps Mindmap[]`; `Task` gains `mindmapNodes MindmapNode[]`.
- Deleting a `Task` sets linked nodes' `taskId` to null (`SetNull`) — the node survives, just unlinked.
- The self-relation uses `NoAction` to avoid MySQL self-referencing cascade issues; **subtree
  deletion is performed in the controller** (collect descendant ids, delete in one transaction).

### API (`/api/mindmaps`, all require `isAuthenticated` + project-access check)

Mirrors `group.controller.js` style (PrismaClient per controller, `{ error }` JSON on failure).
Every handler verifies the target mindmap/node belongs to a project the user may access
(admin owns; developer sees all — reuse existing project-access rules; IDOR-safe).

- `GET  /api/mindmaps?projectId=<id>` → `[{ id, name, updatedAt, _count: { nodes } }]`
- `POST /api/mindmaps` `{ projectId, name }` → `{ success, mindmap }` (also creates a root node, label = name)
- `PUT  /api/mindmaps/:id` `{ name }` → `{ success, mindmap }`
- `DELETE /api/mindmaps/:id` → `{ success }` (cascade deletes nodes)
- `GET  /api/mindmaps/:id` → `{ mindmap, nodes: [...] }` (full tree for rendering)
- `POST /api/mindmap-nodes` `{ mindmapId, parentId, label }` → `{ success, node }`
- `PUT  /api/mindmap-nodes/:id` `{ label?, color?, x?, y?, collapsed? }` → `{ success, node }`
- `DELETE /api/mindmap-nodes/:id` → `{ success }` (deletes the node and its subtree)
- `POST /api/mindmap-nodes/:id/convert` → creates a Task (title = node.label, status `todo`,
  ungrouped, `createdById` = current user, projectId = mindmap's project), sets `node.taskId`,
  returns `{ success, task, node }`.

### Pages & navigation

- Add a **Mindmaps** entry to the per-project sidebar nav (next to Tasks / Documents).
- `GET /projects/:projectSlug/mindmaps` → **list page** (cards of mindmaps + "New mindmap").
- `GET /projects/:projectSlug/mindmaps/:mindmapId` → **canvas page**. Server passes the project
  + the mindmap's nodes as JSON; the client renders. Canonical ID-slug handling reuses
  `parseIdFromSlug` like the dashboard.

### Rendering & interaction (`mindmap.js`, `mindmap.css`)

- `.mm-canvas` (clips) → `.mm-viewport` with `transform: translate(panX, panY) scale(zoom)`.
- **Nodes**: absolutely-positioned `.mm-node` HTML cards (styled with CSS tokens). Show label;
  if `taskId`, show a **status badge** (todo/inprogress/review/done colors, reusing the existing
  status palette). Hover/selected → actions: ➕ add child, ✎ edit label (double-click inline),
  🗑 delete, and **"Create task"** (no `taskId`) or **"Open task"** (has `taskId`).
- **Connectors**: one `<svg>` overlay sized to the viewport; curved paths from each node to its
  parent, recomputed on layout / drag / pan / zoom.
- **Layout**: nodes lacking `x/y` are placed by a client-side tidy-tree algorithm; nodes with
  `x/y` keep their stored position. Dragging a node updates `x/y` only (does not reparent).
- **Persistence**: optimistic UI, each change persisted immediately via the API
  (add/edit/delete node; drag-end saves `x/y`).
- **Open task**: the canvas page includes the existing task-preview modal partial + its scripts,
  so clicking a linked node opens the same familiar preview (`openTaskPreview`).

### Default decisions

- Manual drag repositions only; changing a node's parent is out of MVP scope.
- Mindmaps are authenticated-only (no guest view).
- Converting a node creates an **ungrouped** task with status `todo`; node label is copied to the
  task title once, after which label and title are independent (no two-way sync in MVP).
- A linked task's status change is reflected on the node on next load (no real-time sync).

## Files

**Created**
- `prisma/schema.prisma` additions + migration `add_mindmaps`
- `src/controllers/mindmap.controller.js` (API handlers **and** the two page handlers)
- `src/routes/mindmap.routes.js` — API router mounted at `/api/mindmaps` and `/api/mindmap-nodes`
- `src/views/mindmaps/list.ejs`, `src/views/mindmaps/canvas.ejs`
- `src/public/js/mindmap.js`
- `src/public/css/mindmap.css`

**Modified**
- `prisma/schema.prisma` (`Project.mindmaps`, `Task.mindmapNodes`)
- `src/app.js` (mount the `/api/mindmaps` router and the two page routes
  `GET /projects/:projectSlug/mindmaps` and `GET /projects/:projectSlug/mindmaps/:mindmapId`)
- `src/views/partials/sidebar.ejs` (Mindmaps nav under a project)

## Verification (pragmatic — no test framework)

- Prisma node scripts: model + `SetNull`/subtree-delete behavior; scripts clean up rows they create.
- EJS render asserts for `mindmaps/list.ejs` and `mindmaps/canvas.ejs`.
- curl smoke for `/api/mindmaps` CRUD + node CRUD + convert (authenticated cookie).
- Manual browser check: create map → add/edit/drag nodes (positions persist) → convert a node →
  status badge appears → open task → delete a node (subtree removed) → pan/zoom.

> Note: the configured MySQL (`10.13.13.6:3306`) must be reachable to run DB-dependent
> verification and the migration.
