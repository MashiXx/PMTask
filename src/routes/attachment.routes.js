const router = require('express').Router();
const { isAuthenticated } = require('../middleware/auth');
const taskUpload = require('../config/task-upload');
const attachment = require('../controllers/task-attachment.controller');

// Read routes — allow guests for public-task projects (controller checks access)
router.get('/:id/preview', attachment.previewAttachment);
router.get('/:id/download', attachment.downloadAttachment);

// Upload to a task — auth required; multer wrapper maps limit errors to friendly messages
router.post('/tasks/:taskId', isAuthenticated, (req, res, next) => {
  taskUpload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files'
        : err.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, attachment.uploadAttachment);

// Delete — auth required (controller checks task-modify permission)
router.delete('/:id', isAuthenticated, attachment.deleteAttachment);

module.exports = router;
