const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.createTask = async (req, res) => {
  try {
    const { title, description, priority, status, dueDate, progress, tags, projectId } = req.body;

    const maxPos = await prisma.task.aggregate({
      where: { projectId: parseInt(projectId), status: status || 'todo' },
      _max: { position: true },
    });

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || 'medium',
        status: status || 'todo',
        dueDate: dueDate || null,
        progress: parseInt(progress) || 0,
        position: (maxPos._max.position || 0) + 1,
        projectId: parseInt(projectId),
        createdById: req.user.id,
      },
    });

    if (tags && tags.length > 0) {
      const tagList = Array.isArray(tags) ? tags : [tags];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
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
    const { title, description, priority, dueDate, progress, tags } = req.body;

    const task = await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        title,
        description: description || null,
        priority,
        dueDate: dueDate || null,
        progress: parseInt(progress) || 0,
      },
    });

    if (tags !== undefined) {
      await prisma.taskTag.deleteMany({ where: { taskId: task.id } });
      const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
      for (const tagName of tagList) {
        const tag = await prisma.tag.upsert({
          where: { name: tagName },
          update: {},
          create: { name: tagName },
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
    const { status, position } = req.body;

    await prisma.task.update({
      where: { id: parseInt(id) },
      data: {
        status,
        position: parseInt(position),
        ...(status === 'done' ? { progress: 100 } : {}),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move task' });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.task.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
};

exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await prisma.task.findUnique({
      where: { id: parseInt(id) },
      include: {
        tags: { include: { tag: true } },
        assignees: { include: { user: true } },
      },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get task' });
  }
};
