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
      const cb = document.getElementById(`tag-${tt.tag.name}`);
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

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});
