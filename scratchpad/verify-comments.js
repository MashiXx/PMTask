require('dotenv').config();
require('../src/config/database'); // assembles DATABASE_URL from DB_* into process.env

const { PrismaClient } = require('@prisma/client');
const ctrl = require('../src/controllers/comment.controller');
const prisma = new PrismaClient();

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else console.log('ok:', msg); };

(async () => {
  // Use the first existing project + user from the seeded dev DB.
  const user = await prisma.user.findFirst({ where: { role: 'admin' } });
  const project = await prisma.project.findFirst();
  const task = await prisma.task.create({ data: { title: 'comment-verify', projectId: project.id, createdById: user.id, slug: 'comment-verify' } });

  // create top-level
  let res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: '  hello  ' }, user }, res);
  assert(res.statusCode === 201, 'create top-level returns 201');
  assert(res.body.content === 'hello', 'content trimmed');
  const parentId = res.body.id;

  // reject empty
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: '   ' }, user }, res);
  assert(res.statusCode === 400, 'empty content rejected with 400');

  // create reply (valid)
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: 'a reply', parentId }, user }, res);
  assert(res.statusCode === 201, 'reply to top-level returns 201');
  const replyId = res.body.id;

  // reject 2nd-level reply
  res = mockRes();
  await ctrl.createComment({ params: { taskId: String(task.id) }, body: { content: 'deep', parentId: replyId }, user }, res);
  assert(res.statusCode === 400, 'reply-to-reply rejected with 400');

  // GET returns nested
  res = mockRes();
  await ctrl.getComments({ params: { taskId: String(task.id) }, user }, res);
  assert(Array.isArray(res.body) && res.body.length === 1, 'GET returns 1 top-level');
  assert(res.body[0].replies.length === 1, 'top-level has 1 reply');

  // delete parent cascades reply
  res = mockRes();
  await ctrl.deleteComment({ params: { id: String(parentId) }, user }, res);
  assert(res.statusCode === 200, 'delete parent ok');
  const remaining = await prisma.taskComment.count({ where: { taskId: task.id } });
  assert(remaining === 0, 'deleting parent cascades reply (0 remaining)');

  // cleanup
  await prisma.task.delete({ where: { id: task.id } });
  await prisma.$disconnect();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
