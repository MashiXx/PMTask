// Build ordered board columns from a project's groups and its tasks.
// Returns an "Ungrouped" column first (only when it has tasks, or when the
// project has no groups at all so the board still has somewhere to add tasks),
// then one column per group in the order provided. Tasks keep their incoming
// order within a column.
function buildGroupColumns(groups, tasks) {
  const ungrouped = { id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] };
  const byId = new Map(
    groups.map(g => [g.id, { id: g.id, name: g.name, color: g.color, tasks: [] }])
  );
  for (const task of tasks) {
    const col = task.groupId != null && byId.has(task.groupId) ? byId.get(task.groupId) : ungrouped;
    col.tasks.push(task);
  }
  const columns = groups.map(g => byId.get(g.id));
  // Hide the empty "Ungrouped" column, unless there are no groups to fall back on.
  if (ungrouped.tasks.length > 0 || groups.length === 0) {
    columns.unshift(ungrouped);
  }
  return columns;
}

module.exports = { buildGroupColumns };
