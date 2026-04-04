require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
const { uniqueProjectSlug, uniqueTaskSlug } = require('../src/utils/slug');

async function main() {
  await prisma.taskAssignee.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash('demo123', 12);
  const user = await prisma.user.create({
    data: { name: 'Anh Nguyen', email: 'admin@pmtask.com', password, role: 'admin' },
  });
  const devUser = await prisma.user.create({
    data: { name: 'Dev User', email: 'dev@pmtask.com', password, role: 'developer' },
  });

  const projectNames = [
    { key: 'atlas', name: 'Atlas Platform', color: '#6C63FF' },
    { key: 'mobile', name: 'Mobile App', color: '#00D9FF' },
    { key: 'data', name: 'Data Pipeline', color: '#00F5A0' },
    { key: 'marketing', name: 'Marketing Site', color: '#FF5C7A' },
  ];
  const projects = {};
  for (const p of projectNames) {
    const slug = await uniqueProjectSlug(prisma, p.name);
    projects[p.key] = await prisma.project.create({ data: { name: p.name, slug, color: p.color, userId: user.id } });
  }

  const tagData = [
    { name: 'design', color: '#6C63FF' },
    { name: 'ux', color: '#00D9FF' },
    { name: 'backend', color: '#FF5C7A' },
    { name: 'frontend', color: '#00F5A0' },
    { name: 'devops', color: '#FFB347' },
    { name: 'security', color: '#FF5C7A' },
    { name: 'qa', color: '#FFB347' },
    { name: 'docs', color: '#6B6B8E' },
  ];
  const tags = {};
  for (const t of tagData) {
    tags[t.name] = await prisma.tag.create({ data: { ...t, projectId: projects.atlas.id } });
  }

  const taskData = [
    { title: 'Redesign onboarding flow', priority: 'high', status: 'todo', tags: ['design', 'ux'], progress: 0, dueDate: '2026-04-08', position: 0 },
    { title: 'Set up CI/CD pipeline', priority: 'medium', status: 'todo', tags: ['devops'], progress: 0, dueDate: '2026-04-10', position: 1 },
    { title: 'Write API documentation', priority: 'low', status: 'todo', tags: ['docs'], progress: 0, dueDate: '2026-04-12', position: 2 },
    { title: 'Build authentication module', priority: 'high', status: 'inprogress', tags: ['backend', 'security'], progress: 65, dueDate: '2026-04-06', position: 0 },
    { title: 'Dashboard analytics charts', priority: 'medium', status: 'inprogress', tags: ['frontend'], progress: 40, dueDate: '2026-04-09', position: 1 },
    { title: 'Mobile responsive fixes', priority: 'medium', status: 'review', tags: ['frontend', 'qa'], progress: 90, dueDate: '2026-04-05', position: 0 },
    { title: 'Performance optimization', priority: 'high', status: 'review', tags: ['backend'], progress: 85, dueDate: '2026-04-07', position: 1 },
    { title: 'Database schema design', priority: 'high', status: 'done', tags: ['backend'], progress: 100, dueDate: '2026-04-01', position: 0 },
    { title: 'UI component library', priority: 'medium', status: 'done', tags: ['design', 'frontend'], progress: 100, dueDate: '2026-04-02', position: 1 },
  ];

  for (const td of taskData) {
    const taskSlug = await uniqueTaskSlug(prisma, td.title, projects.atlas.id);
    const task = await prisma.task.create({
      data: {
        title: td.title,
        slug: taskSlug,
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

    // Assign some tasks to dev user too
    if (['inprogress', 'review'].includes(td.status)) {
      await prisma.taskAssignee.create({
        data: { taskId: task.id, userId: devUser.id },
      });
    }
  }

  console.log('Seed complete!');
  console.log('Admin: admin@pmtask.com / demo123');
  console.log('Dev:   dev@pmtask.com / demo123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
