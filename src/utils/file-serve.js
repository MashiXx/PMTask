const path = require('path');
const { uploadDir } = require('../config/upload');

// Validate that a resolved path stays inside the uploads directory (prevent traversal)
function isPathSafe(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const base = path.resolve(uploadDir);
  return resolved === base || resolved.startsWith(base + path.sep);
}

// Set RFC 5987 Content-Disposition headers so non-ASCII filenames (e.g. Vietnamese)
// download correctly. HTTP header values must be ASCII/latin1, so we provide an
// ASCII-safe fallback plus the UTF-8 filename* value for modern browsers.
function setDownloadHeaders(res, filename) {
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
}

module.exports = { isPathSafe, setDownloadHeaders };
