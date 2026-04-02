const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.query.project ? parseInt(req.query.project) : null;

    const projects = await prisma.project.findMany({
      where: { userId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const activeProjectId = projectId || (projects[0]?.id ?? null);

    let tasks = { todo: [], inprogress: [], review: [], done: [] };

    if (activeProjectId) {
      const allTasks = await prisma.task.findMany({
        where: { projectId: activeProjectId },
        include: {
          tags: { include: { tag: true } },
          assignees: { include: { user: true } },
        },
        orderBy: { position: 'asc' },
      });

      for (const task of allTasks) {
        if (tasks[task.status]) {
          tasks[task.status].push(task);
        }
      }
    }

    const totalCount = Object.values(tasks).flat().length;
    const inProgressCount = tasks.inprogress.length;
    const doneCount = tasks.done.length;

    const today = new Date().toISOString().split('T')[0];
    const overdueCount = Object.values(tasks)
      .flat()
      .filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;

    const sprintProgress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    const activeProject = projects.find(p => p.id === activeProjectId);

    res.render('dashboard', {
      title: 'Dashboard',
      projects,
      activeProjectId,
      activeProject,
      tasks,
      stats: {
        total: totalCount,
        inProgress: inProgressCount,
        completed: doneCount,
        overdue: overdueCount,
      },
      sprintProgress,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load dashboard');
    res.redirect('/');
  }
};
