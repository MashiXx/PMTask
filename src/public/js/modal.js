function openTaskModal(status) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskModalTitle').textContent = t('js.modal.newTask');
  document.getElementById('taskSubmitBtn').textContent = t('js.modal.createTask');
  document.getElementById('taskId').value = '';
  document.getElementById('taskForm').reset();
  if (status) {
    document.getElementById('taskStatus').value = status;
  }
  modal.classList.add('active');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.remove('active');
}

async function openEditModal(taskId) {
  closeAllMenus();
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const task = await res.json();

    document.getElementById('taskModalTitle').textContent = t('js.modal.editTask');
    document.getElementById('taskSubmitBtn').textContent = t('js.modal.saveChanges');
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskStatus').value = task.status;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskProgress').value = task.progress;

    document.querySelectorAll('.tag-checkbox').forEach(cb => cb.checked = false);
    task.tags.forEach(tt => {
      const cb = document.getElementById(`tag-${tt.tag.name.toLowerCase()}`);
      if (cb) cb.checked = true;
    });

    document.getElementById('taskModal').classList.add('active');
  } catch (err) {
    console.error('Failed to load task:', err);
  }
}

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const taskId = document.getElementById('taskId').value;
  const tags = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);

  const data = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    priority: document.getElementById('taskPriority').value,
    status: document.getElementById('taskStatus').value,
    dueDate: document.getElementById('taskDueDate').value,
    progress: document.getElementById('taskProgress').value,
    projectId: document.getElementById('taskProjectId').value,
    tags,
  };

  try {
    const url = taskId ? `/api/tasks/${taskId}` : '/api/tasks';
    const method = taskId ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    closeTaskModal();
    window.location.reload();
  } catch (err) {
    console.error('Failed to save task:', err);
  }
});

function deleteTask(taskId) {
  closeAllMenus();
  document.getElementById('deleteTaskId').value = taskId;
  document.getElementById('deleteModal').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
}

async function confirmDelete() {
  const taskId = document.getElementById('deleteTaskId').value;
  try {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    closeDeleteModal();
    window.location.reload();
  } catch (err) {
    console.error('Failed to delete task:', err);
  }
}

function toggleTaskMenu(taskId) {
  closeAllMenus();
  const menu = document.getElementById(`menu-${taskId}`);
  if (menu) menu.classList.toggle('active');
}

function closeAllMenus() {
  document.querySelectorAll('.task-menu').forEach(m => m.classList.remove('active'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.task-menu-btn') && !e.target.closest('.task-menu')) {
    closeAllMenus();
  }
});

// Preview cover "..." menu (delete card)
function togglePreviewCoverMenu() {
  const menu = document.getElementById('previewCoverMenu');
  if (menu) menu.classList.toggle('open');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('previewCoverMenu');
  if (menu && menu.classList.contains('open') && !e.target.closest('.preview-cover-menu-wrap')) {
    menu.classList.remove('open');
  }
});

// Task Preview Popup
let previewTaskId = null;
let previewTaskStatus = null;
let previewDirty = false;

// Build tagColorMap dynamically from PROJECT_TAGS
const tagColorMap = {};
if (typeof window.PROJECT_TAGS !== 'undefined') {
  window.PROJECT_TAGS.forEach(tag => { tagColorMap[tag.name] = tag.color; });
}

// Inner content for an avatar circle: <img> when the user has an avatar, else initials.
function avatarInner(user) {
  if (user && user.avatar) {
    const src = /^https?:\/\//i.test(user.avatar)
      ? user.avatar
      : '/users/' + user.id + '/avatar' + (user.updatedAt ? '?v=' + new Date(user.updatedAt).getTime() : '');
    return `<img class="avatar-img" src="${src}" alt="">`;
  }
  return (user && user.name) ? user.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : '?';
}

