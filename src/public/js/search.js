const searchInput = document.getElementById('searchInput');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.task-card');

    cards.forEach(card => {
      const title = card.querySelector('.task-title')?.textContent.toLowerCase() || '';
      const tags = Array.from(card.querySelectorAll('.tag-badge'))
        .map(t => t.textContent.toLowerCase()).join(' ');

      const match = !query || title.includes(query) || tags.includes(query);
      card.style.display = match ? '' : 'none';
    });
  });
}
