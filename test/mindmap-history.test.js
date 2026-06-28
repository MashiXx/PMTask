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
