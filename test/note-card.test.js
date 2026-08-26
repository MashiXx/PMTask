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
