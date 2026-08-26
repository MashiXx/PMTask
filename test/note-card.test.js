const test = require('node:test');
const assert = require('node:assert');
const { pickNoteCover, isNoteEmpty } = require('../src/public/js/note-card');

const img = (id) => ({ id, type: 'image' });
const vid = (id) => ({ id, type: 'video' });

test('picks the first uploaded image as the cover', () => {
  assert.deepStrictEqual(
    pickNoteCover([img(7), img(9)], null),
    { source: 'media', type: 'image', id: 7 }
  );
});

test('uploaded images win over an image pasted into the body', () => {
  assert.deepStrictEqual(
    pickNoteCover([img(7)], 'data:image/png;base64,AAAA'),
    { source: 'media', type: 'image', id: 7 }
  );
});

test('skips leading videos to reach the first uploaded image', () => {
  assert.deepStrictEqual(
    pickNoteCover([vid(1), img(2)], null),
    { source: 'media', type: 'image', id: 2 }
  );
});

test('falls back to the first image in the note body', () => {
  assert.deepStrictEqual(
    pickNoteCover([], '/notes/api/media/3'),
    { source: 'content', type: 'image', src: '/notes/api/media/3' }
  );
});

test('body image beats a video-only gallery', () => {
  assert.deepStrictEqual(
    pickNoteCover([vid(1)], 'data:image/png;base64,AAAA'),
    { source: 'content', type: 'image', src: 'data:image/png;base64,AAAA' }
  );
});

test('a video-only note still gets a cover rather than a blank card', () => {
  assert.deepStrictEqual(
    pickNoteCover([vid(4)], null),
    { source: 'media', type: 'video', id: 4 }
  );
});

test('a note with no images at all has no cover', () => {
  assert.strictEqual(pickNoteCover([], null), null);
  assert.strictEqual(pickNoteCover([], ''), null);
});

test('tolerates a missing media list', () => {
  assert.strictEqual(pickNoteCover(undefined, null), null);
  assert.deepStrictEqual(
    pickNoteCover(null, 'x.png'),
    { source: 'content', type: 'image', src: 'x.png' }
  );
});

test('treats media with no explicit type as an image', () => {
  assert.deepStrictEqual(
    pickNoteCover([{ id: 5 }], null),
    { source: 'media', type: 'image', id: 5 }
  );
});

// ── isNoteEmpty ───────────────────────────────────────────────────────────
// A brand-new note is discarded when the user closes it without putting
// anything in. `hasText` / `hasImage` are computed by the caller from the DOM.

const blank = { title: 'Untitled', hasText: false, hasImage: false, labels: [] };

test('an untouched new note is empty', () => {
  assert.strictEqual(isNoteEmpty(blank, null), true);
});

test('a typed title, body or image keeps the note', () => {
  assert.strictEqual(isNoteEmpty({ ...blank, title: 'Shopping' }, null), false);
  assert.strictEqual(isNoteEmpty({ ...blank, hasText: true }, null), false);
  assert.strictEqual(isNoteEmpty({ ...blank, hasImage: true }, null), false);
});

test('a label the user picked keeps the note', () => {
  assert.strictEqual(isNoteEmpty({ ...blank, labels: [{ id: 3 }] }, null), false);
});

test('the label auto-applied by the active filter does NOT keep an untouched note', () => {
  assert.strictEqual(isNoteEmpty({ ...blank, labels: [{ id: 3 }] }, 3), true);
});

test('a second label added on top of the auto-applied one keeps the note', () => {
  assert.strictEqual(isNoteEmpty({ ...blank, labels: [{ id: 3 }, { id: 4 }] }, 3), false);
});

test('an auto-applied label does not rescue a note that also has content', () => {
  assert.strictEqual(isNoteEmpty({ ...blank, hasText: true, labels: [{ id: 3 }] }, 3), false);
});

test('tolerates a missing labels list', () => {
  assert.strictEqual(isNoteEmpty({ title: 'Untitled' }, null), true);
});

// ── Masonry layout ────────────────────────────────────────────────────────
// The board is laid out as explicit column elements (CSS multi-column can't be
// drag-sorted), so column count and card placement are computed here.

const { columnCountFor, splitIntoColumns, applyVisualOrder } = require('../src/public/js/note-card');

