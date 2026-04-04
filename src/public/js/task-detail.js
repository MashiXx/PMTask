// ── Task Detail Page: Inline Editing with EasyMDE ──

(function () {
  const TASK = window.TASK_DATA;
  if (!TASK) return;

  let easyMDE = null;
  let isEditing = false;

  // ── Render markdown description on load ──
  function renderDescription() {
    const el = document.getElementById('descriptionRendered');
    if (!el) return;

    if (TASK.description && TASK.description.trim()) {
      const html = DOMPurify.sanitize(marked.parse(TASK.description));
      el.innerHTML = '<div class="markdown-body">' + html + '</div>';
    } else if (TASK.canEdit) {
      el.innerHTML = '<span class="desc-placeholder">Click to add description...</span>';
    } else {
      el.innerHTML = '<span style="color: var(--text-dim);">No description</span>';
    }
  }

  // ── Open EasyMDE editor ──
  function openEditor() {
    if (isEditing || !TASK.canEdit) return;
    isEditing = true;

    const rendered = document.getElementById('descriptionRendered');
    const editorWrap = document.getElementById('descriptionEditorWrap');
    if (!rendered || !editorWrap) return;

    rendered.classList.add('hidden');
    editorWrap.classList.remove('hidden');

    if (!easyMDE) {
      easyMDE = new EasyMDE({
        element: document.getElementById('descriptionEditor'),
        spellChecker: false,
        autofocus: true,
        placeholder: 'Write your description using Markdown...',
        status: false,
        minHeight: '200px',
        toolbar: [
          'bold', 'italic', 'strikethrough', '|',
          'heading-1', 'heading-2', 'heading-3', '|',
          'unordered-list', 'ordered-list', 'checklist', '|',
          'link', 'code', 'quote', '|',
          'preview', 'side-by-side', '|',
          'guide'
        ],
      });
    } else {
      easyMDE.codemirror.focus();
    }
  }

  // ── Save description ──
  window.saveDescription = async function () {
    if (!easyMDE || !TASK.canEdit) return;

    const description = easyMDE.value();
    TASK.description = description;

    try {
      await fetch('/api/tasks/' + TASK.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
    } catch (err) {
      console.error('Failed to save description:', err);
    }

    closeEditor();
  };

  // ── Cancel editing ──
  window.cancelDescription = function () {
    if (easyMDE) {
      easyMDE.value(TASK.description || '');
    }
    closeEditor();
  };

  function closeEditor() {
    isEditing = false;
    const rendered = document.getElementById('descriptionRendered');
    const editorWrap = document.getElementById('descriptionEditorWrap');
    if (rendered) rendered.classList.remove('hidden');
    if (editorWrap) editorWrap.classList.add('hidden');
    renderDescription();
  }

  // ── Click to edit description ──
  const renderedEl = document.getElementById('descriptionRendered');
  if (renderedEl && TASK.canEdit) {
    renderedEl.addEventListener('click', openEditor);
    renderedEl.style.cursor = 'pointer';
  }

  // ── Ctrl+S to save while editing ──
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && isEditing) {
      e.preventDefault();
      window.saveDescription();
    }
    if (e.key === 'Escape' && isEditing) {
      e.preventDefault();
      window.cancelDescription();
    }
  });

  // ── Title inline edit (auto-save on blur) ──
  const titleInput = document.getElementById('detailTitle');
  if (titleInput) {
    titleInput.addEventListener('blur', async function () {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.value = TASK.description ? document.querySelector('.breadcrumb-text:last-child')?.textContent || '' : '';
        return;
      }
      try {
        await fetch('/api/tasks/' + TASK.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        // Update breadcrumb
        const breadcrumb = document.querySelector('.breadcrumb-text:last-child');
        if (breadcrumb) breadcrumb.textContent = title;
      } catch (err) {
        console.error('Failed to save title:', err);
      }
    });

    titleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.blur();
      }
    });
  }

  // ── Status/Priority/DueDate inline selects (auto-save on change) ──
  const statusSelect = document.getElementById('detailStatusSelect');
  const prioritySelect = document.getElementById('detailPrioritySelect');
  const dueDateInput = document.getElementById('detailDueDate');

  async function saveMetaField() {
    const data = {};
    if (statusSelect) data.status = statusSelect.value;
    if (prioritySelect) data.priority = prioritySelect.value;
    if (dueDateInput) data.dueDate = dueDateInput.value;

    try {
      await fetch('/api/tasks/' + TASK.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error('Failed to save field:', err);
    }
  }

  if (statusSelect) statusSelect.addEventListener('change', saveMetaField);
  if (prioritySelect) prioritySelect.addEventListener('change', saveMetaField);
  if (dueDateInput) dueDateInput.addEventListener('change', saveMetaField);

  // ── Initial render ──
  renderDescription();
})();
