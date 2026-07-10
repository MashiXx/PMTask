function mmProjectId() { return document.getElementById('mmProjectId').value; }
function mmProjectSlug() { return document.getElementById('mmProjectSlug').value; }

// Modal that lets the user pick a diagram type. Resolves to
// 'mindmap' | 'flowchart' | 'architecture', or null if cancelled.
function mmPickType() {
  return new Promise((resolve) => {
    const types = [
      { key: 'mindmap', label: t('diagram.typeMindmap') },
      { key: 'flowchart', label: t('diagram.typeFlowchart') },
      { key: 'architecture', label: t('diagram.typeArchitecture') },
    ];
    const overlay = document.createElement('div');
    overlay.className = 'mm-dialog-overlay';
    overlay.innerHTML = `
      <div class="mm-dialog" role="dialog" aria-modal="true">
        <div class="mm-dialog-title">${t('js.diagram.chooseType')}</div>
        <div class="mm-type-choices">
          ${types.map(ty => `<button class="mm-type-choice" data-type="${ty.key}">${ty.label}</button>`).join('')}
        </div>
        <div class="mm-dialog-actions">
          <button class="mm-dialog-cancel" type="button">${t('js.mindmap.cancel')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    function close(result) { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
    overlay.querySelectorAll('.mm-type-choice').forEach(b => { b.onclick = () => close(b.dataset.type); });
    overlay.querySelector('.mm-dialog-cancel').onclick = () => close(null);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    function onKey(e) { if (e.key === 'Escape') close(null); }
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}

async function createMindmap() {
  const type = await mmPickType();
  if (!type) return;
  const name = await mmPrompt(t('js.diagram.newName'), '', t('js.mindmap.create'));
  if (!name) return;
  const res = await fetch('/api/mindmaps', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: mmProjectId(), name, type }),
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
