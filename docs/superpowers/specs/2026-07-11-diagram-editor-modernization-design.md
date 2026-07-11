# Diagram Editor Modernization — Design

**Date:** 2026-07-11
**Status:** Approved (design)
**Scope:** Free-form diagram editor only (`flowchart` + `architecture`). Mindmap editor is untouched.

## Problem

The free-form diagram editor (`src/public/js/diagram.js`, `src/public/css/diagram.css`,
`src/views/diagrams/canvas.ejs`) has usability gaps reported by the user:

1. **Not modern / hard to use** — the toolbar is a row of bare glyph buttons (◇ ▱ ◈ …) with no
   text labels; cramped and cryptic, especially on a phone.
2. **No everyday keyboard shortcuts** — only Delete, Ctrl+Z/Y, and `d` exist. Copy/paste,
   duplicate, select-all, arrow-nudge, quick-edit, zoom keys, and a help panel are missing.
3. **Node text can't wrap** — each node has a single-line `label`; pressing Enter while editing
   commits instead of inserting a line break, so multi-line descriptions are impossible.

Primary device: **desktop** (mouse + keyboard), with **phone/tablet as a first-class secondary**.

## Goals

- Node becomes a **card**: bold title + optional multi-line **description**.
- **Labeled, grouped toolbar** on desktop; **bottom bar + floating "+" (FAB)** on phone.
- **Contextual action bar** floating above the selected node (edit / color / icon / delete).
- **Full keyboard shortcuts** incl. copy/paste/duplicate, multi-select, arrow-nudge, zoom, quick-edit, and a **`?` help overlay**.
- Refreshed node/edge visual language grounded in PMTask's accent `#2D6FE0`.

## Non-Goals (YAGNI for this pass)

- Rubber-band (drag-box) selection — conflicts with the empty-canvas pan gesture; skipped.
- System clipboard integration — copy/paste uses an **in-page JS clipboard** (same tab only).
- Cross-diagram paste.
- Any change to the mindmap editor or its shared shell beyond additive CSS.
- Rich text in descriptions (bold/links) — plain multi-line text only.

## Approved Visual Direction

Mockup approved by user: card-style nodes with a colored left rail + icon chip, dashed group
containers, labeled grouped desktop toolbar, mobile bottom bar + FAB, keyboard-shortcut legend.
Accent stays `#2D6FE0`. Both light and dark themes.

---

## Design

### 1. Data model

Add one column to `DiagramNode` in `prisma/schema.prisma`:

```prisma
description String? @db.Text   // multi-line node body; null/empty = title-only
```

- Migration created + client regenerated **from WSL** (native Windows Prisma fails in this repo —
  see memory `prisma-runs-under-wsl`). Migration name: `add_diagramnode_description`.
- No backfill needed; existing rows get `NULL`.

### 2. Controller (`src/controllers/diagram.controller.js`)

`description` is accepted on both create and update, and — so copy/paste can faithfully recreate a
node — `createNode` is widened to also accept `color`, `width`, and `height` (today it only takes
`shape`, `icon`, `x`, `y`).

- **`createNode`**: after the existing whitelist, add:
  - `if (req.body.description !== undefined) data.description = req.body.description ? String(req.body.description) : null;`
  - `color`: `if (color !== undefined) data.color = color || null;`
  - `width`/`height`: `parseFloat` guarded like `updateNode`.
  - **Whitespace rule for `description`:** trim leading/trailing whitespace but preserve internal
    newlines — `String(description).replace(/^\s+|\s+$/g, '')` — and store `null` when the result is
    empty. `label` keeps its existing single-line `.trim()`.
- **`updateNode`**: add `if (description !== undefined) { const d = description ? String(description).replace(/^\s+|\s+$/g,'') : ''; data.description = d || null; }`
- `VALID_*` constants unchanged.

### 3. Node rendering & editing (`diagram.js` + `diagram.css`)

**Model:** `DG.nodes[i].description` carried through render, drag, history, and API payloads.

