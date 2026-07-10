const { generateSlug, parseIdFromSlug } = require('../utils/slug');
const prisma = require('../config/prisma');

const VALID_STATUS = ['todo', 'inprogress', 'review', 'done'];
const VALID_TYPES = ['mindmap', 'flowchart', 'architecture'];
const VALID_SHAPES = ['rect', 'diamond', 'ellipse', 'parallelogram', 'group'];
const VALID_ICONS = ['server', 'database', 'queue', 'cache', 'storage', 'user', 'cloud', 'api', 'function', 'loadbalancer', 'globe', 'mobile'];

// Admin sees own projects; developer sees all (mirrors dashboard.controller.js).
function userCanAccessProject(project, user) {
  if (!user || !project) return false;
  if (user.role === 'admin') return project.userId === user.id;
  return true;
}

// Load a diagram with its project; returns { diagram, project } or null.
async function loadDiagram(id) {
  const diagram = await prisma.diagram.findUnique({
    where: { id: parseInt(id) },
    include: { project: true },
  });
  if (!diagram) return null;
  return { diagram, project: diagram.project };
}

// Load a node with its diagram's project; returns { node, project } or null.
async function loadNode(id) {
  const node = await prisma.diagramNode.findUnique({
    where: { id: parseInt(id) },
    include: { diagram: { include: { project: true } } },
  });
  if (!node) return null;
  return { node, project: node.diagram.project };
}

// ── Diagram CRUD ──

exports.getDiagramsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const diagrams = await prisma.diagram.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { nodes: true } } },
    });
    res.json(diagrams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get diagrams' });
  }
};

