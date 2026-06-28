# Mindmap Redesign — Design Spec

**Date:** 2026-06-28
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend-only overhaul of the mindmap feature. Backend (Prisma model + API) unchanged.

## Goal

The current mindmap works but feels sloppy: free-form drag causes overlapping nodes, the
auto-layout is a weak one-directional tidy-tree with hardcoded spacing, edges get tangled,
labels are single-line, and there is no undo/redo, search, or export. Make it **standard,
convenient, and beautiful** while keeping every existing capability (task linking/convert,
per-node color, collapse/expand, keyboard navigation).

## Guiding Constraints

- **Do not change the data model or API.** `Mindmap` / `MindmapNode` Prisma models and all
  `/api/mindmaps` + `/api/mindmap-nodes` endpoints stay exactly as they are. This keeps risk
  low and preserves task-linking/convert.
- **Vanilla JS only** — no React/framework. App is server-rendered EJS.
- **One new dependency allowed:** `html-to-image` (small) for PNG export. Nothing else.
- Respect the existing light/dark theme variables.

## Files In Scope

- `src/public/js/mindmap.js` — main editor (largest changes)
- `src/public/js/mindmap-layout.js` — layout algorithm (rewritten)
- `src/public/js/mindmap-list.js` — minor, only if list polish is touched
- `src/public/js/mm-ui.js` — reuse toast/prompt/confirm helpers; extend if needed
- `src/public/css/mindmap.css` — visual restyle
- `src/views/mindmaps/canvas.ejs` — toolbar additions (search, export, auto-arrange)
- `package.json` — add `html-to-image`

Out of scope (unchanged): controllers, routes, prisma schema.

---

## 1. Layout Engine

Replace the current one-directional tidy-tree (`X_GAP=220`, `Y_GAP=90`, rightward only) with a
**balanced two-sided radial-tree layout**, the classic mindmap shape.

