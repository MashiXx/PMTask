// ===========================================================================
// Project visibility rules for the multi-user "private workspace" model.
// ---------------------------------------------------------------------------
//   - admin           -> superuser: sees and can reach every project
//   - other logged-in -> only projects they own (Project.userId === user.id)
//   - guest           -> only what a project explicitly shares publicly
//                        (publicTasks / publicDocuments), handled per-surface
//
// Before this, any logged-in "developer" saw ALL projects — this module is the
// single source of truth that replaced that leak.
// ===========================================================================

// Prisma WHERE clause for listing the projects an actor may see.
// `guestWhere` is the per-surface public filter to use when there is no user
// (e.g. { publicTasks: true } for the task board, a broader OR for documents).
function projectListWhere(user, guestWhere) {
  if (!user) return guestWhere;
  if (user.role === 'admin') return {}; // superuser: every project
  return { userId: user.id }; // owner-only
}

// Predicate: may this authenticated actor reach a specific project's contents?
// Guests are never granted access here — callers apply their own public rules.
function canAccessProject(project, user) {
  if (!project || !user) return false;
  return user.role === 'admin' || project.userId === user.id;
}

module.exports = { projectListWhere, canAccessProject };
