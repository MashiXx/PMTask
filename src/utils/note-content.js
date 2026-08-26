// Length guards for `Note.content` (rich-text HTML).
//
// MySQL sizes TEXT columns in BYTES, not characters. `Note.content` is HTML the
// user can fill with emoji, accented text and pasted markup, so a character
// count is not a safe proxy: 20k emoji is 20k characters but 80k bytes. The
// column used to be TEXT (65,535 bytes) while the controller allowed 100,000
// characters, so oversized notes sailed past validation and died in the driver
// with Prisma P2000. The column is now MEDIUMTEXT (16 MiB) and the cap below is
// measured in bytes.
//
// The cap also has to clear the `express.json({ limit: '1mb' })` body parser in
// src/app.js: content is sent inside a JSON envelope where every quote and
// backslash in the HTML is escaped, so the wire payload can be ~2x the content.
// 500 KiB keeps the worst case comfortably under 1 MiB, so an oversized note is
// rejected by this guard with a clear message rather than by the body parser.
// It is still 8x the old TEXT ceiling, so no existing note can fail it.
const MAX_CONTENT_BYTES = 512000;

function contentByteLength(content) {
  return typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0;
}

function isContentTooLong(content) {
  return contentByteLength(content) > MAX_CONTENT_BYTES;
}

module.exports = { MAX_CONTENT_BYTES, contentByteLength, isContentTooLong };
