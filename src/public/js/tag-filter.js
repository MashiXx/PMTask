// Sidebar filters for kanban — tags and statuses
const activeTagFilters = new Set();
const activeStatusFilters = new Set();

function toggleTagFilter(btn) {
  const tagName = btn.dataset.tagName;
  if (activeTagFilters.has(tagName)) {
    activeTagFilters.delete(tagName);
    btn.classList.remove('active');
  } else {
    activeTagFilters.add(tagName);
    btn.classList.add('active');
  }
  applyFilters();
}

function toggleStatusFilter(btn) {
  const statusName = btn.dataset.statusName;
  if (activeStatusFilters.has(statusName)) {
    activeStatusFilters.delete(statusName);
    btn.classList.remove('active');
  } else {
    activeStatusFilters.add(statusName);
    btn.classList.add('active');
  }
  applyFilters();
}

function clearAllFilters() {
  activeTagFilters.clear();
  activeStatusFilters.clear();
  document.querySelectorAll('.sidebar-tag-btn').forEach(b => b.classList.remove('active'));
  applyFilters();
}

// Kept for backward compat
function clearTagFilters() { clearAllFilters(); }

function applyFilters() {
  const clearBtns = document.querySelectorAll('.sidebar-clear-filters');
  const hasFilters = activeTagFilters.size > 0 || activeStatusFilters.size > 0;

  clearBtns.forEach(btn => btn.classList.toggle('hidden', !hasFilters));

  // Filter both board cards and list rows
  const items = document.querySelectorAll('.task-card, .list-row');

  if (!hasFilters) {
    items.forEach(el => { el.classList.remove('filter-hidden'); });
  } else {
    items.forEach(el => {
      let matchTag = true;
      let matchStatus = true;

      if (activeTagFilters.size > 0) {
        const tags = (el.dataset.tags || '').split(',').filter(Boolean);
        matchTag = tags.some(t => activeTagFilters.has(t));
      }

      if (activeStatusFilters.size > 0) {
        matchStatus = activeStatusFilters.has(el.dataset.status);
      }

      el.classList.toggle('filter-hidden', !(matchTag && matchStatus));
    });
  }

  // Update column counts
  document.querySelectorAll('.tasks-list').forEach(list => {
    const visible = list.querySelectorAll('.task-card:not(.filter-hidden)').length;
    const col = list.closest('.kanban-column');
    if (col) {
      const badge = col.querySelector('.column-count');
      if (badge) badge.textContent = visible;
    }
  });
}
