const prisma = require('../config/prisma');

exports.getGroupsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });
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
    await prisma.$transaction(
      order.map(o => prisma.taskGroup.update({ where: { id: parseInt(o.id) }, data: { position: parseInt(o.position) } }))
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder groups' });
  }
};
