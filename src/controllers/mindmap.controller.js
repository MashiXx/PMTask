const { generateSlug, parseIdFromSlug } = require('../utils/slug');
const prisma = require('../config/prisma');

const VALID_STATUS = ['todo', 'inprogress', 'review', 'done'];

// Admin sees own projects; developer sees all (mirrors dashboard.controller.js).
function userCanAccessProject(project, user) {
  if (!user || !project) return false;
  if (user.role === 'admin') return project.userId === user.id;
  return true;
}

// Load a mindmap with its project; returns { mindmap, project } or null.
async function loadMindmap(id) {
  const mindmap = await prisma.mindmap.findUnique({
    where: { id: parseInt(id) },
    include: { project: true },
  });
  if (!mindmap) return null;
  return { mindmap, project: mindmap.project };
}

// Load a node with its mindmap's project; returns { node, project } or null.
async function loadNode(id) {
  const node = await prisma.mindmapNode.findUnique({
    where: { id: parseInt(id) },
    include: { mindmap: { include: { project: true } } },
  });
  if (!node) return null;
  return { node, project: node.mindmap.project };
}

// ── Mindmap CRUD ──

exports.getMindmapsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const mindmaps = await prisma.mindmap.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { nodes: true } } },
    });
    res.json(mindmaps);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get mindmaps' });
  }
};