async function openTaskPreview(taskId) {
  closeAllMenus();
  const isGuest = window.IS_GUEST;
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const task = await res.json();
    previewTaskId = task.id;
    previewTaskStatus = task.status;
    previewDirty = false;

    document.getElementById('previewTaskId').value = task.id;
    document.getElementById('previewTitle').value = task.title;
    document.getElementById('previewDescription').value = task.description || '';
    document.getElementById('previewPrioritySelect').value = task.priority;

    const codeEl = document.getElementById('previewTaskCode');
    if (codeEl) codeEl.textContent = 'TASK-' + task.id;
    syncPreviewPriorityPill();
    syncPreviewDone();

    // Render click-to-edit title + markdown description
    renderPreviewTitle(task.title || '', isGuest);
    renderPreviewDescription(task.description || '', isGuest);

    previewCurrentTags = (task.tags || []).map(tt => tt.tag.name);
    renderPreviewTagBadges();

    // Hide tag editor on open
    document.getElementById('previewTagEditor').classList.add('hidden');

    // Build tag pill options
    const optionsEl = document.getElementById('previewTagOptions');
    if (window.PROJECT_TAGS && window.PROJECT_TAGS.length > 0) {
      optionsEl.innerHTML = window.PROJECT_TAGS.map(tag => {
        const isActive = previewCurrentTags.includes(tag.name);
        const label = tag.name.charAt(0).toUpperCase() + tag.name.slice(1);
        return `<span class="preview-tag-pill${isActive ? ' active' : ''}" style="--pill-color:${tag.color}" data-tag="${tag.name}" onclick="togglePreviewTag('${tag.name}')">${label}</span>`;
      }).join('');
    }

    const dueDateWrap = document.getElementById('previewDueDateWrap');
    const dueDateEl = document.getElementById('previewDueDate');
    if (task.dueDate) {
      dueDateEl.textContent = formatPreviewDueDate(task.dueDate);
      dueDateEl.parentElement.classList.remove('preview-date-empty');
    } else {
      dueDateEl.textContent = t('js.modal.dateNone');
      dueDateEl.parentElement.classList.add('preview-date-empty');
    }
    if (dueDateWrap) dueDateWrap.classList.remove('hidden');

    // Checklist percentage (the visible bar is rendered by renderPreviewSubtasks)
    const pText = document.getElementById('previewProgressText');
    if (pText) pText.textContent = task.progress + '%';

    const assigneesEl = document.getElementById('previewAssignees');
    const avatarColors = ['#2D6FE0', '#2B9CD8', '#EF4444', '#1E9E60', '#F59E0B'];
    if (task.assignees && task.assignees.length > 0) {
      assigneesEl.innerHTML = task.assignees.map((a, i) => {
        const c = avatarColors[i % avatarColors.length];
        return `<div class="preview-avatar" style="background:${c}; color:#fff;" title="${a.user.name}">${avatarInner(a.user)}</div>`;
      }).join('');
    } else {
      assigneesEl.innerHTML = '<span class="preview-avatars-empty">' + t('js.modal.noMembers') + '</span>';
    }

    const creatorEl = document.getElementById('previewCreator');
    if (creatorEl) creatorEl.textContent = (task.createdBy && task.createdBy.name) ? task.createdBy.name : '—';
    const createdEl = document.getElementById('previewCreatedAt');
    if (createdEl) createdEl.textContent = task.createdAt ? previewRelativeTime(task.createdAt) : '';

    // Render subtasks
    if (typeof renderPreviewSubtasks === 'function') {
      renderPreviewSubtasks(task.subtasks || [], isGuest);
    }

    // Render attachments (upload/delete disabled for guests)
    if (window.TaskAttachments) {
      window.TaskAttachments.mount({
        container: 'previewAttachmentsList',
        fileInput: 'previewAttachmentInput',
        dropZone: isGuest ? null : 'previewAttachmentDrop',
        taskId: task.id,
        canEdit: !isGuest,
        attachments: task.attachments || [],
      });
    }

    if (window.TaskComments) {
      window.TaskComments.mount({
        container: 'previewComments',
        taskId: task.id,
        canEdit: !isGuest,
        currentUserId: window.CURRENT_USER_ID,
        isAdmin: window.IS_ADMIN,
      });
    }

    document.getElementById('previewDetailsLink').href = '/tasks/' + encodeURIComponent(task.id + '-' + (task.slug || ''));

    // Guest mode: make fields read-only, hide edit/delete actions
    const previewTitle = document.getElementById('previewTitle');
    const previewDesc = document.getElementById('previewDescription');
    const previewPriority = document.getElementById('previewPrioritySelect');
    if (isGuest) {
      previewTitle.readOnly = true;
      previewDesc.readOnly = true;
      previewPriority.disabled = true;
      previewTitle.classList.add('preview-readonly');
      document.querySelectorAll('#taskPreviewModal .preview-auth-btn').forEach(el => el.classList.add('hidden'));
    } else {
      previewTitle.readOnly = false;
      previewDesc.readOnly = false;
      previewPriority.disabled = false;
      previewTitle.classList.remove('preview-readonly');
      document.querySelectorAll('#taskPreviewModal .preview-auth-btn').forEach(el => el.classList.remove('hidden'));
    }

    document.getElementById('taskPreviewModal').classList.add('active');
  } catch (err) {
    console.error('Failed to load task preview:', err);
  }
}

