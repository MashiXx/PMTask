// Group manager (modeled on tag-manage.js)
function groupProjectId() {
  const pid = document.getElementById('taskProjectId');
  return pid ? pid.value : null;
}

function openGroupManager() {
  if (!groupProjectId()) return;
  loadGroupList();
  document.getElementById('groupManagerModal').classList.add('active');
  document.getElementById('newGroupName').value = '';
}

function closeGroupManager() {
  document.getElementById('groupManagerModal').classList.remove('active');
  window.location.reload(); // re-render board columns
}

async function loadGroupList() {
  try {
    const res = await fetch(`/api/groups?projectId=${groupProjectId()}`);
    const groups = await res.json();
    const list = document.getElementById('groupList');
    if (!groups.length) {
      list.innerHTML = '<p class="group-empty">No groups yet</p>';
      return;
    }
    list.innerHTML = groups.map(g => `
      <div class="group-manager-item" id="group-item-${g.id}">
        <span class="tag-dot" style="background:${g.color};"></span>
        <span class="group-manager-name">${g.name}</span>
        ${g._count.tasks > 0 ? `<span class="group-count-hint">${g._count.tasks} task${g._count.tasks > 1 ? 's' : ''}</span>` : ''}
        <button class="column-add-btn group-del" onclick="deleteGroupItem(${g.id}, ${g._count.tasks})" title="Delete">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>`).join('');
  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}

async function addNewGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  if (!name) return;
  const color = document.getElementById('newGroupColor').value || '#6C63FF';
  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, projectId: groupProjectId() }),
    });
    if (res.status === 409) { alert('A group with that name already exists.'); return; }
    document.getElementById('newGroupName').value = '';
    loadGroupList();
  } catch (err) {
    console.error('Failed to add group:', err);
  }
}

async function deleteGroupItem(id, taskCount) {
  if (taskCount > 0 && !confirm(`This group has ${taskCount} task${taskCount > 1 ? 's' : ''}. They will move to "Ungrouped". Delete the group?`)) return;
  try {
    await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    const el = document.getElementById(`group-item-${id}`);
    if (el) el.remove();
  } catch (err) {
    console.error('Failed to delete group:', err);
  }
}
