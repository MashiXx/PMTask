const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_LEN = 5000;

// Posting access: admin, task creator, or an assignee (mirrors subtask.controller).
async function canModifyTask(taskId, user) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true },
  });
  if (!task) return null;
  if (user.role === 'admin') return task;
  if (task.createdById === user.id) return task;
  if (task.assignees.some((a) => a.userId === user.id)) return task;
  return false;
}

const authorShape = { select: { id: true, name: true, avatar: true, updatedAt: true } };

function serialize(c) {
  return {
    id: c.id,
    content: c.content,
    author: c.author,
    parentId: c.parentId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    replies: (c.replies || []).map((r) => ({
      id: r.id,
      content: r.content,
      author: r.author,
      parentId: r.parentId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

function cleanContent(raw) {
  const content = (raw || '').trim();
  if (!content) return { error: 'Comment cannot be empty' };
  if (content.length > MAX_LEN) return { error: 'Comment too long' };
  return { content };
}

// GET /api/comments/task/:taskId
exports.getComments = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!req.user) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { project: { select: { publicTasks: true } } },
      });
      if (!task || !task.project.publicTasks) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const comments = await prisma.taskComment.findMany({
      where: { taskId, parentId: null },
      orderBy: { createdAt: 'asc' },
      include: {
        author: authorShape,
        replies: { orderBy: { createdAt: 'asc' }, include: { author: authorShape } },
      },
    });
    res.json(comments.map(serialize));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get comments' });
  }
};

// POST /api/comments/task/:taskId  body: { content, parentId? }
exports.createComment = async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const access = await canModifyTask(taskId, req.user);
    if (access === null) return res.status(404).json({ error: 'Task not found' });
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const { content, error } = cleanContent(req.body.content);
    if (error) return res.status(400).json({ error });

    let parentId = null;
    if (req.body.parentId != null && req.body.parentId !== '') {
      parentId = parseInt(req.body.parentId);
      const parent = await prisma.taskComment.findUnique({ where: { id: parentId } });
      if (!parent || parent.taskId !== taskId) {
        return res.status(400).json({ error: 'Invalid parent comment' });
      }
      if (parent.parentId !== null) {
        return res.status(400).json({ error: 'Replies cannot be nested further' });
      }
    }

    const comment = await prisma.taskComment.create({
      data: { content, taskId, authorId: req.user.id, parentId },
      include: { author: authorShape, replies: { include: { author: authorShape } } },
    });
    res.status(201).json(serialize(comment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

// PUT /api/comments/:id  body: { content }
exports.updateComment = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comment = await prisma.taskComment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { content, error } = cleanContent(req.body.content);
    if (error) return res.status(400).json({ error });

    const updated = await prisma.taskComment.update({
      where: { id },
      data: { content },
      include: { author: authorShape, replies: { include: { author: authorShape } } },
    });
    res.json(serialize(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update comment' });
  }
};

// DELETE /api/comments/:id  (cascade removes replies)
exports.deleteComment = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comment = await prisma.taskComment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (req.user.role !== 'admin' && comment.authorId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.taskComment.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
};
