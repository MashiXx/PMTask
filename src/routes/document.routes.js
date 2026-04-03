const router = require('express').Router({ mergeParams: true });
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const doc = require('../controllers/document.controller');
const upload = require('../config/upload');

// All document routes require authentication
router.use(isAuthenticated);

// View routes
router.get('/', doc.getDocumentsPage);
router.get('/folder/:folderId', doc.getDocumentsPage);

// Folder API
router.post('/api/folders', doc.createFolder);
router.put('/api/folders/:id', doc.updateFolder);
router.delete('/api/folders/:id', doc.deleteFolder);

// Folder password (admin only for set, all users for unlock)
router.put('/api/folders/:id/password', isAdmin, doc.setFolderPassword);
router.post('/api/folders/:id/unlock', doc.unlockFolder);

// Document API (with multer error handling)
router.post('/api/upload/:projectId', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 10 MB)'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files'
        : err.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, doc.uploadDocument);
router.put('/api/files/:id', doc.updateDocument);
router.delete('/api/files/:id', doc.deleteDocument);
router.get('/api/files/:id/download', doc.downloadDocument);
router.get('/api/files/:id/preview', doc.previewDocument);

module.exports = router;
