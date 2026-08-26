const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_CONTENT_BYTES,
  contentByteLength,
  isContentTooLong,
} = require('../src/utils/note-content');

// MySQL sizes TEXT/MEDIUMTEXT in bytes; a character-based guard can accept a
// value the column then rejects with P2000. These tests pin the guard to bytes.

test('contentByteLength counts bytes, not characters', () => {
  assert.strictEqual(contentByteLength('abc'), 3);
  assert.strictEqual(contentByteLength('é'), 2);
  assert.strictEqual(contentByteLength('😀'), 4);
});

test('contentByteLength treats non-strings as empty', () => {
  assert.strictEqual(contentByteLength(undefined), 0);
  assert.strictEqual(contentByteLength(null), 0);
  assert.strictEqual(contentByteLength(12345), 0);
});

test('regression: a note under the old 100k-character cap could still blow a TEXT column', () => {
  const content = '😀'.repeat(20000); // 20k characters, 80k bytes
  assert.ok(content.length < 100000, 'old character guard accepted it');
  assert.ok(contentByteLength(content) > 65535, 'but MySQL TEXT (65535 bytes) rejected it');
});

test('isContentTooLong rejects on bytes even when the character count fits', () => {
  const content = '😀'.repeat(MAX_CONTENT_BYTES / 4 + 1);
  assert.ok(content.length < MAX_CONTENT_BYTES, 'fewer characters than the byte cap');
  assert.ok(isContentTooLong(content), 'still over the byte cap');
});

test('isContentTooLong accepts content at exactly the cap', () => {
  assert.strictEqual(isContentTooLong('a'.repeat(MAX_CONTENT_BYTES)), false);
  assert.strictEqual(isContentTooLong('a'.repeat(MAX_CONTENT_BYTES + 1)), true);
});

test('the cap fits inside a MySQL MEDIUMTEXT column', () => {
  assert.ok(MAX_CONTENT_BYTES < 16777215);
});

test('the cap leaves room for JSON escaping inside the 1mb body-parser limit', () => {
  // Worst case every byte of content escapes to two bytes on the wire.
  assert.ok(MAX_CONTENT_BYTES * 2 < 1024 * 1024);
});

test('the cap is well above the old TEXT ceiling, so no stored note can fail it', () => {
  assert.ok(MAX_CONTENT_BYTES > 65535);
});
