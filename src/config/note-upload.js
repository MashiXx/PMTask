const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDir, randomFilename } = require('./upload');

// Note media (inline images / videos) live under uploads/notes/<noteId>/
const notesDir = path.join(uploadDir, 'notes');

// Notes allow a richer media set than task/document attachments: images plus a
// few web-friendly video containers. Kept as its own whitelist so widening it
// here never loosens the shared document/attachment filter.
const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.mp4', '.webm', '.ogg', '.mov',
];

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error('File type not allowed: ' + ext));
  }
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(new Error('File MIME type not allowed: ' + file.mimetype));
  }
  if (file.originalname.includes('\0') || file.originalname.includes('..') || /[/\\]/.test(file.originalname)) {
    return cb(new Error('Invalid filename'));
  }
  cb(null, true);
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const noteId = req.params.id;
    // Sanitize noteId - must be numeric only
    if (!/^\d+$/.test(String(noteId))) {
      return cb(new Error('Invalid note ID'));
    }
    const noteDir = path.join(notesDir, String(noteId));
    if (!fs.existsSync(noteDir)) fs.mkdirSync(noteDir, { recursive: true });
    cb(null, noteDir);
  },
  filename: randomFilename,
});

const noteUpload = multer({
  storage,
  // Videos are larger than the shared 10 MB attachment cap, so allow 50 MB here.
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter,
});

module.exports = noteUpload;
module.exports.ALLOWED_MIMES = ALLOWED_MIMES;
