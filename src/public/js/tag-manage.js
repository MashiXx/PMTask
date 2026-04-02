// Tag Manager
let currentProjectId = null;

function openTagManager() {
  const pid = document.getElementById('taskProjectId');
  currentProjectId = pid ? pid.value : null;
  if (!currentProjectId) return;

  loadTagList();

  // Init color swatch selection
  document.querySelectorAll('#tagManagerModal input[name="newTagColor"]').forEach(radio => {
    radio.addEventListener('change', updateTagSwatches);
  });
  updateTagSwatches();

  document.getElementById('tagManagerModal').classList.add('active');
  document.getElementById('newTagName').value = '';
}

function closeTagManager() {
  document.getElementById('tagManagerModal').classList.remove('active');
  window.location.reload();
}

function updateTagSwatches() {
  document.querySelectorAll('#tagManagerModal .color-swatch').forEach(swatch => {
    const radio = swatch.parentElement.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      swatch.style.borderColor = swatch.dataset.color;
      swatch.style.boxShadow = '0 0 6px ' + swatch.dataset.color + '55';
    } else {
      swatch.style.borderColor = 'transparent';
      swatch.style.boxShadow = 'none';
    }
  });
}

async function loadTagList() {
  try {
    const res = await fetch(`/api/tags?projectId=${currentProjectId}`);
    const tags = await res.json();
    const list = document.getElementById('tagList');

    if (tags.length === 0) {
      list.innerHTML = '<p style="font-family:var(--font-mono); font-size:0.8rem; color:var(--text-muted); text-align:center; padding:12px;">No tags yet</p>';
      return;
    }

    list.innerHTML = tags.map(tag => `
      <div class="tag-manager-item" id="tag-item-${tag.id}">
        <span class="tag-dot" style="background:${tag.color};"></span>
        <span class="tag-manager-name">${tag.name.charAt(0).toUpperCase() + tag.name.slice(1)}</span>
        ${tag._count.tasks > 0 ? `<span style="font-size:0.7rem; color:var(--text-muted); margin-left:4px;">${tag._count.tasks} task${tag._count.tasks > 1 ? 's' : ''}</span>` : ''}
        <div style="margin-left:auto; display:flex; gap:4px;">
          <button class="column-add-btn" onclick="deleteTagItem(${tag.id}, '${tag.name.replace(/'/g, "\\'")}', ${tag._count.tasks})" title="Delete" style="padding:4px; color:var(--coral);">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load tags:', err);
  }
}

async function addNewTag() {
  const name = document.getElementById('newTagName').value.trim();
  if (!name) return;
  const color = document.querySelector('#tagManagerModal input[name="newTagColor"]:checked')?.value || '#6C63FF';

  try {
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, projectId: currentProjectId }),
    });
    document.getElementById('newTagName').value = '';
    loadTagList();
  } catch (err) {
    console.error('Failed to add tag:', err);
  }
}

async function deleteTagItem(id, name, taskCount) {
  if (taskCount > 0) {
    const msg = `Tag "${name}" đang được dùng trong ${taskCount} task${taskCount > 1 ? 's' : ''}.\nTag sẽ bị gỡ khỏi tất cả task. Bạn có chắc muốn xoá?`;
    if (!confirm(msg)) return;
  }
  try {
    await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    const item = document.getElementById(`tag-item-${id}`);
    if (item) item.remove();
  } catch (err) {
    console.error('Failed to delete tag:', err);
  }
}
