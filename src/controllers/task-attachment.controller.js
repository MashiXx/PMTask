const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { uploadDir } = require('../config/upload');
const { isPathSafe, setDownloadHeaders } = require('../utils/file-serve');

// Image MIME types we stream inline for preview. Deliberately excludes SVG (and
// other types) since an inline SVG can carry scripts that would execute in our
// origin if opened directly — those are download-only. Mirrors document.controller.
const INLINE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Strip characters that could break out of a filename
function sanitizeName(name) {
  return name.replace(/[<>"'&]/g, '').replace(/\.\./g, '').trim().substring(0, 255);
}

// Can this user modify the task (and therefore its attachments)?
// admin, task creator, or an assignee. Returns the task or false/null.
async function canModifyTask(taskId, user) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });
  if (!task) return null;
  if (user.role === 'admin') return task;
  if (task.createdById === user.id) return task;
  if (task.assignees.some(a => a.userId === user.id)) return task;
  return false;
}

// Load an attachment with its task's project visibility, applying guest access rules.
// Returns { attachment } on success or { error, status } on failure.
async function loadViewableAttachment(req) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return { error: 'Invalid ID', status: 400 };

  const attachment = await prisma.taskAttachment.findUnique({
    where: { id },
    include: { task: { include: { project: { select: { publicTasks: true } } } } },
  });
  if (!attachment) return { error: 'Attachment not found', status: 404 };

  // Guests may only view attachments of tasks in public-task projects
  if (!req.user && !attachment.task.project.publicTasks) {
    return { error: 'Access denied', status: 403 };
  }
  return { attachment };
}

// POST /api/attachments/tasks/:taskId
exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const taskId = parseInt(req.params.taskId);
    if (isNaN(taskId)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    // Permission: task must exist and user must be allowed to modify it
    const access = await canModifyTask(taskId, req.user);
    if (access === null) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: 'Task not found' });
    }
    if (access === false) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(403).json({ error: 'You do not have permission to add attachments to this task' });
    }

    // Validate the saved file path is inside uploads dir
    if (!isPathSafe(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Multer decodes Content-Disposition filenames as latin1 by default, which
    // corrupts non-ASCII characters (e.g. Vietnamese). Re-decode to utf8.
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const safeName = sanitizeName(originalName) || 'untitled';

    const attachment = await prisma.taskAttachment.create({
      data: {
        filename: safeName,
        // Store path relative to uploadDir so it's portable across machines/deploys
        filepath: path.relative(uploadDir, req.file.path),
        mimeType: req.file.mimetype,
        size: req.file.size,
        taskId,
        uploadedById: req.user.id,
      },
    });

    res.json({ success: true, attachment });
  } catch (err) {
    console.error(err);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
};

// GET /api/attachments/:id/preview — stream images & PDFs inline
exports.previewAttachment = async (req, res) => {
  try {
    const { attachment, error, status } = await loadViewableAttachment(req);
    if (error) return res.status(status).json({ error });

    const absolutePath = path.resolve(uploadDir, attachment.filepath);
    if (!isPathSafe(absolutePath)) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });

    if (INLINE_IMAGE_TYPES.includes(attachment.mimeType)) {
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolutePath);
    }

    if (attachment.mimeType === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolutePath);
    }

    // Everything else: not previewable inline — client should download instead
    res.json({ type: 'unsupported', filename: attachment.filename, mimeType: attachment.mimeType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to preview attachment' });
  }
};

// GET /api/attachments/:id/download
exports.downloadAttachment = async (req, res) => {
  try {
    const { attachment, error, status } = await loadViewableAttachment(req);
    if (error) return res.status(status).json({ error });

    const absolutePath = path.resolve(uploadDir, attachment.filepath);
    if (!isPathSafe(absolutePath)) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(absolutePath)) return res.status(404).json({ error: 'File not found on disk' });

    setDownloadHeaders(res, attachment.filename);
    res.sendFile(absolutePath);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
};

// DELETE /api/attachments/:id
exports.deleteAttachment = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const attachment = await prisma.taskAttachment.findUnique({ where: { id } });
    if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

    // Permission: only users who can modify the parent task
    const access = await canModifyTask(attachment.taskId, req.user);
    if (!access) {
      return res.status(403).json({ error: 'You do not have permission to delete this attachment' });
    }

    await prisma.taskAttachment.delete({ where: { id } });

    // Remove file from disk (best effort)
    try { fs.unlinkSync(path.resolve(uploadDir, attachment.filepath)); } catch (e) { /* file may not exist */ }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
};
