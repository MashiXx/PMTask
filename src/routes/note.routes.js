const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middleware/auth');
const note = require('../controllers/note.controller');

// Notes are private — the whole router requires login (no guest/public path).
router.use(isAuthenticated);

// Pages
router.get('/', note.getNotesPage);
router.get('/:id', note.getNotePage);

// JSON mutations (under /notes/api so they never collide with the page GETs)
router.post('/api', note.createNote);
router.put('/api/:id', note.updateNote);
router.patch('/api/:id/pin', note.togglePin);
router.delete('/api/:id', note.deleteNote);

module.exports = router;
