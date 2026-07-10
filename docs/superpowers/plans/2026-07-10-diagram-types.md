# Multi-Type Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Flowchart and Architecture Diagram types alongside the existing Mindmap, all in one per-project list, with a type picker on create.

**Architecture:** Extend the existing `Mindmap`/`MindmapNode` models additively with a `type` discriminator, node `shape`/`width`/`height`, and a new `MindmapEdge` table for free-form edges. Mindmap keeps its tree editor untouched. Flowchart + Architecture share a new free-form editor engine (`diagram.js`) that reuses the mindmap's pan/zoom, undo/redo, export, and modal infrastructure. The canvas page loads the right engine by `type`.

**Tech Stack:** Express + EJS + Prisma (MySQL), vanilla JS frontend (custom DOM + SVG), html-to-image for PNG export.

## Global Constraints
- Model/table names stay `Mindmap`/`MindmapNode` (historical) to avoid data migration and regressions; "Diagram" is the user-facing concept only. Decision deviates from spec's `@@map` rename for safety — same end user experience.
- Migrations MUST NOT drop the `sessions` table (express-mysql-session owns it) — strip any such statement. In agent/CI use `prisma migrate diff` + `migrate deploy`, not interactive `migrate dev`.
- Prisma runs via `npm run prisma -- <cmd>` / `npm run migrate` (builds DATABASE_URL from DB_* in .env).
- Free-form edges (`MindmapEdge`) apply ONLY to `flowchart`/`architecture`; `mindmap` type never uses them.
- Follow existing controller patterns: `userCanAccessProject` auth on every endpoint; per-action REST (no bulk save); `prisma.$transaction` deepest-first for the NoAction self-FK.
- i18n: every user-facing string goes through `t('...')` with keys added to both `src/locales/en.json` and `src/locales/vi.json`.

---

## File Structure

- `prisma/schema.prisma` — add fields + `MindmapEdge` model (modify).
- `prisma/migrations/<ts>_add_diagram_types/migration.sql` — new migration (create).
- `src/controllers/mindmap.controller.js` — add `type` handling, edge CRUD, node shape fields, pass `type` to views (modify).
- `src/routes/mindmap.routes.js` — add edge router (modify).
- `src/app.js` — mount `/api/mindmap-edges` (modify).
- `src/views/mindmaps/list.ejs` — type badge + create-with-type picker (modify).
- `src/views/mindmaps/canvas.ejs` — branch scripts by `type` (modify).
- `src/public/js/mindmap-list.js` — type picker create flow (modify).
- `src/public/js/diagram.js` — NEW free-form engine (create).
- `src/public/css/diagram.css` — NEW styles for shapes/edges/groups (create).
- `src/locales/en.json`, `src/locales/vi.json` — new keys (modify).
- `src/views/partials/sidebar.ejs` — label stays "Mindmaps" nav (optional relabel) (modify optional).

---

## Task 1: Data model + migration

**Files:**
- Modify: `prisma/schema.prisma` (Mindmap ~193, MindmapNode ~204)
- Create: `prisma/migrations/<timestamp>_add_diagram_types/migration.sql`

**Produces:** `Mindmap.type`, `MindmapNode.shape/width/height`, `MindmapEdge` model + `prisma.mindmapEdge` client.

- [ ] **Step 1:** In `schema.prisma`, add to `Mindmap`: `type String @default("mindmap")` and relation `edges MindmapEdge[]`.
- [ ] **Step 2:** Add to `MindmapNode`: `shape String @default("rect")`, `width Float?`, `height Float?`, and relations `edgesFrom MindmapEdge[] @relation("EdgeSource")`, `edgesTo MindmapEdge[] @relation("EdgeTarget")`.
- [ ] **Step 3:** Add new model:
```prisma
model MindmapEdge {
  id        Int      @id @default(autoincrement())
  mindmapId Int
  sourceId  Int
  targetId  Int
  label     String?  @db.Text
  style     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  mindmap Mindmap     @relation(fields: [mindmapId], references: [id], onDelete: Cascade)
  source  MindmapNode @relation("EdgeSource", fields: [sourceId], references: [id], onDelete: Cascade)
  target  MindmapNode @relation("EdgeTarget", fields: [targetId], references: [id], onDelete: Cascade)

  @@index([mindmapId])
  @@index([sourceId])
  @@index([targetId])
}
```
- [ ] **Step 4:** Create the migration SQL by diffing (non-interactive):
```bash
npm run prisma -- migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > /tmp/diff.sql
```
Then hand-author `prisma/migrations/<ts>_add_diagram_types/migration.sql` with the ALTERs (add `type` to `Mindmap`; `shape`,`width`,`height` to `MindmapNode`) and `CREATE TABLE MindmapEdge` + FKs/indexes. **Verify no `DROP TABLE sessions`.**
- [ ] **Step 5:** Apply + regenerate:
```bash
npm run prisma -- migrate deploy
npm run generate
```
- [ ] **Step 6: Verify** — `node -e "require('./src/config/prisma').mindmapEdge.count().then(c=>{console.log('edges',c);process.exit(0)})"` prints `edges 0` (table exists). Existing mindmaps still load.
- [ ] **Step 7: Commit** — `feat(db): add diagram type, node shapes, and MindmapEdge table`

