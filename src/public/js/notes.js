// ── Notes: a Google-Keep-style board ──
// Cards render client-side from window.NOTES_DATA so content is always run
// through DOMPurify before it touches the DOM, and one code path handles
// initial render, create and update. The editor (modal) is shared by the
// "take a note" composer (create mode) and card editing (edit mode).

(function () {
  if (!document.getElementById('noteComposer')) return; // not the notes board

  // ── State ──
  var notes = (window.NOTES_DATA || []).slice();
  var labels = (window.NOTE_LABELS || []).slice();
  var COLORS = window.NOTE_COLORS || ['default'];
  var activeFilter = null;   // labelId to filter by, or null
  var searchQuery = '';

  // Recognisable Keep palette (light values); dark variants live in CSS.
  var SWATCHES = {
    default: 'transparent', coral: '#faafa8', peach: '#f39f76', sand: '#fff8b8',
    mint: '#e2f6d3', sage: '#b4ddd3', fog: '#d4e4ed', storm: '#aeccdc',
    dusk: '#d3bfdb', blossom: '#f6e2dd', clay: '#e9e3d4',
  };

  // ── Helpers ──
  function tr(key, vars) { return (window.t ? window.t(key, vars) : key); }

  function sanitize(html) {
    return window.DOMPurify
      ? window.DOMPurify.sanitize(html || '', { ADD_ATTR: ['controls', 'target'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] })
      : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Everything the board needs to know about a note body, from ONE sanitize +
  // parse. Cards need the plain text, the first image and the body-minus-that-
  // image, and re-parsing for each would mean three passes per card per render.
  //
  //   text        — plain-text digest, for search + empty detection
  //   imageSrc    — src of the first <img>, read off the SANITIZED DOM so a
  //                 hostile src can never reach the card ('' when there is none)
  //   html        — the sanitized body, ready to render
  //   htmlNoImage — body with that leading <img> removed, for when the image was
  //                 promoted to the cover and must not appear twice
  function parseBody(html) {
    var d = document.createElement('div');
    d.innerHTML = sanitize(html);
    var text = (d.textContent || '').trim();
    var safeHtml = d.innerHTML;
    var img = d.querySelector('img');
    var imageSrc = (img && img.getAttribute('src')) || '';
    if (img && img.parentNode) img.parentNode.removeChild(img);
    return { text: text, imageSrc: imageSrc, html: safeHtml, htmlNoImage: d.innerHTML };
  }

  // Plain-text digest of a note's HTML content, for search + empty detection.
  function textOf(html) {
    return parseBody(html).text;
  }

  async function api(url, opts) {
    var res = await fetch(url, opts);
    if (!res.ok) {
      var msg = 'Request failed';
      try { msg = (await res.json()).error || msg; } catch (e) {}
      throw new Error(msg);
    }
    return res.status === 204 ? {} : res.json();
  }

  function findNote(id) { return notes.find(function (n) { return n.id === id; }); }
  function labelById(id) { return labels.find(function (l) { return l.id === id; }); }

  // ══════════════════════════════════════════════════════════════════════
  //  Board rendering
  // ══════════════════════════════════════════════════════════════════════
  var pinnedSection = document.getElementById('pinnedSection');
  var othersSection = document.getElementById('othersSection');
  var pinnedBoard = document.getElementById('pinnedBoard');
  var othersBoard = document.getElementById('othersBoard');
  var othersTitle = document.getElementById('othersTitle');
  var emptyState = document.getElementById('notesEmpty');
  var noMatchState = document.getElementById('notesNoMatch');

  function noteMatches(n) {
    if (activeFilter && !n.labels.some(function (l) { return l.id === activeFilter; })) return false;
    if (searchQuery) {
      var hay = (n.title + ' ' + textOf(n.content)).toLowerCase();
      if (hay.indexOf(searchQuery) === -1) return false;
    }
    return true;
  }

  function renderBoard() {
    var visible = notes.filter(noteMatches);
    var pinned = visible.filter(function (n) { return n.pinned; });
    var others = visible.filter(function (n) { return !n.pinned; });

    pinnedBoard.innerHTML = '';
    othersBoard.innerHTML = '';
    pinned.forEach(function (n) { pinnedBoard.appendChild(buildCard(n)); });
    others.forEach(function (n) { othersBoard.appendChild(buildCard(n)); });

    pinnedSection.hidden = pinned.length === 0;
    othersSection.hidden = others.length === 0;
    // Only show the "Others" heading when there are also pinned notes.
    othersTitle.style.display = pinned.length ? '' : 'none';

    emptyState.hidden = notes.length !== 0;
    noMatchState.hidden = !(notes.length !== 0 && visible.length === 0);
  }

  function buildCard(n) {
    var card = document.createElement('div');
    card.className = 'keep-card note-color-' + n.color;
    card.dataset.noteId = n.id;

    var body = document.createElement('div');
    body.className = 'keep-card-body';
    body.addEventListener('click', function () { openEditor(n.id, false); });

    var parsed = parseBody(n.content);

    // Cover: the note's first image (see note-card.js for the precedence).
    var cover = pickNoteCover(n.media, parsed.imageSrc);
    if (cover) {
      var wrap = document.createElement('div');
      wrap.className = 'keep-card-cover';
      var el;
      if (cover.type === 'video') {
        el = document.createElement('video');
        el.src = '/notes/api/media/' + cover.id;
        el.muted = true; el.preload = 'metadata';
      } else {
        el = document.createElement('img');
        el.src = cover.source === 'media' ? '/notes/api/media/' + cover.id : cover.src;
        el.loading = 'lazy'; el.alt = '';
      }
      wrap.appendChild(el);
      body.appendChild(wrap);
    }

    if (n.title) {
      var title = document.createElement('div');
      title.className = 'keep-card-title';
      title.textContent = n.title;
      body.appendChild(title);
    }

    var text = parsed.text;
    if (text) {
      var content = document.createElement('div');
      content.className = 'keep-card-content';
      content.innerHTML = cover && cover.source === 'content'
        ? parsed.htmlNoImage
        : parsed.html;
      body.appendChild(content);
    }

    if (!n.title && !text && !cover) {
      var ph = document.createElement('div');
      ph.className = 'keep-card-empty';
      ph.textContent = tr('js.notes.emptyNote');
      body.appendChild(ph);
    }

    if (n.labels && n.labels.length) {
      var chips = document.createElement('div');
      chips.className = 'keep-card-labels';
      n.labels.forEach(function (l) {
        var chip = document.createElement('span');
        chip.className = 'keep-label-chip';
        chip.style.borderColor = l.color;
        chip.textContent = l.name;
        chips.appendChild(chip);
      });
      body.appendChild(chips);
    }

    card.appendChild(body);

    // Hover toolbar
    var bar = document.createElement('div');
    bar.className = 'keep-card-toolbar';
    bar.appendChild(iconBtn(n.pinned ? 'unpin' : 'pin', pinSVG(n.pinned), function (e) {
      e.stopPropagation(); togglePin(n.id);
    }, n.pinned ? 'is-active' : ''));
    bar.appendChild(iconBtn('changeColor', ICONS.palette, function (e) {
      e.stopPropagation(); openColorPopover(e.currentTarget, n.id);
    }));
    bar.appendChild(iconBtn('addLabel', ICONS.tag, function (e) {
      e.stopPropagation(); openLabelPopover(e.currentTarget, n.id);
    }));
    bar.appendChild(iconBtn('delete', ICONS.trash, function (e) {
      e.stopPropagation(); deleteNote(n.id);
    }, 'text-coral'));
    card.appendChild(bar);

    return card;
  }

  function iconBtn(titleKey, svg, handler, extra) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'keep-icon-btn ' + (extra || '');
    b.title = tr('js.notes.' + titleKey);
    b.innerHTML = svg;
    b.addEventListener('click', handler);
    return b;
  }

  var ICONS = {
    palette: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
    tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  function pinSVG(active) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (active ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>';
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Card-level actions
  // ══════════════════════════════════════════════════════════════════════
  async function togglePin(id) {
    var n = findNote(id);
    if (!n) return;
    try {
      var data = await api('/notes/api/' + id + '/pin', { method: 'PATCH' });
      n.pinned = data.pinned;
      renderBoard();
    } catch (e) { console.error('pin failed', e); }
  }

  async function setColor(id, color) {
    var n = findNote(id);
    if (!n) return;
    n.color = color;
    // Reflect immediately on the board + any open editor.
    renderBoard();
    if (modal.noteId === id) applyModalColor(color);
    try {
      await api('/notes/api/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: color }),
      });
    } catch (e) { console.error('color failed', e); }
  }

  async function deleteNote(id) {
    if (!confirm(tr('js.notes.deleteConfirm'))) return;
    try {
      await api('/notes/api/' + id, { method: 'DELETE' });
      notes = notes.filter(function (n) { return n.id !== id; });
      if (modal.noteId === id) closeModal(true);
      renderBoard();
    } catch (e) { console.error('delete failed', e); }
  }

  // ── Color popover ──
  function openColorPopover(anchor, id) {
    closePopovers();
    var pop = document.createElement('div');
    pop.className = 'keep-popover keep-color-popover';
    COLORS.forEach(function (c) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'keep-color-dot' + (c === 'default' ? ' is-default' : '');
      dot.style.background = SWATCHES[c] || 'transparent';
      dot.title = tr('js.notes.color.' + c);
      var n = findNote(id);
      if (n && n.color === c) dot.classList.add('selected');
      dot.addEventListener('click', function (e) {
        e.stopPropagation(); setColor(id, c); closePopovers();
      });
      pop.appendChild(dot);
    });
    positionPopover(pop, anchor);
  }

  // ── Label popover (attach/detach labels to a note) ──
  function openLabelPopover(anchor, id) {
    closePopovers();
    var n = findNote(id);
    if (!n) return;
    var pop = document.createElement('div');
    pop.className = 'keep-popover keep-label-popover';

    var head = document.createElement('div');
    head.className = 'keep-popover-title';
    head.textContent = tr('js.notes.labelNote');
    pop.appendChild(head);

    var list = document.createElement('div');
    list.className = 'keep-label-list';
    pop.appendChild(list);

    function paintList() {
      list.innerHTML = '';
      if (!labels.length) {
        var none = document.createElement('div');
        none.className = 'keep-label-none';
        none.textContent = tr('js.notes.noLabels');
        list.appendChild(none);
      }
      labels.forEach(function (l) {
        var row = document.createElement('label');
        row.className = 'keep-label-row';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = n.labels.some(function (x) { return x.id === l.id; });
        cb.addEventListener('change', function () { toggleNoteLabel(id, l.id, cb.checked); });
        var dot = document.createElement('span');
        dot.className = 'keep-label-swatch';
        dot.style.background = l.color;
        var name = document.createElement('span');
        name.className = 'keep-label-name';
        name.textContent = l.name;
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'keep-label-del';
        del.innerHTML = ICONS.trash;
        del.title = tr('js.notes.deleteLabel');
        del.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); deleteLabel(l.id, paintList);
        });
        row.appendChild(cb); row.appendChild(dot); row.appendChild(name); row.appendChild(del);
        list.appendChild(row);
      });
    }
    paintList();

    // Create-new-label row
    var form = document.createElement('form');
    form.className = 'keep-label-create';
    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = tr('js.notes.newLabel');
    input.maxLength = 60;
    var add = document.createElement('button');
    add.type = 'submit';
    add.className = 'keep-label-add-btn';
    add.textContent = '+';
    form.appendChild(input); form.appendChild(add);
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = input.value.trim();
      if (!name) return;
      try {
        var data = await api('/notes/api/labels', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name }),
        });
        if (!labelById(data.label.id)) labels.push(data.label);
        labels.sort(function (a, b) { return a.name.localeCompare(b.name); });
        input.value = '';
        paintList();
        renderFilterBar();
        // Auto-attach the freshly created label to this note.
        toggleNoteLabel(id, data.label.id, true, true);
      } catch (err) { console.error('create label failed', err); }
    });
    pop.appendChild(form);

    positionPopover(pop, anchor);
    input.focus();
  }

  async function toggleNoteLabel(noteId, labelId, on, silent) {
    var n = findNote(noteId);
    if (!n) return;
    var ids = n.labels.map(function (l) { return l.id; });
    if (on) { if (ids.indexOf(labelId) === -1) ids.push(labelId); }
    else { ids = ids.filter(function (x) { return x !== labelId; }); }
    try {
      var data = await api('/notes/api/' + noteId + '/labels', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelIds: ids }),
      });
      n.labels = data.labels;
      renderBoard();
      if (modal.noteId === noteId) renderModalLabels(n);
    } catch (e) { console.error('toggle label failed', e); }
  }

  async function deleteLabel(labelId, after) {
    if (!confirm(tr('js.notes.deleteLabelConfirm'))) return;
    try {
      await api('/notes/api/labels/' + labelId, { method: 'DELETE' });
      labels = labels.filter(function (l) { return l.id !== labelId; });
      notes.forEach(function (n) {
        n.labels = n.labels.filter(function (l) { return l.id !== labelId; });
      });
      if (activeFilter === labelId) activeFilter = null;
      if (after) after();
      renderFilterBar();
      renderBoard();
      if (modal.noteId != null) { var n = findNote(modal.noteId); if (n) renderModalLabels(n); }
    } catch (e) { console.error('delete label failed', e); }
  }

  // ── Popover plumbing ──
  function positionPopover(pop, anchor) {
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + window.scrollY + 6;
    var left = r.left + window.scrollX;
    // Keep within viewport horizontally.
    var w = pop.offsetWidth;
    if (left + w > window.scrollX + document.documentElement.clientWidth - 8) {
      left = window.scrollX + document.documentElement.clientWidth - w - 8;
    }
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, left) + 'px';
    pop.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function closePopovers() {
    document.querySelectorAll('.keep-popover').forEach(function (p) { p.remove(); });
  }
  document.addEventListener('click', closePopovers);

  // ══════════════════════════════════════════════════════════════════════
  //  Label filter bar
  // ══════════════════════════════════════════════════════════════════════
  var filterBar = document.getElementById('labelFilterBar');

  function renderFilterBar() {
    filterBar.innerHTML = '';
    if (!labels.length) { filterBar.hidden = true; return; }
    filterBar.hidden = false;

    var all = document.createElement('button');
    all.type = 'button';
    all.className = 'keep-filter-chip' + (activeFilter === null ? ' active' : '');
    all.textContent = tr('js.notes.allNotes');
    all.addEventListener('click', function () { activeFilter = null; renderFilterBar(); renderBoard(); });
    filterBar.appendChild(all);

    labels.forEach(function (l) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'keep-filter-chip' + (activeFilter === l.id ? ' active' : '');
      chip.style.setProperty('--chip-color', l.color);
      chip.innerHTML = '<span class="keep-filter-dot" style="background:' + esc(l.color) + '"></span>' + esc(l.name);
      chip.addEventListener('click', function () {
        activeFilter = (activeFilter === l.id) ? null : l.id;
        renderFilterBar(); renderBoard();
      });
      filterBar.appendChild(chip);
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Composer ("Take a note...")
  // ══════════════════════════════════════════════════════════════════════
  var composer = document.getElementById('noteComposer');

  function renderComposer() {
    composer.innerHTML =
      '<div class="keep-composer-bar">' +
        '<span class="keep-composer-placeholder">' + esc(tr('js.notes.takeNote')) + '</span>' +
        '<div class="keep-composer-actions">' +
          '<button type="button" class="keep-icon-btn" data-act="image" title="' + esc(tr('js.notes.addImage')) + '">' + ICONS.image + '</button>' +
        '</div>' +
      '</div>';
    composer.querySelector('.keep-composer-placeholder').addEventListener('click', function () { newNote(false); });
    composer.querySelector('[data-act="image"]').addEventListener('click', function (e) {
      e.stopPropagation(); newNote(true);
    });
  }

  async function newNote(withImage) {
    // Adopt the label currently being filtered on: a note created from a
    // filtered board should belong to that view, not vanish out of it.
    var autoLabelId = activeFilter;
    try {
      var data = await api('/notes/api', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '', content: '',
          labelIds: autoLabelId ? [autoLabelId] : [],
        }),
      });
      data.note._isNew = true;
      notes.unshift(data.note);
      openEditor(data.note.id, true);
      modal.autoLabelId = autoLabelId;
      if (withImage) setTimeout(function () { triggerMediaPicker(); }, 50);
    } catch (e) { console.error('create note failed', e); }
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Editor modal (shared by create + edit)
  // ══════════════════════════════════════════════════════════════════════
  var overlay = document.getElementById('noteModal');
  var modalCard = document.getElementById('noteModalCard');
  var modal = { noteId: null, isNew: false, autoLabelId: null, saveTimer: null, dirty: false, els: {} };

  function openEditor(id, isNew) {
    var n = findNote(id);
    if (!n) return;
    modal.noteId = id;
    // Only newNote() sets this, right after opening; never inherit it.
    modal.autoLabelId = null;
    modal.isNew = !!isNew;
    modal.dirty = false;
    buildModal(n);
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      if (n.title) modal.els.body.focus(); else modal.els.title.focus();
    }, 30);
  }

  function buildModal(n) {
    modalCard.className = 'keep-modal note-color-' + n.color;
    modalCard.innerHTML = '';

    // Title
    var title = document.createElement('input');
    title.type = 'text';
    title.className = 'keep-modal-title';
    title.placeholder = tr('js.notes.titlePlaceholder');
    title.value = n.title === 'Untitled' ? '' : n.title;
    title.maxLength = 255;

    // Media gallery (existing uploads, deletable)
    var gallery = document.createElement('div');
    gallery.className = 'keep-modal-media';

    // Rich-text body
    var body = document.createElement('div');
    body.className = 'keep-modal-body';
    body.contentEditable = 'true';
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-multiline', 'true');
    body.dataset.placeholder = tr('js.notes.bodyPlaceholder');
    body.innerHTML = sanitize(n.content);

    // Label chips inside the editor
    var labelWrap = document.createElement('div');
    labelWrap.className = 'keep-modal-labels';

    // Formatting toolbar
    var toolbar = buildToolbar();

    // Footer: color / label / image / delete / close
    var footer = document.createElement('div');
    footer.className = 'keep-modal-footer';
    footer.appendChild(iconBtn('changeColor', ICONS.palette, function (e) {
      e.stopPropagation(); openColorPopover(e.currentTarget, n.id);
    }));
    footer.appendChild(iconBtn('addImage', ICONS.image, function (e) {
      e.stopPropagation(); triggerMediaPicker();
    }));
    footer.appendChild(iconBtn('addLabel', ICONS.tag, function (e) {
      e.stopPropagation(); openLabelPopover(e.currentTarget, n.id);
    }));
    footer.appendChild(iconBtn(n.pinned ? 'unpin' : 'pin', pinSVG(n.pinned), function (e) {
      e.stopPropagation();
      var btn = e.currentTarget; // capture: currentTarget is null inside the async .then
      togglePin(n.id).then(function () {
        var nn = findNote(n.id);
        if (!nn || !btn) return;
        btn.classList.toggle('is-active', nn.pinned);
        btn.innerHTML = pinSVG(nn.pinned);
        btn.title = tr('js.notes.' + (nn.pinned ? 'unpin' : 'pin'));
      });
    }, n.pinned ? 'is-active' : ''));
    footer.appendChild(iconBtn('delete', ICONS.trash, function (e) {
      e.stopPropagation(); deleteNote(n.id);
    }, 'text-coral'));

    var spacer = document.createElement('div');
    spacer.className = 'keep-modal-footer-spacer';
    footer.appendChild(spacer);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'keep-modal-close';
    closeBtn.textContent = tr('js.notes.close');
    closeBtn.addEventListener('click', function () { closeModal(false); });
    footer.appendChild(closeBtn);

    modalCard.appendChild(title);
    modalCard.appendChild(gallery);
    modalCard.appendChild(body);
    modalCard.appendChild(labelWrap);
    modalCard.appendChild(toolbar);
    modalCard.appendChild(footer);

    modal.els = { title: title, body: body, gallery: gallery, labelWrap: labelWrap };

    // Change wiring
    title.addEventListener('input', scheduleSave);
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); body.focus(); }
    });
    body.addEventListener('input', scheduleSave);
    // Checklist toggling (click in the checkbox gutter of a .keep-check li)
    body.addEventListener('click', function (e) {
      var li = e.target.closest && e.target.closest('.keep-check > li');
      if (li && e.offsetX < 26) { li.classList.toggle('done'); scheduleSave(); }
    });

    renderModalMedia(n);
    renderModalLabels(n);
  }

  function buildToolbar() {
    var bar = document.createElement('div');
    bar.className = 'keep-editor-toolbar';
    var groups = [
      [['bold', 'B', 'bold', "document.execCommand('bold')"],
       ['italic', 'I', 'italic'],
       ['underline', 'U', 'underline'],
       ['strike', 'S', 'strikeThrough']],
      [['h1', 'H1', 'formatBlock', 'H1'],
       ['h2', 'H2', 'formatBlock', 'H2'],
       ['quote', '❝', 'formatBlock', 'BLOCKQUOTE']],
      [['bullet', '•', 'insertUnorderedList'],
       ['number', '1.', 'insertOrderedList'],
       ['checklist', '☑', 'checklist']],
      [['link', '🔗', 'link'],
       ['clear', '⨯', 'removeFormat']],
    ];
    groups.forEach(function (g, gi) {
      g.forEach(function (item) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'keep-fmt-btn keep-fmt-' + item[0];
        b.innerHTML = item[1];
        b.title = tr('js.notes.fmt.' + item[0]);
        b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep selection
        b.addEventListener('click', function () { runFormat(item); });
        bar.appendChild(b);
      });
      if (gi < groups.length - 1) {
        var sep = document.createElement('span');
        sep.className = 'keep-fmt-sep';
        bar.appendChild(sep);
      }
    });
    return bar;
  }

  function runFormat(item) {
    var cmd = item[2];
    modal.els.body.focus();
    if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, item[3]);
    } else if (cmd === 'link') {
      var url = prompt(tr('js.notes.linkPrompt'), 'https://');
      if (url) document.execCommand('createLink', false, url);
    } else if (cmd === 'checklist') {
      document.execCommand('insertHTML', false, '<ul class="keep-check"><li>​</li></ul>');
    } else {
      document.execCommand(cmd, false, null);
    }
    scheduleSave();
  }

  function applyModalColor(color) {
    modalCard.className = 'keep-modal note-color-' + color;
  }

  function renderModalLabels(n) {
    var wrap = modal.els.labelWrap;
    if (!wrap) return;
    wrap.innerHTML = '';
    n.labels.forEach(function (l) {
      var chip = document.createElement('span');
      chip.className = 'keep-modal-label-chip';
      chip.style.borderColor = l.color;
      chip.innerHTML = esc(l.name) + '<button type="button" class="keep-modal-label-x" aria-label="remove">&times;</button>';
      chip.querySelector('button').addEventListener('click', function () {
        toggleNoteLabel(n.id, l.id, false);
      });
      wrap.appendChild(chip);
    });
  }

  function renderModalMedia(n) {
    var g = modal.els.gallery;
    if (!g) return;
    g.innerHTML = '';
    (n.media || []).forEach(function (m) {
      var item = document.createElement('div');
      item.className = 'keep-media-item';
      var url = '/notes/api/media/' + m.id;
      if (m.type === 'video') {
        item.innerHTML = '<video src="' + url + '" controls preload="metadata"></video>';
      } else {
        item.innerHTML = '<img src="' + url + '" alt="' + esc(m.filename) + '">';
      }
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'keep-media-del';
      del.innerHTML = ICONS.close;
      del.title = tr('js.notes.removeMedia');
      del.addEventListener('click', function () { removeMedia(n.id, m.id); });
      item.appendChild(del);
      g.appendChild(item);
    });
    g.style.display = (n.media && n.media.length) ? '' : 'none';
  }

  // ── Media upload ──
  var mediaInput = document.createElement('input');
  mediaInput.type = 'file';
  mediaInput.accept = 'image/*,video/*';
  mediaInput.style.display = 'none';
  document.body.appendChild(mediaInput);

  function triggerMediaPicker() {
    if (modal.noteId == null) return;
    mediaInput.value = '';
    mediaInput.click();
  }

  mediaInput.addEventListener('change', async function () {
    var file = mediaInput.files && mediaInput.files[0];
    if (!file || modal.noteId == null) return;
    var id = modal.noteId;
    var fd = new FormData();
    fd.append('file', file);
    try {
      var data = await api('/notes/api/' + id + '/media', { method: 'POST', body: fd });
      var n = findNote(id);
      if (!n.media) n.media = [];
      n.media.push({ id: data.media.id, type: data.media.type, filename: file.name });
      renderModalMedia(n);
      renderBoard();
    } catch (e) {
      alert(tr('js.notes.uploadFailed') + (e.message ? ': ' + e.message : ''));
    }
  });

  async function removeMedia(noteId, mediaId) {
    try {
      await api('/notes/api/media/' + mediaId, { method: 'DELETE' });
      var n = findNote(noteId);
      n.media = (n.media || []).filter(function (m) { return m.id !== mediaId; });
      renderModalMedia(n);
      renderBoard();
    } catch (e) { console.error('remove media failed', e); }
  }

  // ── Autosave ──
  function scheduleSave() {
    modal.dirty = true;
    if (modal.saveTimer) clearTimeout(modal.saveTimer);
    modal.saveTimer = setTimeout(saveModal, 700);
  }

  async function saveModal() {
    if (modal.noteId == null || !modal.dirty) return;
    var id = modal.noteId;
    var n = findNote(id);
    if (!n) return;
    modal.dirty = false;
    var title = modal.els.title.value.trim();
    var content = sanitize(modal.els.body.innerHTML);
    n.title = title || 'Untitled';
    n.content = content;
    try {
      await api('/notes/api/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, content: content }),
      });
    } catch (e) {
      // Don't swallow this: a rejected save (e.g. the note exceeds the server's
      // size cap) would otherwise leave the user typing into a note that is
      // silently no longer being persisted.
      console.error('save failed', e);
      modal.dirty = true;
      alert(tr('js.notes.saveFailed') + (e.message ? ': ' + e.message : ''));
    }
  }

  async function closeModal(skipSave) {
    if (modal.saveTimer) clearTimeout(modal.saveTimer);
    var id = modal.noteId;
    var n = id != null ? findNote(id) : null;
    if (!skipSave && modal.dirty) await saveModal();

    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    modal.noteId = null;

    // Drop a brand-new note that was left completely empty.
    if (!skipSave && modal.isNew && n && noteIsBlank(n, modal.autoLabelId)) {
      notes = notes.filter(function (x) { return x.id !== n.id; });
      try { await api('/notes/api/' + n.id, { method: 'DELETE' }); } catch (e) {}
    }
    modal.isNew = false;
    modal.autoLabelId = null;
    renderBoard();
  }

  function noteIsBlank(n, autoLabelId) {
    var parsed = parseBody(n.content);
    return isNoteEmpty({
      title: n.title,
      hasText: parsed.text.length > 0,
      hasImage: (n.media && n.media.length > 0) || !!parsed.imageSrc,
      labels: n.labels,
    }, autoLabelId);
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal(false);
  });

  // ══════════════════════════════════════════════════════════════════════
  //  Search
  // ══════════════════════════════════════════════════════════════════════
  var searchInput = document.getElementById('notesSearch');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderBoard();
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════════════════════
  renderComposer();
  renderFilterBar();
  renderBoard();

  if (window.OPEN_NOTE_ID != null) {
    // Deep link: fetch fresh + open.
    (async function () {
      try {
        var data = await api('/notes/api/' + window.OPEN_NOTE_ID, {});
        var idx = notes.findIndex(function (n) { return n.id === data.note.id; });
        if (idx >= 0) notes[idx] = data.note; else notes.unshift(data.note);
        openEditor(data.note.id, false);
      } catch (e) { /* note may have been deleted */ }
    })();
  }
})();
