# Mindmap Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the mindmap frontend to a balanced two-sided auto-layout with rounded per-branch-colored nodes, smooth curved edges, multi-line labels, node search, undo/redo, and PNG export — without changing the backend.

**Architecture:** Pure, framework-free logic (layout, color, search, undo/redo) is extracted into small focused modules under `src/public/js/`, each exposing both `window.<fn>` (for the browser) and `module.exports` (for `node --test`). These are developed test-first. The interactive DOM editor (`mindmap.js`) and styling (`mindmap.css`) consume those modules and are verified by running the app. The Prisma model and all `/api/mindmap*` endpoints are untouched.

**Tech Stack:** Vanilla JS (no framework), EJS server views, Node's built-in test runner (`node --test`), `html-to-image` via CDN for PNG export, existing flat-key i18n (`js.*` keys auto-shipped to the client).

## Global Constraints

- **No backend changes.** `prisma/schema.prisma`, `src/controllers/mindmap.controller.js`, `src/routes/mindmap*.js`, and all `/api/mindmaps` + `/api/mindmap-nodes` endpoints stay exactly as they are.
- **Vanilla JS only.** No React/build step. Pure-logic modules use the IIFE pattern `(function (root) { ... })(typeof window !== 'undefined' ? window : globalThis)` with `if (typeof module !== 'undefined' && module.exports) module.exports = { ... }` at the end (same pattern as existing `mindmap-layout.js`).
- **One new browser lib, via CDN only** (not npm): `html-to-image` from `https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js`. Loaded with a `<script>` tag, matching the existing Sortable/EasyMDE CDN pattern. `package.json` is NOT modified.
- **i18n:** all new user-facing strings in client JS go through `t('js.mindmap.<key>')`; static EJS strings through `t('mindmap.<key>')`. Every new key MUST be added to BOTH `src/locales/en.json` and `src/locales/vi.json`. Keys prefixed `js.` are auto-shipped to the client by `clientDict()` — no other wiring needed.
- **Theme:** use existing CSS custom properties (`--text`, `--card`, `--border`, `--accent`, `--surface`, `--bg`, `--text-muted`, `--border-light`, `--card-hover`, `--coral`, `--font-mono`). Verify both light and dark themes.
- **Run tests with:** `npm test` (which is `node --test`). Tests live in `test/`.

---

## File Structure

**New files:**
- `src/public/js/mindmap-color.js` — pure: branch-color palette + per-node color derivation.
- `src/public/js/mindmap-search.js` — pure: diacritic-insensitive node matching + ancestor expansion set.
- `src/public/js/mindmap-history.js` — pure: bounded undo/redo command stack (mechanics only; commands are executed by the caller).
- `test/mindmap-layout.test.js` — unit tests for the rewritten layout.
- `test/mindmap-color.test.js` — unit tests for color module.
- `test/mindmap-search.test.js` — unit tests for search module.
- `test/mindmap-history.test.js` — unit tests for history module.

**Modified files:**
- `src/public/js/mindmap-layout.js` — rewritten: balanced two-sided, node-size-aware, returns `side` per node.
- `src/public/js/mindmap.js` — consume new modules: measured sizes into layout, side-aware edges, branch colors, multi-line edit, search UI, undo/redo wiring, auto-arrange, reset-to-auto, PNG export.
- `src/public/css/mindmap.css` — rounded nodes, branch tints, thicker curved edges, multi-line, search box, toolbar additions.
- `src/views/mindmaps/canvas.ejs` — toolbar buttons (auto-arrange, search, export), search input, new `<script>` includes (modules + html-to-image CDN).
- `src/locales/en.json` and `src/locales/vi.json` — new `js.mindmap.*` and `mindmap.*` keys.

**Untouched:** controllers, routes, schema, `mindmap-list.js`, `mm-ui.js` (reused as-is).

---

## Task 1: Balanced two-sided, size-aware layout

Rewrite the layout so the root sits in the middle, top-level branches are split left/right to balance, vertical placement uses each subtree's measured height (so multi-line nodes never overlap), and every node carries a `side` (`'root' | 'left' | 'right'`) for edge anchoring.

**Files:**
- Modify (rewrite): `src/public/js/mindmap-layout.js`
- Test: `test/mindmap-layout.test.js`

**Interfaces:**
- Produces: `computeMindmapLayout(nodes, opts?)`
  - `nodes`: array of `{ id, parentId, position, w?, h? }` (only currently-visible nodes; caller filters collapsed). `w`/`h` are measured pixel sizes; default when absent.
  - `opts?`: `{ hGap?, vGap?, defaultW?, defaultH? }` (defaults: `hGap=70`, `vGap=22`, `defaultW=180`, `defaultH=46`).
  - Returns: `{ [id]: { x, y, side } }`. Root at `x=0`. Right-side nodes have increasing `x`; left-side nodes have decreasing (negative) `x`.

- [ ] **Step 1: Write the failing tests**

