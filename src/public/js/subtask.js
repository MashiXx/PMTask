// ── Subtask management for Preview Modal and Detail Page ──

// Preview modal subtask functions
function renderPreviewSubtasks(subtasks, isGuest) {
  const list = document.getElementById('previewSubtaskList');
  const countEl = document.getElementById('previewSubtaskCount');
  const addEl = document.getElementById('previewSubtaskAdd');

  if (!list) return;

  const doneCount = subtasks.filter(s => s.done).length;
  const total = subtasks.length;

  // Update count badge
  if (countEl) {
    countEl.textContent = total > 0 ? `${doneCount}/${total}` : '';
  }

  // Show/hide add input
  if (addEl) {
    addEl.classList.toggle('hidden', isGuest);
  }

  if (total === 0) {
    list.innerHTML = '';
    return;
  }

  // Progress bar + items
  // Formula: doneSubtasks / (totalSubtasks + 1); parent task completion = 100%
  const percent = (typeof previewTaskStatus !== 'undefined' && previewTaskStatus === 'done') ? 100 : Math.round(doneCount / (total + 1) * 100);
  list.innerHTML =
    `<div class="subtask-progress-bar mb-8">
      <div class="subtask-progress-fill" style="width:${percent}%;"></div>
    </div>` +
    subtasks.map(sub => `
      <div class="subtask-item ${sub.done ? 'done' : ''}" data-subtask-id="${sub.id}">
        <label class="subtask-check">
          <input type="checkbox" ${sub.done ? 'checked' : ''} ${isGuest ? 'disabled' : ''}
            onchange="togglePreviewSubtask(${sub.id}, this.checked)">
          <span class="subtask-checkmark"></span>
        </label>
        <span class="subtask-title">${sub.title}</span>
        ${!isGuest ? `<button class="subtask-delete-btn" onclick="deletePreviewSubtask(${sub.id})">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>` : ''}
      </div>
    `).join('');
}

async function togglePreviewSubtask(id, done) {
  try {
    await fetch(`/api/subtasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    // Reload subtasks for this task
    await refreshPreviewSubtasks();
  } catch (err) {
    console.error('Failed to toggle subtask:', err);
  }
}

async function addPreviewSubtask() {
  const input = document.getElementById('previewSubtaskInput');
  const title = input.value.trim();
  if (!title || !previewTaskId) return;

  try {
    await fetch(`/api/subtasks/task/${previewTaskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    input.value = '';
    await refreshPreviewSubtasks();
  } catch (err) {
    console.error('Failed to add subtask:', err);
  }
}

async function deletePreviewSubtask(id) {
  try {
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' });
    await refreshPreviewSubtasks();
  } catch (err) {
    console.error('Failed to delete subtask:', err);
  }
}

async function refreshPreviewSubtasks() {
  if (!previewTaskId) return;
  try {
    const res = await fetch(`/api/subtasks/task/${previewTaskId}`);
    const subtasks = await res.json();
    renderPreviewSubtasks(subtasks, window.IS_GUEST);
  } catch (err) {
    console.error('Failed to refresh subtasks:', err);
  }
}

// ── Detail page subtask functions ──
async function toggleDetailSubtask(id, done) {
  try {
    await fetch(`/api/subtasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    // Update DOM
    const item = document.querySelector(`.subtask-item[data-subtask-id="${id}"]`);
    if (item) item.classList.toggle('done', done);
    updateDetailSubtaskProgress();
  } catch (err) {
    console.error('Failed to toggle subtask:', err);
  }
}

async function addDetailSubtask() {
  const input = document.getElementById('detailSubtaskInput');
  if (!input) return;
  const title = input.value.trim();
  if (!title) return;

  const list = document.getElementById('detailSubtaskList');
  const taskId = list?.dataset.taskId;
  if (!taskId) return;

  try {
    const res = await fetch(`/api/subtasks/task/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const sub = await res.json();
    input.value = '';

    // Append to DOM
    const div = document.createElement('div');
    div.className = 'subtask-item';
    div.dataset.subtaskId = sub.id;
    div.innerHTML = `
      <label class="subtask-check">
        <input type="checkbox" onchange="toggleDetailSubtask(${sub.id}, this.checked)">
        <span class="subtask-checkmark"></span>
      </label>
      <span class="subtask-title">${sub.title}</span>
      <button class="subtask-delete-btn" onclick="deleteDetailSubtask(${sub.id})">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    list.appendChild(div);
    updateDetailSubtaskProgress();
  } catch (err) {
    console.error('Failed to add subtask:', err);
  }
}

async function deleteDetailSubtask(id) {
  try {
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' });
    const item = document.querySelector(`.subtask-item[data-subtask-id="${id}"]`);
    if (item) item.remove();
    updateDetailSubtaskProgress();
  } catch (err) {
    console.error('Failed to delete subtask:', err);
  }
}

function updateDetailSubtaskProgress() {
  const items = document.querySelectorAll('#detailSubtaskList .subtask-item');
  const total = items.length;
  const done = document.querySelectorAll('#detailSubtaskList .subtask-item.done').length;

  // Update count badge
  const badge = document.querySelector('.task-detail-section .subtask-count-badge');
  if (badge) badge.textContent = total > 0 ? `${done}/${total}` : '';

  // Update progress bar (formula: done / (total + 1); only status=done gives 100%)
  const fill = document.querySelector('.task-detail-section .subtask-progress-fill');
  const detailTaskStatus = document.getElementById('detailSubtaskList')?.dataset.taskStatus;
  const detailPercent = detailTaskStatus === 'done' ? 100 : Math.round(done / (total + 1) * 100);
  if (fill) fill.style.width = total > 0 ? detailPercent + '%' : '0%';
}
