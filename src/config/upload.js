const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// WHITELIST approach - only allow known safe file types
const ALLOWED_EXTENSIONS = [
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  // Text / Code
  '.txt', '.md', '.csv', '.json', '.xml', '.yml', '.yaml', '.log',
  '.js', '.ts', '.html', '.css', '.py', '.sql', '.env.example',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz',
];

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/x-icon',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/css', 'text/xml',
  'application/json', 'application/xml',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/gzip', 'application/x-tar',
];

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const projectId = req.params.projectId || req.body.projectId;
    // Sanitize projectId - must be numeric only
    if (!/^\d+$/.test(String(projectId))) {
      return cb(new Error('Invalid project ID'));
    }
    const projectDir = path.join(uploadDir, String(projectId));
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
    cb(null, projectDir);
  },
  filename(req, file, cb) {
    // Use crypto random bytes instead of Math.random for unpredictable filenames
    const unique = Date.now() + '-' + crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, unique + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5, // max 5 files per request
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();

    // Check extension whitelist
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('File type not allowed: ' + ext));
    }

    // Check MIME type whitelist
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('File MIME type not allowed: ' + file.mimetype));
    }

    // Sanitize filename - reject null bytes and path traversal
    if (file.originalname.includes('\0') || file.originalname.includes('..') || /[/\\]/.test(file.originalname)) {
      return cb(new Error('Invalid filename'));
    }

    cb(null, true);
  },
});

module.exports = upload;
module.exports.uploadDir = uploadDir;
