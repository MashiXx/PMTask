// One-off: normalize Document.filepath from absolute -> relative (to uploadDir).
//
// Run this ON THE SERVER where the files live (uploadDir must match where the
// files actually are), e.g.:
//     node scripts/migrate-document-paths.js
//
// Safe to re-run: rows already relative (or pointing outside uploadDir) are skipped.
require('../src/config/database');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { uploadDir } = require('../src/config/upload');

const prisma = new PrismaClient();

(async () => {
  const docs = await prisma.document.findMany({ select: { id: true, filepath: true } });
  const base = path.resolve(uploadDir);
  let changed = 0, skipped = 0;
  for (const d of docs) {
    if (!path.isAbsolute(d.filepath)) { skipped++; continue; } // already relative
    const rel = path.relative(base, d.filepath);
    // Only rewrite paths that actually live under uploadDir on this machine.
    if (rel.startsWith('..') || path.isAbsolute(rel)) { skipped++; continue; }
    await prisma.document.update({ where: { id: d.id }, data: { filepath: rel } });
    changed++;
  }
  console.log(`Document paths migrated: ${changed} changed, ${skipped} skipped (of ${docs.length}).`);
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
