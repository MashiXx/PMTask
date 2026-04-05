// Theme cycle: system -> light -> dark -> vintage -> vintage-dark -> system
function cycleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'system';

  const cycle = ['system', 'light', 'dark', 'vintage', 'vintage-dark'];
  let idx = cycle.indexOf(current);
  let next;

  if (current === 'system') {
    const osLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    next = osLight ? 'dark' : 'light';
  } else {
    next = cycle[(idx + 1) % cycle.length];
  }

  applyTheme(next);
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
