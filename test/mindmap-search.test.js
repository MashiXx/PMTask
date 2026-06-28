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
