const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const mammoth = require('mammoth');
const { uploadDir } = require('../config/upload');

// Validate that a file path is inside the uploads directory (prevent path traversal)
function isPathSafe(filepath) {
  const resolved = path.resolve(filepath);
  const uploadsResolved = path.resolve(uploadDir);
  return resolved.startsWith(uploadsResolved + path.sep) || resolved === uploadsResolved;
}

// Sanitize HTML from mammoth to prevent XSS
function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
}

// Sanitize folder/document names
function sanitizeName(name) {
  return name.replace(/[<>"'&]/g, '').replace(/\.\./g, '').trim().substring(0, 255);
}

// Build breadcrumb trail for a folder
async function buildBreadcrumbs(folderId) {
  const crumbs = [];
  let current = folderId;
  while (current) {
    const folder = await prisma.folder.findUnique({
      where: { id: current },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) break;
    crumbs.unshift(folder);
    current = folder.parentId;
  }
  return crumbs;
}

// Build nested tree from flat folder list
function buildFolderTree(folders, parentId = null) {
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map(f => ({
      ...f,
      children: buildFolderTree(folders, f.id),
    }));
}

// Recursively collect all document filepaths in a folder tree
async function collectDocumentPaths(folderId) {
  const paths = [];
  const docs = await prisma.document.findMany({
    where: { folderId },
    select: { filepath: true },
  });
  paths.push(...docs.map(d => d.filepath));

  const children = await prisma.folder.findMany({
    where: { parentId: folderId },
    select: { id: true },
  });
  for (const child of children) {
    const childPaths = await collectDocumentPaths(child.id);
    paths.push(...childPaths);
  }
  return paths;
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Check if user has unlocked a password-protected folder (or any ancestor)
function isFolderUnlocked(req, folderId) {
  if (!req.session.unlockedFolders) return false;
  return req.session.unlockedFolders.includes(folderId);
}

// Check folder access: returns { allowed, lockedFolder }
// Checks the folder itself and all ancestors in the breadcrumb chain
async function checkFolderAccess(req, folderId) {
  if (!folderId) return { allowed: true, lockedFolder: null };
  if (req.user && req.user.role === 'admin') return { allowed: true, lockedFolder: null };

  const crumbs = await buildBreadcrumbs(folderId);
  for (const crumb of crumbs) {
    const folder = await prisma.folder.findUnique({ where: { id: crumb.id }, select: { id: true, password: true } });
    if (folder && folder.password && !isFolderUnlocked(req, folder.id)) {
      return { allowed: false, lockedFolder: folder };
    }
  }
  return { allowed: true, lockedFolder: null };
}

// GET /projects/:projectId/documents
exports.getDocumentsPage = async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const folderId = req.params.folderId ? parseInt(req.params.folderId) : null;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { tags: true },
    });
    if (!project) {
      req.flash('error', 'Project not found');
      return res.redirect('/projects');
    }

    // Check password protection
    const access = await checkFolderAccess(req, folderId);
    if (!access.allowed) {
      // Render password prompt
      const allFolders = await prisma.folder.findMany({
        where: { projectId },
        include: { _count: { select: { documents: true, children: true } } },
        orderBy: { position: 'asc' },
      });
      const breadcrumbs = folderId ? await buildBreadcrumbs(folderId) : [];
      const folderTree = buildFolderTree(allFolders);
      const currentFolder = folderId ? allFolders.find(f => f.id === folderId) || null : null;

      return res.render('documents', {
        title: 'Documents',
        activeProject: project,
        activeProjectId: projectId,
        projectTags: project.tags || [],
        activePage: 'documents',
        folderTree,
        subfolders: [],
        documents: [],
        currentFolder,
        breadcrumbs,
        allFolders,
        folderLocked: true,
        lockedFolderId: access.lockedFolder.id,
      });
    }

    // All folders for tree
    const allFolders = await prisma.folder.findMany({
      where: { projectId },
      include: { _count: { select: { documents: true, children: true } } },
      orderBy: { position: 'asc' },
    });

    // Documents in current folder (or root)
    const documents = await prisma.document.findMany({
      where: { projectId, folderId },
      include: { uploadedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Subfolders of current folder
    const subfolders = allFolders.filter(f => f.parentId === folderId);

    const breadcrumbs = folderId ? await buildBreadcrumbs(folderId) : [];
    const folderTree = buildFolderTree(allFolders);

    // Current folder info
    const currentFolder = folderId
      ? allFolders.find(f => f.id === folderId) || null
      : null;

    res.render('documents', {
      title: 'Documents',
      activeProject: project,
      activeProjectId: projectId,
      projectTags: project.tags || [],
      activePage: 'documents',
      folderTree,
      subfolders,
      documents: documents.map(d => ({ ...d, sizeFormatted: formatSize(d.size) })),
      currentFolder,
      breadcrumbs,
      allFolders,
      folderLocked: false,
      lockedFolderId: null,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load documents');
    res.redirect('/projects');
  }
};

// POST /api/documents/folders
exports.createFolder = async (req, res) => {
  try {
    const { name, projectId, parentId } = req.body;
    if (!name || !projectId) {
      return res.status(400).json({ error: 'Name and projectId are required' });
    }

    const safeName = sanitizeName(name);
    if (!safeName) return res.status(400).json({ error: 'Invalid folder name' });

    // Check duplicate at same level
    const existing = await prisma.folder.findFirst({
      where: {
        name: safeName,
        projectId: parseInt(projectId),
        parentId: parentId ? parseInt(parentId) : null,
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'A folder with this name already exists here' });
    }

    const folder = await prisma.folder.create({
      data: {
        name: safeName,
        projectId: parseInt(projectId),
        parentId: parentId ? parseInt(parentId) : null,
        createdById: req.user.id,
      },
    });

    res.json({ success: true, folder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
};

// PUT /api/documents/folders/:id
exports.updateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const safeName = sanitizeName(name);
    if (!safeName) return res.status(400).json({ error: 'Invalid folder name' });

    const folder = await prisma.folder.findUnique({ where: { id: parseInt(id) } });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Check duplicate
    const existing = await prisma.folder.findFirst({
      where: {
        name: safeName,
        projectId: folder.projectId,
        parentId: folder.parentId,
        NOT: { id: parseInt(id) },
      },
    });
    if (existing) {
      return res.status(400).json({ error: 'A folder with this name already exists here' });
    }

    const updated = await prisma.folder.update({
      where: { id: parseInt(id) },
      data: { name: safeName },
    });

    res.json({ success: true, folder: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
};

// DELETE /api/documents/folders/:id
exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const folder = await prisma.folder.findUnique({ where: { id: parseInt(id) } });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Collect all file paths before deleting
    const filePaths = await collectDocumentPaths(parseInt(id));

    await prisma.folder.delete({ where: { id: parseInt(id) } });

    // Clean up files from disk
    for (const fp of filePaths) {
      try { fs.unlinkSync(fp); } catch (e) { /* file may not exist */ }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
};

// PUT /api/documents/folders/:id/password (admin only)
exports.setFolderPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const folder = await prisma.folder.findUnique({ where: { id: parseInt(id) } });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    let hashed = null;
    if (password && password.trim()) {
      hashed = await bcrypt.hash(password.trim(), 12);
    }

    await prisma.folder.update({
      where: { id: parseInt(id) },
      data: { password: hashed },
    });

    res.json({ success: true, hasPassword: !!hashed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set folder password' });
  }
};

// POST /api/documents/folders/:id/unlock
exports.unlockFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const folder = await prisma.folder.findUnique({ where: { id: parseInt(id) } });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    if (!folder.password) return res.json({ success: true });

    const match = await bcrypt.compare(password || '', folder.password);
    if (!match) return res.status(403).json({ error: 'Incorrect password' });

    // Store unlocked folder in session
    if (!req.session.unlockedFolders) req.session.unlockedFolders = [];
    if (!req.session.unlockedFolders.includes(folder.id)) {
      req.session.unlockedFolders.push(folder.id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unlock folder' });
  }
};

// POST /api/documents/upload/:projectId
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const projectId = parseInt(req.params.projectId);
    const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      // Clean up uploaded file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify folder belongs to this project (if specified)
    if (folderId) {
      const folder = await prisma.folder.findUnique({ where: { id: folderId } });
      if (!folder || folder.projectId !== projectId) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
        return res.status(400).json({ error: 'Invalid folder' });
      }
    }

    // Validate the saved file path is inside uploads dir
    if (!isPathSafe(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ error: 'Invalid file path' });
    }

    const safeTitle = sanitizeName(req.file.originalname) || 'untitled';

    const document = await prisma.document.create({
      data: {
        title: safeTitle,
        filename: req.file.originalname,
        filepath: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size,
        projectId,
        folderId,
        uploadedById: req.user.id,
      },
    });

    res.json({ success: true, document });
  } catch (err) {
    console.error(err);
    // Clean up file on error
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// PUT /api/documents/:id
exports.updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, folderId } = req.body;

    const doc = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const data = {};
    if (title !== undefined) {
      const safeTitle = sanitizeName(title);
      if (!safeTitle) return res.status(400).json({ error: 'Invalid title' });
      data.title = safeTitle;
    }
    if (folderId !== undefined) data.folderId = folderId ? parseInt(folderId) : null;

    const updated = await prisma.document.update({
      where: { id: parseInt(id) },
      data,
    });

    res.json({ success: true, document: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

// DELETE /api/documents/:id
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    await prisma.document.delete({ where: { id: parseInt(id) } });

    // Remove file from disk
    try { fs.unlinkSync(doc.filepath); } catch (e) { /* file may not exist */ }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

// GET /api/documents/:id/download
exports.downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Check folder password access
    if (doc.folderId) {
      const access = await checkFolderAccess(req, doc.folderId);
      if (!access.allowed) return res.status(403).json({ error: 'Folder is locked' });
    }

    const absolutePath = path.resolve(doc.filepath);

    // Path traversal protection
    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.download(absolutePath, doc.filename);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download document' });
  }
};

// Supported preview MIME types
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.html', '.css', '.py', '.sql', '.xml', '.yml', '.yaml', '.log', '.env.example'];
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// GET /api/documents/:id/preview
exports.previewDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await prisma.document.findUnique({ where: { id: parseInt(id) } });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Check folder password access
    if (doc.folderId) {
      const access = await checkFolderAccess(req, doc.folderId);
      if (!access.allowed) return res.status(403).json({ error: 'Folder is locked' });
    }

    const absolutePath = path.resolve(doc.filepath);

    // Path traversal protection
    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const ext = path.extname(doc.filename).toLowerCase();

    // Images - stream binary (validate MIME is actually an image type we allow)
    if (IMAGE_TYPES.includes(doc.mimeType)) {
      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolutePath);
    }

    // PDF - stream binary
    if (doc.mimeType === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.sendFile(absolutePath);
    }

    // Text files
    if (doc.mimeType.startsWith('text/') || TEXT_EXTENSIONS.includes(ext)) {
      const stat = fs.statSync(absolutePath);
      if (stat.size > 512 * 1024) {
        return res.json({ type: 'unsupported', filename: doc.filename, mimeType: doc.mimeType, message: 'File too large to preview' });
      }
      const buffer = fs.readFileSync(absolutePath);
      // Check for binary content (null bytes in first 8KB)
      const sample = buffer.slice(0, 8192);
      if (sample.includes(0)) {
        return res.json({ type: 'unsupported', filename: doc.filename, mimeType: doc.mimeType, message: 'Binary file cannot be previewed as text' });
      }
      const content = buffer.toString('utf-8');
      return res.json({ type: 'text', content, filename: doc.filename, mimeType: doc.mimeType });
    }

    // DOCX
    if (doc.mimeType === DOCX_TYPE || ext === '.docx') {
      const result = await mammoth.convertToHtml({ path: absolutePath });
      const safeHtml = sanitizeHtml(result.value);
      return res.json({ type: 'docx', html: safeHtml, filename: doc.filename });
    }

    // Unsupported
    res.json({ type: 'unsupported', filename: doc.filename, mimeType: doc.mimeType, message: 'Preview not available for this file type' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to preview document' });
  }
};
