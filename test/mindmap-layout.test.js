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
