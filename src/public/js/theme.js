// Theme toggle: light <-> dark
function cycleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Apply a specific theme by name
function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  localStorage.setItem('pmtask-theme', theme);

  // Update active state on theme picker cards if present
  document.querySelectorAll('.theme-picker-card').forEach(function(card) {
    card.classList.toggle('active', card.dataset.theme === theme);
  });

  // Save to server if logged in
  fetch('/profile/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: theme }),
  }).catch(function() {}); // Silently fail for guests
}
