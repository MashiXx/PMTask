// ── Shared Task Attachments module ──
// Used by the task detail page and the quick task-preview modal.
// Renders an image thumbnail grid + non-image file rows, handles upload,
// delete, and a full-size image lightbox.
(function () {
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Only these stream inline from the server, so only these get a thumbnail.
  // Other "image" types (svg, bmp, ico) are shown as downloadable file rows.
  const THUMBNAIL_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  function isImageMime(mime) {
    return THUMBNAIL_MIMES.indexOf(mime) !== -1;
  }

  const fileIconSvg =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // ── Lightbox ──
  let lightboxEl = null;
  function openLightbox(url, alt) {
    if (!lightboxEl) {
      lightboxEl = document.createElement('div');
      lightboxEl.className = 'attach-lightbox';
      lightboxEl.innerHTML =
        '<button class="attach-lightbox-close" type="button" aria-label="Close">&times;</button>' +
        '<img class="attach-lightbox-img" alt="">';
      lightboxEl.addEventListener('click', function (e) {
        if (e.target === lightboxEl || e.target.classList.contains('attach-lightbox-close')) {
          closeLightbox();
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && lightboxEl && lightboxEl.classList.contains('active')) {
          closeLightbox();
        }
      });
      document.body.appendChild(lightboxEl);
    }
    const img = lightboxEl.querySelector('.attach-lightbox-img');
    img.src = url;
    img.alt = alt || '';
    lightboxEl.classList.add('active');
  }
  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.classList.remove('active');
    const img = lightboxEl.querySelector('.attach-lightbox-img');
    if (img) img.src = '';
  }

  // ── Upload one file with progress, resolves to the created attachment ──
  function uploadOne(taskId, file, onProgress) {
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', function (e) {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener('load', function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).attachment); }
          catch (e) { resolve(null); }
        } else {
          let msg = 'Upload failed';
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
          reject(new Error(msg));
        }
      });
      xhr.addEventListener('error', function () { reject(new Error('Upload failed for ' + file.name)); });
      const fd = new FormData();
      fd.append('file', file);
      xhr.open('POST', '/api/attachments/tasks/' + taskId);
      xhr.send(fd);
    });
  }

  // Mount/refresh an attachments UI on a container.
  // opts: { container, fileInput, dropZone?, taskId, canEdit, attachments }
  // Returns a small controller with getAttachments().
  function mount(opts) {
    const container = typeof opts.container === 'string'
      ? document.getElementById(opts.container) : opts.container;
    if (!container) return null;
    const fileInput = typeof opts.fileInput === 'string'
      ? document.getElementById(opts.fileInput) : opts.fileInput;
    const dropZone = typeof opts.dropZone === 'string'
      ? document.getElementById(opts.dropZone) : opts.dropZone;

    const taskId = opts.taskId;
    const canEdit = !!opts.canEdit;
    let items = Array.isArray(opts.attachments) ? opts.attachments.slice() : [];
    let busy = false;

    function render() {
      if (items.length === 0) {
        container.innerHTML = '<p class="attach-empty">No attachments yet.</p>';
        return;
      }
      const images = items.filter(function (a) { return isImageMime(a.mimeType); });
      const others = items.filter(function (a) { return !isImageMime(a.mimeType); });

      let html = '';
      if (images.length) {
        html += '<div class="attach-grid">';
        images.forEach(function (a) {
          const url = '/api/attachments/' + a.id + '/preview';
          html += '<div class="attach-thumb" data-id="' + a.id + '">' +
            '<img src="' + url + '" alt="' + escapeHtml(a.filename) + '" loading="lazy" data-url="' + url + '" data-name="' + escapeHtml(a.filename) + '">' +
            (canEdit ? '<button type="button" class="attach-del" data-id="' + a.id + '" title="Delete">&times;</button>' : '') +
            '<span class="attach-thumb-name">' + escapeHtml(a.filename) + '</span>' +
            '</div>';
        });
        html += '</div>';
      }
      if (others.length) {
        html += '<div class="attach-files">';
        others.forEach(function (a) {
          html += '<div class="attach-file" data-id="' + a.id + '">' +
            '<span class="attach-file-icon">' + fileIconSvg + '</span>' +
            '<a class="attach-file-name" href="/api/attachments/' + a.id + '/download" target="_blank" rel="noopener">' + escapeHtml(a.filename) + '</a>' +
            '<span class="attach-file-size">' + formatSize(a.size) + '</span>' +
            (canEdit ? '<button type="button" class="attach-del" data-id="' + a.id + '" title="Delete">&times;</button>' : '') +
            '</div>';
        });
        html += '</div>';
      }
      container.innerHTML = html;
    }

    async function doDelete(id) {
      try {
        const res = await fetch('/api/attachments/' + id, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(function () { return {}; });
          alert(data.error || 'Failed to delete attachment');
          return;
        }
        items = items.filter(function (a) { return a.id !== id; });
        render();
      } catch (err) {
        console.error(err);
        alert('Failed to delete attachment');
      }
    }

    async function handleFiles(fileList) {
      if (busy || !fileList || !fileList.length) return;
      busy = true;
      const status = document.createElement('p');
      status.className = 'attach-uploading';
      container.prepend(status);
      let done = 0;
      for (let i = 0; i < fileList.length; i++) {
        status.textContent = 'Uploading ' + (done + 1) + ' / ' + fileList.length + '...';
        try {
          const created = await uploadOne(taskId, fileList[i], function (pct) {
            status.textContent = 'Uploading ' + (done + 1) + ' / ' + fileList.length + ' (' + pct + '%)';
          });
          if (created) items.unshift(created);
        } catch (err) {
          alert(err.message || 'Upload failed');
        }
        done++;
      }
      busy = false;
      render();
    }

    // Delegated clicks for thumbnails (lightbox) and delete buttons
    container.onclick = function (e) {
      const del = e.target.closest('.attach-del');
      if (del) {
        e.preventDefault();
        const id = parseInt(del.dataset.id, 10);
        if (confirm('Delete this attachment?')) doDelete(id);
        return;
      }
      const thumbImg = e.target.closest('.attach-thumb img');
      if (thumbImg) {
        openLightbox(thumbImg.dataset.url, thumbImg.dataset.name);
      }
    };

    if (fileInput) {
      fileInput.onchange = function () {
        handleFiles(this.files);
        this.value = '';
      };
    }

    if (dropZone) {
      dropZone.ondragover = function (e) { e.preventDefault(); dropZone.classList.add('attach-drag'); };
      dropZone.ondragleave = function () { dropZone.classList.remove('attach-drag'); };
      dropZone.ondrop = function (e) {
        e.preventDefault();
        dropZone.classList.remove('attach-drag');
        handleFiles(e.dataTransfer.files);
      };
    }

    render();
    return { getAttachments: function () { return items.slice(); } };
  }

  window.TaskAttachments = { mount: mount, openLightbox: openLightbox };
})();
