// Documents page JS

let selectedFiles = [];

// ===== Folder Modal =====
function openFolderModal(editId, editName) {
  const modal = document.getElementById('folderModal');
  const title = document.getElementById('folderModalTitle');
  const input = document.getElementById('folderNameInput');
  const btn = document.getElementById('folderSubmitBtn');
  const hidden = document.getElementById('folderEditId');

  if (editId && editName) {
    title.textContent = 'Rename Folder';
    input.value = editName;
    btn.textContent = 'Save';
    hidden.value = editId;
  } else {
    title.textContent = 'New Folder';
    input.value = '';
    btn.textContent = 'Create';
    hidden.value = '';
  }

  modal.classList.add('active');
  setTimeout(() => input.focus(), 100);
}

function closeFolderModal() {
  document.getElementById('folderModal').classList.remove('active');
}

async function submitFolder(e) {
  e.preventDefault();
  const name = document.getElementById('folderNameInput').value.trim();
  const editId = document.getElementById('folderEditId').value;

  if (!name) return;

  try {
    if (editId) {
      const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/folders/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Failed to rename folder');
    } else {
      const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: PROJECT_ID, parentId: CURRENT_FOLDER_ID }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error || 'Failed to create folder');
    }
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  }
}

async function deleteFolder(id, name) {
  if (!confirm(`Delete folder "${name}" and all its contents?`)) return;
  try {
    const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/folders/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to delete folder');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  }
}

// ===== Upload Modal =====
function openUploadModal() {
  selectedFiles = [];
  updateFileList();
  document.getElementById('modalFileInput').value = '';
  document.getElementById('uploadModal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('active');
  selectedFiles = [];
}

document.getElementById('modalFileInput').addEventListener('change', function () {
  for (const f of this.files) {
    if (!selectedFiles.some(s => s.name === f.name && s.size === f.size)) {
      selectedFiles.push(f);
    }
  }
  updateFileList();
});

function updateFileList() {
  const list = document.getElementById('uploadFileList');
  if (selectedFiles.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = selectedFiles.map((f, i) => `
    <div class="doc-upload-file-item">
      <span>${escapeHtml(f.name)}</span>
      <span class="file-size">${formatSize(f.size)}</span>
      <span class="file-remove" onclick="removeFile(${i})">&times;</span>
    </div>
  `).join('');
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  updateFileList();
}

async function submitUpload() {
  if (selectedFiles.length === 0) return alert('Please select files to upload');

  const btn = document.getElementById('uploadSubmitBtn');
  btn.textContent = 'Uploading...';
  btn.disabled = true;

  const folderId = document.getElementById('uploadFolderSelect').value;

  try {
    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) formData.append('folderId', folderId);

      const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/upload/${PROJECT_ID}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Failed to upload ${file.name}: ${data.error || 'Unknown error'}`);
      }
    }
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('Upload failed');
  } finally {
    btn.textContent = 'Upload';
    btn.disabled = false;
  }
}

// ===== Document actions =====
function downloadDoc(id) {
  window.open(`/projects/${PROJECT_SLUG}/documents/api/files/${id}/download`, '_blank');
}

async function renameDoc(id, currentName) {
  const name = prompt('Rename document:', currentName);
  if (!name || name === currentName) return;

  try {
    const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/files/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: name }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to rename');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  }
}

async function deleteDoc(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/files/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to delete');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  }
}

// ===== Move Modal =====
function openMoveModal(id, type, name) {
  const modal = document.getElementById('moveModal');
  if (!modal) return;

  document.getElementById('moveItemId').value = id;
  document.getElementById('moveItemType').value = type;
  document.getElementById('moveModalTitle').textContent = type === 'folder' ? 'Move Folder' : 'Move Document';
  document.getElementById('moveItemName').innerHTML =
    (type === 'folder' ? 'Folder: ' : 'File: ') +
    '<strong style="color:var(--text)">' + escapeHtml(name) + '</strong>';

  const select = document.getElementById('moveFolderSelect');
  // Disable the folder itself and its children from being selected as destination (for folder moves)
  for (const option of select.options) {
    option.disabled = false;
    if (type === 'folder' && option.value === String(id)) {
      option.disabled = true;
    }
  }

  // Pre-select current folder
  select.value = CURRENT_FOLDER_ID || '';

  modal.classList.add('active');
}

function closeMoveModal() {
  const modal = document.getElementById('moveModal');
  if (modal) modal.classList.remove('active');
}

async function submitMove(e) {
  e.preventDefault();
  const id = document.getElementById('moveItemId').value;
  const type = document.getElementById('moveItemType').value;
  const folderId = document.getElementById('moveFolderSelect').value;

  const btn = document.getElementById('moveSubmitBtn');
  btn.textContent = 'Moving...';
  btn.disabled = true;

  try {
    let url, method, body;

    if (type === 'folder') {
      url = `/projects/${PROJECT_SLUG}/documents/api/folders/${id}/move`;
      method = 'PATCH';
      body = JSON.stringify({ parentId: folderId || null });
    } else {
      url = `/projects/${PROJECT_SLUG}/documents/api/files/${id}`;
      method = 'PUT';
      body = JSON.stringify({ folderId: folderId || null });
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to move');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  } finally {
    btn.textContent = 'Move';
    btn.disabled = false;
  }
}

// ===== Password Modal (Admin) =====
function openPasswordModal(folderId, folderName, hasPassword) {
  const modal = document.getElementById('passwordModal');
  if (!modal) return;

  document.getElementById('passwordFolderId').value = folderId;
  document.getElementById('passwordFolderName').innerHTML =
    'Folder: <strong style="color:var(--text)">' + escapeHtml(folderName) + '</strong>';
  document.getElementById('folderPasswordInput').value = '';

  const title = document.getElementById('passwordModalTitle');
  const btn = document.getElementById('passwordSubmitBtn');
  const hint = document.getElementById('passwordHint');

  if (hasPassword) {
    title.textContent = 'Change Folder Password';
    btn.textContent = 'Update Password';
    hint.textContent = 'Leave empty to remove password protection';
  } else {
    title.textContent = 'Set Folder Password';
    btn.textContent = 'Set Password';
    hint.textContent = 'Non-admin users will need this password to access the folder';
  }

  modal.classList.add('active');
  setTimeout(() => document.getElementById('folderPasswordInput').focus(), 100);
}

function closePasswordModal() {
  const modal = document.getElementById('passwordModal');
  if (modal) modal.classList.remove('active');
}

async function submitPassword(e) {
  e.preventDefault();
  const folderId = document.getElementById('passwordFolderId').value;
  const password = document.getElementById('folderPasswordInput').value;

  try {
    const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/folders/${folderId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Failed to set password');
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert('An error occurred');
  }
}

// ===== Unlock Folder =====
async function submitUnlock(e) {
  e.preventDefault();
  const folderId = document.getElementById('lockedFolderId').value;
  const password = document.getElementById('unlockPasswordInput').value;
  const errorEl = document.getElementById('unlockError');

  try {
    const res = await fetch(`/projects/${PROJECT_SLUG}/documents/api/folders/${folderId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || 'Incorrect password';
      errorEl.style.display = 'block';
      document.getElementById('unlockPasswordInput').value = '';
      document.getElementById('unlockPasswordInput').focus();
      return;
    }
    window.location.reload();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'An error occurred';
    errorEl.style.display = 'block';
  }
}

// ===== Drag & Drop on main zone =====
const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (!files.length) return;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    if (CURRENT_FOLDER_ID) formData.append('folderId', CURRENT_FOLDER_ID);

    try {
      await fetch(`/projects/${PROJECT_SLUG}/documents/api/upload/${PROJECT_ID}`, {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error('Upload failed for', file.name, err);
    }
  }
  window.location.reload();
});

// Also handle file input on the main drop zone
document.getElementById('fileInput').addEventListener('change', async function () {
  const files = this.files;
  if (!files.length) return;

  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    if (CURRENT_FOLDER_ID) formData.append('folderId', CURRENT_FOLDER_ID);

    try {
      await fetch(`/projects/${PROJECT_SLUG}/documents/api/upload/${PROJECT_ID}`, {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error('Upload failed for', file.name, err);
    }
  }
  window.location.reload();
});

// ===== Close modals on overlay click =====
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ===== Helpers =====
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Preview =====
let currentBlobUrl = null;

function previewDoc(id, mimeType, title) {
  const modal = document.getElementById('previewModal');
  const body = document.getElementById('previewBody');
  const filename = document.getElementById('previewFilename');

  filename.textContent = title;
  body.innerHTML = '<div class="preview-loading">Loading preview...</div>';
  modal.classList.add('active');

  // Download button
  document.getElementById('previewDownloadBtn').onclick = function (e) {
    e.stopPropagation();
    downloadDoc(id);
  };

  const previewUrl = `/projects/${PROJECT_SLUG}/documents/api/files/${id}/preview`;

  if (mimeType.startsWith('image/')) {
    previewImage(previewUrl, body);
  } else if (mimeType === 'application/pdf') {
    previewPdf(previewUrl, body);
  } else if (mimeType.includes('wordprocessingml') || title.endsWith('.docx')) {
    previewFetch(previewUrl, body, 'docx');
  } else if (mimeType.startsWith('text/') || /\.(txt|md|csv|json|js|ts|html|css|py|sql|xml|yml|yaml|log)$/i.test(title)) {
    previewFetch(previewUrl, body, 'text');
  } else {
    body.innerHTML = `
      <div class="preview-unsupported">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>Preview not available for this file type</p>
        <button class="btn-submit" onclick="downloadDoc(${id}); closePreviewModal();">Download File</button>
      </div>`;
  }
}

async function previewImage(url, body) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    const blob = await res.blob();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = URL.createObjectURL(blob);
    body.innerHTML = `<img src="${currentBlobUrl}" class="preview-image" alt="preview">`;
  } catch (err) {
    body.innerHTML = '<div class="preview-unsupported"><p>Failed to load image</p></div>';
  }
}

