// Tag filter for kanban
const activeTagFilters = new Set();

function toggleTagFilter(btn) {
  const tagName = btn.dataset.tagName;
  if (activeTagFilters.has(tagName)) {
    activeTagFilters.delete(tagName);
    btn.classList.remove('active');
  } else {
    activeTagFilters.add(tagName);
    btn.classList.add('active');
  }
  applyTagFilters();
}

function clearTagFilters() {
  activeTagFilters.clear();
  document.querySelectorAll('.sidebar-tag-btn').forEach(b => b.classList.remove('active'));
  applyTagFilters();
}

function applyTagFilters() {
  const clearBtn = document.querySelector('.sidebar-clear-filters');

  // Filter both board cards and list rows
  const items = document.querySelectorAll('.task-card, .list-row');

  if (activeTagFilters.size === 0) {
    items.forEach(el => { el.classList.remove('hidden'); });
    if (clearBtn) clearBtn.classList.add('hidden');
  } else {
    if (clearBtn) clearBtn.classList.remove('hidden');
    items.forEach(el => {
      const tags = (el.dataset.tags || '').split(',').filter(Boolean);
      el.classList.toggle('hidden', !tags.some(t => activeTagFilters.has(t)));
    });
  }

  // Update column counts
  document.querySelectorAll('.tasks-list').forEach(list => {
    const visible = list.querySelectorAll('.task-card:not(.hidden)').length;
    const col = list.closest('.kanban-column');
    if (col) {
      const badge = col.querySelector('.column-count');
      if (badge) badge.textContent = visible;
    }
  });
}
