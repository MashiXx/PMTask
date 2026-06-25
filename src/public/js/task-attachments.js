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

  const downloadIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const trashIcon =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return 'hôm nay';
    if (days === 1) return 'hôm qua';
    if (days < 30) return days + ' ngày trước';
    if (days < 365) return Math.floor(days / 30) + ' tháng trước';
    return Math.floor(days / 365) + ' năm trước';
  }

  function fileExt(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || '');
    return m ? m[1].toLowerCase() : '';
  }

  // Map an extension to a colour category (drives the badge colour in CSS)
  function fileCategory(ext) {
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic'].indexOf(ext) !== -1) return 'img';
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx', 'rtf', 'odt'].indexOf(ext) !== -1) return 'doc';
    if (['xls', 'xlsx', 'csv', 'ods'].indexOf(ext) !== -1) return 'sheet';
    if (['ppt', 'pptx', 'odp'].indexOf(ext) !== -1) return 'slide';
    if (['zip', 'rar', '7z', 'tar', 'gz'].indexOf(ext) !== -1) return 'zip';
    if (['txt', 'md', 'json', 'xml', 'log', 'yml', 'yaml'].indexOf(ext) !== -1) return 'text';
    return 'file';
  }

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

  // ── Paste-to-attach (Ctrl/Cmd+V) ──
  // A single global handler routes pasted images to whichever editable
  // attachments area is currently visible (detail page or open modal).
  const mounts = [];
  let pasteInstalled = false;

  function installPasteHandler() {
    if (pasteInstalled) return;
    pasteInstalled = true;
    document.addEventListener('paste', function (e) {
      const cd = e.clipboardData;
      if (!cd || !cd.items) return;
      const files = [];
      for (let i = 0; i < cd.items.length; i++) {
        const it = cd.items[i];
        if (it.kind === 'file' && it.type.indexOf('image/') === 0) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return; // no image in clipboard → let default paste happen
      const target = mounts.find(function (m) { return m.canEdit && m.isVisible(); });
      if (!target) return;
      e.preventDefault();
      target.handle(files);
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

    function rowHtml(a) {
      const ext = fileExt(a.filename);
      const isImg = isImageMime(a.mimeType);
      const cat = isImg ? 'img' : fileCategory(ext);
      const previewUrl = '/api/attachments/' + a.id + '/preview';
      const dlUrl = '/api/attachments/' + a.id + '/download';
      const badge = ext ? escapeHtml(ext.toUpperCase().slice(0, 4)) : 'FILE';
      const sub = formatSize(a.size) + (a.createdAt ? ' · ' + timeAgo(a.createdAt) : '');
      const name = escapeHtml(a.filename);

      // The label is the always-present fallback; an image overlays it and
      // removes itself on error (missing file / 404) so we never show a broken icon.
      const media =
        '<span class="attach-media attach-media--' + cat + '">' +
          '<span class="attach-media-label">' + badge + '</span>' +
          (isImg ? '<img class="attach-media-img" src="' + previewUrl + '" alt="" loading="lazy" onerror="this.remove()">' : '') +
        '</span>';

      return '<div class="attach-item" data-id="' + a.id + '" data-type="' + (isImg ? 'img' : 'file') +
        '" data-url="' + previewUrl + '" data-name="' + name + '">' +
          media +
          '<div class="attach-info">' +
            '<a class="attach-name" href="' + dlUrl + '" target="_blank" rel="noopener" title="' + name + '">' + name + '</a>' +
            '<span class="attach-sub">' + sub + '</span>' +
          '</div>' +
          '<div class="attach-actions">' +
            '<a class="attach-act" href="' + dlUrl + '" target="_blank" rel="noopener" title="Tải xuống" aria-label="Tải xuống">' + downloadIcon + '</a>' +
            (canEdit ? '<button type="button" class="attach-act attach-del" data-id="' + a.id + '" title="Xóa" aria-label="Xóa">' + trashIcon + '</button>' : '') +
          '</div>' +
        '</div>';
    }

    function render() {
      if (items.length === 0) {
        container.innerHTML = '<p class="attach-empty">Chưa có tệp đính kèm.</p>';
        return;
      }
      container.innerHTML = items.map(rowHtml).join('');
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
        if (confirm('Xóa tệp đính kèm này?')) doDelete(id);
        return;
      }
      // Click an image's thumbnail → open the lightbox (files use their download link)
      const media = e.target.closest('.attach-item[data-type="img"] .attach-media');
      if (media) {
        const item = media.closest('.attach-item');
        if (item) openLightbox(item.dataset.url, item.dataset.name);
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

    // Register this mount for Ctrl+V paste routing (dedupe by container)
    for (let i = mounts.length - 1; i >= 0; i--) {
      if (mounts[i].container === container) mounts.splice(i, 1);
    }
    if (canEdit && taskId) {
      mounts.push({
        container: container,
        canEdit: canEdit,
        handle: handleFiles,
        isVisible: function () {
          return document.body.contains(container) && container.offsetParent !== null;
        },
      });
      installPasteHandler();
    }

    render();
    return { getAttachments: function () { return items.slice(); } };
  }

  window.TaskAttachments = { mount: mount, openLightbox: openLightbox };
})();
