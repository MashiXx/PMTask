const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { uploadDir } = require('./upload');

// User avatars live under uploads/avatars/
const avatarsDir = path.join(uploadDir, 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination(req, file, cb) { cb(null, avatarsDir); },
  filename(req, file, cb) {
    // Prefix with the user id for traceability, plus random bytes for uniqueness.
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = 'u' + req.user.id + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, unique + ext);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(ext)) return cb(new Error('Only image files are allowed'));
  if (!IMAGE_MIMES.includes(file.mimetype)) return cb(new Error('Unsupported image type'));
  if (file.originalname.includes('\0') || /[/\\]/.test(file.originalname)) return cb(new Error('Invalid filename'));
  cb(null, true);
}

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
  fileFilter,
});
