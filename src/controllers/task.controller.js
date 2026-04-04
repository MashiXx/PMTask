const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateSlug, parseIdFromSlug } = require('../utils/slug');

const VALID_STATUSES = ['todo', 'inprogress', 'review', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

// Check if user has access to modify a task (admin, creator, or assignee)
async function canModifyTask(taskId, user) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });
  if (!task) return null;
  if (user.role === 'admin') return task;
  if (task.createdById === user.id) return task;
  if (task.assignees.some(a => a.userId === user.id)) return task;
  return false;
}

exports.createTask = async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, progress, tags, projectId } = req.body;

    if (!title || !projectId) {
      return res.status(400).json({ error: 'Title and projectId are required' });
    }

    const safeStatus = VALID_STATUSES.includes(status) ? status : 'todo';
    const safePriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';
    const safeProgress = Math.min(100, Math.max(0, parseInt(progress) || 0));

    const maxPos = await prisma.task.aggregate({
      where: { projectId: parseInt(projectId), status: safeStatus },
      _max: { position: true },
    });

    const pid = parseInt(projectId);
    const task = await prisma.task.create({
      data: {
        title,
        slug: generateSlug(title),
        description: description || null,
        priority: safePriority,
        status: safeStatus,
        dueDate: dueDate || null,
        progress: safeProgress,
        position: (maxPos._max.position || 0) + 1,
        projectId: pid,
        createdById: req.user.id,
      },
    });

    if (tags && tags.length > 0) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name_projectId: { name: tagName, projectId: pid } },
          update: {},
          create: { name: tagName, projectId: pid },
        });
        await prisma.taskTag.create({
          data: { taskId: task.id, tagId: tag.id },
        });
      }
    }

    await prisma.taskAssignee.create({
      data: { taskId: task.id, userId: req.user.id },
    });

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const { title, description, priority, status, dueDate, progress, tags } = req.body;

    // IDOR protection: check ownership
    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    const safeProgress = Math.min(100, Math.max(0, parseInt(progress) || 0));

    const updateData = {
      title,
      description: description || null,
      priority: VALID_PRIORITIES.includes(priority) ? priority : access.priority,
      dueDate: dueDate || null,
      progress: safeProgress,
    };
    if (title && title !== access.title) {
      updateData.slug = generateSlug(title);
    }
    if (status && VALID_STATUSES.includes(status)) {
      updateData.status = status;
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: { subtasks: true },
    });

    // Recalculate progress based on subtasks
    if (task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      const calcProgress = task.status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);
      await prisma.task.update({ where: { id: taskId }, data: { progress: calcProgress } });
      task.progress = calcProgress;
    } else if (task.status === 'done') {
      await prisma.task.update({ where: { id: taskId }, data: { progress: 100 } });
      task.progress = 100;
    }

    if (tags !== undefined) {
      await prisma.taskTag.deleteMany({ where: { taskId: task.id } });
      const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name_projectId: { name: tagName, projectId: task.projectId } },
          update: {},
          create: { name: tagName, projectId: task.projectId },
        });
        await prisma.taskTag.create({
          data: { taskId: task.id, tagId: tag.id },
        });
      }
    }

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
};

exports.moveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);
    const { status, position } = req.body;

    // IDOR protection
    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status,
        position: parseInt(position),
      },
      include: { subtasks: true },
    });

    // Recalculate progress based on subtasks
    if (task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      const calcProgress = status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);
      await prisma.task.update({ where: { id: taskId }, data: { progress: calcProgress } });
    } else if (status === 'done') {
      await prisma.task.update({ where: { id: taskId }, data: { progress: 100 } });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const taskId = parseInt(id);

    // IDOR protection
    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    await prisma.taskTag.deleteMany({ where: { taskId } });
    await prisma.taskAssignee.deleteMany({ where: { taskId } });
    await prisma.task.delete({ where: { id: taskId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

exports.getTaskPage = async (req, res) => {
  try {
    const { slug } = req.params;
    // Parse ID from slug (e.g. "42-my-task-title" -> 42)
    const taskId = parseIdFromSlug(slug);
    if (!taskId) {
      req.flash('error', 'Task not found');
      return res.redirect('/dashboard');
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
      },
    });
    if (!task) {
      req.flash('error', 'Task not found');
      return res.redirect('/dashboard');
    }

    // Redirect bare ID or wrong slug to canonical URL
    const canonical = `${task.id}-${task.slug}`;
    if (slug !== canonical) {
      return res.redirect(301, `/tasks/${canonical}`);
    }

    const isGuest = !req.user;
    let canEdit = false;
    if (req.user) {
      const access = await canModifyTask(task.id, req.user);
      canEdit = access !== null && access !== false;
    }

    const projectFilter = req.user && req.user.role === 'admin' ? { userId: req.user.id } : {};
    const projects = await prisma.project.findMany({
      where: projectFilter,
      include: { _count: { select: { tasks: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const projectTags = await prisma.tag.findMany({
      where: { projectId: task.projectId },
      orderBy: { name: 'asc' },
    });

    res.render('task-detail', {
      title: task.title,
      task,
      projects,
      activeProjectId: task.projectId,
      activeProject: task.project,
      projectTags,
      isGuest,
      canEdit,
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load task');
    res.redirect('/dashboard');
  }
};

exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await prisma.task.findUnique({
      where: { id: parseInt(id) },
      include: {
        project: { select: { publicTasks: true } },
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // If not logged in, only allow if project has publicTasks enabled
    if (!req.user && !task.project.publicTasks) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get task' });
  }
};
