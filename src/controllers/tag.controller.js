const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getTagsByProject = async (req, res) => {
  try {
    const projectId = parseInt(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const tags = await prisma.tag.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tasks: true } } },
    });
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get tags' });
  }
};

exports.createTag = async (req, res) => {
  try {
    const { name, color, projectId } = req.body;
    if (!name || !projectId) return res.status(400).json({ error: 'name and projectId are required' });

    const tag = await prisma.tag.upsert({
      where: { name_projectId: { name: name.toLowerCase(), projectId: parseInt(projectId) } },
      update: { color: color || '#6C63FF' },
      create: { name: name.toLowerCase(), color: color || '#6C63FF', projectId: parseInt(projectId) },
    });

    res.json({ success: true, tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create tag' });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const tag = await prisma.tag.update({
      where: { id: parseInt(id) },
      data: {
        ...(name ? { name: name.toLowerCase() } : {}),
        ...(color ? { color } : {}),
      },
    });

    res.json({ success: true, tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tag' });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.tag.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
};