**`buildNodeEl(n)`** produces (for non-group, non-diamond/ellipse shapes — i.e. `rect`,
`parallelogram`, and group members):

```
.dg-node
  ├─ .dg-node-head   → optional .dg-node-icon + .dg-node-title (was .dg-node-label)
  ├─ .dg-node-desc   → rendered only when n.description is non-empty (white-space:pre-wrap)
  ├─ .dg-node-actions (contextual bar — restyled)
  ├─ .dg-handle
  └─ .dg-resize (groups only)
```

- Diamond / ellipse stay single-line title-only (no description block) — shape geometry can't hold
  a body cleanly.
- Group nodes keep their current label-in-corner treatment; no description.
- Both `title` and `description` are HTML-escaped via the existing `escapeHtml`.

**Editing** — two independently editable regions via `contenteditable`:

- **Title** (`dgEditLabel`, kept): Enter = save, Escape = cancel, blur = save. Single line.
- **Description** (new `dgEditDescription`): `Shift+Enter` inserts a newline; `Enter` (no shift) =
  save; `Escape` = cancel; blur = save. Reads back with `innerText` (preserves `\n`), stores to
  `n.description`, persists via `apiUpdateNode(id, { description })`, and pushes an undo entry
  mirroring `dgEditLabel`.
- Trigger: the contextual **✎ edit** button and quick-edit key (`Enter`/`F2`) open title edit; a
  dedicated affordance (e.g. clicking the description area, or an "edit description" action) opens
  description edit. On a fresh node with no description, entering description-edit shows an empty
  editable region with a muted placeholder (CSS `:empty::before`).

### 4. Selection model → multi-select

Replace scalar `DG.selectedId` with a **Set** `DG.selection` (node ids). `DG.selectedEdgeId` stays
scalar (edges remain single-select).

- Helpers: `dgSelectNode(id, {additive})`, `dgToggleInSelection(id)`, `dgSelectAll()`,
  `dgClearSelection()`, and `dgIsSelected(id)`.
- Plain click → replace selection with `{id}`. **Shift/Ctrl+click** → toggle membership.
- **Ctrl+A** → select all non-group nodes (groups excluded to avoid surprise bulk-moves; revisit if
  needed).
- Render: `.selected` class applied per-node from the Set. Contextual action bar shows only when
  **exactly one** node is selected (multi-select shows a lighter "N selected" state, actions via
  keyboard).
- **Drag:** dragging a node that is part of a multi-selection moves the whole selection (extends the
  current `members` mechanism, which already moves group members, to also move co-selected nodes).
  Dragging an unselected node selects just it, then drags.
- **Delete / nudge / copy** operate over the whole Set.

### 5. Keyboard shortcuts (extend the `keydown` handler in `diagram.js`)

Guard unchanged: ignore when focus is in `[contenteditable]` / `input` / `textarea`.

| Keys | Action |
| --- | --- |
| `Enter` / `F2` | Edit title of the single selected node |
| `Shift+Enter` | Newline inside description edit (handled in edit mode) |
| `Ctrl/Cmd+C` | Copy selection to in-page clipboard |
| `Ctrl/Cmd+V` | Paste clipboard (offset +20,+20; new ids from API) |
| `Ctrl/Cmd+D` | Duplicate selection in place (copy + immediate paste) |
| `Ctrl/Cmd+A` | Select all nodes |
| `←↑↓→` | Nudge selection by 1 grid step (20px); `Shift+arrow` = 1px fine nudge |
| `Delete` / `Backspace` | Delete selection or selected edge (existing) |
| `Esc` | Clear selection / cancel in-progress edge draw |
| `Tab` | Create a new box to the right of the single selected node + edge from it |
| `Ctrl/Cmd+Z` / `+Shift` or `Ctrl+Y` | Undo / redo (existing) |
| `Ctrl/Cmd + =` / `-` / `0` | Zoom in / out / fit-to-view |
| `d` | Toggle dashed style on selected edge (existing) |
| `?` (Shift+/) | Open shortcuts help overlay |

