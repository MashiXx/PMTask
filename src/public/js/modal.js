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

    document.getElementById('previewDetailsLink').href = '/tasks/' + task.id;

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
  const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
  if (!card) return;

  // Update title
  const titleEl = card.querySelector('.task-title');
  if (titleEl && changes.title) titleEl.textContent = changes.title;

  // Update priority badge + line
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

  // Move card to new column if status changed
  if (changes.status && card.dataset.status !== changes.status) {
    const oldStatus = card.dataset.status;
    const newStatus = changes.status;
    card.dataset.status = newStatus;

    const newList = document.querySelector(`.tasks-list[data-status="${newStatus}"]`);
    if (newList) {
      card.remove();
      // Insert before the "Add task" button
      const addBtn = newList.querySelector('.add-task-btn');
      newList.insertBefore(card, addBtn);
    }

    // Update column counts
    updateColumnCount(oldStatus);
    updateColumnCount(newStatus);
  }
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

    // Update card tags in DOM
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
  } catch (err) {
    console.error('Failed to update tags:', err);
  }
}
