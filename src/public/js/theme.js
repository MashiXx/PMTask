// Theme cycle: system -> light -> dark -> system
function cycleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'system';

  let next;
  if (current === 'system') {
    // If OS is dark, user probably wants light next; if OS is light, want dark
    const osLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    next = osLight ? 'dark' : 'light';
  } else if (current === 'light') {
    next = 'dark';
  } else {
    next = 'system';
  }

  html.setAttribute('data-theme', next);
  localStorage.setItem('pmtask-theme', next);

  // Save to server if logged in
  fetch('/profile/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: next }),
  }).catch(() => {}); // Silently fail for guests
}
