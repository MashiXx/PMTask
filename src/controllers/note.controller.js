const prisma = require('../config/prisma');
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('../config/upload');
const { isPathSafe } = require('../utils/file-serve');
const { isContentTooLong } = require('../utils/note-content');

const MAX_TITLE = 255;
const MAX_LABEL = 60;
// Upper bound on one reorder request, so a malformed client can't ask for an
// unbounded transaction.
const MAX_REORDER = 2000;

// Google-Keep-style background palette. The client renders these swatches; the
// server only validates that a note's stored color is one of the known keys so
// a tampered request can't inject arbitrary CSS.
const NOTE_COLORS = [
  'default', 'coral', 'peach', 'sand', 'mint',
  'sage', 'fog', 'storm', 'dusk', 'blossom', 'clay',
];

// Media MIME types we stream inline. Excludes SVG (script vector) entirely — the
// note-upload whitelist already rejects it, this is defence in depth.
const INLINE_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime',
];

// Fetch a note and assert access. Returns the note, null (404), or false (403).
// Admins may access any note; otherwise only the owner.
async function getOwnedNote(id, user, include) {
  if (Number.isNaN(id)) return null;
  const note = await prisma.note.findUnique({ where: { id }, include });
  if (!note) return null;
  if (user.role !== 'admin' && note.createdById !== user.id) return false;
  return note;
}

function cleanTitle(raw) {
  const title = (raw || '').trim().slice(0, MAX_TITLE);
  return title || 'Untitled';
}

function cleanColor(raw) {
  return NOTE_COLORS.includes(raw) ? raw : 'default';
}

// Shape a note (with its labels/media relations) into the lightweight object the
// views and JSON clients consume.
function serializeNote(note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    color: note.color,
    pinned: note.pinned,
    updatedAt: note.updatedAt,
    labels: (note.labels || []).map((l) => ({ id: l.label.id, name: l.label.name, color: l.label.color })),
    media: (note.media || []).map((m) => ({ id: m.id, type: m.type, filename: m.filename })),
  };
}

const NOTE_INCLUDE = {
  labels: { include: { label: true } },
  media: { orderBy: { createdAt: 'asc' } },
};

// Board order. `position` is the user's own drag-and-drop order; notes that
// predate ordering all sit at 0, so recency breaks those ties until the first
// drag assigns real positions.
const NOTE_ORDER = [{ pinned: 'desc' }, { position: 'asc' }, { updatedAt: 'desc' }];