test('columnCountFor fits as many columns as the width allows', () => {
  // n columns need n*240 + (n-1)*14 px.
  assert.strictEqual(columnCountFor(748, 240, 14), 3); // exactly 3 columns
  assert.strictEqual(columnCountFor(747, 240, 14), 2); // one pixel short of 3
  assert.strictEqual(columnCountFor(494, 240, 14), 2); // exactly 2 columns
  assert.strictEqual(columnCountFor(493, 240, 14), 1);
});

test('columnCountFor never drops below a single column', () => {
  assert.strictEqual(columnCountFor(100, 240, 14), 1);
  assert.strictEqual(columnCountFor(0, 240, 14), 1);
  assert.strictEqual(columnCountFor(-50, 240, 14), 1);
  assert.strictEqual(columnCountFor(NaN, 240, 14), 1);
});

// splitIntoColumns gives each column a CONTIGUOUS run of the note order, the
// way CSS multi-column does. That is what makes the layout reversible: reading
// the columns left to right, top to bottom recovers the exact order that was
// laid out, so ending a drag can't silently scramble the board.

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('splitIntoColumns returns runs that exactly cover the list', () => {
  const heights = [100, 40, 70, 120, 55, 90, 30];
  for (const count of [1, 2, 3, 4, 8]) {
    const runs = splitIntoColumns(heights, count);
    assert.strictEqual(runs.length, count, `${count} columns`);
    assert.strictEqual(sum(runs), heights.length, `covers all cards for ${count}`);
    assert.ok(runs.every((r) => r >= 0), 'no negative runs');
  }
});

test('splitIntoColumns balances column heights', () => {
  // Six equal cards over three columns -> two each.
  assert.deepStrictEqual(splitIntoColumns([10, 10, 10, 10, 10, 10], 3), [2, 2, 2]);
  // One very tall card should occupy a column on its own.
  assert.deepStrictEqual(splitIntoColumns([100, 10, 10, 10, 10], 2), [1, 4]);
});

test('splitIntoColumns puts everything in one column when asked for one', () => {
  assert.deepStrictEqual(splitIntoColumns([10, 20, 30], 1), [3]);
});

test('splitIntoColumns handles fewer cards than columns', () => {
  assert.deepStrictEqual(splitIntoColumns([10, 20], 3), [1, 1, 0]);
  assert.deepStrictEqual(splitIntoColumns([10], 3), [1, 0, 0]);
});

test('splitIntoColumns handles an empty board', () => {
  assert.deepStrictEqual(splitIntoColumns([], 3), [0, 0, 0]);
  assert.deepStrictEqual(splitIntoColumns([], 1), [0]);
});

test('splitIntoColumns never reorders: runs are read left to right in sequence', () => {
  // Reconstructing the list from the runs must give back the original order.
  const heights = [30, 90, 45, 60, 15, 80];
  const items = ['a', 'b', 'c', 'd', 'e', 'f'];
  const runs = splitIntoColumns(heights, 3);
  let at = 0;
  const readBack = [];
  for (const len of runs) for (let k = 0; k < len; k++) readBack.push(items[at++]);
  assert.deepStrictEqual(readBack, items);
});

// ── applyVisualOrder ──────────────────────────────────────────────────────
// A drag reorders only the notes currently on screen. Notes hidden by a label
// filter or a search query must keep the slots they already hold, otherwise
// reordering a filtered view would silently shuffle everything else.

test('with nothing filtered out, the visual order IS the new order', () => {
  assert.deepStrictEqual(applyVisualOrder([1, 2, 3], [3, 1, 2]), [3, 1, 2]);
});

test('hidden notes keep their slots while visible ones are rearranged', () => {
  // 2 and 4 are hidden; visible 1,3,5 get dragged into the order 5,3,1.
  assert.deepStrictEqual(applyVisualOrder([1, 2, 3, 4, 5], [5, 3, 1]), [5, 2, 3, 4, 1]);
});

test('a hidden note at the front is not disturbed', () => {
  assert.deepStrictEqual(applyVisualOrder([9, 1, 2], [2, 1]), [9, 2, 1]);
});

test('an empty or unchanged drag leaves the list alone', () => {
  assert.deepStrictEqual(applyVisualOrder([1, 2, 3], []), [1, 2, 3]);
  assert.deepStrictEqual(applyVisualOrder([1, 2, 3], [1, 2, 3]), [1, 2, 3]);
  assert.deepStrictEqual(applyVisualOrder([], []), []);
});

test('ids that are not in the full list are ignored rather than injected', () => {
  assert.deepStrictEqual(applyVisualOrder([1, 2], [2, 99, 1]), [2, 1]);
});
