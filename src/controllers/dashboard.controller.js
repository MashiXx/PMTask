const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getDashboard = async (req, res) => {
  try {
    const user = req.user;
    const isGuest = !user;
    const projectId = req.query.project ? parseInt(req.query.project) : null;

    // Admins see their own projects; developers see all; guests see only public
    let projectFilter = {};
    if (user && user.role === 'admin') {
      projectFilter = { userId: user.id };
    } else if (!user) {
      projectFilter = { publicTasks: true };
    }
    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });

    // Use query param, or session saved project, or first project
    let activeProjectId = projectId
      || (req.session && req.session.lastProjectId)
      || (projects[0]?.id ?? null);

    // Verify the project still exists
    if (activeProjectId && !projects.find(p => p.id === activeProjectId)) {
      activeProjectId = projects[0]?.id ?? null;
    }

    // Save to session for next visit
    if (activeProjectId && req.session) {
      req.session.lastProjectId = activeProjectId;
    }

    // No projects at all
    if (!activeProjectId) {
      if (isGuest) {
        // Guest with no projects -> show empty dashboard
        return res.render('dashboard', {
          title: 'Dashboard',
          projects: [],
          activeProjectId: null,
          activeProject: null,
          tasks: { todo: [], inprogress: [], review: [], done: [] },
          stats: { total: 0, inProgress: 0, completed: 0, overdue: 0 },
          sprintProgress: 0,
          projectTags: [],
          isGuest: true,
        });
      }
      return res.redirect('/projects');
    }

    let tasks = { todo: [], inprogress: [], review: [], done: [] };

    const allTasks = await prisma.task.findMany({
      where: { projectId: activeProjectId },
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
      },
      orderBy: { position: 'asc' },
    });

    for (const task of allTasks) {
      if (tasks[task.status]) {
        tasks[task.status].push(task);
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

    const projectTags = activeProjectId
      ? await prisma.tag.findMany({ where: { projectId: activeProjectId }, orderBy: { name: 'asc' } })
      : [];

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
      projectTags,
      isGuest,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load dashboard');
    res.redirect('/auth/login');
  }
};
