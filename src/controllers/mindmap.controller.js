const { generateSlug, parseIdFromSlug } = require('../utils/slug');
const prisma = require('../config/prisma');

const VALID_STATUS = ['todo', 'inprogress', 'review', 'done'];
const VALID_TYPES = ['mindmap', 'flowchart', 'architecture'];
const VALID_SHAPES = ['rect', 'diamond', 'ellipse', 'parallelogram', 'group'];

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
    const type = VALID_TYPES.includes(req.body.type) ? req.body.type : 'mindmap';
    const mindmap = await prisma.mindmap.create({ data: { name: name.trim(), projectId: pid, type } });
    if (type === 'mindmap') {
      await prisma.mindmapNode.create({ data: { mindmapId: mindmap.id, label: name.trim(), parentId: null } });
    } else {
      // Free-form diagrams start with one placed starter box (canvas isn't blank).
      await prisma.mindmapNode.create({ data: { mindmapId: mindmap.id, label: name.trim(), shape: 'rect', x: 0, y: 0 } });
    }
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
    const edges = await prisma.mindmapEdge.findMany({ where: { mindmapId: loaded.mindmap.id } });
    res.json({ mindmap: loaded.mindmap, nodes, edges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get mindmap' });
  }
};

// ── Node CRUD + convert ──