Create `test/mindmap-layout.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { computeMindmapLayout } = require('../src/public/js/mindmap-layout');

// helper: build {id,parentId,position,w,h} list
const N = (id, parentId, position = 0, w = 100, h = 40) => ({ id, parentId, position, w, h });

function boxesOverlap(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
         a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

test('single root sits at origin with side=root', () => {
  const pos = computeMindmapLayout([N(1, null)]);
  assert.strictEqual(pos[1].x, 0);
  assert.strictEqual(pos[1].side, 'root');
});

test('top-level branches are split between left and right', () => {
  const nodes = [N(1, null), N(2, 1, 0), N(3, 1, 1), N(4, 1, 2), N(5, 1, 3)];
  const pos = computeMindmapLayout(nodes);
  const sides = [2, 3, 4, 5].map((id) => pos[id].side);
  assert.ok(sides.includes('left'), 'at least one branch on the left');
  assert.ok(sides.includes('right'), 'at least one branch on the right');
});

test('left-side nodes have x < 0 and right-side nodes have x > 0', () => {
  const nodes = [N(1, null), N(2, 1, 0), N(3, 1, 1)];
  const pos = computeMindmapLayout(nodes);
  for (const id of [2, 3]) {
    if (pos[id].side === 'left') assert.ok(pos[id].x < 0, `node ${id} left => x<0`);
    if (pos[id].side === 'right') assert.ok(pos[id].x > 0, `node ${id} right => x>0`);
  }
});

test('no two nodes overlap in a deep tree', () => {
  const nodes = [N(1, null)];
  // 4 branches, each with 3 children
  let id = 2;
  for (let b = 0; b < 4; b++) {
    const branch = id++;
    nodes.push(N(branch, 1, b));
    for (let c = 0; c < 3; c++) nodes.push(N(id++, branch, c));
  }
  const pos = computeMindmapLayout(nodes);
  const boxes = nodes.map((n) => ({ ...pos[n.id], w: n.w, h: n.h }));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(!boxesOverlap(boxes[i], boxes[j]), `nodes ${i} and ${j} overlap`);
});

test('tall (multi-line) children push siblings apart so nothing overlaps', () => {
  const nodes = [N(1, null), N(2, 1, 0), N(3, 1, 1, 100, 200), N(4, 1, 2)];
  const pos = computeMindmapLayout(nodes);
  const boxes = nodes.map((n) => ({ ...pos[n.id], w: n.w, h: n.h }));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(!boxesOverlap(boxes[i], boxes[j]), `nodes overlap with tall child`);
});

test('a parent is vertically centered against its children block', () => {
  const nodes = [N(1, null), N(2, 1, 0), N(10, 2, 0), N(11, 2, 1), N(12, 2, 2)];
  const pos = computeMindmapLayout(nodes);
  const parentCenter = pos[2].y + 40 / 2;
  const top = pos[10].y, bot = pos[12].y + 40;
  assert.ok(Math.abs(parentCenter - (top + bot) / 2) < 1, 'parent centered on its kids');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — the current `computeMindmapLayout` ignores `w/h`, returns no `side`, and lays out one-directionally (so the side/overlap/centering assertions fail).

- [ ] **Step 3: Rewrite `src/public/js/mindmap-layout.js`**

```javascript
// Balanced two-sided tidy-tree layout: root centered, top-level branches split
// left/right to balance, vertical placement driven by each subtree's measured
// height so variable-height (multi-line) nodes never overlap. Returns {x,y,side}.
// The renderer overlays a node's manual x/y (if set) on top of these auto positions.
(function (root) {
  const DEF = { hGap: 70, vGap: 22, defaultW: 180, defaultH: 46 };

  function computeMindmapLayout(nodes, opts) {
    const o = Object.assign({}, DEF, opts || {});
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map(nodes.map((n) => [n.id, []]));
    let rootNode = null;
    for (const n of nodes) {
      if (n.parentId != null && childrenOf.has(n.parentId)) childrenOf.get(n.parentId).push(n);
      else rootNode = rootNode || n;
    }
    for (const list of childrenOf.values())
      list.sort((a, b) => (a.position - b.position) || (a.id - b.id));

    const W = (n) => (n && n.w) || o.defaultW;
    const H = (n) => (n && n.h) || o.defaultH;

    // subtree vertical extent: max(own height, stacked children heights + gaps)
    const heightCache = new Map();
    function subtreeHeight(node) {
      if (heightCache.has(node.id)) return heightCache.get(node.id);
      const kids = childrenOf.get(node.id) || [];
      let h;
      if (!kids.length) h = H(node);
      else {
        let sum = 0;
        for (const k of kids) sum += subtreeHeight(k);
        sum += (kids.length - 1) * o.vGap;
        h = Math.max(H(node), sum);
      }
      heightCache.set(node.id, h);
      return h;
    }

    const pos = {};
    // place a subtree growing toward `side`; `x` is this node's left edge, `top` its band top
    function place(node, side, x, top) {
      const h = subtreeHeight(node);
      pos[node.id] = { x, y: top + (h - H(node)) / 2, side };
      const kids = childrenOf.get(node.id) || [];
      let cursor = top;
      for (const k of kids) {
        const kx = side === 'left' ? x - o.hGap - W(k) : x + W(node) + o.hGap;
        place(k, side, kx, cursor);
        cursor += subtreeHeight(k) + o.vGap;
      }
    }

    if (rootNode) {
      const branches = childrenOf.get(rootNode.id) || [];
      // balance: assign each branch to the lighter side (by accumulated subtree height)
      const left = [], right = [];
      let lh = 0, rh = 0;
      for (const b of branches) {
        const bh = subtreeHeight(b);
        if (lh <= rh) { left.push(b); lh += bh + o.vGap; }
        else { right.push(b); rh += bh + o.vGap; }
      }
      const sideTotal = (arr) =>
        arr.reduce((s, b) => s + subtreeHeight(b), 0) + Math.max(0, arr.length - 1) * o.vGap;
      const leftH = sideTotal(left), rightH = sideTotal(right);
      const contentH = Math.max(leftH, rightH, H(rootNode));
      pos[rootNode.id] = { x: 0, y: (contentH - H(rootNode)) / 2, side: 'root' };
      let lc = (contentH - leftH) / 2;
      for (const b of left) { place(b, 'left', 0 - o.hGap - W(b), lc); lc += subtreeHeight(b) + o.vGap; }
      let rc = (contentH - rightH) / 2;
      for (const b of right) { place(b, 'right', W(rootNode) + o.hGap, rc); rc += subtreeHeight(b) + o.vGap; }
    }
    // defensive: any unreached node stacks below origin
    let orphanY = 0;
    for (const n of nodes) if (!pos[n.id]) { pos[n.id] = { x: 0, y: -200 - orphanY, side: 'right' }; orphanY += H(n) + o.vGap; }
    return pos;
  }

  root.computeMindmapLayout = computeMindmapLayout;
  if (typeof module !== 'undefined' && module.exports) module.exports = { computeMindmapLayout };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (all layout tests green; existing `test/i18n.test.js` still green).

- [ ] **Step 5: Commit**

```bash
git add src/public/js/mindmap-layout.js test/mindmap-layout.test.js
git commit -m "feat(mindmap): balanced two-sided size-aware layout with side metadata"
```

---

## Task 2: Branch-color module

Each top-level branch gets a deterministic palette color; descendants inherit it; the renderer tints node backgrounds. An explicit per-node `color` overrides the derived one.

**Files:**
- Create: `src/public/js/mindmap-color.js`
- Test: `test/mindmap-color.test.js`

**Interfaces:**
- Produces:
  - `MM_PALETTE` — array of 8 hex strings.
  - `mmBranchColor(id, byId)` — returns the palette hex for the node's top-level branch (the ancestor whose parent is the root), or `null` for the root itself. `byId` is a `Map(id -> node)` where node has `{ id, parentId, position }`.
  - `mmHexAlpha(hex, alpha)` — returns an `rgba(r,g,b,alpha)` string for a `#rrggbb` input.
  - `mmNodeColors(node, byId)` — returns `{ accent, bg }`: `accent = node.color || mmBranchColor(node.id, byId) || '#2D6FE0'`; `bg = mmHexAlpha(accent, 0.10)`.

- [ ] **Step 1: Write the failing tests**

Create `test/mindmap-color.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors } = require('../src/public/js/mindmap-color');

function makeById(nodes) { return new Map(nodes.map((n) => [n.id, n])); }

test('palette has 8 valid hex colors', () => {
  assert.strictEqual(MM_PALETTE.length, 8);
  for (const c of MM_PALETTE) assert.match(c, /^#[0-9a-fA-F]{6}$/);
});

test('root node has no branch color', () => {
  const byId = makeById([{ id: 1, parentId: null, position: 0 }]);
  assert.strictEqual(mmBranchColor(1, byId), null);
});

test('branch color is deterministic by branch position', () => {
  const byId = makeById([
    { id: 1, parentId: null, position: 0 },
    { id: 2, parentId: 1, position: 0 },
    { id: 3, parentId: 1, position: 1 },
  ]);
  assert.strictEqual(mmBranchColor(2, byId), MM_PALETTE[0]);
  assert.strictEqual(mmBranchColor(3, byId), MM_PALETTE[1 % MM_PALETTE.length]);
});

test('a deep descendant inherits its top-level branch color', () => {
  const byId = makeById([
    { id: 1, parentId: null, position: 0 },
    { id: 2, parentId: 1, position: 0 },
    { id: 5, parentId: 2, position: 0 },
    { id: 9, parentId: 5, position: 0 },
  ]);
  assert.strictEqual(mmBranchColor(9, byId), mmBranchColor(2, byId));
});

test('mmHexAlpha produces rgba', () => {
  assert.strictEqual(mmHexAlpha('#2D6FE0', 0.1), 'rgba(45, 111, 224, 0.1)');
});

test('explicit node color overrides derived branch color', () => {
  const byId = makeById([
    { id: 1, parentId: null, position: 0 },
    { id: 2, parentId: 1, position: 0, color: '#ff0000' },
  ]);
  assert.strictEqual(mmNodeColors(byId.get(2), byId).accent, '#ff0000');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/public/js/mindmap-color'`.

- [ ] **Step 3: Create `src/public/js/mindmap-color.js`**

```javascript
// Deterministic per-branch coloring for the mindmap. The top-level branch (a
// direct child of the root) owns a palette color; all its descendants inherit it.
// A node's explicit `color` overrides the derived branch color.
(function (root) {
  const MM_PALETTE = ['#2D6FE0', '#1E9E60', '#F59E0B', '#E0526A', '#8B5CF6', '#0EA5A4', '#D9760A', '#3B82F6'];

  // climb to the top-level branch (the node whose parent is the root); null for the root
  function topBranch(id, byId) {
    let node = byId.get(id);
    if (!node || node.parentId == null) return null;
    while (node && node.parentId != null) {
      const parent = byId.get(node.parentId);
      if (!parent || parent.parentId == null) return node; // parent is the root
      node = parent;
    }
    return node;
  }

  function mmBranchColor(id, byId) {
    const branch = topBranch(id, byId);
    if (!branch) return null;
    const idx = ((branch.position % MM_PALETTE.length) + MM_PALETTE.length) % MM_PALETTE.length;
    return MM_PALETTE[idx];
  }

  function mmHexAlpha(hex, alpha) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function mmNodeColors(node, byId) {
    const accent = (node && node.color) || mmBranchColor(node.id, byId) || '#2D6FE0';
    return { accent, bg: mmHexAlpha(accent, 0.10) };
  }

  Object.assign(root, { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors });
  if (typeof module !== 'undefined' && module.exports) module.exports = { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/mindmap-color.js test/mindmap-color.test.js
git commit -m "feat(mindmap): deterministic per-branch color module"
```

---

## Task 3: Node-search module

Diacritic-insensitive substring matching over labels, plus the set of ancestor ids that must be expanded so each match is visible.

**Files:**
- Create: `src/public/js/mindmap-search.js`
- Test: `test/mindmap-search.test.js`

**Interfaces:**
- Produces:
  - `mmNormalize(s)` — lowercase + strip diacritics (so Vietnamese `"Hà"` normalizes to `"ha"`).
  - `mmSearchNodes(nodes, query)` — `nodes` is array of `{ id, parentId, label }`. Returns `{ matches: number[], expand: Set<number> }`. Empty/blank query → `{ matches: [], expand: new Set() }`. `matches` preserves input order. `expand` contains every ancestor id of every match (not the matches themselves).

- [ ] **Step 1: Write the failing tests**

Create `test/mindmap-search.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { mmNormalize, mmSearchNodes } = require('../src/public/js/mindmap-search');

const nodes = [
  { id: 1, parentId: null, label: 'Root' },
  { id: 2, parentId: 1, label: 'Hà Nội' },
  { id: 3, parentId: 2, label: 'Hoàn Kiếm' },
  { id: 4, parentId: 1, label: 'Sài Gòn' },
];

test('mmNormalize strips Vietnamese diacritics and lowercases', () => {
  assert.strictEqual(mmNormalize('Hà Nội'), 'ha noi');
  assert.strictEqual(mmNormalize('Sài Gòn'), 'sai gon');
});

test('blank query returns no matches', () => {
  const r = mmSearchNodes(nodes, '   ');
  assert.deepStrictEqual(r.matches, []);
  assert.strictEqual(r.expand.size, 0);
});

test('matches ignore diacritics and case', () => {
  const r = mmSearchNodes(nodes, 'ha noi');
  assert.deepStrictEqual(r.matches, [2]);
});

test('expand contains all ancestors of matches but not the match itself', () => {
  const r = mmSearchNodes(nodes, 'kiem');
  assert.deepStrictEqual(r.matches, [3]);
  assert.ok(r.expand.has(1) && r.expand.has(2));
  assert.ok(!r.expand.has(3));
});

test('multiple matches preserve input order', () => {
  const r = mmSearchNodes(nodes, 'o'); // Root, Hà Nội, Sài Gòn (after normalize) contain 'o'? -> root, gon
  assert.ok(r.matches.length >= 1);
  for (let i = 1; i < r.matches.length; i++) {
    const a = nodes.findIndex((n) => n.id === r.matches[i - 1]);
    const b = nodes.findIndex((n) => n.id === r.matches[i]);
    assert.ok(a < b, 'matches in input order');
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/public/js/mindmap-search'`.

- [ ] **Step 3: Create `src/public/js/mindmap-search.js`**

```javascript
// Diacritic-insensitive node search. Returns matching ids (in input order) plus
// the set of ancestor ids that must be expanded for every match to be visible.
(function (root) {
  function mmNormalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining marks
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function mmSearchNodes(nodes, query) {
    const q = mmNormalize(query);
    if (!q) return { matches: [], expand: new Set() };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const matches = [];
    const expand = new Set();
    for (const n of nodes) {
      if (mmNormalize(n.label).includes(q)) {
        matches.push(n.id);
        let p = n.parentId;
        while (p != null && byId.has(p)) { expand.add(p); p = byId.get(p).parentId; }
      }
    }
    return { matches, expand };
  }

  Object.assign(root, { mmNormalize, mmSearchNodes });
  if (typeof module !== 'undefined' && module.exports) module.exports = { mmNormalize, mmSearchNodes };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/mindmap-search.js test/mindmap-search.test.js
git commit -m "feat(mindmap): diacritic-insensitive node search module"
```

---

## Task 4: Undo/redo history stack

A bounded command stack. The module only handles stack mechanics; the caller (Task 9) supplies command objects and executes their `undo`/`redo` closures.

**Files:**
- Create: `src/public/js/mindmap-history.js`
- Test: `test/mindmap-history.test.js`

**Interfaces:**
- Produces: `mmCreateHistory(limit?)` (default `limit = 50`) → object with:
  - `push(cmd)` — push a command `{ undo, redo, label }`; clears the redo stack; evicts the oldest when over `limit`.
  - `undo()` — pop the newest undo entry, move it to the redo stack, and **return** it (or `null` if none). Caller runs `cmd.undo()`.
  - `redo()` — pop the newest redo entry, move it back to the undo stack, and **return** it (or `null`). Caller runs `cmd.redo()`.
  - `canUndo()` / `canRedo()` — booleans.
  - `clear()` — empty both stacks.
  - `sizes()` — `{ undo, redo }` counts (for tests/assertions).

- [ ] **Step 1: Write the failing tests**

Create `test/mindmap-history.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { mmCreateHistory } = require('../src/public/js/mindmap-history');

const cmd = (label) => ({ label, undo() {}, redo() {} });

test('push/undo/redo move commands across stacks in LIFO order', () => {
  const h = mmCreateHistory();
  h.push(cmd('a')); h.push(cmd('b'));
  assert.strictEqual(h.undo().label, 'b');
  assert.strictEqual(h.undo().label, 'a');
  assert.strictEqual(h.undo(), null);
  assert.strictEqual(h.redo().label, 'a');
  assert.strictEqual(h.redo().label, 'b');
});

test('pushing after an undo clears the redo stack', () => {
  const h = mmCreateHistory();
  h.push(cmd('a')); h.push(cmd('b'));
  h.undo();
  assert.ok(h.canRedo());
  h.push(cmd('c'));
  assert.ok(!h.canRedo());
  assert.strictEqual(h.sizes().redo, 0);
});

test('history is bounded to the limit (oldest evicted)', () => {
  const h = mmCreateHistory(2);
  h.push(cmd('a')); h.push(cmd('b')); h.push(cmd('c'));
  assert.strictEqual(h.sizes().undo, 2);
  assert.strictEqual(h.undo().label, 'c');
  assert.strictEqual(h.undo().label, 'b');
  assert.strictEqual(h.undo(), null); // 'a' was evicted
});

test('canUndo/canRedo and clear', () => {
  const h = mmCreateHistory();
  assert.ok(!h.canUndo() && !h.canRedo());
  h.push(cmd('a'));
  assert.ok(h.canUndo());
  h.clear();
  assert.ok(!h.canUndo() && !h.canRedo());
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/public/js/mindmap-history'`.

- [ ] **Step 3: Create `src/public/js/mindmap-history.js`**

```javascript
// Bounded undo/redo command stack (mechanics only). Commands are { undo, redo, label }
// objects; the caller executes the returned command's closures.
(function (root) {
  function mmCreateHistory(limit) {
    limit = limit || 50;
    let undoStack = [];
    let redoStack = [];
    return {
      push(cmd) {
        undoStack.push(cmd);
        if (undoStack.length > limit) undoStack.shift();
        redoStack = [];
      },
      undo() {
        if (!undoStack.length) return null;
        const cmd = undoStack.pop();
        redoStack.push(cmd);
        return cmd;
      },
      redo() {
        if (!redoStack.length) return null;
        const cmd = redoStack.pop();
        undoStack.push(cmd);
        return cmd;
      },
      canUndo() { return undoStack.length > 0; },
      canRedo() { return redoStack.length > 0; },
      clear() { undoStack = []; redoStack = []; },
      sizes() { return { undo: undoStack.length, redo: redoStack.length }; },
    };
  }

  root.mmCreateHistory = mmCreateHistory;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mmCreateHistory };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/mindmap-history.js test/mindmap-history.test.js
git commit -m "feat(mindmap): bounded undo/redo command-stack module"
```

---

## Task 5: Wire new layout, side-aware edges, and branch colors into the renderer

Feed measured node sizes into the layout, carry `side` through resolution, anchor edges to the correct side, and tint nodes with their branch color. This is the visual core; verified by running the app.

**Files:**
- Modify: `src/public/js/mindmap.js` (`mmComputeAuto`, `mmResolve`, `mmRender`, `mmRenderEdges`, plus a measurement helper)
- Modify: `src/views/mindmaps/canvas.ejs` (add the three new module `<script>` includes BEFORE `mindmap.js`)
- Modify: `src/public/css/mindmap.css` (node tint variables; full restyle is Task 7)

**Interfaces:**
- Consumes: `computeMindmapLayout` (Task 1, now `{x,y,side}` + size-aware), `mmNodeColors`/`mmBranchColor` (Task 2).
- Produces: a `mmMeasure(list)` helper returning `Map(id -> {w,h})` from rendered DOM; `mmComputeAuto(list)` now passes `{w,h}` and returns the side-bearing layout; `MM` resolution carries `side` per node for edges.

- [ ] **Step 1: Add the module includes to `canvas.ejs`**

In `src/views/mindmaps/canvas.ejs`, replace the line:

```html
<script src="/js/mindmap-layout.js"></script>
```

with:

```html
<script src="/js/mindmap-layout.js"></script>
<script src="/js/mindmap-color.js"></script>
<script src="/js/mindmap-search.js"></script>
<script src="/js/mindmap-history.js"></script>
```

- [ ] **Step 2: Add a measurement helper and update `mmComputeAuto` in `mindmap.js`**

Replace the existing `mmComputeAuto` (currently `mindmap.js:37-39`) with:

```javascript
// Measure rendered node sizes (for variable multi-line heights). Falls back to
// approximate defaults for nodes not currently in the DOM.
function mmMeasure(list) {
  const sizes = new Map();
  for (const n of list) {
    const el = viewportEl.querySelector(`.mm-node[data-node-id="${n.id}"]`);
    sizes.set(n.id, el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: NODE_W, h: NODE_H });
  }
  return sizes;
}

function mmComputeAuto(list) {
  const sizes = mmMeasure(list);
  return computeMindmapLayout(list.map((n) => {
    const s = sizes.get(n.id) || { w: NODE_W, h: NODE_H };
    return { id: n.id, parentId: n.parentId, position: n.position, w: s.w, h: s.h };
  }));
}
```

- [ ] **Step 3: Carry `side` through `mmResolve`**

The layout entries are now `{x,y,side}`. In `mmResolve` (`mindmap.js:45-71`), the `pos[node.id]` objects must keep a `side`. Update the `resolve` function body so each computed `p` records the auto side:

Replace the assignment block inside `resolve` (the `let p; if (...) ... pos[node.id] = p;` section, `mindmap.js:55-65`) with:

```javascript
    let p;
    if (overrideId != null && node.id === overrideId) {
      p = { x: overridePos.x, y: overridePos.y };
    } else if (node.x != null && node.y != null) {
      p = { x: node.x, y: node.y };
    } else if (parentResolved && parentAuto) {
      p = { x: parentResolved.x + (a.x - parentAuto.x), y: parentResolved.y + (a.y - parentAuto.y) };
    } else {
      p = { x: a.x, y: a.y };
    }
    p.side = a.side || 'right';
    pos[node.id] = p;
```

(`a` is `auto[node.id]`, which now includes `side`.)

- [ ] **Step 4: Make edges side-aware in `mmRenderEdges`**

Replace `mmRenderEdges` (`mindmap.js:138-149`) with a version that anchors to each child's incoming side and uses measured widths/heights:

```javascript
function mmRenderEdges(pos) {
  let paths = '';
  for (const n of MM.nodes) {
    if (n.parentId == null) continue;
    const a = pos[n.parentId], b = pos[n.id];
    if (!a || !b) continue; // skip edges to/from hidden (collapsed) nodes
    const pEl = viewportEl.querySelector(`.mm-node[data-node-id="${n.parentId}"]`);
    const cEl = viewportEl.querySelector(`.mm-node[data-node-id="${n.id}"]`);
    const pw = pEl ? pEl.offsetWidth : NODE_W, ph = pEl ? pEl.offsetHeight : NODE_H;
    const cw = cEl ? cEl.offsetWidth : NODE_W, ch = cEl ? cEl.offsetHeight : NODE_H;
    // child on the left of its parent → leave parent's left edge, enter child's right edge
    const leftSide = b.side === 'left' || (b.x + cw / 2) < (a.x + pw / 2);
    const x1 = leftSide ? a.x : a.x + pw;
    const x2 = leftSide ? b.x + cw : b.x;
    const y1 = a.y + ph / 2, y2 = b.y + ch / 2;
    const mx = (x1 + x2) / 2;
    const color = mmBranchColor(n.id, MM.byId) || 'var(--border-light)';
    paths += `<path class="mm-edge" stroke="${color}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
  }
  svgEl.innerHTML = paths;
}
```

- [ ] **Step 5: Tint nodes with their branch color in `mmRender`**

In `mmRender` (`mindmap.js:96-136`), replace the single line:

```javascript
    if (n.color) el.style.borderLeftColor = n.color;
