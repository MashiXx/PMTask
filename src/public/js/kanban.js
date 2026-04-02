document.querySelectorAll('.tasks-list').forEach(list => {
  new Sortable(list, {
    group: 'kanban',
    animation: 200,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    draggable: '.task-card',
    onEnd: async function(evt) {
      const taskId = evt.item.dataset.taskId;
      const newStatus = evt.to.dataset.status;
      const newIndex = evt.newIndex;

      try {
        await fetch(`/api/tasks/${taskId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus, position: newIndex }),
        });

        updateColumnCounts();

        if (newStatus === 'done') {
          const progressFill = evt.item.querySelector('.task-progress-fill');
          const progressValue = evt.item.querySelector('.task-progress-value');
          if (progressFill) {
            progressFill.style.width = '100%';
            progressFill.style.background = '#00F5A0';
          }
          if (progressValue) {
            progressValue.textContent = '100%';
            progressValue.style.color = '#00F5A0';
          }
        }
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