---

## Task 2: Backend — type on diagram, node shapes, edge CRUD

**Files:**
- Modify: `src/controllers/mindmap.controller.js`
- Modify: `src/routes/mindmap.routes.js`
- Modify: `src/app.js:108`

**Interfaces produced (REST):**
- `POST /api/mindmaps` body now accepts `type` ('mindmap'|'flowchart'|'architecture'); mindmap auto-creates root node, others create empty.
- `GET /api/mindmaps/:id` → `{ mindmap, nodes, edges }` (edges `[]` for mindmap type).
- `POST /api/mindmap-nodes` accepts `shape`, `parentId`, `x`, `y`.
- `PUT /api/mindmap-nodes/:id` accepts `shape`, `width`, `height`, `parentId` in addition to existing fields.
- `DELETE /api/mindmap-nodes/:id` — also deletes connected edges; if node is a `group` shape, detaches members (`parentId`→null) instead of deleting them.
- `POST /api/mindmap-edges` body `{ mindmapId, sourceId, targetId, label? }` → `{ success, edge }`.
- `PUT /api/mindmap-edges/:id` body `{ label?, style? }`.
- `DELETE /api/mindmap-edges/:id`.

- [ ] **Step 1:** `createMindmap`: read `type` from body, validate in `['mindmap','flowchart','architecture']` (default `mindmap`). Store on create. Only auto-create root node when `type === 'mindmap'`; for others, create one starter node (`label` = name, `shape` = 'rect', `x:0,y:0`) so the canvas isn't blank.
```js
const type = ['mindmap','flowchart','architecture'].includes(req.body.type) ? req.body.type : 'mindmap';
const mindmap = await prisma.mindmap.create({ data: { name: name.trim(), projectId: pid, type } });
if (type === 'mindmap') {
  await prisma.mindmapNode.create({ data: { mindmapId: mindmap.id, label: name.trim(), parentId: null } });
} else {
  await prisma.mindmapNode.create({ data: { mindmapId: mindmap.id, label: name.trim(), shape: 'rect', x: 0, y: 0 } });
}
```
- [ ] **Step 2:** `getMindmap`: also fetch edges and return them.
```js
const edges = await prisma.mindmapEdge.findMany({ where: { mindmapId: loaded.mindmap.id } });
res.json({ mindmap: loaded.mindmap, nodes, edges });
```
- [ ] **Step 3:** `createNode`: accept `shape` (validate against `['rect','diamond','ellipse','parallelogram','group']`, default 'rect'), `x`, `y`. Keep parent validation.
- [ ] **Step 4:** `updateNode`: extend `data` with `shape` (validated), `width`, `height` (parseFloat/null), and `parentId` (validate same mindmap or null).
- [ ] **Step 5:** `deleteNode`: before the subtree delete, in the transaction also delete `mindmapEdge` where `sourceId`/`targetId` in the deleted set. If the deleted node's `shape === 'group'`, first `updateMany` its direct children `parentId`→null and DO NOT cascade-delete them (only delete the group node itself + its edges).
```js
// edges touching any node being removed
const delEdges = prisma.mindmapEdge.deleteMany({ where: { OR: [{ sourceId: { in: toDelete } }, { targetId: { in: toDelete } }] } });
```
For a `group` node: `toDelete = [group.id]` only, plus `prisma.mindmapNode.updateMany({ where: { parentId: group.id }, data: { parentId: null } })`.
- [ ] **Step 6:** Add `createEdge`, `updateEdge`, `deleteEdge` (auth via loaded mindmap/project; reject if `mindmap.type === 'mindmap'`; validate source/target belong to mindmap).
- [ ] **Step 7:** In `mindmap.routes.js` add `edgeRouter` (post `/`, put `/:id`, delete `/:id`) and export it; mount in `app.js` as `app.use('/api/mindmap-edges', require('./routes/mindmap.routes').edgeRouter);`.
- [ ] **Step 8:** Pass `mindmap` (incl. `type`) and `edges` to the canvas view in `getMindmapCanvasPage`; add `edges` fetch there too.
- [ ] **Step 9: Verify** with the app running (`npm run dev`) using curl with a session cookie, or via the UI in later tasks. Minimal check: create a flowchart via API returns `type:'flowchart'`, GET returns `edges: []`.
- [ ] **Step 10: Commit** — `feat(api): diagram type, node shapes, and edge CRUD`

