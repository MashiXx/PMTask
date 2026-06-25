const prisma = require('../config/prisma');
const fs = require('fs');
const path = require('path');
const { generateSlug, parseIdFromSlug } = require('../utils/slug');
const { uploadDir } = require('../config/upload');

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

    // Only update fields that were actually sent, so partial saves (e.g. the
    // preview modal, which omits dueDate/progress) never clobber existing values.
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (priority !== undefined) {
      updateData.priority = VALID_PRIORITIES.includes(priority) ? priority : access.priority;
    }
    if (dueDate !== undefined) updateData.dueDate = dueDate || null;
    if (progress !== undefined) {
      updateData.progress = Math.min(100, Math.max(0, parseInt(progress) || 0));
    }
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
    const taskId = parseInt(req.params.id);
    const { groupId, position } = req.body;

    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    // Normalize groupId: null / '' / 'ungrouped' => null (the Ungrouped column)
    let normGroupId = null;
    if (groupId != null && groupId !== '' && groupId !== 'ungrouped') {
      normGroupId = parseInt(groupId);
      if (Number.isNaN(normGroupId)) return res.status(400).json({ error: 'Invalid groupId' });
      const group = await prisma.taskGroup.findUnique({ where: { id: normGroupId } });
      if (!group || group.projectId !== access.projectId) {
        return res.status(400).json({ error: 'Group does not belong to this project' });
      }
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { groupId: normGroupId, position: parseInt(position) || 0 },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

// Change only a task's status (the board no longer changes status via drag).
exports.setTaskStatus = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id);
    const { status } = req.body;

    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status },
      include: { subtasks: true },
    });

    // Keep progress in sync with the new status:
    //   • with subtasks → done = 100, otherwise the subtask ratio
    //   • no subtasks  → progress is driven purely by completion (done = 100, else 0)
    let calc;
    if (task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      calc = status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);
    } else {
      calc = status === 'done' ? 100 : 0;
    }
    await prisma.task.update({ where: { id: taskId }, data: { progress: calc } });
    task.progress = calc;

    res.json({ success: true, task });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set status' });
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

    // Remove attachment files from disk (DB rows cascade-deleted above).
    // All of a task's attachments live under uploads/tasks/<taskId>/.
    try {
      fs.rmSync(path.join(uploadDir, 'tasks', String(taskId)), { recursive: true, force: true });
    } catch (e) { /* nothing to clean */ }

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
      req.flash('error', req.t('flash.taskNotFound'));
      return res.redirect('/dashboard');
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        project: true,
        createdBy: { select: { name: true } },
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
        attachments: {
          include: { uploadedBy: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!task) {
      req.flash('error', req.t('flash.taskNotFound'));
      return res.redirect('/dashboard');
    }

    // Redirect bare ID or wrong slug to canonical URL
    const canonical = `${task.id}-${task.slug}`;
    if (slug !== canonical) {
      return res.redirect(301, `/tasks/${canonical}`);
    }

    const isGuest = !req.user;
    // Derive edit permission from the already-loaded task (avoids re-querying
    // the task + assignees that canModifyTask would otherwise fetch).
    let canEdit = false;
    if (req.user) {
      canEdit = req.user.role === 'admin'
        || task.createdById === req.user.id
        || task.assignees.some((a) => a.userId === req.user.id);
    }

    // These two are independent — run them concurrently instead of sequentially.
    const projectFilter = req.user && req.user.role === 'admin' ? { userId: req.user.id } : {};
    const [projects, projectTags] = await Promise.all([
      prisma.project.findMany({
        where: projectFilter,
        include: { _count: { select: { tasks: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.tag.findMany({
        where: { projectId: task.projectId },
        orderBy: { name: 'asc' },
      }),
    ]);

    // Build OG description from task details
    const ogDesc = task.description
      ? task.description.replace(/[#*_`>\-\[\]()]/g, '').substring(0, 200)
      : `Task in project ${task.project.name}`;

    res.render('task-detail', {
      title: task.title,
      ogDescription: `${task.title} — ${ogDesc}`,
      ogUrl: `${req.protocol}://${req.get('host')}/tasks/${task.id}`,
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
    req.flash('error', req.t('flash.loadTaskFailed'));
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
        createdBy: { select: { name: true } },
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
        subtasks: { orderBy: { position: 'asc' } },
        attachments: {
          include: { uploadedBy: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
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
