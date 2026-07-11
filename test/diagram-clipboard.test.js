const test = require('node:test');
const assert = require('node:assert');
const { cloneForClipboard, pastePayloads, nudgeDelta } = require('../src/public/js/diagram-clipboard');

test('cloneForClipboard keeps visual props and drops ids/positions absolute', () => {
  const nodes = [
    { id: 1, label: 'A', description: 'd', shape: 'rect', color: '#111', icon: 'server', width: 100, height: 50, x: 40, y: 60, parentId: null },
  ];
  const clip = cloneForClipboard(nodes);
  assert.strictEqual(clip.length, 1);
  assert.deepStrictEqual(clip[0], { label: 'A', description: 'd', shape: 'rect', color: '#111', icon: 'server', width: 100, height: 50, x: 40, y: 60 });
});

test('pastePayloads offsets every node by the same delta, preserving relative layout', () => {
  const clip = [ { label: 'A', shape: 'rect', x: 40, y: 60 }, { label: 'B', shape: 'rect', x: 40, y: 160 } ];
  const out = pastePayloads(clip, 20, 20);
  assert.strictEqual(out[0].x, 60); assert.strictEqual(out[0].y, 80);
  assert.strictEqual(out[1].x, 60); assert.strictEqual(out[1].y, 180);
  // relative gap preserved
  assert.strictEqual(out[1].y - out[0].y, 100);
});

test('pastePayloads carries description/color/icon and omits undefined optionals', () => {
  const out = pastePayloads([{ label: 'A', shape: 'rect', x: 0, y: 0, color: '#abc' }], 10, 10);
  assert.strictEqual(out[0].color, '#abc');
  assert.ok(!('icon' in out[0]));
});

test('nudgeDelta returns grid step normally and 1px when fine', () => {
  assert.deepStrictEqual(nudgeDelta('ArrowRight', false, 20), { dx: 20, dy: 0 });
  assert.deepStrictEqual(nudgeDelta('ArrowUp', false, 20), { dx: 0, dy: -20 });
  assert.deepStrictEqual(nudgeDelta('ArrowLeft', true, 20), { dx: -1, dy: 0 });
  assert.strictEqual(nudgeDelta('ArrowDown', false, 20).dy, 20);
  assert.strictEqual(nudgeDelta('Enter', false, 20), null);
});
