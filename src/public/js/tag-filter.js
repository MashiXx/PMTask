// Board/list filters — tag chips and the header Filters popover
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
  applyFilters();
}

function clearAllFilters() {
  activeTagFilters.clear();
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  applyFilters();
}

// Kept for backward compat
function clearTagFilters() { clearAllFilters(); }

function applyFilters() {
  const hasTagFilters = activeTagFilters.size > 0;
  document.querySelectorAll('.filter-clear').forEach(btn => btn.classList.toggle('hidden', !hasTagFilters));

  // Filter both board cards and list rows by tag
  const items = document.querySelectorAll('.task-card, .list-row');
  if (!hasTagFilters) {
    items.forEach(el => el.classList.remove('filter-hidden'));
  } else {
    items.forEach(el => {
      const tags = (el.dataset.tags || '').split(',').filter(Boolean);
      el.classList.toggle('filter-hidden', !tags.some(t => activeTagFilters.has(t)));
    });
  }

  // Update column counts (visible cards only)
  document.querySelectorAll('.tasks-list').forEach(list => {
    const visible = list.querySelectorAll('.task-card:not(.filter-hidden)').length;
    const col = list.closest('.kanban-column');
    if (col) {
      const badge = col.querySelector('.column-count');
      if (badge) badge.textContent = visible;
    }
  });

  updateFilterCount();
}

// Active-filter count shown on the header Filters button
function updateFilterCount() {
  const badge = document.getElementById('filterCount');
  if (!badge) return;
  const hideCompleted = document.getElementById('hideCompletedCheck');
  const count = activeTagFilters.size + (hideCompleted && hideCompleted.checked ? 1 : 0);
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
  const btn = document.getElementById('filterBtn');
  if (btn) btn.classList.toggle('has-filters', count > 0);
}

// ── Filters popover open/close ──
function toggleFilterPopover(event) {
  if (event) event.stopPropagation();
  const pop = document.getElementById('filterPopover');
  const btn = document.getElementById('filterBtn');
  if (!pop) return;
  const open = pop.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeFilterPopover() {
  const pop = document.getElementById('filterPopover');
  if (!pop || !pop.classList.contains('open')) return;
  pop.classList.remove('open');
  const btn = document.getElementById('filterBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// Close on outside click (clicks inside .filter-wrap keep it open)
document.addEventListener('click', (e) => {
  if (!e.target.closest('.filter-wrap')) closeFilterPopover();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFilterPopover();
});

// Reflect any restored state (e.g. hide-completed) in the count on load
document.addEventListener('DOMContentLoaded', updateFilterCount);
