const searchInput = document.getElementById('searchInput');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    document.querySelectorAll('.task-card').forEach(card => {
      const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
      const tags = Array.from(card.querySelectorAll('.tag-badge'))
        .map(t => t.textContent.toLowerCase()).join(' ');
      card.classList.toggle('hidden', query && !title.includes(query) && !tags.includes(query));
    });

    document.querySelectorAll('.list-row').forEach(row => {
      const title = row.querySelector('.list-task-name')?.textContent.toLowerCase() || '';
      const tags = (row.dataset.tags || '').toLowerCase();
      row.classList.toggle('hidden', query && !title.includes(query) && !tags.includes(query));
    });
  });
}