// Reflect the priority <select> value onto the visible coloured pill
function syncPreviewPriorityPill() {
  const sel = document.getElementById('previewPrioritySelect');
  const pill = document.getElementById('previewPriorityPill');
  const txt = document.getElementById('previewPriorityText');
  if (!sel || !pill) return;
  const labels = { low: t('js.priority.low'), medium: t('js.priority.medium'), high: t('js.priority.high') };
  pill.dataset.priority = sel.value;
  if (txt) txt.textContent = labels[sel.value] || sel.value;
}

// Sidebar "Việc cần làm" shortcut → focus the add-subtask input
function focusPreviewSubtask() {
  const input = document.getElementById('previewSubtaskInput');
  if (input) {
    input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus();
  }
}

// "X ngày trước" relative time for the created-by footer
function previewRelativeTime(iso) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return t('js.time.today');
  if (days === 1) return t('js.time.yesterday');
  if (days < 30) return t('js.time.daysAgo', { n: days });
  if (days < 365) return t('js.time.monthsAgo', { n: Math.floor(days / 30) });
  return t('js.time.yearsAgo', { n: Math.floor(days / 365) });
}

// "2025-07-02" → "2 Th7, 2025"
function formatPreviewDueDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim());
  if (!m) return d;
  return parseInt(m[3], 10) + ' Th' + parseInt(m[2], 10) + ', ' + m[1];
}