async function previewFetch(url, body, type) {
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.type === 'unsupported') {
      body.innerHTML = `<div class="preview-unsupported"><p>${escapeHtml(data.message || 'Preview not available')}</p></div>`;
      return;
    }
    if (type === 'text') {
      body.innerHTML = `<pre class="preview-text">${escapeHtml(data.content)}</pre>`;
    } else if (type === 'docx') {
      // Render DOCX in sandboxed iframe to prevent XSS
      const iframe = document.createElement('iframe');
      iframe.className = 'preview-docx-iframe';
      iframe.sandbox = 'allow-same-origin'; // no scripts allowed
      iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body{font-family:sans-serif;font-size:14px;line-height:1.7;color:#222;padding:24px;margin:0;}
        h1{font-size:1.5em;margin:16px 0 8px}h2{font-size:1.25em;margin:14px 0 6px}
        p{margin:6px 0}table{border-collapse:collapse;width:100%}
        td,th{border:1px solid #ddd;padding:6px 10px}th{background:#f5f5f5}
        img{max-width:100%}ul,ol{margin:8px 0 8px 20px}
      </style></head><body>${data.html}</body></html>`;
      body.innerHTML = '';
      body.appendChild(iframe);
    }
  } catch (err) {
    body.innerHTML = '<div class="preview-unsupported"><p>Failed to load preview</p></div>';
  }
}

async function previewPdf(url, body) {
  try {
    // Lazy load PDF.js
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to load');
    const arrayBuffer = await res.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const maxPages = Math.min(pdf.numPages, 20);

    body.innerHTML = `<div class="preview-pdf-pages" id="pdfPages"><p style="font-size:0.75rem;color:var(--text-dim);margin-bottom:8px;">${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}${pdf.numPages > 20 ? ' (showing first 20)' : ''}</p></div>`;
    const container = document.getElementById('pdfPages');

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const scale = Math.min(1.5, 800 / page.getViewport({ scale: 1 }).width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = '<div class="preview-unsupported"><p>Failed to load PDF preview</p></div>';
  }
}

function closePreviewModal() {
  document.getElementById('previewModal').classList.remove('active');
  document.getElementById('previewBody').innerHTML = '';
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

// Escape key to close preview
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    const preview = document.getElementById('previewModal');
    if (preview && preview.classList.contains('active')) {
      closePreviewModal();
    }
  }
});
