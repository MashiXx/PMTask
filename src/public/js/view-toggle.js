// View toggle: board / list
function switchView(mode) {
  const board = document.querySelector('.kanban-board');
  const list = document.getElementById('listView');
  if (!board || !list) return;

  if (mode === 'list') {
    board.classList.add('hidden');
    list.classList.remove('hidden');
  } else {
    board.classList.remove('hidden');
    list.classList.add('hidden');
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });

  localStorage.setItem('pmtask-view', mode);
}

// Restore saved view on load
(function() {
  const saved = localStorage.getItem('pmtask-view');
  if (saved === 'list') {
    switchView('list');
  }
})();