// ── Mark task as completed (status done ↔ todo) — shared by board, preview, detail ──
async function setTaskStatusRemote(taskId, status) {
  const res = await fetch(`/api/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('status update failed');
  return (await res.json()).task;
}

// Board card completion checkbox
async function toggleCardDone(taskId, done, btn) {
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (btn) btn.classList.toggle('checked', done); // optimistic
  if (card) card.classList.toggle('is-done', done);
  try {
    await setTaskStatusRemote(taskId, done ? 'done' : 'todo');
    if (typeof refreshCardFromAPI === 'function') refreshCardFromAPI(taskId);
    if (typeof refreshListRowsFromAPI === 'function') refreshListRowsFromAPI(taskId);
    if (typeof previewTaskId !== 'undefined' && previewTaskId === taskId) {
      previewTaskStatus = done ? 'done' : 'todo';
      previewDirty = true;
      syncPreviewDone();
      if (typeof refreshPreviewSubtasks === 'function') refreshPreviewSubtasks();
    }
  } catch (err) {
    console.error('Failed to toggle done:', err);
    if (btn) btn.classList.toggle('checked', !done); // revert
    if (card) card.classList.toggle('is-done', !done);
  }
}

// Preview "mark as completed" pill
function syncPreviewDone() {
  const btn = document.getElementById('previewDoneToggle');
  if (!btn) return;
  const done = (typeof previewTaskStatus !== 'undefined' && previewTaskStatus === 'done');
  btn.classList.toggle('is-done', done);
  btn.title = done ? t('js.modal.alreadyDone') : t('js.modal.markDone');
  btn.setAttribute('aria-label', btn.title);
}

async function togglePreviewDone() {
  if (!previewTaskId) return;
  const done = previewTaskStatus !== 'done';
  previewTaskStatus = done ? 'done' : 'todo'; // optimistic
  previewDirty = true;
  syncPreviewDone();
  try {
    await setTaskStatusRemote(previewTaskId, done ? 'done' : 'todo');
    if (typeof refreshPreviewSubtasks === 'function') refreshPreviewSubtasks();
    if (typeof refreshCardFromAPI === 'function') refreshCardFromAPI(previewTaskId);
    if (typeof refreshListRowsFromAPI === 'function') refreshListRowsFromAPI(previewTaskId);
    const card = document.querySelector(`.task-card[data-task-id="${previewTaskId}"]`);
    if (card) card.classList.toggle('is-done', done);
    const check = card && card.querySelector('.card-done-check');
    if (check) check.classList.toggle('checked', done);
  } catch (err) {
    console.error('Failed to toggle done:', err);
    previewTaskStatus = done ? 'todo' : 'done'; // revert
    syncPreviewDone();
  }
}

const priorityColors = { high: '#EF4444', medium: '#F59E0B', low: '#1E9E60' };

async function savePreviewField() {
  if (!previewTaskId) return;
  const title = document.getElementById('previewTitle').value.trim();
  if (!title) return;

  const priority = document.getElementById('previewPrioritySelect').value;

  const data = {
    title,
    description: document.getElementById('previewDescription').value,
    priority,
  };

  try {
    await fetch(`/api/tasks/${previewTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    previewDirty = true;
    updateCardInDOM(previewTaskId, { title, priority });
    // Re-render subtask progress with updated status
    if (typeof refreshPreviewSubtasks === 'function') refreshPreviewSubtasks();
  } catch (err) {
    console.error('Failed to save:', err);
  }
}

function updateCardInDOM(taskId, changes) {
  // Update board view card
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (card) {
    const titleEl = card.querySelector('.task-title');
    if (titleEl && changes.title) titleEl.textContent = changes.title;

    if (changes.priority) {
      const cardPriorityLabels = { high: t('js.priority.badgeHigh'), medium: t('js.priority.badgeMed'), low: t('js.priority.badgeLow') };
      const pColor = priorityColors[changes.priority] || '#F59E0B';
      const badge = card.querySelector('.badge-priority');
      if (badge) {
        badge.style.color = pColor;
        badge.style.background = pColor + '1f';
        badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> ${cardPriorityLabels[changes.priority] || 'MED'}`;
      }
      const line = card.querySelector('.task-priority-line');
      if (line) line.style.background = pColor;
    }

    // Status is a badge on the card now, not a column — update it in place.
    if (changes.status && card.dataset.status !== changes.status) {
      card.dataset.status = changes.status;
      updateCardStatusBadge(card, changes.status);
    }
  }

  // Update list view rows (status view + tag view)
  updateListRowsInDOM(taskId, changes);
}

const listPriorityLabels = { high: t('js.priority.badgeHigh'), medium: t('js.priority.badgeMed'), low: t('js.priority.badgeLow') };
const statusLabelsMap = { todo: t('js.status.todo'), inprogress: t('js.status.inProgress'), review: t('js.status.inReview'), done: t('js.status.done') };
const statusColorsMap = { todo: '#6B6B8E', inprogress: '#2B9CD8', review: '#F59E0B', done: '#1E9E60' };

// Update the per-card status badge in place (status no longer drives columns)
function updateCardStatusBadge(card, status) {
  const badge = card.querySelector('.task-status-badge');
  if (!badge) return;
  const sColor = statusColorsMap[status] || '#6B6B8E';
  const sLabel = statusLabelsMap[status] || t('js.status.todo');
  badge.style.color = sColor;
  badge.style.borderColor = sColor + '55';
  badge.style.background = sColor + '14';
  badge.innerHTML = `<span class="task-status-dot" style="background:${sColor}"></span>${sLabel}`;
}

function updateListRowsInDOM(taskId, changes) {
  const rows = document.querySelectorAll(`.list-row[data-task-id="${taskId}"]`);
  rows.forEach(row => {
    if (changes.title) {
      const nameEl = row.querySelector('.list-task-name');
      if (nameEl) nameEl.textContent = changes.title;
    }

    if (changes.priority) {
      const pColor = priorityColors[changes.priority] || '#F59E0B';
      const dot = row.querySelector('.list-priority-dot');
      if (dot) dot.style.background = pColor;
      const prioCol = row.querySelector('.list-col-priority > div');
      if (prioCol) {
        prioCol.textContent = listPriorityLabels[changes.priority] || 'MED';
        prioCol.style.color = pColor;
      }
    }

  });

  // List rows are grouped by custom group now, so status changes update the
  // row's data-status but never move it between sections.
  if (changes.status) {
    const statusRow = document.querySelector(`#listView .list-row[data-task-id="${taskId}"]`);
    if (statusRow) statusRow.dataset.status = changes.status;
  }
}

// Full card refresh from API — smooth update without page reload
async function refreshCardFromAPI(taskId) {
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (!card) return;

  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const task = await res.json();
    if (!task || task.error) return;

    const cardPriorityLabels = { high: t('js.priority.badgeHigh'), medium: t('js.priority.badgeMed'), low: t('js.priority.badgeLow') };
    const pColor = priorityColors[task.priority] || '#F59E0B';
    const pLabel = cardPriorityLabels[task.priority] || 'MED';
    const progressColor = task.progress === 100 ? '#1E9E60' : task.progress > 60 ? '#2D6FE0' : '#F59E0B';

    // Priority accent line
    const line = card.querySelector('.task-priority-line');
    if (line) line.style.background = pColor;

    // Title
    const titleEl = card.querySelector('.task-title');
    if (titleEl) titleEl.textContent = task.title;

    // Keep data-tags in sync for filtering/search (card shows no tag chips)
    card.dataset.tags = (task.tags || []).map(tt => tt.tag.name).join(',');

    // Ensure the meta row (badges + assignees) exists
    let meta = card.querySelector('.task-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'task-meta';
      meta.innerHTML = '<div class="task-badges"></div>';
      (titleEl || card).after(meta);
    }
    let badges = meta.querySelector('.task-badges');
    if (!badges) {
      badges = document.createElement('div');
      badges.className = 'task-badges';
      meta.prepend(badges);
    }

    // Priority badge — always first in the badges row
    let prio = badges.querySelector('.badge-priority');
    if (!prio) {
      prio = document.createElement('span');
      prio.className = 'task-badge badge-priority';
      badges.prepend(prio);
    }
    prio.style.color = pColor;
    prio.style.background = pColor + '1f';
    prio.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> ${pLabel}`;

    // Due date badge
    let dueEl = badges.querySelector('.badge-due');
    if (task.dueDate) {
      const dueHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${task.dueDate}`;
      if (!dueEl) {
        dueEl = document.createElement('span');
        dueEl.className = 'task-badge badge-due';
        prio.after(dueEl);
      }
      dueEl.innerHTML = dueHTML;
    } else if (dueEl) {
      dueEl.remove();
    }

    // Checklist (subtasks) badge — last in the badges row, green when complete
    let checklist = badges.querySelector('.badge-checklist');
    if (task.subtasks && task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      const total = task.subtasks.length;
      const complete = doneCount === total || task.status === 'done';
      if (!checklist) {
        checklist = document.createElement('span');
        badges.appendChild(checklist);
      }
      checklist.className = 'task-badge badge-checklist' + (complete ? ' is-complete' : '');
      checklist.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> ${doneCount}/${total}`;
    } else if (checklist) {
      checklist.remove();
    }

    // Progress strip — slim bar below the meta row
    let progressEl = card.querySelector('.task-progress-mini');
    if (task.progress > 0) {
      const progressHTML = `
        <div class="task-progress-mini-track"><div class="task-progress-mini-fill" style="width:${task.progress}%; background:${progressColor}; ${task.progress === 100 ? 'box-shadow: 0 0 8px #1E9E6055;' : ''}"></div></div>
        <span class="task-progress-mini-pct" style="color:${progressColor}">${task.progress}%</span>`;
      if (!progressEl) {
        progressEl = document.createElement('div');
        progressEl.className = 'task-progress-mini';
        meta.after(progressEl);
      }
      progressEl.innerHTML = progressHTML;
    } else if (progressEl) {
      progressEl.remove();
    }

    // Status badge (status is a badge on the card, not a column)
    if (card.dataset.status !== task.status) {
      card.dataset.status = task.status;
      updateCardStatusBadge(card, task.status);
    }
  } catch (err) {
    console.error('Failed to refresh card:', err);
  }
}

// Full list-row refresh from API — smooth update without page reload
async function refreshListRowsFromAPI(taskId) {
  const rows = document.querySelectorAll(`.list-row[data-task-id="${taskId}"]`);
  if (rows.length === 0) return;

  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const task = await res.json();
    if (!task || task.error) return;

    const pColor = priorityColors[task.priority] || '#F59E0B';
    const progColor = task.progress === 100 ? '#1E9E60' : task.progress > 60 ? '#2D6FE0' : '#F59E0B';

    rows.forEach(row => {
      // Title
      const nameEl = row.querySelector('.list-task-name');
      if (nameEl) nameEl.textContent = task.title;

      // Priority dot + label
      const dot = row.querySelector('.list-priority-dot');
      if (dot) dot.style.background = pColor;
      const prioCol = row.querySelector('.list-col-priority > div');
      if (prioCol) {
        prioCol.textContent = listPriorityLabels[task.priority] || 'MED';
        prioCol.style.color = pColor;
      }

      // Progress
      const progFill = row.querySelector('.list-progress-fill');
      if (progFill) {
        progFill.style.width = task.progress + '%';
        progFill.style.background = progColor;
      }
      const progText = row.querySelector('.list-col-progress > div:last-child');
      if (progText && !progText.classList.contains('list-progress-track')) {
        progText.textContent = task.progress + '%';
        progText.style.color = progColor;
      }

      // Due date
      const dueCol = row.querySelector('.list-col-due');
      if (dueCol) dueCol.textContent = task.dueDate || '—';

      // Tags (dots in status view)
      const tagsCol = row.querySelector('.list-col-tags');
      if (tagsCol) {
        tagsCol.innerHTML = (task.tags || []).map(tt => {
          const tColor = tt.tag.color || '#6B6B8E';
          return `<div class="list-tag-dot" style="background:${tColor};" title="${tt.tag.name}"></div>`;
        }).join('');
      }

      row.dataset.tags = (task.tags || []).map(tt => tt.tag.name).join(',');
    });

    // List rows are grouped by custom group now — status changes don't move rows.
    const statusRow = document.querySelector(`#listView .list-row[data-task-id="${taskId}"]`);
    if (statusRow) statusRow.dataset.status = task.status;
  } catch (err) {
    console.error('Failed to refresh list rows:', err);
  }
}

// Preview title: shown as a label, click to edit (mirrors the description)
function renderPreviewTitle(title, isGuest) {
  const display = document.getElementById('previewTitleRendered');
  const input = document.getElementById('previewTitle');
  if (!display || !input) return;

  display.classList.remove('hidden');
  input.classList.add('hidden');

  const titleText = (title || '').trim();
  display.textContent = titleText || (isGuest ? t('js.modal.untitled') : t('js.modal.addTitle'));

  if (!isGuest) {
    display.classList.remove('preview-readonly');
    display.onclick = function () {
      display.classList.add('hidden');
      input.classList.remove('hidden');
      input.focus();
      input.select();
    };
  } else {
    display.classList.add('preview-readonly');
    display.onclick = null;
  }
}

// Auto-save on blur for text fields, then return the title to its label view
var _previewTitle = document.getElementById('previewTitle');
if (_previewTitle) {
  _previewTitle.addEventListener('blur', function () {
    savePreviewField().then(function () {
      renderPreviewTitle(document.getElementById('previewTitle').value, window.IS_GUEST);
    });
  });
  _previewTitle.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); _previewTitle.blur(); }
  });
}
// Auto-save on change for selects
var _previewPriority = document.getElementById('previewPrioritySelect');
if (_previewPriority) {
  _previewPriority.addEventListener('change', savePreviewField);
  _previewPriority.addEventListener('change', syncPreviewPriorityPill);
}

