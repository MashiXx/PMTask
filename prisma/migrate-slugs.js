// One-time migration script: generates slugs for existing projects and tasks
// Run: node prisma/migrate-slugs.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { uniqueProjectSlug, uniqueTaskSlug } = require('../src/utils/slug');

async function main() {
  // Migrate projects
  const projects = await prisma.project.findMany({ where: { slug: '' } });
  for (const project of projects) {
    const slug = await uniqueProjectSlug(prisma, project.name, project.id);
    await prisma.project.update({ where: { id: project.id }, data: { slug } });
    console.log(`Project "${project.name}" -> ${slug}`);
  }

  // Migrate tasks
  const tasks = await prisma.task.findMany({ where: { slug: '' } });
  for (const task of tasks) {
    const slug = await uniqueTaskSlug(prisma, task.title, task.projectId, task.id);
    await prisma.task.update({ where: { id: task.id }, data: { slug } });
    console.log(`Task "${task.title}" -> ${slug}`);
  }

  console.log('Slug migration complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
