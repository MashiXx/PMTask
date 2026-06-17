// Build ordered board columns from a project's groups and its tasks.
// Always returns an "Ungrouped" column first, then one column per group
// in the order provided. Tasks keep their incoming order within a column.
function buildGroupColumns(groups, tasks) {
  const ungrouped = { id: 'ungrouped', name: 'Ungrouped', color: '#6B6B8E', tasks: [] };
  const byId = new Map(
    groups.map(g => [g.id, { id: g.id, name: g.name, color: g.color, tasks: [] }])
  );
  for (const task of tasks) {
    const col = task.groupId != null && byId.has(task.groupId) ? byId.get(task.groupId) : ungrouped;
    col.tasks.push(task);
  }
  return [ungrouped, ...groups.map(g => byId.get(g.id))];
}

module.exports = { buildGroupColumns };