exports.createNode = async (req, res) => {
  try {
    const { mindmapId, parentId, label, shape, x, y } = req.body;
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
    const data = { mindmapId: mindmap.id, parentId: pid, label: label.trim(), position: (max._max.position || 0) + 1 };
    if (shape !== undefined && VALID_SHAPES.includes(shape)) data.shape = shape;
    if (x !== undefined && x !== null) data.x = parseFloat(x);
    if (y !== undefined && y !== null) data.y = parseFloat(y);
    const node = await prisma.mindmapNode.create({ data });
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
    const { label, color, x, y, collapsed, shape, width, height, parentId } = req.body;
    const data = {};
    if (label != null) data.label = String(label).trim();
    if (color !== undefined) data.color = color || null;
    if (x !== undefined) data.x = x === null ? null : parseFloat(x);
    if (y !== undefined) data.y = y === null ? null : parseFloat(y);
    if (collapsed !== undefined) data.collapsed = !!collapsed;
    if (shape !== undefined && VALID_SHAPES.includes(shape)) data.shape = shape;
    if (width !== undefined) data.width = width === null ? null : parseFloat(width);
    if (height !== undefined) data.height = height === null ? null : parseFloat(height);
    if (parentId !== undefined) {
      if (parentId === null || parentId === '') {
        data.parentId = null;
      } else {
        const pid = parseInt(parentId);
        const parent = await prisma.mindmapNode.findUnique({ where: { id: pid } });
        if (!parent || parent.mindmapId !== loaded.node.mindmapId) return res.status(400).json({ error: 'Parent not in this diagram' });
        if (pid === loaded.node.id) return res.status(400).json({ error: 'Node cannot be its own parent' });
        data.parentId = pid;
      }
    }
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

    // A free-form "group" frame is deleted alone — its members are detached
    // (parentId -> null), not removed. Everything else removes its subtree.
    if (loaded.node.shape === 'group') {
      await prisma.$transaction([
        prisma.mindmapNode.updateMany({ where: { parentId: loaded.node.id }, data: { parentId: null } }),
        prisma.mindmapEdge.deleteMany({ where: { OR: [{ sourceId: loaded.node.id }, { targetId: loaded.node.id }] } }),
        prisma.mindmapNode.delete({ where: { id: loaded.node.id } }),
      ]);
      return res.json({ success: true });
    }

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
    // Delete connected edges first, then nodes deepest-first so the NoAction FK never blocks.
    await prisma.$transaction([
      prisma.mindmapEdge.deleteMany({ where: { OR: [{ sourceId: { in: toDelete } }, { targetId: { in: toDelete } }] } }),
      ...toDelete.reverse().map(id => prisma.mindmapNode.delete({ where: { id } })),
    ]);
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

// ── Edge CRUD (free-form diagrams only) ──

async function loadEdge(id) {
  const edge = await prisma.mindmapEdge.findUnique({
    where: { id: parseInt(id) },
    include: { mindmap: { include: { project: true } } },
  });
  if (!edge) return null;
  return { edge, mindmap: edge.mindmap, project: edge.mindmap.project };
}

exports.createEdge = async (req, res) => {
  try {
    const { mindmapId, sourceId, targetId, label } = req.body;
    if (!mindmapId || !sourceId || !targetId) return res.status(400).json({ error: 'mindmapId, sourceId and targetId are required' });
    const mindmap = await prisma.mindmap.findUnique({ where: { id: parseInt(mindmapId) }, include: { project: true } });
    if (!mindmap) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(mindmap.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    if (mindmap.type === 'mindmap') return res.status(400).json({ error: 'Edges are not supported on mindmaps' });
    const sid = parseInt(sourceId), tid = parseInt(targetId);
    if (sid === tid) return res.status(400).json({ error: 'An edge needs two different nodes' });
    const nodes = await prisma.mindmapNode.findMany({ where: { id: { in: [sid, tid] }, mindmapId: mindmap.id }, select: { id: true } });
    if (nodes.length !== 2) return res.status(400).json({ error: 'Both nodes must belong to this diagram' });
    const edge = await prisma.mindmapEdge.create({
      data: { mindmapId: mindmap.id, sourceId: sid, targetId: tid, label: label ? String(label).trim() : null },
    });
    res.json({ success: true, edge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create edge' });
  }
};

exports.updateEdge = async (req, res) => {
  try {
    const loaded = await loadEdge(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Edge not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { label, style } = req.body;
    const data = {};
    if (label !== undefined) data.label = label ? String(label).trim() : null;
    if (style !== undefined) data.style = style || null;
    const edge = await prisma.mindmapEdge.update({ where: { id: loaded.edge.id }, data });
    res.json({ success: true, edge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update edge' });
  }
};

exports.deleteEdge = async (req, res) => {
  try {
    const loaded = await loadEdge(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Edge not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    await prisma.mindmapEdge.delete({ where: { id: loaded.edge.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete edge' });
  }
};

// ── Pages ──

exports.getMindmapsListPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    if (!projectId) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
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
    console.error(err); req.flash('error', req.t('flash.loadMindmapsFailed')); res.redirect('/projects');
  }
};

exports.getMindmapCanvasPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    const mindmapId = parseInt(req.params.mindmapId);
    if (!projectId || !mindmapId) { req.flash('error', req.t('flash.notFound')); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
    const canonical = `${project.id}-${project.slug}`;
    if (req.params.projectSlug !== canonical) return res.redirect(301, `/projects/${canonical}/mindmaps/${mindmapId}`);
    if (!userCanAccessProject(project, req.user)) return res.redirect('/projects');
    const mindmap = await prisma.mindmap.findUnique({ where: { id: mindmapId } });
    if (!mindmap || mindmap.projectId !== projectId) { req.flash('error', req.t('flash.mindmapNotFound')); return res.redirect(`/projects/${canonical}/mindmaps`); }
    const nodes = await prisma.mindmapNode.findMany({
      where: { mindmapId }, orderBy: { position: 'asc' },
      include: { task: { select: { id: true, status: true, title: true } } },
    });
    const edges = await prisma.mindmapEdge.findMany({ where: { mindmapId } });
    res.render('mindmaps/canvas', {
      title: mindmap.name, activeProject: project, activeProjectId: projectId,
      activePage: 'mindmaps', mindmap, nodes, edges, isGuest: false,
    });
  } catch (err) {
    console.error(err); req.flash('error', req.t('flash.loadMindmapFailed')); res.redirect('/projects');
  }
};
