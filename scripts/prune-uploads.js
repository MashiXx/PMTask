// ===========================================================================
// prune-uploads — audit & clean orphaned upload files
// ---------------------------------------------------------------------------
// Reconciles the files on disk under uploadDir against the DB rows that
// reference them (Document.filepath + TaskAttachment.filepath), so you can see:
//   • ORPHAN files   — on disk but no DB row points to them (safe to delete)
//   • DANGLING rows  — a DB row whose file is missing on disk (broken link)
//
// Run it ON THE MACHINE WHERE THE FILES LIVE (i.e. the server / WSL), e.g.:
//     npm run prune-uploads            # report only (default, deletes nothing)
//     npm run prune-uploads -- --delete   # also delete the ORPHAN files
//
// Dangling DB rows are only reported, never auto-deleted.
// ===========================================================================
require('../src/config/database'); // assembles DATABASE_URL from DB_* in .env
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { uploadDir } = require('../src/config/upload');

const prisma = new PrismaClient();
const DO_DELETE = process.argv.includes('--delete');

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Recursively list every file (absolute path) under a directory.
function walkFiles(dir) {
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return out; }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue; // ignore .gitkeep and friends
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(full));
    else if (ent.isFile()) out.push(full);
  }
  return out;
}

// Which task/project does a file path belong to (by folder convention)?
function describeLocation(absFile) {
  const rel = path.relative(uploadDir, absFile);
  const parts = rel.split(path.sep);
  if (parts[0] === 'tasks' && parts[1]) return `task #${parts[1]}`;
  if (parts[0]) return `project #${parts[0]}`;
  return 'unknown';
}

// Remove now-empty directories under uploadDir (deepest first).
function pruneEmptyDirs(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return; }
  for (const ent of entries) {
    if (ent.isDirectory()) pruneEmptyDirs(path.join(dir, ent.name));
  }
  if (path.resolve(dir) === path.resolve(uploadDir)) return; // never remove the root
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch (e) {}
}

(async () => {
  const base = path.resolve(uploadDir);
  if (!fs.existsSync(base)) {
    console.log(`uploadDir does not exist yet: ${base}`);
    await prisma.$disconnect();
    return;
  }

  // 1. Gather referenced files from the DB (absolute, resolved paths).
  const [docs, attachments] = await Promise.all([
    prisma.document.findMany({ select: { id: true, filename: true, filepath: true, projectId: true } }),
    prisma.taskAttachment.findMany({ select: { id: true, filename: true, filepath: true, taskId: true } }),
  ]);

  const referenced = new Map(); // absolute path -> { type, id, filename, owner }
  for (const d of docs) {
    referenced.set(path.resolve(uploadDir, d.filepath), { type: 'document', id: d.id, filename: d.filename, owner: `project #${d.projectId}` });
  }
  for (const a of attachments) {
    referenced.set(path.resolve(uploadDir, a.filepath), { type: 'attachment', id: a.id, filename: a.filename, owner: `task #${a.taskId}` });
  }

  // 2. Walk the disk.
  const diskFiles = walkFiles(base);
  const referencedSet = new Set(referenced.keys());

  // 3a. Orphan files: on disk, not referenced.
  const orphans = diskFiles.filter(f => !referencedSet.has(path.resolve(f)));

  // 3b. Dangling rows: referenced, but file missing on disk.
  const dangling = [];
  for (const [abs, info] of referenced.entries()) {
    if (!fs.existsSync(abs)) dangling.push({ abs, ...info });
  }

  // 4. Report.
  console.log('── Upload audit ───────────────────────────────────────────');
  console.log(`uploadDir:        ${base}`);
  console.log(`DB references:    ${referenced.size} (${docs.length} documents, ${attachments.length} attachments)`);
  console.log(`Files on disk:    ${diskFiles.length}`);
  console.log(`Linked OK:        ${diskFiles.length - orphans.length}`);
  console.log(`Orphan files:     ${orphans.length}`);
  console.log(`Dangling rows:    ${dangling.length}`);
  console.log('');

  if (orphans.length) {
    let freed = 0;
    console.log(`ORPHAN FILES (on disk, no DB link)${DO_DELETE ? ' — deleting' : ' — run with --delete to remove'}:`);
    for (const f of orphans) {
      let size = 0;
      try { size = fs.statSync(f).size; } catch (e) {}
      freed += size;
      console.log(`  • ${path.relative(base, f)}  [${describeLocation(f)}, ${formatSize(size)}]`);
      if (DO_DELETE) {
        try { fs.unlinkSync(f); } catch (e) { console.log(`      ! failed to delete: ${e.message}`); }
      }
    }
    console.log(`  ${DO_DELETE ? 'Freed' : 'Would free'}: ${formatSize(freed)}`);
    console.log('');
  }

  if (dangling.length) {
    console.log('DANGLING DB ROWS (DB link, file missing on disk) — reported only:');
    for (const d of dangling) {
      console.log(`  • ${d.type} #${d.id} "${d.filename}" (${d.owner})  ->  ${path.relative(base, d.abs)}`);
    }
    console.log('');
  }

  if (DO_DELETE && orphans.length) {
    pruneEmptyDirs(base);
    console.log('Removed empty directories.');
  }

  if (!orphans.length && !dangling.length) {
    console.log('Everything is in sync. No garbage files.');
  }

  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
