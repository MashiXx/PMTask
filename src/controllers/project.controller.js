const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getProjects = async (req, res) => {
  try {
    const isGuest = !req.user;
    const projectFilter = req.user && req.user.role === 'admin' ? { userId: req.user.id } : {};
    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: {
        _count: { select: { tasks: true } },
        tasks: { select: { status: true, dueDate: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const today = new Date().toISOString().split('T')[0];
    for (const p of projects) {
      p.doneTasks = p.tasks.filter(t => t.status === 'done').length;
      p.overdueTasks = p.tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;
      delete p.tasks;
    }

    res.render('projects', {
      title: 'Projects',
      projects,
      activeProjectId: null,
      projectTags: [],
      isGuest,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load projects');
    res.redirect('/dashboard');
  }
};

exports.createProject = async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const project = await prisma.project.create({
      data: {
        name,
        color: color || '#6C63FF',
        userId: req.user.id,
      },
    });

    res.json({ success: true, project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const project = await prisma.project.update({
      where: { id: parseInt(id) },
      data: { name, color: color || '#6C63FF' },
    });

    res.json({ success: true, project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.project.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};