exports.createMindmap = async (req, res) => {
  try {
    const { name, projectId } = req.body;
    if (!name || !projectId) return res.status(400).json({ error: 'name and projectId are required' });
    const pid = parseInt(projectId);
    const project = await prisma.project.findUnique({ where: { id: pid } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const mindmap = await prisma.mindmap.create({ data: { name: name.trim(), projectId: pid } });
    await prisma.mindmapNode.create({ data: { mindmapId: mindmap.id, label: name.trim(), parentId: null } });
    res.json({ success: true, mindmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create mindmap' });
  }
};

exports.updateMindmap = async (req, res) => {
  try {
    const loaded = await loadMindmap(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Mindmap not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { name } = req.body;
    const mindmap = await prisma.mindmap.update({
      where: { id: loaded.mindmap.id },
      data: { ...(name ? { name: name.trim() } : {}) },
    });
    res.json({ success: true, mindmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update mindmap' });
  }
};

exports.deleteMindmap = async (req, res) => {
  try {
    const loaded = await loadMindmap(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Mindmap not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    await prisma.mindmap.delete({ where: { id: loaded.mindmap.id } }); // cascade removes nodes
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete mindmap' });
  }
};

exports.getMindmap = async (req, res) => {
  try {
    const loaded = await loadMindmap(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Mindmap not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const nodes = await prisma.mindmapNode.findMany({
      where: { mindmapId: loaded.mindmap.id },
      orderBy: { position: 'asc' },
      include: { task: { select: { id: true, status: true, title: true } } },
    });
    res.json({ mindmap: loaded.mindmap, nodes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get mindmap' });
  }
};

// ── Node CRUD + convert ──

exports.createNode = async (req, res) => {
  try {
    const { mindmapId, parentId, label } = req.body;
    if (!mindmapId || !label) return res.status(400).json({ error: 'mindmapId and label are required' });
    const mindmap = await prisma.mindmap.findUnique({ where: { id: parseInt(mindmapId) }, include: { project: true } });
    if (!mindmap) return res.status(404).json({ error: 'Mindmap not found' });
    if (!userCanAccessProject(mindmap.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    let pid = null;
    if (parentId != null && parentId !== '') {
      pid = parseInt(parentId);
      const parent = await prisma.mindmapNode.findUnique({ where: { id: pid } });
      if (!parent || parent.mindmapId !== mindmap.id) return res.status(400).json({ error: 'Parent not in this mindmap' });
    }
    const max = await prisma.mindmapNode.aggregate({ where: { mindmapId: mindmap.id, parentId: pid }, _max: { position: true } });
    const node = await prisma.mindmapNode.create({
      data: { mindmapId: mindmap.id, parentId: pid, label: label.trim(), position: (max._max.position || 0) + 1 },
    });
    res.json({ success: true, node });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create node' });
  }
};

exports.updateNode = async (req, res) => {
  try {
    const loaded = await loadNode(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Node not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { label, color, x, y, collapsed } = req.body;
    const data = {};
    if (label != null) data.label = String(label).trim();
    if (color !== undefined) data.color = color || null;
    if (x !== undefined) data.x = x === null ? null : parseFloat(x);
    if (y !== undefined) data.y = y === null ? null : parseFloat(y);
    if (collapsed !== undefined) data.collapsed = !!collapsed;
    const node = await prisma.mindmapNode.update({ where: { id: loaded.node.id }, data });
    res.json({ success: true, node });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update node' });
  }
};

exports.deleteNode = async (req, res) => {
  try {
    const loaded = await loadNode(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Node not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    // Collect the subtree (BFS over parentId within the same mindmap), then delete in one transaction.
    const all = await prisma.mindmapNode.findMany({ where: { mindmapId: loaded.node.mindmapId }, select: { id: true, parentId: true } });
    const childrenOf = new Map();
    for (const n of all) {
      if (!childrenOf.has(n.parentId)) childrenOf.set(n.parentId, []);
      childrenOf.get(n.parentId).push(n.id);
    }
    const toDelete = [];
    const queue = [loaded.node.id];
    while (queue.length) {
      const cur = queue.shift();
      toDelete.push(cur);
      for (const cid of (childrenOf.get(cur) || [])) queue.push(cid);
    }
    // Delete deepest first so the NoAction FK never blocks (children before parents).
    await prisma.$transaction(
      toDelete.reverse().map(id => prisma.mindmapNode.delete({ where: { id } }))
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete node' });
  }
};

exports.convertNode = async (req, res) => {
  try {
    const loaded = await loadNode(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Node not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    if (loaded.node.taskId) return res.status(400).json({ error: 'Node is already linked to a task' });
    const pid = loaded.project.id;
    const title = loaded.node.label.trim() || 'Untitled';
    const maxPos = await prisma.task.aggregate({ where: { projectId: pid, status: 'todo' }, _max: { position: true } });
    const task = await prisma.task.create({
      data: {
        title, slug: generateSlug(title), status: 'todo', priority: 'medium', progress: 0,
        position: (maxPos._max.position || 0) + 1, projectId: pid, createdById: req.user.id,
      },
    });
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: req.user.id } });
    const node = await prisma.mindmapNode.update({ where: { id: loaded.node.id }, data: { taskId: task.id } });
    res.json({ success: true, task, node });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert node to task' });
  }
};

// ── Pages ──

exports.getMindmapsListPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    if (!projectId) { req.flash('error', 'Project not found'); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/projects'); }
    const canonical = `${project.id}-${project.slug}`;
    if (req.params.projectSlug !== canonical) return res.redirect(301, `/projects/${canonical}/mindmaps`);
    if (!userCanAccessProject(project, req.user)) return res.redirect('/projects');
    const mindmaps = await prisma.mindmap.findMany({
      where: { projectId }, orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { nodes: true } } },
    });
    res.render('mindmaps/list', {
      title: 'Mindmaps', activeProject: project, activeProjectId: projectId,
      activePage: 'mindmaps', mindmaps, isGuest: false,
    });
  } catch (err) {
    console.error(err); req.flash('error', 'Failed to load mindmaps'); res.redirect('/projects');
  }
};

exports.getMindmapCanvasPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    const mindmapId = parseInt(req.params.mindmapId);
    if (!projectId || !mindmapId) { req.flash('error', 'Not found'); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', 'Project not found'); return res.redirect('/projects'); }
    const canonical = `${project.id}-${project.slug}`;
    if (req.params.projectSlug !== canonical) return res.redirect(301, `/projects/${canonical}/mindmaps/${mindmapId}`);
    if (!userCanAccessProject(project, req.user)) return res.redirect('/projects');
    const mindmap = await prisma.mindmap.findUnique({ where: { id: mindmapId } });
    if (!mindmap || mindmap.projectId !== projectId) { req.flash('error', 'Mindmap not found'); return res.redirect(`/projects/${canonical}/mindmaps`); }
    const nodes = await prisma.mindmapNode.findMany({
      where: { mindmapId }, orderBy: { position: 'asc' },
      include: { task: { select: { id: true, status: true, title: true } } },
    });
    res.render('mindmaps/canvas', {
      title: mindmap.name, activeProject: project, activeProjectId: projectId,
      activePage: 'mindmaps', mindmap, nodes, isGuest: false,
    });
  } catch (err) {
    console.error(err); req.flash('error', 'Failed to load mindmap'); res.redirect('/projects');
  }
};