---

## Task 3: List page — type picker + badges

**Files:**
- Modify: `src/views/mindmaps/list.ejs`
- Modify: `src/public/js/mindmap-list.js`
- Modify: `src/locales/en.json`, `src/locales/vi.json`

**Interfaces consumed:** `POST /api/mindmaps` with `type`.

- [ ] **Step 1:** Add i18n keys: `diagram.typeMindmap/typeFlowchart/typeArchitecture`, `js.diagram.chooseType`, and reuse existing mindmap create keys. (both locales)
- [ ] **Step 2:** `list.ejs`: render a type badge per card using `m.type` (icon + label). Card link stays `/projects/<slug>/mindmaps/<id>`.
- [ ] **Step 3:** `mindmap-list.js`: change `createMindmap()` to first pick a type. Add a small `mmPickType()` helper (a modal with 3 buttons using `mm-ui` conventions, or a sequential `mmPrompt` fallback returning 'mindmap'|'flowchart'|'architecture'), then prompt name, then `POST` with `{ projectId, name, type }`, redirect to the new canvas.
- [ ] **Step 4: Verify** — from the list page, "New" offers three types; creating each lands on the canvas and the card shows the right badge after returning.
- [ ] **Step 5: Commit** — `feat(diagrams): type picker and badges on list page`

---

## Task 4: Canvas routing by type

**Files:**
- Modify: `src/views/mindmaps/canvas.ejs`
- Modify: `src/controllers/mindmap.controller.js` (`getMindmapCanvasPage` already passes `mindmap`+`edges` from Task 2)

- [ ] **Step 1:** In `canvas.ejs`, expose `window.DIAGRAM = { id, type, projectSlug }` and `window.DIAGRAM_EDGES = <edges json>` alongside existing `window.MINDMAP*` vars.
- [ ] **Step 2:** Branch the trailing scripts: if `mindmap.type === 'mindmap'` load the current mindmap stack (`mindmap.js` + layout/color/search/history). Else load the shared reusable modules (`mm-ui.js`, `mindmap-history.js`, html-to-image) + new `diagram.css` + `diagram.js`.
- [ ] **Step 3:** Keep the toolbar markup but make labels/buttons conditional where flowchart/architecture differ (shape buttons added by `diagram.js` at runtime is fine).
- [ ] **Step 4: Verify** — opening a mindmap still renders exactly as before (regression); opening a flowchart loads `diagram.js` with no console errors (even before full engine — a stub render).
- [ ] **Step 5: Commit** — `feat(diagrams): load editor engine by diagram type`

---

## Task 5: Free-form editor engine (`diagram.js` + `diagram.css`)

**Files:**
- Create: `src/public/js/diagram.js`
- Create: `src/public/css/diagram.css`
- Modify: `src/locales/en.json`, `src/locales/vi.json` (engine strings)

**Interfaces consumed:** `window.DIAGRAM`, `window.MINDMAP_NODES`, `window.DIAGRAM_EDGES`; REST endpoints from Task 2; `mm-ui.js` (`mmPrompt/mmConfirm/mmToast`); `mindmap-history.js` (`mmCreateHistory`); global `t()`.

