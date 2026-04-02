// View toggle: board / list
function switchView(mode) {
  const board = document.querySelector('.kanban-board');
  const list = document.getElementById('listView');
  if (!board || !list) return;

  if (mode === 'list') {
    board.style.display = 'none';
    list.style.display = 'block';
  } else {
    board.style.display = '';
    list.style.display = 'none';
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
