// Project Modal
function openProjectModal(id, name, color, publicTasks, publicDocuments) {
  const modal = document.getElementById('projectModal');
  const title = document.getElementById('projectModalTitle');
  const submitBtn = document.getElementById('projectSubmitBtn');
  const nameInput = document.getElementById('projectName');
  const idInput = document.getElementById('projectId');
  const publicSettings = document.getElementById('projectPublicSettings');
  const ptCheck = document.getElementById('projectPublicTasks');
  const pdCheck = document.getElementById('projectPublicDocuments');

  if (id) {
    title.textContent = 'Edit Project';
    submitBtn.textContent = 'Save Changes';
    idInput.value = id;
    nameInput.value = name || '';
    const radios = document.querySelectorAll('input[name="projectColor"]');
    radios.forEach(r => { r.checked = r.value === color; });
    updateSwatchBorders();
    if (publicSettings) {
      publicSettings.style.display = '';
      if (ptCheck) ptCheck.checked = !!publicTasks;
      if (pdCheck) pdCheck.checked = !!publicDocuments;
    }
  } else {
    title.textContent = 'New Project';
    submitBtn.textContent = 'Create Project';
    idInput.value = '';
    nameInput.value = '';
    const radios = document.querySelectorAll('input[name="projectColor"]');
    if (radios[0]) radios[0].checked = true;
    updateSwatchBorders();
    if (publicSettings) publicSettings.style.display = 'none';
    if (ptCheck) ptCheck.checked = false;
    if (pdCheck) pdCheck.checked = false;
  }

  modal.classList.add('active');
  nameInput.focus();
}

function closeProjectModal() {
  document.getElementById('projectModal').classList.remove('active');
}

// Color swatch selection visual
function updateSwatchBorders() {
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    const radio = swatch.parentElement.querySelector('input[type="radio"]');
    if (radio && radio.checked) {
      swatch.classList.add('swatch-selected');
      swatch.style.setProperty('--swatch-color', swatch.dataset.color);
    } else {
      swatch.classList.remove('swatch-selected');
    }
  });
}

document.querySelectorAll('input[name="projectColor"]').forEach(radio => {
  radio.addEventListener('change', updateSwatchBorders);
});

// Initialize swatch borders on load
updateSwatchBorders();

// Project form submit
document.getElementById('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const projectId = document.getElementById('projectId').value;
  const name = document.getElementById('projectName').value.trim();
  const color = document.querySelector('input[name="projectColor"]:checked')?.value || '#6C63FF';

  if (!name) return;

  try {
    const url = projectId ? `/api/projects/${projectId}` : '/api/projects';
    const method = projectId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        color,
        publicTasks: document.getElementById('projectPublicTasks')?.checked || false,
        publicDocuments: document.getElementById('projectPublicDocuments')?.checked || false,
      }),
    });

    const data = await res.json();
    if (data.success) {
      closeProjectModal();
      // Redirect to the new/updated project
      window.location.href = '/dashboard?project=' + (data.project?.id || projectId);
    }
  } catch (err) {
    console.error('Failed to save project:', err);
  }
});

// Delete Project
function deleteProject(id, name) {
  document.getElementById('deleteProjectId').value = id;
  document.getElementById('deleteProjectName').textContent = name;
  document.getElementById('deleteProjectExpectedName').value = name;
  document.getElementById('deleteProjectConfirmInput').value = '';
  const btn = document.getElementById('deleteProjectBtn');
  btn.disabled = true;
  btn.classList.add('btn-disabled');
  document.getElementById('deleteProjectModal').classList.add('active');
  document.getElementById('deleteProjectConfirmInput').focus();
}

document.getElementById('deleteProjectConfirmInput').addEventListener('input', function() {
  const expected = document.getElementById('deleteProjectExpectedName').value;
  const btn = document.getElementById('deleteProjectBtn');
  if (this.value === expected) {
    btn.disabled = false;
    btn.classList.remove('btn-disabled');
  } else {
    btn.disabled = true;
    btn.classList.add('btn-disabled');
  }
});

function closeDeleteProjectModal() {
  document.getElementById('deleteProjectModal').classList.remove('active');
}

async function confirmDeleteProject() {
  const expected = document.getElementById('deleteProjectExpectedName').value;
  const typed = document.getElementById('deleteProjectConfirmInput').value;
  if (typed !== expected) return;

  const id = document.getElementById('deleteProjectId').value;
  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      closeDeleteProjectModal();
      window.location.href = '/projects';
    }
  } catch (err) {
    console.error('Failed to delete project:', err);
  }
}
