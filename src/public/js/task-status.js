// Open/close the per-card status dropdown
function toggleStatusMenu(taskId) {
  const menu = document.getElementById(`status-menu-${taskId}`);
  if (!menu) return;
  const open = menu.classList.contains('open');
  document.querySelectorAll('.task-status-menu.open').forEach(m => m.classList.remove('open'));
  if (!open) menu.classList.add('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-status-wrap')) {
    document.querySelectorAll('.task-status-menu.open').forEach(m => m.classList.remove('open'));
  }
});

async function changeTaskStatus(taskId, status) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('status update failed');
    window.location.reload();
  } catch (err) {
    console.error('Failed to change status:', err);
    window.location.reload();
  }
}
