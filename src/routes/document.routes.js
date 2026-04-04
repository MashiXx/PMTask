const router = require('express').Router({ mergeParams: true });
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const doc = require('../controllers/document.controller');
const upload = require('../config/upload');

// View routes — allow guests for public projects (controller checks access)
router.get('/', doc.getDocumentsPage);
router.get('/folder/:folderId', doc.getDocumentsPage);

// Mutation routes — require authentication
router.post('/api/folders', isAuthenticated, doc.createFolder);
router.put('/api/folders/:id', isAuthenticated, doc.updateFolder);
router.patch('/api/folders/:id/move', isAuthenticated, doc.moveFolder);
router.delete('/api/folders/:id', isAuthenticated, doc.deleteFolder);

// Folder password (admin only for set, all users for unlock)
router.put('/api/folders/:id/password', isAuthenticated, isAdmin, doc.setFolderPassword);
router.post('/api/folders/:id/unlock', isAuthenticated, doc.unlockFolder);

// File read routes — allow guests for public projects (controller checks access)
router.get('/api/files/:id/download', doc.downloadDocument);
router.get('/api/files/:id/preview', doc.previewDocument);

// File mutation routes — require authentication
router.post('/api/upload/:projectId', isAuthenticated, (req, res, next) => {
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
router.put('/api/files/:id', isAuthenticated, doc.updateDocument);
router.delete('/api/files/:id', isAuthenticated, doc.deleteDocument);

module.exports = router;