exports.createDiagram = async (req, res) => {
  try {
    const { name, projectId } = req.body;
    if (!name || !projectId) return res.status(400).json({ error: 'name and projectId are required' });
    const pid = parseInt(projectId);
    const project = await prisma.project.findUnique({ where: { id: pid } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!userCanAccessProject(project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const type = VALID_TYPES.includes(req.body.type) ? req.body.type : 'mindmap';
    const diagram = await prisma.diagram.create({ data: { name: name.trim(), projectId: pid, type } });
    if (type === 'mindmap') {
      await prisma.diagramNode.create({ data: { mindmapId: diagram.id, label: name.trim(), parentId: null } });
    } else {
      // Free-form diagrams start with one placed starter box (canvas isn't blank).
      await prisma.diagramNode.create({ data: { mindmapId: diagram.id, label: name.trim(), shape: 'rect', x: 0, y: 0 } });
    }
    res.json({ success: true, diagram });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create diagram' });
  }
};

exports.updateDiagram = async (req, res) => {
  try {
    const loaded = await loadDiagram(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const { name } = req.body;
    const diagram = await prisma.diagram.update({
      where: { id: loaded.diagram.id },
      data: { ...(name ? { name: name.trim() } : {}) },
    });
    res.json({ success: true, diagram });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update diagram' });
  }
};

exports.deleteDiagram = async (req, res) => {
  try {
    const loaded = await loadDiagram(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    await prisma.diagram.delete({ where: { id: loaded.diagram.id } }); // cascade removes nodes + edges
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete diagram' });
  }
};

exports.getDiagram = async (req, res) => {
  try {
    const loaded = await loadDiagram(req.params.id);
    if (!loaded) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(loaded.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    const nodes = await prisma.diagramNode.findMany({
      where: { mindmapId: loaded.diagram.id },
      orderBy: { position: 'asc' },
      include: { task: { select: { id: true, status: true, title: true } } },
    });
    const edges = await prisma.diagramEdge.findMany({ where: { mindmapId: loaded.diagram.id } });
    res.json({ diagram: loaded.diagram, nodes, edges });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get diagram' });
  }
};

// ── Node CRUD + convert ──

exports.createNode = async (req, res) => {
  try {
    const { mindmapId, parentId, label, shape, x, y } = req.body;
    if (!mindmapId || !label) return res.status(400).json({ error: 'mindmapId and label are required' });
    const diagram = await prisma.diagram.findUnique({ where: { id: parseInt(mindmapId) }, include: { project: true } });
    if (!diagram) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(diagram.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    let pid = null;
    if (parentId != null && parentId !== '') {
      pid = parseInt(parentId);
      const parent = await prisma.diagramNode.findUnique({ where: { id: pid } });
      if (!parent || parent.mindmapId !== diagram.id) return res.status(400).json({ error: 'Parent not in this diagram' });
    }
    const max = await prisma.diagramNode.aggregate({ where: { mindmapId: diagram.id, parentId: pid }, _max: { position: true } });
    const data = { mindmapId: diagram.id, parentId: pid, label: label.trim(), position: (max._max.position || 0) + 1 };
    if (shape !== undefined && VALID_SHAPES.includes(shape)) data.shape = shape;
    if (req.body.icon !== undefined && VALID_ICONS.includes(req.body.icon)) data.icon = req.body.icon;
    if (x !== undefined && x !== null) data.x = parseFloat(x);
    if (y !== undefined && y !== null) data.y = parseFloat(y);
    const node = await prisma.diagramNode.create({ data });
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
    if (req.body.icon !== undefined) data.icon = VALID_ICONS.includes(req.body.icon) ? req.body.icon : null;
    if (width !== undefined) data.width = width === null ? null : parseFloat(width);
    if (height !== undefined) data.height = height === null ? null : parseFloat(height);
    if (parentId !== undefined) {
      if (parentId === null || parentId === '') {
        data.parentId = null;
      } else {
        const pid = parseInt(parentId);
        const parent = await prisma.diagramNode.findUnique({ where: { id: pid } });
        if (!parent || parent.mindmapId !== loaded.node.mindmapId) return res.status(400).json({ error: 'Parent not in this diagram' });
        if (pid === loaded.node.id) return res.status(400).json({ error: 'Node cannot be its own parent' });
        data.parentId = pid;
      }
    }
    const node = await prisma.diagramNode.update({ where: { id: loaded.node.id }, data });
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
        prisma.diagramNode.updateMany({ where: { parentId: loaded.node.id }, data: { parentId: null } }),
        prisma.diagramEdge.deleteMany({ where: { OR: [{ sourceId: loaded.node.id }, { targetId: loaded.node.id }] } }),
        prisma.diagramNode.delete({ where: { id: loaded.node.id } }),
      ]);
      return res.json({ success: true });
    }

    // Collect the subtree (BFS over parentId within the same diagram), then delete in one transaction.
    const all = await prisma.diagramNode.findMany({ where: { mindmapId: loaded.node.mindmapId }, select: { id: true, parentId: true } });
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
      prisma.diagramEdge.deleteMany({ where: { OR: [{ sourceId: { in: toDelete } }, { targetId: { in: toDelete } }] } }),
      ...toDelete.reverse().map(id => prisma.diagramNode.delete({ where: { id } })),
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
    const node = await prisma.diagramNode.update({ where: { id: loaded.node.id }, data: { taskId: task.id } });
    res.json({ success: true, task, node });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert node to task' });
  }
};

// ── Edge CRUD (free-form diagrams only) ──

async function loadEdge(id) {
  const edge = await prisma.diagramEdge.findUnique({
    where: { id: parseInt(id) },
    include: { diagram: { include: { project: true } } },
  });
  if (!edge) return null;
  return { edge, diagram: edge.diagram, project: edge.diagram.project };
}

exports.createEdge = async (req, res) => {
  try {
    const { mindmapId, sourceId, targetId, label } = req.body;
    if (!mindmapId || !sourceId || !targetId) return res.status(400).json({ error: 'mindmapId, sourceId and targetId are required' });
    const diagram = await prisma.diagram.findUnique({ where: { id: parseInt(mindmapId) }, include: { project: true } });
    if (!diagram) return res.status(404).json({ error: 'Diagram not found' });
    if (!userCanAccessProject(diagram.project, req.user)) return res.status(403).json({ error: 'Access denied' });
    if (diagram.type === 'mindmap') return res.status(400).json({ error: 'Edges are not supported on mindmaps' });
    const sid = parseInt(sourceId), tid = parseInt(targetId);
    if (sid === tid) return res.status(400).json({ error: 'An edge needs two different nodes' });
    const nodes = await prisma.diagramNode.findMany({ where: { id: { in: [sid, tid] }, mindmapId: diagram.id }, select: { id: true } });
    if (nodes.length !== 2) return res.status(400).json({ error: 'Both nodes must belong to this diagram' });
    const edge = await prisma.diagramEdge.create({
      data: { mindmapId: diagram.id, sourceId: sid, targetId: tid, label: label ? String(label).trim() : null },
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
    const edge = await prisma.diagramEdge.update({ where: { id: loaded.edge.id }, data });
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
    await prisma.diagramEdge.delete({ where: { id: loaded.edge.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete edge' });
  }
};

// ── Pages ──

exports.getDiagramsListPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    if (!projectId) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
    const canonical = `${project.id}-${project.slug}`;
    if (req.params.projectSlug !== canonical) return res.redirect(301, `/projects/${canonical}/diagrams`);
    if (!userCanAccessProject(project, req.user)) return res.redirect('/projects');
    const diagrams = await prisma.diagram.findMany({
      where: { projectId }, orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { nodes: true } } },
    });
    res.render('diagrams/list', {
      title: 'Diagrams', activeProject: project, activeProjectId: projectId,
      activePage: 'diagrams', diagrams, isGuest: false,
    });
  } catch (err) {
    console.error(err); req.flash('error', req.t('flash.loadMindmapsFailed')); res.redirect('/projects');
  }
};

exports.getDiagramCanvasPage = async (req, res) => {
  try {
    const projectId = parseIdFromSlug(req.params.projectSlug);
    const diagramId = parseInt(req.params.diagramId);
    if (!projectId || !diagramId) { req.flash('error', req.t('flash.notFound')); return res.redirect('/projects'); }
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { req.flash('error', req.t('flash.projectNotFound')); return res.redirect('/projects'); }
    const canonical = `${project.id}-${project.slug}`;
    if (req.params.projectSlug !== canonical) return res.redirect(301, `/projects/${canonical}/diagrams/${diagramId}`);
    if (!userCanAccessProject(project, req.user)) return res.redirect('/projects');
    const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
    if (!diagram || diagram.projectId !== projectId) { req.flash('error', req.t('flash.mindmapNotFound')); return res.redirect(`/projects/${canonical}/diagrams`); }
    const nodes = await prisma.diagramNode.findMany({
      where: { mindmapId: diagramId }, orderBy: { position: 'asc' },
      include: { task: { select: { id: true, status: true, title: true } } },
    });
    const edges = await prisma.diagramEdge.findMany({ where: { mindmapId: diagramId } });
    res.render('diagrams/canvas', {
      title: diagram.name, activeProject: project, activeProjectId: projectId,
      activePage: 'diagrams', diagram, nodes, edges, isGuest: false,
    });
  } catch (err) {
    console.error(err); req.flash('error', req.t('flash.loadMindmapFailed')); res.redirect('/projects');
  }
};
