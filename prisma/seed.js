const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  await prisma.taskAssignee.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('demo123', 12);
  const user = await prisma.user.create({
    data: { name: 'Anh Nguyen', email: 'demo@pmtask.com', password },
  });

  const tagData = [
    { name: 'Design', color: '#6C63FF' },
    { name: 'UX', color: '#00D9FF' },
    { name: 'Backend', color: '#FF5C7A' },
    { name: 'Frontend', color: '#00F5A0' },
    { name: 'DevOps', color: '#FFB347' },
    { name: 'Security', color: '#FF5C7A' },
    { name: 'QA', color: '#FFB347' },
    { name: 'Docs', color: '#6B6B8E' },
  ];
  const tags = {};
  for (const t of tagData) {
    tags[t.name] = await prisma.tag.create({ data: t });
  }

  const projects = {
    atlas: await prisma.project.create({ data: { name: 'Atlas Platform', color: '#6C63FF', userId: user.id } }),
    mobile: await prisma.project.create({ data: { name: 'Mobile App', color: '#00D9FF', userId: user.id } }),
    data: await prisma.project.create({ data: { name: 'Data Pipeline', color: '#00F5A0', userId: user.id } }),
    marketing: await prisma.project.create({ data: { name: 'Marketing Site', color: '#FF5C7A', userId: user.id } }),
  };

  const taskData = [
    { title: 'Redesign onboarding flow', priority: 'high', status: 'todo', tags: ['Design', 'UX'], progress: 0, dueDate: '2026-04-08', position: 0 },
    { title: 'Set up CI/CD pipeline', priority: 'medium', status: 'todo', tags: ['DevOps'], progress: 0, dueDate: '2026-04-10', position: 1 },
    { title: 'Write API documentation', priority: 'low', status: 'todo', tags: ['Docs'], progress: 0, dueDate: '2026-04-12', position: 2 },
    { title: 'Build authentication module', priority: 'high', status: 'inprogress', tags: ['Backend', 'Security'], progress: 65, dueDate: '2026-04-06', position: 0 },
    { title: 'Dashboard analytics charts', priority: 'medium', status: 'inprogress', tags: ['Frontend'], progress: 40, dueDate: '2026-04-09', position: 1 },
    { title: 'Mobile responsive fixes', priority: 'medium', status: 'review', tags: ['Frontend', 'QA'], progress: 90, dueDate: '2026-04-05', position: 0 },
    { title: 'Performance optimization', priority: 'high', status: 'review', tags: ['Backend'], progress: 85, dueDate: '2026-04-07', position: 1 },
    { title: 'Database schema design', priority: 'high', status: 'done', tags: ['Backend'], progress: 100, dueDate: '2026-04-01', position: 0 },
    { title: 'UI component library', priority: 'medium', status: 'done', tags: ['Design', 'Frontend'], progress: 100, dueDate: '2026-04-02', position: 1 },
  ];

  for (const td of taskData) {
    const task = await prisma.task.create({
      data: {
        title: td.title,
        priority: td.priority,
        status: td.status,
        progress: td.progress,
        dueDate: td.dueDate,
        position: td.position,
        projectId: projects.atlas.id,
        createdById: user.id,
      },
    });

    for (const tagName of td.tags) {
      await prisma.taskTag.create({
        data: { taskId: task.id, tagId: tags[tagName].id },
      });
    }

    await prisma.taskAssignee.create({
      data: { taskId: task.id, userId: user.id },
    });
  }

  console.log('Seed complete!');
  console.log('Login: demo@pmtask.com / demo123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
