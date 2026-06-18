function mmProjectId() { return document.getElementById('mmProjectId').value; }
function mmProjectSlug() { return document.getElementById('mmProjectSlug').value; }

async function createMindmap() {
  const name = prompt('Mindmap name:');
  if (!name || !name.trim()) return;
  const res = await fetch('/api/mindmaps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: mmProjectId(), name: name.trim() }),
  });
  const data = await res.json();
  if (data.success) window.location.href = `/projects/${mmProjectSlug()}/mindmaps/${data.mindmap.id}`;
  else alert(data.error || 'Failed to create mindmap');
}

async function renameMindmap(id, current) {
  const name = prompt('Rename mindmap:', current);
  if (!name || !name.trim()) return;
  const res = await fetch(`/api/mindmaps/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  if ((await res.json()).success) window.location.reload();
}

async function deleteMindmap(id) {
  if (!confirm('Delete this mindmap and all its nodes?')) return;
  const res = await fetch(`/api/mindmaps/${id}`, { method: 'DELETE' });
  if ((await res.json()).success) {
    const card = document.querySelector(`.mm-card[data-mm-id="${id}"]`);
    if (card) card.remove();
  }
}
