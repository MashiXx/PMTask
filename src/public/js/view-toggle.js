// View toggle: board / list (header buttons)
// Group by: status / tag (sidebar buttons)
// Hide completed: toggle (sidebar checkbox)

function switchView(mode) {
  const boardStatus = document.querySelector('.kanban-board:not(#kanbanTagView)');
  const boardTag = document.getElementById('kanbanTagView');
  const list = document.getElementById('listView');
  if (!boardStatus || !boardTag || !list) return;

  const groupBy = localStorage.getItem('pmtask-group') || 'status';

  boardStatus.classList.add('hidden');
  boardTag.classList.add('hidden');
  list.classList.add('hidden');

  if (mode === 'list') {
    list.classList.remove('hidden');
  } else {
    // board mode — pick which board based on group-by
    if (groupBy === 'tag') {
      boardTag.classList.remove('hidden');
    } else {
      boardStatus.classList.remove('hidden');
    }
  }

  document.querySelectorAll('.view-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });

  localStorage.setItem('pmtask-view', mode);
}

function setGroupBy(group) {
  localStorage.setItem('pmtask-group', group);

  // Update sidebar buttons
  document.querySelectorAll('.sidebar-groupby-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.group === group);
  });

  // Switch sidebar filters
  const tagFilters = document.getElementById('sidebarTagFilters');
  const statusFilters = document.getElementById('sidebarStatusFilters');
  if (tagFilters && statusFilters) {
    if (group === 'tag') {
      tagFilters.classList.add('hidden');
      statusFilters.classList.remove('hidden');
    } else {
      tagFilters.classList.remove('hidden');
      statusFilters.classList.add('hidden');
    }
  }

  // Clear active filters when switching
  clearAllFilters();

  // Re-apply current view
  const currentView = localStorage.getItem('pmtask-view') || 'board';
  switchView(currentView);

  // Re-apply hide completed
  const hide = localStorage.getItem('pmtask-hide-completed') === 'true';
  applyCompletedFilter(hide);
}

// Toggle completed tasks visibility
function toggleCompletedTasks() {
  const checkbox = document.getElementById('hideCompletedCheck');
  const hide = checkbox ? checkbox.checked : false;
  localStorage.setItem('pmtask-hide-completed', String(hide));
  applyCompletedFilter(hide);
}

function applyCompletedFilter(hide) {
  // Board by status: hide/show the "done" column
  document.querySelectorAll('.kanban-board:not(#kanbanTagView) .kanban-column').forEach(col => {
    const list = col.querySelector('.tasks-list');
    if (list && list.dataset.status === 'done') {
      col.style.display = hide ? 'none' : '';
    }
  });

  // Board by tag: hide/show task cards with status "done"
  document.querySelectorAll('#kanbanTagView .task-card').forEach(card => {
    if (card.dataset.status === 'done') {
      card.style.display = hide ? 'none' : '';
    }
  });
  // Update tag column counts
  document.querySelectorAll('#kanbanTagView .kanban-column').forEach(col => {
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
  // Restore group-by
  const savedGroup = localStorage.getItem('pmtask-group') || 'status';
  document.querySelectorAll('.sidebar-groupby-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.group === savedGroup);
  });
  const tagFilters = document.getElementById('sidebarTagFilters');
  const statusFilters = document.getElementById('sidebarStatusFilters');
  if (tagFilters && statusFilters) {
    if (savedGroup === 'tag') {
      tagFilters.classList.add('hidden');
      statusFilters.classList.remove('hidden');
    } else {
      tagFilters.classList.remove('hidden');
      statusFilters.classList.add('hidden');
    }
  }

  // Restore view
  const savedView = localStorage.getItem('pmtask-view') || 'board';
  switchView(savedView);

  // Restore hide completed
  const hideCompleted = localStorage.getItem('pmtask-hide-completed') === 'true';
  const checkbox = document.getElementById('hideCompletedCheck');
  if (checkbox) checkbox.checked = hideCompleted;
  if (hideCompleted) applyCompletedFilter(true);
})();
