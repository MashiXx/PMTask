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

  if (activeTagFilters.size === 0) {
    // Show all
    document.querySelectorAll('.task-card').forEach(card => {
      card.style.display = '';
    });
    if (clearBtn) clearBtn.style.display = 'none';
  } else {
    if (clearBtn) clearBtn.style.display = 'block';
    document.querySelectorAll('.task-card').forEach(card => {
      const cardTags = (card.dataset.tags || '').split(',').filter(Boolean);
      const matches = cardTags.some(t => activeTagFilters.has(t));
      card.style.display = matches ? '' : 'none';
    });
  }

  // Update column counts
  document.querySelectorAll('.tasks-list').forEach(list => {
    const visible = list.querySelectorAll('.task-card:not([style*="display: none"])').length;
    const col = list.closest('.kanban-column');
    if (col) {
      const badge = col.querySelector('.column-count');
      if (badge) badge.textContent = visible;
    }
  });
}