// ── Preview Description: Rendered Markdown + Click-to-Edit ──
function renderPreviewDescription(description, isGuest) {
  const rendered = document.getElementById('previewDescRendered');
  const textarea = document.getElementById('previewDescription');
  if (!rendered) return;

  // Always show rendered, hide textarea
  rendered.classList.remove('hidden');
  textarea.classList.add('hidden');

  if (description && description.trim()) {
    const safeHtml = (typeof DOMPurify !== 'undefined' && typeof marked !== 'undefined')
      ? DOMPurify.sanitize(marked.parse(description))
      : description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    rendered.innerHTML = '<div class="markdown-body">' + safeHtml + '</div>';
  } else {
    rendered.innerHTML = isGuest
      ? '<span class="preview-desc-empty">' + t('js.modal.noDescription') + '</span>'
      : '<span class="preview-desc-empty">' + t('js.modal.addDescription') + '</span>';
  }

  // Editable: click to switch to textarea
  if (!isGuest) {
    rendered.style.cursor = 'pointer';
    rendered.onclick = function () {
      rendered.classList.add('hidden');
      textarea.classList.remove('hidden');
      textarea.focus();
    };
  } else {
    rendered.style.cursor = 'default';
    rendered.onclick = null;
  }
}

// Save description on blur, then re-render markdown
var _previewDesc = document.getElementById('previewDescription');
if (_previewDesc) {
  _previewDesc.addEventListener('blur', function () {
    savePreviewField().then(function () {
      const desc = document.getElementById('previewDescription').value;
      renderPreviewDescription(desc, window.IS_GUEST);
    });
  });
}

