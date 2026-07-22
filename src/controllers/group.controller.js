const prisma = require('../config/prisma');
const { canAccessProject } = require('../utils/access');

// Load a project and assert the current user may reach it. Returns the project,
// or sends the appropriate error response and returns null.
async function requireProjectAccess(projectId, req, res) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, userId: true } });
  if (!project) { res.status(404).json({ error: 'Project not found' }); return null; }
  if (!canAccessProject(project, req.user)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return project;
}

// Load a group with its project's owner and assert access. Returns the group or null.
async function requireGroupAccess(groupId, req, res) {
  const group = await prisma.taskGroup.findUnique({
    where: { id: groupId },
    include: { project: { select: { userId: true } } },
  });
  if (!group) { res.status(404).json({ error: 'Group not found' }); return null; }
  if (!canAccessProject(group.project, req.user)) { res.status(403).json({ error: 'Access denied' }); return null; }
  return group;
}

exports.getGroupsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
    if (!(await requireProjectAccess(projectId, req, res))) return;
    const groups = await prisma.taskGroup.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get groups' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, color, projectId } = req.body;
    if (!name || !projectId) return res.status(400).json({ error: 'name and projectId are required' });
    const pid = parseInt(projectId);
    if (!(await requireProjectAccess(pid, req, res))) return;
    const max = await prisma.taskGroup.aggregate({ where: { projectId: pid }, _max: { position: true } });
    const group = await prisma.taskGroup.create({
      data: { name: name.trim(), color: color || '#6C63FF', projectId: pid, position: (max._max.position || 0) + 1 },
    });
    res.json({ success: true, group });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A group with that name already exists in this project' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create group' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    if (!(await requireGroupAccess(parseInt(id), req, res))) return;
    const group = await prisma.taskGroup.update({
      where: { id: parseInt(id) },
      data: { ...(name ? { name: name.trim() } : {}), ...(color ? { color } : {}) },
    });
    res.json({ success: true, group });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A group with that name already exists in this project' });
    console.error(err);
    res.status(500).json({ error: 'Failed to update group' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await requireGroupAccess(parseInt(id), req, res))) return;
    await prisma.taskGroup.delete({ where: { id: parseInt(id) } }); // onDelete: SetNull -> tasks become ungrouped
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
};

exports.reorderGroups = async (req, res) => {
  try {
    const { order } = req.body; // [{ id, position }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

    // Verify every referenced group belongs to a project the user may reach.
    const ids = order.map((o) => parseInt(o.id));
    const groups = await prisma.taskGroup.findMany({
      where: { id: { in: ids } },
      include: { project: { select: { userId: true } } },
    });
    if (groups.length !== ids.length || !groups.every((g) => canAccessProject(g.project, req.user))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.$transaction(
      order.map(o => prisma.taskGroup.update({ where: { id: parseInt(o.id) }, data: { position: parseInt(o.position) } }))
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
};
