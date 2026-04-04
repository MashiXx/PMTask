// One-time migration script: generates slugs for existing projects and tasks
// Run: node prisma/migrate-slugs.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { generateSlug } = require('../src/utils/slug');

async function main() {
  // Migrate projects
  const projects = await prisma.project.findMany({ where: { slug: '' } });
  for (const project of projects) {
    const slug = generateSlug(project.name);
    await prisma.project.update({ where: { id: project.id }, data: { slug } });
    console.log(`Project "${project.name}" -> ${project.id}-${slug}`);
  }

  // Migrate tasks
  const tasks = await prisma.task.findMany({ where: { slug: '' } });
  for (const task of tasks) {
    const slug = generateSlug(task.title);
    await prisma.task.update({ where: { id: task.id }, data: { slug } });
    console.log(`Task "${task.title}" -> ${task.id}-${slug}`);
  }

  console.log('Slug migration complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
