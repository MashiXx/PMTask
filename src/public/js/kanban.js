if (window.IS_GUEST) { /* skip drag setup for guests */ } else
document.querySelectorAll('.tasks-list').forEach(list => {
  new Sortable(list, {
    group: 'kanban',
    animation: 200,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    draggable: '.task-card',
    handle: '.task-drag-handle',
    onEnd: async function(evt) {
      const taskId = evt.item.dataset.taskId;
      const groupId = evt.to.dataset.groupId; // 'ungrouped' or numeric string
      const newIndex = evt.newIndex;
      try {
        await fetch(`/api/tasks/${taskId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId, position: newIndex }),
        });
        evt.item.dataset.groupId = groupId === 'ungrouped' ? '' : groupId;
        updateColumnCounts();
      } catch (err) {
        console.error('Failed to move task:', err);
        window.location.reload();
      }
    },
  });
});

function updateColumnCounts() {
  document.querySelectorAll('.kanban-column').forEach(col => {
    const list = col.querySelector('.tasks-list');
    const count = list.querySelectorAll('.task-card').length;
    const countBadge = col.querySelector('.column-count');
    if (countBadge) countBadge.textContent = count;
  });
}