// GET /notes — the Keep-style board (all of the user's notes + their labels)
exports.getNotesPage = async (req, res) => {
  try {
    const [notes, labels] = await Promise.all([
      prisma.note.findMany({
        where: { createdById: req.user.id },
        orderBy: NOTE_ORDER,
        include: NOTE_INCLUDE,
      }),
      prisma.noteLabel.findMany({
        where: { createdById: req.user.id },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.render('notes-list', {
      title: req.t('notes.title'),
      notes: notes.map(serializeNote),
      labels,
      colors: NOTE_COLORS,
      openNoteId: null,
      activePage: 'notes',
    });
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('notes.loadFailed'));
    res.redirect('/dashboard');
  }
};

// GET /notes/:id — deep link: render the board and auto-open this note
exports.getNotePage = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const note = await getOwnedNote(id, req.user);
    if (note === null || note === false) {
      req.flash('error', req.t('notes.notFound'));
      return res.redirect('/notes');
    }
    const [notes, labels] = await Promise.all([
      prisma.note.findMany({
        where: { createdById: req.user.id },
        orderBy: NOTE_ORDER,
        include: NOTE_INCLUDE,
      }),
      prisma.noteLabel.findMany({
        where: { createdById: req.user.id },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.render('notes-list', {
      title: note.title || req.t('notes.untitled'),
      notes: notes.map(serializeNote),
      labels,
      colors: NOTE_COLORS,
      openNoteId: id,
      activePage: 'notes',
    });
  } catch (err) {
    console.error(err);
    req.flash('error', req.t('notes.loadFailed'));
    res.redirect('/notes');
  }
};

// GET /notes/api/:id — full note JSON (used when opening the editor modal)
exports.getNote = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user, NOTE_INCLUDE);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });
    res.json({ success: true, note: serializeNote(note) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load note' });
  }
};

// POST /notes/api — create a note, return the full serialized note so the client
// can insert a card without a round-trip.
exports.createNote = async (req, res) => {
  try {
    // Never truncate: slicing HTML mid-tag corrupts the note. Reject instead.
    if (isContentTooLong(req.body.content)) return res.status(413).json({ error: 'Note too long' });

    // A new note goes to the top of the board, ahead of everything already
    // there. Positions are relative, so going one below the current minimum is
    // enough -- no need to renumber every other note.
    const lowest = await prisma.note.aggregate({
      where: { createdById: req.user.id },
      _min: { position: true },
    });

    const note = await prisma.note.create({
      data: {
        title: cleanTitle(req.body.title),
        content: typeof req.body.content === 'string' ? req.body.content : '',
        color: cleanColor(req.body.color),
        position: (lowest._min.position || 0) - 1,
        createdById: req.user.id,
      },
      include: NOTE_INCLUDE,
    });

    // Optional labels on create (array of labelIds the user owns).
    if (Array.isArray(req.body.labelIds) && req.body.labelIds.length) {
      await setLabelsForNote(note.id, req.user.id, req.body.labelIds);
      const withLabels = await prisma.note.findUnique({ where: { id: note.id }, include: NOTE_INCLUDE });
      return res.status(201).json({ success: true, note: serializeNote(withLabels) });
    }

    res.status(201).json({ success: true, note: serializeNote(note) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
};

// PUT /notes/api/:id — update title, content and/or color (used by autosave)
exports.updateNote = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });

    const data = {};
    if (typeof req.body.title === 'string') data.title = cleanTitle(req.body.title);
    if (typeof req.body.content === 'string') {
      if (isContentTooLong(req.body.content)) return res.status(413).json({ error: 'Note too long' });
      data.content = req.body.content;
    }
    if (typeof req.body.color === 'string') data.color = cleanColor(req.body.color);
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

// PATCH /notes/api/reorder — persist a drag-and-drop order.
//
// The client sends the complete ordered id list for one section (pinned or
// unpinned), including notes hidden behind a label filter or search, so the
// order it describes is total rather than a rearrangement of whatever happened
// to be on screen. Ids the user doesn't own are dropped rather than rejected:
// a stale tab shouldn't be able to renumber someone else's notes, and shouldn't
// fail the whole drag either.
exports.reorderNotes = async (req, res) => {
  try {
    if (!Array.isArray(req.body.ids)) return res.status(400).json({ error: 'ids must be an array' });
    if (req.body.ids.length > MAX_REORDER) return res.status(400).json({ error: 'Too many notes' });

    const ids = [...new Set(req.body.ids.map((n) => parseInt(n)).filter((n) => !Number.isNaN(n)))];
    if (!ids.length) return res.json({ success: true, updated: 0 });

    const owned = await prisma.note.findMany({
      where: { id: { in: ids }, createdById: req.user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((n) => n.id));
    const ordered = ids.filter((id) => ownedIds.has(id));

    await prisma.$transaction(
      ordered.map((id, index) => prisma.note.update({ where: { id }, data: { position: index } }))
    );

    res.json({ success: true, updated: ordered.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder notes' });
  }
};

// DELETE /notes/api/:id — delete note (media rows cascade; also wipe files on disk)
exports.deleteNote = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });

    await prisma.note.delete({ where: { id: note.id } });

    // Remove the note's media directory (best effort).
    const noteDir = path.join(uploadDir, 'notes', String(note.id));
    if (isPathSafe(noteDir)) {
      try { fs.rmSync(noteDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
};

// ── Labels ───────────────────────────────────────────────────────────────

// Replace a note's labels with the given set, ignoring ids the user doesn't own.
async function setLabelsForNote(noteId, userId, labelIds) {
  const ids = [...new Set(labelIds.map((n) => parseInt(n)).filter((n) => !Number.isNaN(n)))];
  const owned = ids.length
    ? await prisma.noteLabel.findMany({ where: { id: { in: ids }, createdById: userId }, select: { id: true } })
    : [];
  const ownedIds = owned.map((l) => l.id);
  await prisma.$transaction([
    prisma.noteLabelLink.deleteMany({ where: { noteId } }),
    ...(ownedIds.length
      ? [prisma.noteLabelLink.createMany({ data: ownedIds.map((labelId) => ({ noteId, labelId })) })]
      : []),
  ]);
  return ownedIds;
}

// GET /notes/api/labels — all of the user's labels
exports.listLabels = async (req, res) => {
  try {
    const labels = await prisma.noteLabel.findMany({
      where: { createdById: req.user.id },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, labels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load labels' });
  }
};

// POST /notes/api/labels — create (or return the existing) label by name
exports.createLabel = async (req, res) => {
  try {
    const name = (req.body.name || '').trim().slice(0, MAX_LABEL);
    if (!name) return res.status(400).json({ error: 'Label name required' });
    const color = typeof req.body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.color)
      ? req.body.color : '#6C63FF';

    // Idempotent per (name, user): reuse an existing label rather than erroring.
    const existing = await prisma.noteLabel.findUnique({
      where: { name_createdById: { name, createdById: req.user.id } },
    });
    if (existing) return res.status(200).json({ success: true, label: existing });

    const label = await prisma.noteLabel.create({
      data: { name, color, createdById: req.user.id },
    });
    res.status(201).json({ success: true, label });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create label' });
  }
};

// DELETE /notes/api/labels/:id — delete a label (links cascade away)
exports.deleteLabel = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const label = await prisma.noteLabel.findUnique({ where: { id } });
    if (!label) return res.status(404).json({ error: 'Label not found' });
    if (label.createdById !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.noteLabel.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete label' });
  }
};

// PUT /notes/api/:id/labels — set the labels attached to a note
exports.setNoteLabels = async (req, res) => {
  try {
    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null) return res.status(404).json({ error: 'Note not found' });
    if (note === false) return res.status(403).json({ error: 'Access denied' });
    if (!Array.isArray(req.body.labelIds)) return res.status(400).json({ error: 'labelIds must be an array' });

    const ownerId = note.createdById;
    const ownedIds = await setLabelsForNote(note.id, ownerId, req.body.labelIds);
    const labels = await prisma.noteLabel.findMany({ where: { id: { in: ownedIds } } });
    res.json({ success: true, labels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update labels' });
  }
};

// ── Media (inline images / videos) ─────────────────────────────────────────

// POST /notes/api/:id/media — upload one image/video, return its serve URL
exports.uploadMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const note = await getOwnedNote(parseInt(req.params.id), req.user);
    if (note === null || note === false) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(note === null ? 404 : 403).json({ error: note === null ? 'Note not found' : 'Access denied' });
    }

    if (!isPathSafe(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

    const media = await prisma.noteMedia.create({
      data: {
        noteId: note.id,
        filename: originalName.replace(/[<>"'&]/g, '').slice(0, 255) || 'media',
        filepath: path.relative(uploadDir, req.file.path),
        mimeType: req.file.mimetype,
        size: req.file.size,
        type,
      },
    });

    res.status(201).json({ success: true, media: { id: media.id, type, url: `/notes/api/media/${media.id}` } });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    res.status(500).json({ error: 'Failed to upload media' });
  }
};

// GET /notes/api/media/:id — stream a note's media inline (owner / admin only)
exports.serveMedia = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const media = await prisma.noteMedia.findUnique({
      where: { id },
      include: { note: { select: { createdById: true } } },
    });
    if (!media) return res.status(404).json({ error: 'Media not found' });
    if (req.user.role !== 'admin' && media.note.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absolutePath = path.resolve(uploadDir, media.filepath);
    if (!isPathSafe(absolutePath)) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });
    if (!INLINE_MEDIA_TYPES.includes(media.mimeType)) return res.status(415).json({ error: 'Unsupported media type' });

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(absolutePath); // Express honours Range requests → video seeking works
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to serve media' });
  }
};

// DELETE /notes/api/media/:id — remove a media item (row + file)
exports.deleteMedia = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const media = await prisma.noteMedia.findUnique({
      where: { id },
      include: { note: { select: { createdById: true } } },
    });
    if (!media) return res.status(404).json({ error: 'Media not found' });
    if (req.user.role !== 'admin' && media.note.createdById !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.noteMedia.delete({ where: { id } });
    try { fs.unlinkSync(path.resolve(uploadDir, media.filepath)); } catch (e) { /* file may not exist */ }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
};