function closeTaskPreview() {
  document.getElementById('taskPreviewModal').classList.remove('active');
  const coverMenu = document.getElementById('previewCoverMenu');
  if (coverMenu) coverMenu.classList.remove('open');
  // Reset title + description view state back to their label views
  const titleDisplay = document.getElementById('previewTitleRendered');
  const titleInput = document.getElementById('previewTitle');
  if (titleDisplay) titleDisplay.classList.remove('hidden');
  if (titleInput) titleInput.classList.add('hidden');
  const rendered = document.getElementById('previewDescRendered');
  const textarea = document.getElementById('previewDescription');
  if (rendered) rendered.classList.remove('hidden');
  if (textarea) textarea.classList.add('hidden');
  // Refresh card/row in-place if changes were made
  if (previewDirty && previewTaskId) {
    refreshCardFromAPI(previewTaskId);
    refreshListRowsFromAPI(previewTaskId);
  }
  previewTaskId = null;
  previewDirty = false;
}

function previewDelete() {
  const id = previewTaskId;
  closeTaskPreview();
  previewDirty = false;
  if (id) deleteTask(id);
}

function previewEdit() {
  const id = previewTaskId;
  closeTaskPreview();
  if (id) openEditModal(id);
}

// Save any in-progress inline edits, then close the modal
function previewSave() {
  savePreviewField().then(function () {
    closeTaskPreview();
  });
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

// Preview Tag Editor
let previewCurrentTags = [];

function renderPreviewTagBadges() {
  const tagsEl = document.getElementById('previewTags');
  if (!tagsEl) return;
  if (previewCurrentTags.length > 0) {
    tagsEl.innerHTML = previewCurrentTags.map(name => {
      const c = tagColorMap[name] || '#6B6B8E';
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      return `<span class="tag-badge" style="background:${c}18; border:1px solid ${c}35; color:${c};">${label}</span>`;
    }).join('');
  } else {
    tagsEl.innerHTML = '<span style="color:var(--text-dim); font-size:0.75rem;">' + t('js.modal.noTags') + '</span>';
  }
}

function togglePreviewTagEditor() {
  document.getElementById('previewTagEditor').classList.toggle('hidden');
}

async function togglePreviewTag(tagName) {
  if (!previewTaskId) return;
  const idx = previewCurrentTags.indexOf(tagName);
  if (idx >= 0) {
    previewCurrentTags.splice(idx, 1);
  } else {
    previewCurrentTags.push(tagName);
  }

  // Update pill states
  document.querySelectorAll('#previewTagOptions .preview-tag-pill').forEach(pill => {
    if (pill.dataset.tag === tagName) {
      pill.classList.toggle('active');
    }
  });

  renderPreviewTagBadges();

  // Save to API
  try {
    await fetch(`/api/tasks/${previewTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: previewCurrentTags }),
    });
    previewDirty = true;

    // Update card tags in DOM (board view)
    const card = document.querySelector(`.task-card[data-task-id="${previewTaskId}"]`);
    if (card) {
      const cardTags = card.querySelector('.task-tags');
      if (cardTags) {
        cardTags.innerHTML = previewCurrentTags.map(name => {
          const c = tagColorMap[name] || '#6B6B8E';
          const label = name.charAt(0).toUpperCase() + name.slice(1);
          return `<span class="tag-badge" style="background:color-mix(in srgb, ${c} 12%, transparent); border:1px solid color-mix(in srgb, ${c} 35%, transparent); color:${c};">${label}</span>`;
        }).join('');
      }
      card.dataset.tags = previewCurrentTags.join(',');
    }

    // Update list row tags in DOM (status list view)
    const listRows = document.querySelectorAll(`.list-row[data-task-id="${previewTaskId}"]`);
    listRows.forEach(row => {
      const tagsCol = row.querySelector('.list-col-tags');
      if (tagsCol) {
        tagsCol.innerHTML = previewCurrentTags.map(name => {
          const c = tagColorMap[name] || '#6B6B8E';
          return `<div class="list-tag-dot" style="background:${c};" title="${name}"></div>`;
        }).join('');
      }
      row.dataset.tags = previewCurrentTags.join(',');
    });
  } catch (err) {
    console.error('Failed to update tags:', err);
  }
}
