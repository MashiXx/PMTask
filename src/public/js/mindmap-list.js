function mmProjectId() { return document.getElementById('mmProjectId').value; }
function mmProjectSlug() { return document.getElementById('mmProjectSlug').value; }

async function createMindmap() {
  const name = await mmPrompt(t('js.mindmap.newMindmapName'), '', t('js.mindmap.create'));
  if (!name) return;
  const res = await fetch('/api/mindmaps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: mmProjectId(), name }),
  });
  const data = await res.json();
  if (data.success) window.location.href = `/projects/${mmProjectSlug()}/mindmaps/${data.mindmap.id}`;
  else mmToast(data.error || t('js.mindmap.failedCreateMindmap'), 'error');
}

async function renameMindmap(id, current) {
  const name = await mmPrompt(t('js.mindmap.renameMindmap'), current);
  if (!name) return;
  const res = await fetch(`/api/mindmaps/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if ((await res.json()).success) window.location.reload();
  else mmToast(t('js.mindmap.failedRename'), 'error');
}

async function deleteMindmap(id) {
  if (!(await mmConfirm(t('js.mindmap.confirmDeleteMindmap')))) return;
  const res = await fetch(`/api/mindmaps/${id}`, { method: 'DELETE' });
  if ((await res.json()).success) {
    const card = document.querySelector(`.mm-card[data-mm-id="${id}"]`);
    if (card) card.remove();
  } else {
    mmToast(t('js.mindmap.failedDelete'), 'error');
  }
}
