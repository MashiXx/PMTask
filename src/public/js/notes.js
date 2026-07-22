// ── Notes: list interactions + editor with EasyMDE autosave ──

// Create a blank note, then navigate into its editor.
async function createNote() {
  try {
    const res = await fetch('/notes/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error('create failed');
    const data = await res.json();
    window.location = '/notes/' + data.note.id;
  } catch (err) {
    console.error('Failed to create note:', err);
  }
}

// Delete a note (works from both list cards and the editor topbar).
async function deleteNote(id) {
  if (!confirm(t('js.notes.deleteConfirm'))) return;
  try {
    const res = await fetch('/notes/api/' + id, { method: 'DELETE' });
    if (!res.ok) throw new Error('delete failed');
    const card = document.querySelector('.note-card[data-note-id="' + id + '"]');
    if (card) {
      card.remove();
      if (!document.querySelector('.note-card')) window.location.reload();
    } else {
      window.location = '/notes';
    }
  } catch (err) {
    console.error('Failed to delete note:', err);
  }
}

// Toggle the pinned flag from a list card; update the icon in place.
async function togglePin(id, btn) {
  try {
    const res = await fetch('/notes/api/' + id + '/pin', { method: 'PATCH' });
    if (!res.ok) throw new Error('pin failed');
    const data = await res.json();
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', data.pinned ? 'var(--amber)' : 'none');
      svg.setAttribute('stroke', data.pinned ? 'var(--amber)' : 'currentColor');
    }
    btn.classList.toggle('is-pinned', data.pinned);
    btn.title = data.pinned ? t('js.notes.unpin') : t('js.notes.pin');
  } catch (err) {
    console.error('Failed to toggle pin:', err);
  }
}

// ── List page: client-side title search ──
(function () {
  const search = document.getElementById('notesSearch');
  if (!search) return;
  const noMatch = document.getElementById('notesNoMatch');
  search.addEventListener('input', function () {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.note-card').forEach(function (card) {
      const match = (card.dataset.title || '').includes(q);
      card.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    if (noMatch) noMatch.classList.toggle('hidden', visible !== 0);
  });
})();

// ── Editor page: EasyMDE + debounced autosave ──
(function () {
  const NOTE = window.NOTE_DATA;
  if (!NOTE) return;

  const statusEl = document.getElementById('noteSaveStatus');
  const titleInput = document.getElementById('noteTitle');
  let saveTimer = null;
  let saving = false;
  let dirty = false;

  function setStatus(key) {
    if (statusEl) statusEl.textContent = key ? t(key) : '';
  }

  const easyMDE = new EasyMDE({
    element: document.getElementById('noteEditor'),
    spellChecker: false,
    autofocus: true,
    placeholder: t('js.notes.editorPlaceholder'),
    status: false,
    minHeight: '420px',
    toolbar: [
      'bold', 'italic', 'strikethrough', '|',
      'heading-1', 'heading-2', 'heading-3', '|',
      'unordered-list', 'ordered-list', 'checklist', '|',
      'link', 'code', 'quote', 'table', '|',
      'preview', 'side-by-side', '|',
      'guide',
    ],
    renderingConfig: {
      sanitizerFunction: function (html) {
        return DOMPurify.sanitize(html);
      },
    },
  });

  async function save() {
    if (saving || !dirty) return;
    saving = true;
    dirty = false;
    setStatus('js.notes.saving');
    const payload = { content: easyMDE.value(), title: titleInput ? titleInput.value.trim() : undefined };
    try {
      const res = await fetch('/notes/api/' + NOTE.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('save failed');
      setStatus('js.notes.saved');
    } catch (err) {
      console.error('Failed to save note:', err);
      dirty = true; // let the next tick retry
      setStatus('js.notes.saveFailed');
    } finally {
      saving = false;
    }
  }

  function scheduleSave() {
    dirty = true;
    setStatus('js.notes.unsaved');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }

  easyMDE.codemirror.on('change', scheduleSave);

  if (titleInput) {
    // Keep the browser tab / breadcrumb in sync and mark dirty on edit.
    titleInput.addEventListener('input', function () {
      const crumb = document.getElementById('noteBreadcrumb');
      if (crumb) crumb.textContent = titleInput.value.trim() || t('js.notes.untitled');
      scheduleSave();
    });
    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); easyMDE.codemirror.focus(); }
    });
  }

  // Ctrl/Cmd+S forces an immediate save.
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimer) clearTimeout(saveTimer);
      save();
    }
  });

  // Flush a pending save before leaving the page (keepalive lets it finish during unload).
  window.addEventListener('pagehide', function () {
    if (!dirty) return;
    try {
      fetch('/notes/api/' + NOTE.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: easyMDE.value(), title: titleInput ? titleInput.value.trim() : undefined }),
        keepalive: true,
      });
    } catch (err) { /* best-effort on unload */ }
  });
})();