```

with:

```javascript
    const colors = mmNodeColors(n, MM.byId);
    el.style.borderLeftColor = colors.accent;
    el.style.background = colors.bg;
```

Also update the color `<input>` default value in the same function (`mindmap.js:128`) from `value="${n.color || '#2D6FE0'}"` to `value="${n.color || mmBranchColor(n.id, MM.byId) || '#2D6FE0'}"` so the picker shows the effective color.

- [ ] **Step 6: Keep `mmSetColor`'s rollback consistent**

In `mmSetColor` (`mindmap.js:422-432`), the optimistic update sets `el.style.borderLeftColor`. Add the background tint so the optimistic update matches `mmRender`. Replace the body with:

```javascript
async function mmSetColor(id, color) {
  const node = MM.byId.get(id);
  const prev = node.color;
  node.color = color;
  const el = viewportEl.querySelector(`.mm-node[data-node-id="${id}"]`);
  if (el) {
    const c = mmNodeColors(node, MM.byId);
    el.style.borderLeftColor = c.accent;
    el.style.background = c.bg;
  }
  apiUpdateNode(id, { color }, () => {
    node.color = prev;
    if (el) { const c = mmNodeColors(node, MM.byId); el.style.borderLeftColor = c.accent; el.style.background = c.bg; }
  });
  mmRenderEdges(mmPositions()); // descendants' edge colors follow an explicit override
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
Then open a project's mindmap (`/projects/<id>-<slug>/mindmaps` → open one) and confirm:
- Root sits in the middle; branches fan out to BOTH left and right, balanced.
- No nodes overlap.
- Each branch (and its descendants) shares one color; edges are colored to match and curve smoothly, anchored on the correct side (left-branch edges leave the root's left, right-branch edges its right).
- Changing a node's color via the picker updates it and its background tint immediately.
- Drag still works and children follow a dragged parent (existing behavior intact).

Expected: all of the above hold in both light and dark theme (toggle theme to check).

- [ ] **Step 8: Commit**

```bash
git add src/public/js/mindmap.js src/views/mindmaps/canvas.ejs src/public/css/mindmap.css
git commit -m "feat(mindmap): size-aware layout, side-aware colored edges, branch tints"
```

---

## Task 6: Multi-line labels

Allow `Shift+Enter` to insert a newline while editing; render labels with preserved wrapping; layout already consumes measured heights (Task 5), so taller nodes spread automatically.

**Files:**
- Modify: `src/public/js/mindmap.js` (`mmEditLabel`)
- Modify: `src/public/css/mindmap.css` (`.mm-node-label`)

- [ ] **Step 1: Allow newline on Shift+Enter in `mmEditLabel`**

In `mmEditLabel`'s `onKey` (`mindmap.js:383-389`), replace the Enter handling so a plain Enter commits but `Shift+Enter` inserts a line break. Replace the `onKey` function body with:

```javascript
  function onKey(e) {
    if (e.isComposing) return; // let an IME (e.g. Vietnamese) finish composing first
    if (e.key === 'Enter' && e.shiftKey) {
      // Shift+Enter inserts a newline; let the browser do it, just stop it bubbling to canvas.
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); finish(true); labelEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); labelEl.blur(); }
  }
```

Also change `finish` so it preserves newlines instead of collapsing them: in `finish` (`mindmap.js:373`), replace `const text = labelEl.textContent.trim();` with:

```javascript
    const text = labelEl.innerText.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
```

(`innerText` preserves the visual line breaks the user typed.)

- [ ] **Step 2: Render labels with preserved wrapping**

In `src/public/css/mindmap.css`, replace the `.mm-node-label` rule (`mindmap.css:26`) with:

```css
.mm-node-label { font-size:0.82rem; color:var(--text); word-break:break-word; white-space:pre-wrap; line-height:1.35; }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open a mindmap, edit a node, press `Shift+Enter` to add a second line, then `Enter` to commit. Confirm:
- The node shows two lines and grows taller.
- Sibling nodes move apart so nothing overlaps (layout reacts to the taller node).
- Reloading the page keeps the multi-line label (persisted via existing `updateNode`).
- A plain `Enter` (no shift) still commits and does not insert a newline.

Expected: all hold.

- [ ] **Step 4: Commit**

```bash
git add src/public/js/mindmap.js src/public/css/mindmap.css
git commit -m "feat(mindmap): multi-line node labels (Shift+Enter)"
```

---

## Task 7: Visual restyle (rounded nodes, curves, theme)

Polish the look to the approved style: softer rounded nodes, thicker smooth edges, refined toolbar. Branch tint already wired in Task 5.

**Files:**
- Modify: `src/public/css/mindmap.css`

- [ ] **Step 1: Restyle nodes and edges**

In `src/public/css/mindmap.css`, replace the `.mm-edge` rule (`mindmap.css:20`) and the `.mm-node` rule (`mindmap.css:21`) with:

```css
.mm-edge { fill:none; stroke:var(--border-light); stroke-width:2.5; stroke-linecap:round; opacity:.85; }
.mm-node { position:absolute; z-index:1; min-width:120px; max-width:260px; padding:11px 14px; background:var(--card); border:1px solid var(--border); border-left:4px solid var(--accent); border-radius:14px; box-shadow:0 6px 18px rgba(0,0,0,.16); cursor:grab; user-select:none; transition:box-shadow .15s ease, transform .05s ease; }
```

- [ ] **Step 2: Soften selection/hover/drag states**

Replace the `.mm-node.dragging` rule (`mindmap.css:24`) and the `.mm-node.selected` rule (`mindmap.css:52`) with:

```css
.mm-node.dragging { cursor:grabbing; box-shadow:0 12px 30px rgba(0,0,0,.30); }
.mm-node.selected { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent), 0 10px 26px rgba(0,0,0,.28); }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, open a mindmap. Confirm nodes are rounded (14px) with a soft shadow and a colored left accent; edges are smooth, slightly thick, and rounded; selection shows a clear ring. Toggle light/dark theme — both look clean and legible.

Expected: matches the approved "rounded, per-branch color, smooth curves" style.

- [ ] **Step 4: Commit**

```bash
git add src/public/css/mindmap.css
git commit -m "style(mindmap): rounded nodes and smoother edges"
```

---

## Task 8: Auto-arrange toolbar button + per-node "reset to auto"

Add a toolbar "Auto arrange" action (re-runs layout; a second menu item clears all manual pins) and a per-node action to drop a pinned node back to auto.

**Files:**
- Modify: `src/views/mindmaps/canvas.ejs` (toolbar buttons)
- Modify: `src/public/js/mindmap.js` (`mmAutoArrange`, `mmClearPins`, `mmResetNode`, render the per-node button)
- Modify: `src/locales/en.json`, `src/locales/vi.json` (keys)

**Interfaces:**
- Consumes: `apiUpdateNode`, `mmRender`, `mmFit` (existing).
- Produces: `mmAutoArrange()` (re-fit only), `mmClearPins()` (null every node's x/y, persist, re-render+fit), `mmResetNode(id)` (null one node's x/y, persist, re-render).

- [ ] **Step 1: Add the toolbar buttons in `canvas.ejs`**

In `src/views/mindmaps/canvas.ejs`, replace the toolbar block (`canvas.ejs:21-26`) with:

```html
      <div class="mm-toolbar">
        <button onclick="mmAutoArrange()" title="<%= t('mindmap.autoArrange') %>">&#10070;</button>
        <button onclick="mmClearPins()" title="<%= t('mindmap.resetLayout') %>">&#8635;</button>
        <button onclick="mmToggleSearch()" title="<%= t('mindmap.search') %>">&#128269;</button>
        <button onclick="mmZoom(0.1)" title="<%= t('mindmap.zoomIn') %>">+</button>
        <button onclick="mmZoom(-0.1)" title="<%= t('mindmap.zoomOut') %>">&minus;</button>
        <button onclick="mmFit()" title="<%= t('mindmap.resetView') %>">&#9633;</button>
        <button onclick="mmExportPng()" title="<%= t('mindmap.exportPng') %>">&#11015;</button>
        <button onclick="mmToggleHelp()" title="<%= t('mindmap.keyboardShortcuts') %>">?</button>
      </div>
```

(`mmToggleSearch` is wired in Task 9 and `mmExportPng` in Task 10; add the buttons now so the toolbar is built once.)

- [ ] **Step 2: Add the arrange functions in `mindmap.js`**

Add near the other node mutations (after `mmSetColor`, around `mindmap.js:432`):

```javascript
// Re-fit the current layout to the viewport (does not clear manual pins).
function mmAutoArrange() { mmRender(); mmFit(); }

// Drop ALL manual positions back to auto-layout, persist, and re-fit.
async function mmClearPins() {
  if (!(await mmConfirm(t('js.mindmap.confirmResetLayout')))) return;
  const pinned = MM.nodes.filter((n) => n.x != null || n.y != null);
  for (const n of pinned) { n.x = null; n.y = null; }
  mmRender(); mmFit();
  for (const n of pinned) apiUpdateNode(n.id, { x: null, y: null });
}

// Drop one node back to auto-layout.
async function mmResetNode(id) {
  const node = MM.byId.get(id);
  if (!node || (node.x == null && node.y == null)) return;
  const px = node.x, py = node.y;
  node.x = null; node.y = null;
  mmRender();
  apiUpdateNode(id, { x: null, y: null }, () => { node.x = px; node.y = py; mmRender(); });
}
```

- [ ] **Step 3: Render the per-node "reset to auto" button for pinned nodes**

In `mmRender` (`mindmap.js`), inside the `.mm-node-actions` block, add a reset button shown only when the node is manually pinned. Replace the delete-button line (`mindmap.js:130`) with:

```javascript
        ${(n.x != null || n.y != null) ? `<button onclick="mmResetNode(${n.id})" title="${t('js.mindmap.resetToAuto')}">${t('js.mindmap.resetToAuto')}</button>` : ''}
        ${n.parentId != null ? `<button onclick="mmDeleteNode(${n.id})">${t('js.mindmap.delete')}</button>` : ''}
```

- [ ] **Step 4: Add locale keys**

Add to `src/locales/en.json` (alongside the other `mindmap.*` and `js.mindmap.*` keys):

```json
  "mindmap.autoArrange": "Auto arrange",
  "mindmap.resetLayout": "Reset layout",
  "mindmap.search": "Search nodes",
  "mindmap.exportPng": "Export PNG",
  "js.mindmap.confirmResetLayout": "Reset all manual positions to auto-layout?",
  "js.mindmap.resetToAuto": "Reset to auto",
```

Add to `src/locales/vi.json` the same keys with Vietnamese values:

```json
  "mindmap.autoArrange": "Tự sắp xếp",
  "mindmap.resetLayout": "Đặt lại bố cục",
  "mindmap.search": "Tìm node",
  "mindmap.exportPng": "Xuất PNG",
  "js.mindmap.confirmResetLayout": "Đặt lại toàn bộ vị trí thủ công về tự động?",
  "js.mindmap.resetToAuto": "Về tự động",
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open a mindmap. Confirm:
- Drag a node (it becomes pinned); a "Về tự động / Reset to auto" button appears in its actions; clicking it returns the node to its auto slot.
- "Tự sắp xếp" re-fits the view.
- "Đặt lại bố cục" asks for confirmation, then snaps every dragged node back to a clean auto-layout and re-fits.

Expected: all hold; reloading the page reflects the persisted positions.

- [ ] **Step 6: Commit**

```bash
git add src/public/js/mindmap.js src/views/mindmaps/canvas.ejs src/locales/en.json src/locales/vi.json
git commit -m "feat(mindmap): auto-arrange toolbar and per-node reset-to-auto"
```

---

## Task 9: Search UI

Wire the search module to a toolbar-toggled input that highlights matches, dims non-matches, expands ancestors of matches, and cycles through matches with Enter.

**Files:**
- Modify: `src/views/mindmaps/canvas.ejs` (search input element)
- Modify: `src/public/js/mindmap.js` (`mmToggleSearch`, `mmRunSearch`, `mmFocusMatch`, highlight/dim classes)
- Modify: `src/public/css/mindmap.css` (`.mm-search`, `.mm-node.mm-hit`, `.mm-node.mm-dim`)

**Interfaces:**
- Consumes: `mmSearchNodes` (Task 3), `mmRender`, `mmSelectReveal` (existing).
- Produces: `mmToggleSearch()`, and internal match-cycling state on `MM`.

- [ ] **Step 1: Add the search input to `canvas.ejs`**

In `src/views/mindmaps/canvas.ejs`, add this element immediately AFTER the `<div class="mm-toolbar">…</div>` block (still inside `#mmCanvas`):

```html
      <div class="mm-search" id="mmSearch" hidden>
        <input type="text" id="mmSearchInput" placeholder="<%= t('mindmap.search') %>" autocomplete="off">
        <span class="mm-search-count" id="mmSearchCount"></span>
      </div>
```

- [ ] **Step 2: Add search behavior in `mindmap.js`**

Add after the arrange functions (Task 8):

```javascript
// ── Search ──
MM.search = { open: false, matches: [], idx: -1 };
function mmToggleSearch(force) {
  const box = document.getElementById('mmSearch');
  const input = document.getElementById('mmSearchInput');
  const open = force === undefined ? box.hasAttribute('hidden') : force;
  if (open) { box.removeAttribute('hidden'); input.focus(); input.select(); }
  else { box.setAttribute('hidden', ''); input.value = ''; mmRunSearch(''); }
  MM.search.open = open;
}
function mmApplyHighlight() {
  const hit = new Set(MM.search.matches);
  viewportEl.querySelectorAll('.mm-node').forEach((el) => {
    const id = parseInt(el.dataset.nodeId);
    el.classList.toggle('mm-hit', hit.has(id));
    el.classList.toggle('mm-dim', hit.size > 0 && !hit.has(id));
  });
}
function mmRunSearch(query) {
  const { matches, expand } = mmSearchNodes(MM.nodes, query);
  // expand ancestors of matches so matches are visible
  let changed = false;
  for (const id of expand) { const n = MM.byId.get(id); if (n && n.collapsed) { n.collapsed = false; changed = true; apiUpdateNode(id, { collapsed: false }); } }
  if (changed) mmRender();
  MM.search.matches = matches;
  MM.search.idx = matches.length ? 0 : -1;
  document.getElementById('mmSearchCount').textContent = matches.length ? `1/${matches.length}` : (query.trim() ? '0' : '');
  mmApplyHighlight();
  if (matches.length) mmFocusMatch(0);
}
function mmFocusMatch(i) {
  if (!MM.search.matches.length) return;
  MM.search.idx = (i + MM.search.matches.length) % MM.search.matches.length;
  const id = MM.search.matches[MM.search.idx];
  document.getElementById('mmSearchCount').textContent = `${MM.search.idx + 1}/${MM.search.matches.length}`;
  mmSelectReveal(id);
  mmApplyHighlight();
}
document.addEventListener('input', (e) => { if (e.target && e.target.id === 'mmSearchInput') mmRunSearch(e.target.value); });
document.addEventListener('keydown', (e) => {
  if (!(document.activeElement && document.activeElement.id === 'mmSearchInput')) return;
  if (e.key === 'Enter') { e.preventDefault(); mmFocusMatch(MM.search.idx + (e.shiftKey ? -1 : 1)); }
  else if (e.key === 'Escape') { e.preventDefault(); mmToggleSearch(false); }
});
```

Note: `mmRender()` rebuilds nodes and drops the highlight classes, so call `mmApplyHighlight()` at the very end of `mmRender` to re-apply highlights after any re-render. Add this line as the last statement inside `mmRender` (after `mmApplyTransform();` at `mindmap.js:135`):

```javascript
  if (MM.search && MM.search.matches.length) mmApplyHighlight();
```

- [ ] **Step 3: Add search styles to `mindmap.css`**

Append to `src/public/css/mindmap.css`:

```css
/* Search */
.mm-search { position:absolute; top:56px; right:14px; z-index:15; display:flex; align-items:center; gap:8px; padding:7px 10px; background:var(--surface); border:1px solid var(--border); border-radius:10px; box-shadow:0 10px 28px rgba(0,0,0,.28); }
.mm-search input { width:200px; padding:6px 9px; background:var(--card); border:1px solid var(--border); border-radius:7px; color:var(--text); font-size:0.82rem; }
.mm-search input:focus { outline:none; border-color:var(--accent); }
.mm-search-count { font-size:0.72rem; color:var(--text-muted); font-family:var(--font-mono); min-width:30px; }
.mm-node.mm-dim { opacity:.32; }
.mm-node.mm-hit { box-shadow:0 0 0 2px var(--accent), 0 8px 22px rgba(0,0,0,.28); }
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open a mindmap with several nodes (include one under a collapsed parent). Click the search (🔍) button. Type part of a node label (try without diacritics, e.g. `ha` for `Hà`). Confirm:
- Matching nodes are highlighted; others dim.
- A match under a collapsed parent causes that parent to expand.
- The counter shows `1/N`; pressing Enter cycles to the next match (Shift+Enter previous) and pans to it.
- Escape (or clearing) closes search and restores the normal view.

Expected: all hold.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/mindmap.js src/views/mindmaps/canvas.ejs src/public/css/mindmap.css
git commit -m "feat(mindmap): node search with highlight, expand, and cycling"
```

---

## Task 10: Undo/redo wiring

Wire `mmCreateHistory` into the mutating actions and bind Ctrl+Z / Ctrl+Y. Each action pushes a command whose `undo`/`redo` closures call existing APIs and re-render.

**Files:**
- Modify: `src/public/js/mindmap.js` (history instance, record on mutations, keyboard binding, help overlay text)
- Modify: `src/locales/en.json`, `src/locales/vi.json` (help keys)

**Interfaces:**
- Consumes: `mmCreateHistory` (Task 4), `apiUpdateNode`, `mmRender` (existing).
- Produces: `MM.history`, `mmRecord(cmd)`, `mmUndo()`, `mmRedo()`.

**Scope note:** record label-edit, color, collapse, move, and reset-to-auto (all reversible via `updateNode` with no id change). Add/delete are NOT recorded in this pass — they change ids and would need id-remapping, which is deferred (documented in the spec's "Out of scope risk" note). The help overlay and commit message state this clearly.

- [ ] **Step 1: Create the history instance and helpers in `mindmap.js`**

Add right after the `MM` object definition (`mindmap.js:9`):

```javascript
MM.history = mmCreateHistory(50);
function mmRecord(cmd) { MM.history.push(cmd); }
async function mmUndo() { const c = MM.history.undo(); if (c) await c.undo(); }
async function mmRedo() { const c = MM.history.redo(); if (c) await c.redo(); }
// Persist a single scalar field and re-render (used by undo/redo closures).
function mmSetField(id, field, value) {
  const node = MM.byId.get(id);
  if (!node) return;
  node[field] = value;
  mmRender();
  apiUpdateNode(id, { [field]: value });
}
```

- [ ] **Step 2: Record label edits**

In `mmEditLabel`'s `finish` (`mindmap.js:374-377`), wrap the successful save so it records an undo command. Replace the `if (save && text && text !== node.label) { ... }` block with:

```javascript
    if (save && text && text !== node.label) {
      const prev = node.label;
      node.label = text;
      apiUpdateNode(id, { label: text }, () => { node.label = prev; labelEl.textContent = prev; });
      mmRecord({ label: 'label',
        undo: () => mmSetField(id, 'label', prev),
        redo: () => mmSetField(id, 'label', text) });
    } else {
```

- [ ] **Step 3: Record color changes**

In `mmSetColor` (Task 5 version), after the optimistic update + `apiUpdateNode`, add a record. Insert before the trailing `mmRenderEdges(...)` line:

```javascript
  mmRecord({ label: 'color',
    undo: () => mmSetField(id, 'color', prev),
    redo: () => mmSetField(id, 'color', color) });
```

- [ ] **Step 4: Record collapse toggles**

In `mmToggleCollapse` (`mindmap.js:414-420`), after the existing `apiUpdateNode(...)` call, add:

```javascript
  mmRecord({ label: 'collapse',
    undo: () => mmSetField(id, 'collapsed', prev),
    redo: () => mmSetField(id, 'collapsed', !prev) });
```

- [ ] **Step 5: Record drag-move and reset-to-auto**

In `endPointer`'s drag branch (`mindmap.js:225-230`), after the existing `apiUpdateNode(...)` line that persists `{x,y}`, add a record using the captured `prevX/prevY`:

```javascript
      mmRecord({ label: 'move',
        undo: () => { const m = MM.byId.get(g.id); m.x = prevX; m.y = prevY; mmRender(); apiUpdateNode(g.id, { x: prevX, y: prevY }); },
        redo: () => { const m = MM.byId.get(g.id); m.x = g.nx; m.y = g.ny; mmRender(); apiUpdateNode(g.id, { x: g.nx, y: g.ny }); } });
```

In `mmResetNode` (Task 8), after its `apiUpdateNode(...)`, add:

```javascript
  mmRecord({ label: 'reset',
    undo: () => { const m = MM.byId.get(id); m.x = px; m.y = py; mmRender(); apiUpdateNode(id, { x: px, y: py }); },
    redo: () => { const m = MM.byId.get(id); m.x = null; m.y = null; mmRender(); apiUpdateNode(id, { x: null, y: null }); } });
```

- [ ] **Step 6: Bind Ctrl+Z / Ctrl+Y**

In the global `keydown` handler, add an early branch BEFORE the field-guard `return` (insert right after the `if (e.defaultPrevented) return;` line at `mindmap.js:503`):

```javascript
  if ((e.ctrlKey || e.metaKey) && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); mmUndo(); return; }
    if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); mmRedo(); return; }
  }
```

- [ ] **Step 7: Add undo/redo to the help overlay**

In `mmToggleHelp` (`mindmap.js:543-552`), add two rows to the `<dl>`, before the `<dt>?</dt>` row:

```javascript
        <dt>Ctrl + Z</dt><dd>${t('js.mindmap.helpUndo')}</dd>
        <dt>Ctrl + Y</dt><dd>${t('js.mindmap.helpRedo')}</dd>
```

Add the keys to `src/locales/en.json`:

```json
  "js.mindmap.helpUndo": "Undo (label/color/move/collapse)",
  "js.mindmap.helpRedo": "Redo",
```

And to `src/locales/vi.json`:

```json
  "js.mindmap.helpUndo": "Hoàn tác (nhãn/màu/di chuyển/thu gọn)",
  "js.mindmap.helpRedo": "Làm lại",
```

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev`, open a mindmap. For each of: rename a node, change its color, collapse/expand it, drag it, reset it to auto — perform the action, press Ctrl+Z, and confirm it reverts (and persists on reload); press Ctrl+Y and confirm it re-applies. Open the `?` help and confirm the Ctrl+Z/Ctrl+Y rows show.

Expected: undo/redo works for label, color, collapse, move, reset; add/delete are intentionally not undoable (no error, just no-op for those).

- [ ] **Step 9: Commit**

```bash
git add src/public/js/mindmap.js src/locales/en.json src/locales/vi.json
git commit -m "feat(mindmap): client undo/redo for label, color, collapse, move, reset"
```

---

## Task 11: Export PNG

Add an export button that renders the full mindmap to a PNG via `html-to-image` (CDN) and downloads it.

**Files:**
- Modify: `src/views/mindmaps/canvas.ejs` (CDN `<script>` for html-to-image)
- Modify: `src/public/js/mindmap.js` (`mmExportPng`)

**Interfaces:**
- Consumes: global `htmlToImage` (from CDN), `mmPositions`, `mmApplyTransform` (existing).
- Produces: `mmExportPng()`.

- [ ] **Step 1: Add the html-to-image CDN script in `canvas.ejs`**

In `src/views/mindmaps/canvas.ejs`, add BEFORE the `<script src="/js/mindmap.js"></script>` line:

```html
<script src="https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js"></script>
```

- [ ] **Step 2: Add `mmExportPng` in `mindmap.js`**

Add near the export of other toolbar handlers (after `mmExportPng`'s siblings, e.g. after the search section):

```javascript
// Export the whole mindmap (nodes + edges) to a downloadable PNG. Temporarily
// fits all content into a fixed-size offscreen transform so the full map is captured.
async function mmExportPng() {
  if (typeof htmlToImage === 'undefined') { mmToast(t('js.mindmap.exportUnavailable'), 'error'); return; }
  const pos = mmPositions();
  const ids = Object.keys(pos);
  if (!ids.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const el = viewportEl.querySelector(`.mm-node[data-node-id="${id}"]`);
    const w = el ? el.offsetWidth : NODE_W, h = el ? el.offsetHeight : NODE_H;
    minX = Math.min(minX, pos[id].x); minY = Math.min(minY, pos[id].y);
    maxX = Math.max(maxX, pos[id].x + w); maxY = Math.max(maxY, pos[id].y + h);
  }
  const pad = 40;
  const W = (maxX - minX) + pad * 2, H = (maxY - minY) + pad * 2;
  // save view, switch to a 1:1 transform that frames the whole map
  const saved = { pan: { ...MM.pan }, zoom: MM.zoom };
  MM.zoom = 1; MM.pan = { x: pad - minX, y: pad - minY }; mmApplyTransform();
  try {
    const bg = getComputedStyle(canvasEl).backgroundColor;
    const dataUrl = await htmlToImage.toPng(canvasEl, { width: W, height: H, pixelRatio: 2, backgroundColor: bg,
      style: { } });
    const a = document.createElement('a');
    a.download = (window.MINDMAP_NAME || 'mindmap').replace(/[^\w\-]+/g, '_') + '.png';
    a.href = dataUrl; a.click();
  } catch (err) {
    console.error('Export failed:', err);
    mmToast(t('js.mindmap.exportFailed'), 'error');
  } finally {
    MM.pan = saved.pan; MM.zoom = saved.zoom; mmApplyTransform();
  }
}
```

Note: the export captures `canvasEl` at a framed 1:1 transform. The toolbar/search overlays sit inside `canvasEl`; to keep them out of the image, hide them during capture. Add this just before the `htmlToImage.toPng` call:

```javascript
    canvasEl.querySelectorAll('.mm-toolbar, .mm-search, .mm-help').forEach((el) => el.dataset.mmHidden = el.style.display, el.style.display = 'none');
```

and restore them in the `finally` block:

```javascript
    canvasEl.querySelectorAll('.mm-toolbar, .mm-search, .mm-help').forEach((el) => el.style.display = el.dataset.mmHidden || '');
```

(Correct the first line to a clean form when implementing:)

```javascript
    const overlays = canvasEl.querySelectorAll('.mm-toolbar, .mm-search, .mm-help');
    overlays.forEach((el) => { el.dataset.mmPrevDisplay = el.style.display; el.style.display = 'none'; });
```

with the restore:

```javascript
    canvasEl.querySelectorAll('.mm-toolbar, .mm-search, .mm-help').forEach((el) => { el.style.display = el.dataset.mmPrevDisplay || ''; });
```

- [ ] **Step 3: Expose the mindmap name for the filename**

In `src/views/mindmaps/canvas.ejs`, in the inline `window.MINDMAP = {...}` script block (`canvas.ejs:47`), add a line:

```html
  window.MINDMAP_NAME = <%- JSON.stringify(mindmap.name) %>;
```

- [ ] **Step 4: Add locale keys**

`src/locales/en.json`:

```json
  "js.mindmap.exportUnavailable": "Export library not loaded",
  "js.mindmap.exportFailed": "Could not export image",
```

`src/locales/vi.json`:

```json
  "js.mindmap.exportUnavailable": "Chưa tải được thư viện xuất ảnh",
  "js.mindmap.exportFailed": "Không thể xuất ảnh",
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open a mindmap, click the export (⬇) button. Confirm a PNG downloads named `<mindmap-name>.png`, showing the full map (all branches, correct colors, edges) on the canvas background, WITHOUT the toolbar/search overlays. The on-screen view returns to where it was after export.

Expected: all hold.

- [ ] **Step 6: Commit**

```bash
git add src/public/js/mindmap.js src/views/mindmaps/canvas.ejs src/locales/en.json src/locales/vi.json
git commit -m "feat(mindmap): export full mindmap to PNG"
```

---

## Task 12: Locale completeness + full regression verification

Confirm every new key exists in both locales and run a full manual regression of preserved features.

**Files:**
- Verify/patch: `src/locales/en.json`, `src/locales/vi.json`
- Run: existing tests

- [ ] **Step 1: Confirm key parity across locales**

Run:

```bash
cd /Users/mashi/mashicode/PMTask
node -e "const en=require('./src/locales/en.json'),vi=require('./src/locales/vi.json');const miss=Object.keys(en).filter(k=>!(k in vi));console.log('missing in vi:',miss);const extra=Object.keys(vi).filter(k=>!(k in en));console.log('missing in en:',extra);"
```

Expected: both arrays empty. If any key is missing, add it to the lacking locale and re-run.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all of `mindmap-layout`, `mindmap-color`, `mindmap-search`, `mindmap-history`, and `i18n` tests green.

- [ ] **Step 3: Full manual regression in the browser**

Run: `npm run dev`. Open a mindmap and confirm every preserved capability still works:
- Add child (Tab / + Child button), add sibling (Shift+Enter), inline edit (Enter/F2), delete (Delete) with confirm.
- Collapse/expand a node hides/shows its subtree; arrow-key navigation (←parent, →child, ↑↓ siblings) works.
- Convert a node to a task ("Create task") shows the status badge; "Open task" opens the task preview modal.
- Color picker changes a node and its descendants' tint/edges; pan, wheel-zoom, pinch-zoom, and Fit all work.
- New features: balanced two-sided colored layout, multi-line labels, search, undo/redo, auto-arrange/reset, PNG export — all functional together.
- Switch language (profile) to Vietnamese and back to English: all toolbar tooltips, node buttons, help overlay, toasts, and confirm dialogs are translated (no raw `js.mindmap.*` keys visible).
- Toggle light/dark theme: everything legible.

Expected: no regressions; all new features work.

- [ ] **Step 4: Commit any locale fixes**

```bash
git add src/locales/en.json src/locales/vi.json
git commit -m "chore(mindmap): ensure en/vi locale key parity for new strings"
```

(If Step 1 found nothing to fix, skip this commit.)

---

## Self-Review Notes (coverage map)

- Spec §1 Layout engine → Tasks 1, 5, 8 (balanced two-sided, size-aware, no-overlap, auto default, manual override + reset, auto-arrange).
- Spec §2 Visual → Tasks 2, 5, 6, 7 (branch colors, rounded nodes, curved colored edges, multi-line, theme).
- Spec §3 Interaction → Tasks 8 (toolbar), 9 (search), 10 (Ctrl+Z/Y), existing drag persistence kept.
- Spec §4 Undo/Redo → Task 4 (module) + Task 10 (wiring). Add/delete remapping intentionally deferred and documented.
- Spec §5 Export PNG → Task 11 (CDN `html-to-image`, not an npm dependency — follows the repo's CDN convention; spec intent preserved).
- Spec acceptance criteria 1–8 → covered by Tasks 5/7 (1), 8 (2), 6 (3), 9 (4), 10 (5), 11 (6), 12 (7), and the no-backend-change constraint (8).
```