**Engine responsibilities (module `diagram.js`):**
- State `DG = { id, type, nodes, edges, byId, pan, zoom, selectedId, selectedEdgeId, connectFrom, history }`.
- `dgRender()` rebuilds node DOM in `#mmViewport` (reuse existing ids) and calls `dgRenderEdges()` into `#mmSvg`. `group` shape renders as a container rect behind members.
- Node shapes via CSS class + SVG/clip-path: `rect`, `diamond`, `ellipse`, `parallelogram`, `group`.
- Pan/zoom: reuse the transform approach (`translate(pan) scale(zoom)` on both svg + viewport), same wheel/drag/pinch handlers as mindmap.
- Interactions: drag node → `PUT x,y`; double-click label → `mmPrompt` → `PUT label`; toolbar "add box" → `POST node` with chosen shape at viewport center; connection handle drag from node A to node B → `POST /api/mindmap-edges`; click edge → select → delete or edit label (`PUT`); resize handle on group/box → `PUT width,height`; drop a box inside a group → `PUT parentId`; delete key removes selected node (`DELETE`, detaches group members) or edge.
- Toolbar built per `type`: flowchart shows rect/diamond/ellipse/parallelogram add buttons; architecture shows rect + group; both share zoom/fit/export/undo/redo.
- Undo/redo via `mmCreateHistory(50)` recording inverse REST ops for move/label/color/shape/add/delete/edge-add/edge-delete.
- Export PNG via `html-to-image` (same as mindmap).
- Optional: convert node → task reusing existing task-preview modal (only if wired without heavy cost; else omit — YAGNI).

- [ ] **Step 1:** Write `diagram.css`: shape classes, group container, edge path + arrowhead marker, edge label chip, selection outline, connection handle, resize handle — using existing theme CSS vars from `mindmap.css` for light/dark parity.
- [ ] **Step 2:** Write `diagram.js` state bootstrap + `dgRender()`/`dgRenderEdges()` (read-only render of nodes+edges).
- [ ] **Step 3:** Add pan/zoom + node drag (persist x/y).
- [ ] **Step 4:** Add toolbar shape-add buttons (per type) + label edit + color.
- [ ] **Step 5:** Add edge creation (connection handle) + edge select/label/delete.
- [ ] **Step 6:** Add group membership (drop-in / detach) + resize.
- [ ] **Step 7:** Add undo/redo + export PNG.
- [ ] **Step 8: Verify** end-to-end for both flowchart and architecture (see Task 7 checklist).
- [ ] **Step 9: Commit** — `feat(diagrams): free-form flowchart/architecture editor engine`

---

## Task 6: Sidebar + i18n polish

**Files:**
- Modify: `src/views/partials/sidebar.ejs` (line ~54)
- Modify: `src/locales/en.json`, `src/locales/vi.json`

- [ ] **Step 1:** Keep the nav link to `/mindmaps` (URLs unchanged) but the visible label can stay `t('sidebar.mindmaps')` — optionally add `sidebar.diagrams` key and switch the label to "Diagrams"/"Sơ đồ" if desired. Default: leave label, only ensure list/canvas titles read "Diagrams" via keys.
- [ ] **Step 2:** Ensure all new engine + list strings exist in both locales (scan `diagram.*`, `js.diagram.*`).
- [ ] **Step 3: Verify** — switch language vi/en; no missing-key fallbacks show in the diagram UI.
- [ ] **Step 4: Commit** — `feat(i18n): diagram type strings (en/vi)`

---

## Task 7: End-to-end verification

- [ ] Run `npm run dev`. For a seeded project:
- [ ] Mindmap regression: open an existing mindmap — renders/edits exactly as before.
- [ ] Create flowchart: add rect/diamond/ellipse/parallelogram boxes; connect with arrows; add "Yes"/"No" edge labels; move boxes; delete a box → its arrows disappear; undo/redo; export PNG.
- [ ] Create architecture: create a group frame; drop boxes into it; move the group → members follow; detach a box; delete group → members remain.
- [ ] List page: three type badges render; each card opens the correct editor.
- [ ] Reload a saved flowchart/architecture — nodes, shapes, edges, labels, positions persist.
- [ ] Delete a whole flowchart from the list → cascade removes its nodes + edges (check `mindmapEdge.count`).
- [ ] Confirm migration left `sessions` intact and existing data readable.

---

## Self-Review Notes
- Spec coverage: type discriminator (T1/T2), free-form edges (T1/T2/T5), shapes+labels+groups (T1/T2/T5), one shared list + type picker (T3), engine reuse of pan/zoom/undo/export (T5), mindmap untouched (T4 branch). All covered.
- Deviation flagged: model names kept as `Mindmap*` (Global Constraints) instead of spec's `@@map`-rename — user-facing identical, lower risk. Confirm with user.
- No automated test framework in repo → verification is app-run + curl/UI (T7), not unit tests.
