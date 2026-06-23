const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDir, fileFilter, randomFilename, UPLOAD_LIMITS } = require('./upload');

// Task attachments live under uploads/tasks/<taskId>/
const tasksDir = path.join(uploadDir, 'tasks');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const taskId = req.params.taskId;
    // Sanitize taskId - must be numeric only
    if (!/^\d+$/.test(String(taskId))) {
      return cb(new Error('Invalid task ID'));
    }
    const taskDir = path.join(tasksDir, String(taskId));
    if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });
    cb(null, taskDir);
  },
  filename: randomFilename,
});

const taskUpload = multer({
  storage,
  limits: UPLOAD_LIMITS,
  fileFilter,
});

module.exports = taskUpload;
