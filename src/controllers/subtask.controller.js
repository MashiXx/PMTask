const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getSubtasks = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
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

    const data = {};
    if (title !== undefined) data.title = title;
    if (done !== undefined) data.done = done;

    const subtask = await prisma.subTask.update({
      where: { id },
      data,
    });
    res.json(subtask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update subtask' });
  }
};

exports.deleteSubtask = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.subTask.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete subtask' });
  }
};
