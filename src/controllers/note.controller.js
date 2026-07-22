const prisma = require('../config/prisma');

const MAX_TITLE = 255;
const MAX_CONTENT = 100000;

// Fetch a note and assert access. Returns the note, null (404), or false (403).
// Admins may access any note; otherwise only the owner.
async function getOwnedNote(id, user) {
  if (Number.isNaN(id)) return null;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) return null;
  if (user.role !== 'admin' && note.createdById !== user.id) return false;
  return note;
}

function cleanTitle(raw) {
  const title = (raw || '').trim().slice(0, MAX_TITLE);
  return title || 'Untitled';
}

// GET /notes — list the current user's notes (content omitted for a light payload)
exports.getNotesPage = async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: { createdById: req.user.id },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, title: true, pinned: true, updatedAt: true },
    });
    res.render('notes-list', { title: req.t('notes.title'), notes, activePage: 'notes' });
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('notes.loadFailed'));
    res.redirect('/dashboard');
  }
};

// GET /notes/:id — the note editor page
exports.getNotePage = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null || note === false) {
      req.flash('error', req.t('notes.notFound'));
      return res.redirect('/notes');
    }
    res.render('note-detail', { title: note.title || req.t('notes.untitled'), note, activePage: 'notes' });
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('notes.loadFailed'));
    res.redirect('/notes');
  }
};

// POST /notes/api — create a new (empty) note, return its id so the client can navigate in
exports.createNote = async (req, res) => {
  try {
    const note = await prisma.note.create({
      data: {
        title: cleanTitle(req.body.title),
        content: typeof req.body.content === 'string' ? req.body.content.slice(0, MAX_CONTENT) : '',
        createdById: req.user.id,
      },
      select: { id: true },
    });
    res.status(201).json({ success: true, note });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
};

// PUT /notes/api/:id — update title and/or content (used by autosave)
exports.updateNote = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });

    const data = {};
    if (typeof req.body.title === 'string') data.title = cleanTitle(req.body.title);
    if (typeof req.body.content === 'string') {
      if (req.body.content.length > MAX_CONTENT) return res.status(400).json({ error: 'Note too long' });
      data.content = req.body.content;
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    await prisma.note.update({ where: { id: note.id }, data });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
};

// PATCH /notes/api/:id/pin — toggle the pinned flag
exports.togglePin = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: { pinned: !note.pinned },
      select: { pinned: true },
    });
    res.json({ success: true, pinned: updated.pinned });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
};

// DELETE /notes/api/:id
exports.deleteNote = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });

    await prisma.note.delete({ where: { id: note.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
};
