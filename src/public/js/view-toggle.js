// View toggle: board / list (header buttons)
// Hide completed: toggle (sidebar checkbox) — filters tasks with status "done"

function switchView(mode) {
  const board = document.querySelector('.kanban-board');
  const list = document.getElementById('listView');
  if (!board || !list) return;

  board.classList.toggle('hidden', mode === 'list');
  list.classList.toggle('hidden', mode !== 'list');

  document.querySelectorAll('.view-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  localStorage.setItem('pmtask-view', mode);
}

// Toggle completed tasks visibility
function toggleCompletedTasks() {
  const checkbox = document.getElementById('hideCompletedCheck');
  const hide = checkbox ? checkbox.checked : false;
  localStorage.setItem('pmtask-hide-completed', String(hide));
  applyCompletedFilter(hide);
}

function applyCompletedFilter(hide) {
  // Board (grouped by custom group): hide/show individual "done" cards
  document.querySelectorAll('.kanban-board .task-card').forEach(card => {
    if (card.dataset.status === 'done') {
      card.style.display = hide ? 'none' : '';
    }
  });
  // Update column counts to reflect visible cards
  document.querySelectorAll('.kanban-board .kanban-column').forEach(col => {
    const list = col.querySelector('.tasks-list');
    if (!list) return;
    const visible = list.querySelectorAll('.task-card' + (hide ? ':not([data-status="done"])' : '')).length;
    const badge = col.querySelector('.column-count');
    if (badge) badge.textContent = visible;
  });

  // List view: hide/show rows with status "done"
  document.querySelectorAll('#listView .list-row').forEach(row => {
    if (row.dataset.status === 'done') {
      row.style.display = hide ? 'none' : '';
    }
  });
}

// Restore saved state on load
(function() {
  const savedView = localStorage.getItem('pmtask-view') || 'board';
  switchView(savedView);

  const hideCompleted = localStorage.getItem('pmtask-hide-completed') === 'true';
  const checkbox = document.getElementById('hideCompletedCheck');
  if (checkbox) checkbox.checked = hideCompleted;
  if (hideCompleted) applyCompletedFilter(true);
})();
