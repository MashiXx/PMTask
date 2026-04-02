const searchInput = document.getElementById('searchInput');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    // Search board cards
    document.querySelectorAll('.task-card').forEach(card => {
      const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
      const tags = Array.from(card.querySelectorAll('.tag-badge'))
        .map(t => t.textContent.toLowerCase()).join(' ');
      card.style.display = !query || title.includes(query) || tags.includes(query) ? '' : 'none';
    });

    // Search list rows
    document.querySelectorAll('.list-row').forEach(row => {
      const title = row.querySelector('.list-task-name')?.textContent.toLowerCase() || '';
      const tags = (row.dataset.tags || '').toLowerCase();
      row.style.display = !query || title.includes(query) || tags.includes(query) ? '' : 'none';
    });
  });
}
