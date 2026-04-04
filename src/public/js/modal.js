function openTaskModal(status) {
  const modal = document.getElementById('taskModal');
  document.getElementById('taskModalTitle').textContent = 'New Task';
  document.getElementById('taskSubmitBtn').textContent = 'Create Task';
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

    document.getElementById('taskModalTitle').textContent = 'Edit Task';
    document.getElementById('taskSubmitBtn').textContent = 'Save Changes';
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

// Task Preview Popup
let previewTaskId = null;
let previewTaskStatus = null;
let previewDirty = false;

// Build tagColorMap dynamically from PROJECT_TAGS
const tagColorMap = {};
if (typeof window.PROJECT_TAGS !== 'undefined') {
  window.PROJECT_TAGS.forEach(t => { tagColorMap[t.name] = t.color; });
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
    document.getElementById('previewStatusSelect').value = task.status;
    document.getElementById('previewPrioritySelect').value = task.priority;

    // Render markdown description
    renderPreviewDescription(task.description || '', isGuest);

    const tagsEl = document.getElementById('previewTags');
    previewCurrentTags = (task.tags || []).map(tt => tt.tag.name);
    renderPreviewTagBadges();

    // Hide tag editor on open
    document.getElementById('previewTagEditor').classList.add('hidden');

    // Build tag pill options
    const optionsEl = document.getElementById('previewTagOptions');
    if (window.PROJECT_TAGS && window.PROJECT_TAGS.length > 0) {
      optionsEl.innerHTML = window.PROJECT_TAGS.map(t => {
        const isActive = previewCurrentTags.includes(t.name);
        const label = t.name.charAt(0).toUpperCase() + t.name.slice(1);
        return `<span class="preview-tag-pill${isActive ? ' active' : ''}" style="--pill-color:${t.color}" data-tag="${t.name}" onclick="togglePreviewTag('${t.name}')">${label}</span>`;
      }).join('');
    }

    const dueDateWrap = document.getElementById('previewDueDateWrap');
    if (task.dueDate) {
      document.getElementById('previewDueDate').textContent = task.dueDate;
      dueDateWrap.classList.remove('hidden');
    } else {
      dueDateWrap.classList.add('hidden');
    }

    const progressColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347';
    const bar = document.getElementById('previewProgressBar');
    bar.style.width = task.progress + '%';
    bar.style.background = progressColor;
    const pText = document.getElementById('previewProgressText');
    pText.textContent = task.progress + '%';
    pText.style.color = progressColor;

    const assigneesWrap = document.getElementById('previewAssigneesWrap');
    const assigneesEl = document.getElementById('previewAssignees');
    const avatarColors = ['#6C63FF', '#00D9FF', '#FF5C7A', '#00F5A0', '#FFB347'];
    if (task.assignees && task.assignees.length > 0) {
      assigneesEl.innerHTML = task.assignees.map((a, i) => {
        const c = avatarColors[i % avatarColors.length];
        const initials = a.user.name.split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
        return `<div class="assignee-chip" style="padding:4px 10px; border-radius:6px;">
          <div class="avatar" style="background:${c}22; border-color:${c}55; color:${c}; width:20px; height:20px; font-size:0.55rem;">${initials}</div>
          <span class="assignee-chip-name" style="font-size:0.75rem;">${a.user.name}</span>
        </div>`;
      }).join('');
      assigneesWrap.classList.remove('hidden');
    } else {
      assigneesWrap.classList.add('hidden');
    }

    // Render subtasks
    if (typeof renderPreviewSubtasks === 'function') {
      renderPreviewSubtasks(task.subtasks || [], isGuest);
    }

    document.getElementById('previewDetailsLink').href = '/tasks/' + encodeURIComponent(task.id + '-' + (task.slug || ''));

    // Guest mode: make fields read-only, hide edit/delete actions
    const previewTitle = document.getElementById('previewTitle');
    const previewDesc = document.getElementById('previewDescription');
    const previewStatus = document.getElementById('previewStatusSelect');
    const previewPriority = document.getElementById('previewPrioritySelect');
    if (isGuest) {
      previewTitle.readOnly = true;
      previewDesc.readOnly = true;
      previewStatus.disabled = true;
      previewPriority.disabled = true;
      previewTitle.classList.add('preview-readonly');
      document.querySelectorAll('#taskPreviewModal .preview-auth-btn').forEach(el => el.classList.add('hidden'));
    } else {
      previewTitle.readOnly = false;
      previewDesc.readOnly = false;
      previewStatus.disabled = false;
      previewPriority.disabled = false;
      previewTitle.classList.remove('preview-readonly');
      document.querySelectorAll('#taskPreviewModal .preview-auth-btn').forEach(el => el.classList.remove('hidden'));
    }

    document.getElementById('taskPreviewModal').classList.add('active');
  } catch (err) {
    console.error('Failed to load task preview:', err);
  }
}