**In-page clipboard:** `DG.clipboard = []` holding shallow copies of selected nodes' visual props
(`label, description, shape, color, icon, width, height` + relative offsets). Paste POSTs each via
`createNode` (now accepting those fields), re-selects the new nodes, and pushes a single undo entry
that deletes them.

- Nudge/arrow persistence: batch a debounced `apiUpdateNode` per moved node on keyup (avoid a PUT
  per keypress) and push one undo entry for the run.
- Zoom keys reuse `dgZoom` / `dgFit`.

### 6. Toolbar & shell (`canvas.ejs` + `diagram.css`)

Only the `isFreeform` toolbar branch changes; the mindmap branch is untouched.

- **Desktop toolbar** (`.mm-toolbar` freeform variant → grouped): buttons gain SVG icon + text
  label, grouped by `Add` (box / decision / group) · `Arrange` · `Zoom` (in / out / fit) ·
  `History` (undo / redo) · `Export` · `?`. Shape buttons still gated by `diagramType`.
- **Mobile (`@media (max-width: 640px)`):** toolbar becomes a fixed **bottom bar** (Add · Arrange ·
  Fit · Undo) plus a floating **`+` FAB**; secondary actions in an overflow sheet. Contextual bar
  and handles enlarge touch targets (min 40px).
- **Contextual action bar** (`.dg-node-actions`): restyled to the mockup — rounded floating chip
  above the node, larger hit targets, appears on hover/selection.

### 7. i18n

Add keys to the en + vi locale files (same files the existing `t('diagram.*')` / `t('js.diagram.*')`
keys live in) for: toolbar labels (`diagram.toolbar.add`, `.arrange`, `.zoomIn`, `.zoomOut`, `.fit`,
`.undo`, `.redo`, `.export`, `.shortcuts`), the description placeholder (`js.diagram.descPlaceholder`),
and every row label + the title of the shortcuts overlay (`diagram.shortcuts.*`). No hard-coded UI
strings.

### 8. Shortcuts help overlay

Reuse the shared `mm-dialog` overlay pattern (as `dgPickIcon` already does). New `dgShowShortcuts()`
builds a dialog listing the table above (grouped), opened by the `?` key and the toolbar `?` button,
closed by `Esc` / backdrop / close button.

---

## Error handling

- All node/edge mutations already surface failures via `mmToast(t('js.diagram.couldNotSave'))` and
  roll back optimistic local state where an `onError` is provided; new mutations (description, paste,
  nudge-batch) follow the same pattern.
- Paste of N nodes: if any `createNode` fails, toast once and keep the successfully-created nodes
  (partial success is acceptable; no cross-node transaction on the client).

## Testing / verification

No automated test harness exists for this UI. Verification is by driving the running app
(`npm run dev`, seeded via `npm run seed`, login `admin@pmtask.com` / `demo123`):

1. Migration applies cleanly from WSL; `description` column present.
2. Create a node, add a multi-line description with Shift+Enter, reload → text + line breaks persist.
3. Each shortcut: copy/paste/duplicate, Ctrl+A, arrow-nudge (coarse + Shift-fine), Enter/F2 edit,
   Ctrl +/-/0, Tab, Esc, `?` overlay.
4. Multi-select: shift-click builds a set; drag moves all; Delete removes all; undo restores.
5. Toolbar labels render (en + vi); mobile layout (DevTools responsive ~390px) shows bottom bar + FAB
   and is operable by touch-emulation.
6. Both light and dark themes; PNG export still excludes selection chrome.

## Rollout / sequencing

1. Schema + migration + controller (`description`, widened `createNode`).
2. Node card render + description editing.
3. Multi-select model.
4. Keyboard shortcuts + in-page clipboard + help overlay.
5. Toolbar/shell redesign (desktop grouped + mobile bottom bar) + i18n.
6. Visual polish pass (CSS) + verification.

Each step is independently verifiable in the running app.