### Behavior
- **Root centered.** Top-level branches (root's direct children) are split into a **left set**
  and a **right set**, balanced so the two sides have roughly equal total subtree size.
  - Assignment rule: greedily assign each top-level branch (in `position` order) to whichever
    side currently has the smaller accumulated leaf-count. Deterministic and stable.
  - Side assignment is recomputed on every auto-layout pass (it is derived, not stored).
- **Each side is a tidy subtree** growing outward (right side grows rightward, left side
  mirrors leftward). Depth advances horizontally; siblings stack vertically.
- **No overlap by construction.** Vertical placement uses each subtree's measured block height,
  so a parent is centered against the full vertical extent of its descendants. Variable node
  heights (multi-line labels) are accounted for — see "Node measurement" below.
- Collapsed nodes contribute zero descendant height (their subtree is hidden).

### Node measurement
Auto-layout needs real rendered node heights (multi-line labels make these vary). Approach:
1. Render nodes to the DOM first (or measure via a hidden measuring pass).
2. Read each visible node's `offsetWidth`/`offsetHeight`.
3. Run layout with measured sizes, then position nodes.
This is a measure → layout → position cycle on each full render.

### Manual override (hybrid model — preserved)
- A node with non-null `x`/`y` is **pinned** (manually placed) and excluded from auto-layout
  positioning; auto-layout flows the rest around conceptual slots as today.
- The existing "dragged parent carries its auto children" relative-offset behavior is kept.
- New: each pinned node shows a **"reset to auto"** action that sets `x = null, y = null`
  (via existing `updateNode` API) and re-runs layout.
- New toolbar button **"Tự sắp xếp" (Auto arrange)**: clears nothing by default but re-runs
  auto-layout; an optional confirm-modal variant can also clear all manual pins (reset every
  node's `x/y` to null) — implemented as a second menu item "Sắp xếp lại toàn bộ".

### Spacing
- Horizontal gap per depth and vertical gap between sibling blocks become named constants at
  the top of `mindmap-layout.js` (still constants, but centralized and tuned for the new look,
  e.g. `H_GAP ≈ 80` between a node's right edge and its child's left edge, `V_GAP ≈ 24`
  between sibling blocks). Final values tuned during implementation.

---

## 2. Visual Design

Target style: **rounded nodes, per-branch color, smooth curved edges** (modern friendly mindmap).

### Nodes
- Border-radius **12px**, soft shadow, generous padding.
- **Multi-line labels supported.** In edit mode, `Shift+Enter` inserts a newline; `Enter`
  commits. Display uses `white-space: pre-wrap` and word-break; node grows vertically.
  (Today newlines are silently dropped — that restriction is removed.)
- Selected/hover state: subtle ring using `--accent`, raised z-index (keep existing behavior).
- Replace the current left-border color stripe with a **filled tinted background + colored
  accent** consistent with the branch color (see below).

### Per-branch color
- Each top-level branch is assigned a palette color **deterministically by its `position`
  index** (a fixed palette of ~8 pleasant hues with light/dark theme-aware variants).
- Descendants **inherit the branch hue**, getting progressively lighter background by depth.
- The branch color is **derived at render time** from the node's top-level ancestor — not
  stored — EXCEPT when the user has set an explicit `color` on a node via the existing color
  picker, which **overrides** the derived color for that node (and tints its descendants).
- Root node has its own neutral/prominent style.

### Edges
- **Smooth cubic bezier**, thicker stroke than today, anchored to the correct side:
  right-side children connect parent's right edge → child's left edge; left-side children
  mirror. Edge stroke color follows the branch color (with reduced opacity).
- Edges render in the existing SVG overlay layer (`pointer-events: none`).

### Theme
- All colors via existing CSS custom properties; verify both light and dark themes.

---

## 3. Interaction

### Toolbar (canvas.ejs)
Compact, clearly-labeled buttons (icons + tooltip):
`Thêm node` · `Tự sắp xếp` · `Tìm kiếm` · `Zoom −/+` · `Fit` · `Export PNG` · `Trợ giúp (?)`.

### Search / find nodes
- A search input (toggled from toolbar).
- As the user types: matching nodes (label substring, case/diacritic-insensitive) are
  highlighted; non-matches dimmed.
- Ancestors of matches are auto-expanded so matches are visible.
- Pan/zoom to the first match; `Enter` cycles to the next match (wraps).
- Clearing search restores normal view.

### Keyboard
- Keep all existing shortcuts (Enter/Shift+Enter/F2/Tab/Delete/arrows/Escape/`?`).
- Add **Ctrl+Z = undo**, **Ctrl+Y / Ctrl+Shift+Z = redo**.
- Edit mode: `Shift+Enter` = newline (multi-line), `Enter` = commit, `Escape` = revert.

### Persistence smoothing
- Drag still persists on drop (not during move). Keep the optimistic-update +
  rollback-on-error pattern already in place. No per-frame saves.

---

## 4. Undo / Redo

- **Client-session command history** (not persisted; closing the tab clears it — confirmed
  acceptable).
- A bounded stack (e.g. last ~50 ops). Each mutating action pushes a command holding enough
  state to invert it:
  - add node ↔ delete node
  - delete node/subtree ↔ recreate (capture the deleted subtree's data to restore)
  - edit label ↔ restore previous label
  - move (drag / reset-to-auto) ↔ restore previous `x/y`
  - set color ↔ restore previous color
  - toggle collapse ↔ toggle back
- Undo/redo replays the inverse by calling the **existing** API endpoints, then re-renders.
- On API failure during undo/redo: toast the error and stop (do not corrupt the stack).
- Note: delete→recreate gets a **new node id** from the server; the history entry and any
  dependent redo entries must remap to the new id. Implementation keeps an id-remap step so a
  redo after an undone delete stays consistent.

---

## 5. Export PNG

- Toolbar **Export PNG** renders the current mindmap viewport (nodes + SVG edges) to a PNG and
  triggers a download.
- Use **`html-to-image`** (`toPng`) on the viewport container. Export the full content bounds
  (temporarily fit/transform so the whole map is captured, not just the visible crop), at a
  reasonable scale (e.g. 2× for crispness).
- Filename: `<mindmap-name>.png` (sanitized).

---

## Out of Scope (YAGNI for this pass)

- Multi-select / group drag.
- Real-time collaboration / live sync.
- Import (JSON/markdown).
- Server-side persistence of undo history.

These may be revisited later as separate specs.

---

## Acceptance Criteria

1. Opening a mindmap shows a balanced, non-overlapping two-sided layout with branch colors and
   smooth curved edges, in both light and dark themes.
2. "Tự sắp xếp" re-tidies the whole map; manual drag still works and a pinned node can be reset
   to auto.
3. Nodes support multi-line labels that grow the node and are respected by layout (no overlap).
4. Search highlights matches, expands their ancestors, and cycles through them.
5. Ctrl+Z / Ctrl+Y undo and redo add, delete, label edit, move, color, and collapse actions.
6. Export PNG downloads a correct image of the full mindmap.
7. Task convert/open, per-node color override, and collapse/expand all still work.
8. No backend/API/schema changes; existing data renders correctly.
