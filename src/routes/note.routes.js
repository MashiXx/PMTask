const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const noteUpload = require('../config/note-upload');
const note = require('../controllers/note.controller');

// Notes are private — the whole router requires login (no guest/public path).
router.use(isAuthenticated);

// ── Labels (registered before /api/:id so "labels" isn't parsed as an id) ──
router.get('/api/labels', note.listLabels);
router.post('/api/labels', note.createLabel);
router.delete('/api/labels/:id', note.deleteLabel);

// ── Media ──
// Multer wrapper maps limit/type errors to friendly JSON messages.
router.post('/api/:id/media', (req, res, next) => {
  noteUpload.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 50 MB)'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Too many files'
        : err.message || 'Upload failed';
      return res.status(400).json({ error: message });
    }
    next();
  });
}, note.uploadMedia);
router.get('/api/media/:id', note.serveMedia);
router.delete('/api/media/:id', note.deleteMedia);

// ── Note JSON mutations (under /notes/api so they never collide with page GETs) ──
// "reorder" is registered before /api/:id so it isn't parsed as a note id.
router.patch('/api/reorder', note.reorderNotes);
router.post('/api', note.createNote);
router.get('/api/:id', note.getNote);
router.put('/api/:id', note.updateNote);
router.patch('/api/:id/pin', note.togglePin);
router.put('/api/:id/labels', note.setNoteLabels);
router.delete('/api/:id', note.deleteNote);

// ── Pages ──
router.get('/', note.getNotesPage);
router.get('/:id', note.getNotePage);

module.exports = router;
