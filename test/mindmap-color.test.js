const test = require('node:test');
const assert = require('node:assert');
const { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors, mmEffectiveAccent } = require('../src/public/js/mindmap-color');

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

test('a descendant inherits the nearest explicit ancestor color over the branch palette', () => {
  const byId = makeById([
    { id: 1, parentId: null, position: 0 },
    { id: 2, parentId: 1, position: 0 },
    { id: 5, parentId: 2, position: 0, color: '#abcdef' },
    { id: 9, parentId: 5, position: 0 },
  ]);
  assert.strictEqual(mmEffectiveAccent(9, byId), '#abcdef'); // nearest explicit ancestor (node 5)
  assert.strictEqual(mmEffectiveAccent(2, byId), mmBranchColor(2, byId)); // no explicit ancestor → branch palette
});