const priorityColors = { high: '#FF5C7A', medium: '#FFB347', low: '#00F5A0' };
const priorityLabels = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

async function savePreviewField() {
  if (!previewTaskId) return;
  const title = document.getElementById('previewTitle').value.trim();
  if (!title) return;

  const status = document.getElementById('previewStatusSelect').value;
  const priority = document.getElementById('previewPrioritySelect').value;

  const data = {
    title,
    description: document.getElementById('previewDescription').value,
    status,
    priority,
  };

  try {
    await fetch(`/api/tasks/${previewTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    previewDirty = true;
    previewTaskStatus = status;
    updateCardInDOM(previewTaskId, { title, status, priority });
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
      const pColor = priorityColors[changes.priority] || '#FFB347';
      const badge = card.querySelector('.task-priority-badge');
      if (badge) {
        badge.textContent = priorityLabels[changes.priority] || 'MEDIUM';
        badge.style.color = pColor;
      }
      const line = card.querySelector('.task-priority-line');
      if (line) line.style.background = pColor;
    }

    if (changes.status && card.dataset.status !== changes.status) {
      const oldStatus = card.dataset.status;
      const newStatus = changes.status;
      card.dataset.status = newStatus;

      const newList = document.querySelector(`.tasks-list[data-status="${newStatus}"]`);
      if (newList) {
        card.remove();
        const addBtn = newList.querySelector('.add-task-btn');
        newList.insertBefore(card, addBtn);
      }

      updateColumnCount(oldStatus);
      updateColumnCount(newStatus);
    }
  }

  // Update list view rows (status view + tag view)
  updateListRowsInDOM(taskId, changes);
}

const listPriorityLabels = { high: 'HIGH', medium: 'MED', low: 'LOW' };
const statusLabelsMap = { todo: 'To Do', inprogress: 'In Progress', review: 'In Review', done: 'Completed' };
const statusColorsMap = { todo: '#6B6B8E', inprogress: '#00D9FF', review: '#FFB347', done: '#00F5A0' };

function updateListRowsInDOM(taskId, changes) {
  const rows = document.querySelectorAll(`.list-row[data-task-id="${taskId}"]`);
  rows.forEach(row => {
    if (changes.title) {
      const nameEl = row.querySelector('.list-task-name');
      if (nameEl) nameEl.textContent = changes.title;
    }

    if (changes.priority) {
      const pColor = priorityColors[changes.priority] || '#FFB347';
      const dot = row.querySelector('.list-priority-dot');
      if (dot) dot.style.background = pColor;
      const prioCol = row.querySelector('.list-col-priority > div');
      if (prioCol) {
        prioCol.textContent = listPriorityLabels[changes.priority] || 'MED';
        prioCol.style.color = pColor;
      }
    }

    if (changes.status) {
      const statusBadge = row.querySelector('.list-status-badge');
      if (statusBadge) {
        const sColor = statusColorsMap[changes.status] || '#6B6B8E';
        statusBadge.textContent = statusLabelsMap[changes.status] || changes.status;
        statusBadge.style.color = sColor;
        statusBadge.style.background = `color-mix(in srgb, ${sColor} 12%, transparent)`;
      }
    }
  });

  // Move row in status-grouped list view if status changed
  if (changes.status) {
    const statusRow = document.querySelector(`#listView .list-row[data-task-id="${taskId}"]`);
    if (statusRow && statusRow.dataset.status !== changes.status) {
      const oldStatus = statusRow.dataset.status;
      statusRow.dataset.status = changes.status;

      const newGroup = document.querySelector(`#listView .list-group[data-status="${changes.status}"] .list-group-body`);
      if (newGroup) {
        statusRow.remove();
        newGroup.appendChild(statusRow);
        updateListGroupCount(document.querySelector(`#listView .list-group[data-status="${oldStatus}"]`));
        updateListGroupCount(document.querySelector(`#listView .list-group[data-status="${changes.status}"]`));
      }
    }
  }
}

function updateListGroupCount(group) {
  if (!group) return;
  const count = group.querySelectorAll('.list-row').length;
  const badge = group.querySelector('.list-group-count');
  if (badge) badge.textContent = count;
  // Update empty row
  const body = group.querySelector('.list-group-body');
  const emptyRow = body.querySelector('.list-empty-row');
  if (count === 0 && !emptyRow) {
    const div = document.createElement('div');
    div.className = 'list-empty-row';
    div.textContent = 'No tasks';
    body.appendChild(div);
  } else if (count > 0 && emptyRow) {
    emptyRow.remove();
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

    const pColor = priorityColors[task.priority] || '#FFB347';
    const pLabel = priorityLabels[task.priority] || 'MEDIUM';
    const progressColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347';

    // Priority line + badge
    const line = card.querySelector('.task-priority-line');
    if (line) line.style.background = pColor;
    const badge = card.querySelector('.task-priority-badge');
    if (badge) { badge.textContent = pLabel; badge.style.color = pColor; }

    // Title
    const titleEl = card.querySelector('.task-title');
    if (titleEl) titleEl.textContent = task.title;

    // Tags
    const tagsEl = card.querySelector('.task-tags');
    if (tagsEl) {
      tagsEl.innerHTML = (task.tags || []).map(tt => {
        const c = tt.tag.color || '#6B6B8E';
        const label = tt.tag.name.charAt(0).toUpperCase() + tt.tag.name.slice(1);
        return `<span class="tag-badge" style="background:color-mix(in srgb, ${c} 12%, transparent); border:1px solid color-mix(in srgb, ${c} 35%, transparent); color:${c};">${label}</span>`;
      }).join('');
      card.dataset.tags = (task.tags || []).map(tt => tt.tag.name).join(',');
    }

    // Subtask indicator
    let subtaskEl = card.querySelector('.task-subtask-indicator');
    if (task.subtasks && task.subtasks.length > 0) {
      const doneCount = task.subtasks.filter(s => s.done).length;
      const subPercent = task.status === 'done' ? 100 : Math.round(doneCount / (task.subtasks.length + 1) * 100);
      const subtaskHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="task-subtask-text">${doneCount}/${task.subtasks.length}</span>
        <div class="task-subtask-track"><div class="task-subtask-fill" style="width:${subPercent}%;"></div></div>`;
      if (subtaskEl) {
        subtaskEl.innerHTML = subtaskHTML;
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'task-subtask-indicator';
        wrapper.innerHTML = subtaskHTML;
        const tagsAfter = card.querySelector('.task-tags');
        if (tagsAfter) tagsAfter.after(wrapper);
      }
    } else if (subtaskEl) {
      subtaskEl.remove();
    }

    // Progress bar
    let progressEl = card.querySelector('.task-progress');
    if (task.progress > 0) {
      const progressHTML = `
        <div class="task-progress-header">
          <span class="task-progress-label">Progress</span>
          <span class="task-progress-value" style="color:${progressColor}">${task.progress}%</span>
        </div>
        <div class="task-progress-track">
          <div class="task-progress-fill" style="width:${task.progress}%; background:${progressColor}; ${task.progress === 100 ? 'box-shadow: 0 0 8px #00F5A055;' : ''}"></div>
        </div>`;
      if (progressEl) {
        progressEl.innerHTML = progressHTML;
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'task-progress';
        wrapper.innerHTML = progressHTML;
        const footer = card.querySelector('.task-footer');
        if (footer) footer.before(wrapper);
      }
    } else if (progressEl) {
      progressEl.remove();
    }

    // Due date
    const footer = card.querySelector('.task-footer');
    let dueEl = card.querySelector('.task-due');
    if (task.dueDate) {
      const dueHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${task.dueDate}`;
      if (dueEl) {
        dueEl.innerHTML = dueHTML;
      } else if (footer) {
        const span = document.createElement('span');
        span.className = 'task-due';
        span.innerHTML = dueHTML;
        footer.appendChild(span);
      }
    } else if (dueEl) {
      dueEl.remove();
    }

    // Status column move
    if (card.dataset.status !== task.status) {
      const oldStatus = card.dataset.status;
      card.dataset.status = task.status;
      const newList = document.querySelector(`.tasks-list[data-status="${task.status}"]`);
      if (newList) {
        card.remove();
        const addBtn = newList.querySelector('.add-task-btn');
        newList.insertBefore(card, addBtn);
      }
      updateColumnCount(oldStatus);
      updateColumnCount(task.status);
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

    const pColor = priorityColors[task.priority] || '#FFB347';
    const progColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347';

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

      // Status badge (tag view rows)
      const statusBadge = row.querySelector('.list-status-badge');
      if (statusBadge) {
        const sColor = statusColorsMap[task.status] || '#6B6B8E';
        statusBadge.textContent = statusLabelsMap[task.status] || task.status;
        statusBadge.style.color = sColor;
        statusBadge.style.background = `color-mix(in srgb, ${sColor} 12%, transparent)`;
      }

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

    // Move row in status list view if status changed
    const statusRow = document.querySelector(`#listView .list-row[data-task-id="${taskId}"]`);
    if (statusRow && statusRow.dataset.status !== task.status) {
      const oldStatus = statusRow.dataset.status;
      statusRow.dataset.status = task.status;

      const newGroup = document.querySelector(`#listView .list-group[data-status="${task.status}"] .list-group-body`);
      if (newGroup) {
        statusRow.remove();
        newGroup.appendChild(statusRow);
        updateListGroupCount(document.querySelector(`#listView .list-group[data-status="${oldStatus}"]`));
        updateListGroupCount(document.querySelector(`#listView .list-group[data-status="${task.status}"]`));
      }
    }

    // Handle tag view: remove and re-add rows if tags changed
    refreshTagViewRows(taskId, task);
  } catch (err) {
    console.error('Failed to refresh list rows:', err);
  }
}

function refreshTagViewRows(taskId, task) {
  const tagView = document.getElementById('listViewTag');
  if (!tagView) return;

  // Remove existing rows for this task in tag view
  const existingRows = tagView.querySelectorAll(`.list-row[data-task-id="${taskId}"]`);
  const affectedGroups = new Set();
  existingRows.forEach(row => {
    const group = row.closest('.list-group');
    if (group) affectedGroups.add(group);
    row.remove();
  });

  // Re-create rows in appropriate tag groups
  const taskTags = (task.tags || []).map(tt => tt.tag.name);
  const pColor = priorityColors[task.priority] || '#FFB347';
  const sColor = statusColorsMap[task.status] || '#6B6B8E';
  const progColor = task.progress === 100 ? '#00F5A0' : task.progress > 60 ? '#6C63FF' : '#FFB347';

  const targetTagNames = taskTags.length > 0 ? taskTags : ['No Tag'];

  targetTagNames.forEach(tagName => {
    const group = tagView.querySelector(`.list-group[data-tag="${tagName}"]`);
    if (!group) return;
    const body = group.querySelector('.list-group-body');
    if (!body) return;

    const row = document.createElement('div');
    row.className = 'list-row';
    row.dataset.taskId = taskId;
    row.dataset.status = task.status;
    row.dataset.tags = taskTags.join(',');
    row.setAttribute('onclick', `openTaskPreview(${taskId})`);

    row.innerHTML = `
      <div class="list-col list-col-title">
        <div class="list-priority-dot" style="background:${pColor};"></div>
        <div class="list-task-name">${task.title}</div>
      </div>
      <div class="list-col list-col-status">
        <div class="list-status-badge" style="color:${sColor}; background:color-mix(in srgb, ${sColor} 12%, transparent);">${statusLabelsMap[task.status] || task.status}</div>
      </div>
      <div class="list-col list-col-priority">
        <div style="color:${pColor}; font-weight:600;">${listPriorityLabels[task.priority] || 'MED'}</div>
      </div>
      <div class="list-col list-col-progress">
        <div class="list-progress-track">
          <div class="list-progress-fill" style="width:${task.progress}%; background:${progColor};"></div>
        </div>
        <div style="color:${progColor}; font-weight:600; min-width:30px; text-align:right; padding-right:5px;">${task.progress}%</div>
      </div>
      <div class="list-col list-col-due">
        ${task.dueDate || '—'}
      </div>`;

    body.appendChild(row);
    affectedGroups.add(group);
  });

  // Update counts for all affected groups
  affectedGroups.forEach(group => updateListGroupCount(group));
}

function updateColumnCount(status) {
  const list = document.querySelector(`.tasks-list[data-status="${status}"]`);
  if (!list) return;
  const count = list.querySelectorAll('.task-card').length;
  const col = list.closest('.kanban-column');
  if (!col) return;
  const badge = col.querySelector('.column-count');
  if (badge) badge.textContent = count;
}

// Auto-save on blur for text fields
document.getElementById('previewTitle').addEventListener('blur', savePreviewField);
// Auto-save on change for selects
document.getElementById('previewStatusSelect').addEventListener('change', savePreviewField);
document.getElementById('previewPrioritySelect').addEventListener('change', savePreviewField);

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
      ? '<span class="preview-desc-empty">No description</span>'
      : '<span class="preview-desc-empty">Click to add description...</span>';
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
document.getElementById('previewDescription').addEventListener('blur', function () {
  savePreviewField().then(function () {
    const desc = document.getElementById('previewDescription').value;
    renderPreviewDescription(desc, window.IS_GUEST);
  });
});

function closeTaskPreview() {
  document.getElementById('taskPreviewModal').classList.remove('active');
  // Reset description view state
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
  if (previewCurrentTags.length > 0) {
    tagsEl.innerHTML = previewCurrentTags.map(name => {
      const c = tagColorMap[name] || '#6B6B8E';
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      return `<span class="tag-badge" style="background:${c}18; border:1px solid ${c}35; color:${c};">${label}</span>`;
    }).join('');
  } else {
    tagsEl.innerHTML = '<span style="color:var(--text-dim); font-size:0.75rem;">No tags</span>';
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
