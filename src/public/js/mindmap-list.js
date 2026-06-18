function mmProjectId() { return document.getElementById('mmProjectId').value; }
function mmProjectSlug() { return document.getElementById('mmProjectSlug').value; }

async function createMindmap() {
  const name = await mmPrompt('New mindmap name', '', 'Create');
  if (!name) return;
  const res = await fetch('/api/mindmaps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: mmProjectId(), name }),
  });
  const data = await res.json();
  if (data.success) window.location.href = `/projects/${mmProjectSlug()}/mindmaps/${data.mindmap.id}`;
  else mmToast(data.error || 'Failed to create mindmap', 'error');
}

async function renameMindmap(id, current) {
  const name = await mmPrompt('Rename mindmap', current);
  if (!name) return;
  const res = await fetch(`/api/mindmaps/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if ((await res.json()).success) window.location.reload();
  else mmToast('Failed to rename', 'error');
}

async function deleteMindmap(id) {
  if (!(await mmConfirm('Delete this mindmap and all its nodes?'))) return;
  const res = await fetch(`/api/mindmaps/${id}`, { method: 'DELETE' });
  if ((await res.json()).success) {
    const card = document.querySelector(`.mm-card[data-mm-id="${id}"]`);
    if (card) card.remove();
  } else {
    mmToast('Failed to delete', 'error');
  }
}
