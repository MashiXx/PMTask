function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'untitled';
}

async function uniqueProjectSlug(prisma, name, excludeId = null) {
  let base = generateSlug(name);
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.project.findUnique({ where: { slug } });
    if (!existing || (excludeId && existing.id === excludeId)) return slug;
    slug = `${base}-${counter++}`;
  }
}

async function uniqueTaskSlug(prisma, title, projectId, excludeId = null) {
  let base = generateSlug(title);
  let slug = base;
  let counter = 1;

  while (true) {
    const existing = await prisma.task.findFirst({
      where: { slug, projectId },
    });
    if (!existing || (excludeId && existing.id === excludeId)) return slug;
    slug = `${base}-${counter++}`;
  }
}

module.exports = { generateSlug, uniqueProjectSlug, uniqueTaskSlug };
