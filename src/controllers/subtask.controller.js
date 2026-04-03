const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// Recalculate parent task progress based on subtasks
// Formula: doneSubtasks / (totalSubtasks + 1) * 100
// The +1 represents the parent task itself; only status=done gives 100%
async function recalcTaskProgress(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { subtasks: true },
  });
  if (!task) return;

  if (task.subtasks.length === 0) return;

  const doneCount = task.subtasks.filter(s => s.done).length;
  const progress = task.status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);

  await prisma.task.update({
    where: { id: taskId },
    data: { progress },
  });
}

exports.getSubtasks = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);

    // If not logged in, check if the task's project allows public access
    if (!req.user) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { project: { select: { publicTasks: true } } },
      });
      if (!task || !task.project.publicTasks) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const subtasks = await prisma.subTask.findMany({
      where: { taskId },
      orderBy: { position: 'asc' },
    });
    res.json(subtasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get subtasks' });
  }
};

exports.createSubtask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    const maxPos = await prisma.subTask.aggregate({
      where: { taskId },
      _max: { position: true },
    });

    const subtask = await prisma.subTask.create({
      data: {
        title,
        taskId,
        position: (maxPos._max.position || 0) + 1,
      },
    });
    await recalcTaskProgress(taskId);
    res.json(subtask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create subtask' });
  }
};

exports.updateSubtask = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { title, done } = req.body;

    const existing = await prisma.subTask.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Subtask not found' });

    const access = await canModifyTask(existing.taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    const data = {};
    if (title !== undefined) data.title = title;
    if (done !== undefined) data.done = done;

    const subtask = await prisma.subTask.update({
      where: { id },
      data,
    });
    await recalcTaskProgress(subtask.taskId);
    res.json(subtask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update subtask' });
  }
};

exports.deleteSubtask = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const subtask = await prisma.subTask.findUnique({ where: { id } });
    if (!subtask) return res.status(404).json({ error: 'Subtask not found' });

    const access = await canModifyTask(subtask.taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (access === false) return res.status(403).json({ error: 'Access denied' });

    await prisma.subTask.delete({ where: { id } });
    if (subtask) await recalcTaskProgress(subtask.taskId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
};
