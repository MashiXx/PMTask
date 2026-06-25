(function () {
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(marked.parse(text || ''));
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function relativeTime(iso) {
    const then = new Date(iso).getTime();
    const s = Math.round((Date.now() - then) / 1000);
    if (s < 60) return t('js.comment.justNow');
    const m = Math.round(s / 60);
    if (m < 60) return t(m > 1 ? 'js.comment.minutesAgo' : 'js.comment.minuteAgo', { n: m });
    const h = Math.round(m / 60);
    if (h < 24) return t(h > 1 ? 'js.comment.hoursAgo' : 'js.comment.hourAgo', { n: h });
    const d = Math.round(h / 24);
    if (d < 30) return t(d > 1 ? 'js.comment.daysAgo' : 'js.comment.dayAgo', { n: d });
    return new Date(iso).toLocaleDateString();
  }

  function avatarInner(u) {
    if (u && u.avatar) {
      const src = /^https?:\/\//i.test(u.avatar)
        ? u.avatar
        : '/users/' + u.id + '/avatar' + (u.updatedAt ? '?v=' + new Date(u.updatedAt).getTime() : '');
      return '<img src="' + escapeHtml(src) + '" alt="">';
    }
    return u && u.name ? escapeHtml(u.name.charAt(0).toUpperCase()) : '?';
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json(); });
  }

  const instances = {};

  function mount(opts) {
    const root = document.getElementById(opts.container);
    if (!root) return;
    const state = {
      container: opts.container,
      taskId: opts.taskId,
      canEdit: !!opts.canEdit,
      currentUserId: opts.currentUserId,
      isAdmin: !!opts.isAdmin,
      root: root,
      raw: {},
      bound: instances[opts.container] ? instances[opts.container].bound : false,
    };
    instances[opts.container] = state;
    if (!state.bound) { bind(state); state.bound = true; }
    load(state);
  }

  function load(state) {
    state.root.innerHTML = '<div class="comment-loading">' + t('js.comment.loading') + '</div>';
    api('GET', '/api/comments/task/' + state.taskId)
      .then(function (data) { render(state, Array.isArray(data) ? data : []); })
      .catch(function () { state.root.innerHTML = '<div class="comment-empty">' + t('js.comment.loadFailed') + '</div>'; });
  }

  function render(state, comments) {
    state.raw = {};
    state.root.innerHTML = '';
    if (state.canEdit) state.root.appendChild(composer(state, null));
    if (!comments.length) {
      const empty = document.createElement('div');
      empty.className = 'comment-empty';
      empty.textContent = t('js.comment.empty');
      state.root.appendChild(empty);
      return;
    }
    comments.forEach(function (c) { state.root.appendChild(itemEl(state, c, false)); });
  }

  function itemEl(state, c, isReply) {
    state.raw[c.id] = c.content;
    const wrap = document.createElement('div');
    wrap.className = 'comment-item' + (isReply ? ' comment-reply' : '');
    wrap.dataset.commentId = c.id;
    const edited = new Date(c.updatedAt) > new Date(c.createdAt);
    const manage = state.canEdit && (state.isAdmin || (c.author && c.author.id === state.currentUserId));

    const row = document.createElement('div');
    row.className = 'comment-row';
    row.innerHTML =
      '<div class="comment-avatar" title="' + escapeHtml(c.author.name) + '">' + avatarInner(c.author) + '</div>' +
      '<div class="comment-main">' +
        '<div class="comment-head">' +
          '<span class="comment-author">' + escapeHtml(c.author.name) + '</span>' +
          '<span class="comment-time" title="' + escapeHtml(new Date(c.createdAt).toLocaleString()) + '">' +
            escapeHtml(relativeTime(c.createdAt)) + (edited ? ' (' + t('js.comment.edited') + ')' : '') +
          '</span>' +
        '</div>' +
        '<div class="comment-body markdown-body">' + renderMarkdown(c.content) + '</div>' +
        '<div class="comment-actions">' +
          (!isReply && state.canEdit ? '<button type="button" class="comment-link-btn" data-act="reply">' + t('js.comment.reply') + '</button>' : '') +
          (manage ? '<button type="button" class="comment-link-btn" data-act="edit">' + t('js.comment.edit') + '</button>' : '') +
          (manage ? '<button type="button" class="comment-link-btn danger" data-act="delete">' + t('js.comment.delete') + '</button>' : '') +
        '</div>' +
      '</div>';
    wrap.appendChild(row);

    if (!isReply) {
      const sub = document.createElement('div');
      sub.className = 'comment-sub';
      (c.replies || []).forEach(function (r) { sub.appendChild(itemEl(state, r, true)); });
      wrap.appendChild(sub);
    }
    return wrap;
  }

  function composer(state, parentId) {
    const box = document.createElement('div');
    box.className = 'comment-composer' + (parentId ? ' comment-composer-reply' : '');
    const ta = document.createElement('textarea');
    ta.className = 'comment-input';
    ta.rows = parentId ? 2 : 3;
    ta.placeholder = parentId ? t('js.comment.replyPlaceholder') : t('js.comment.commentPlaceholder');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'comment-submit-btn';
    btn.textContent = parentId ? t('js.comment.reply') : t('js.comment.comment');
    btn.addEventListener('click', function () {
      const content = ta.value.trim();
      if (!content) return;
      btn.disabled = true;
      api('POST', '/api/comments/task/' + state.taskId, { content: content, parentId: parentId })
        .then(function () { load(state); })
        .catch(function () { btn.disabled = false; });
    });
    box.appendChild(ta);
    box.appendChild(btn);
    return box;
  }

  function startEdit(state, itemWrap, id) {
    const main = itemWrap.querySelector('.comment-row .comment-main');
    if (!main || main.querySelector('.comment-edit')) return;
    const body = main.querySelector('.comment-body');
    const actions = main.querySelector('.comment-actions');

    const editBox = document.createElement('div');
    editBox.className = 'comment-edit';
    const ta = document.createElement('textarea');
    ta.className = 'comment-input';
    ta.rows = 3;
    ta.value = state.raw[id] || '';
    const bar = document.createElement('div');
    bar.className = 'comment-edit-bar';
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'comment-submit-btn'; save.textContent = t('js.comment.save');
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'comment-link-btn'; cancel.textContent = t('js.comment.cancel');
    save.addEventListener('click', function () {
      const content = ta.value.trim();
      if (!content) return;
      save.disabled = true;
      api('PUT', '/api/comments/' + id, { content: content })
        .then(function () { load(state); })
        .catch(function (e) { save.disabled = false; console.error('Failed to save comment', e); });
    });
    cancel.addEventListener('click', function () { load(state); });
    bar.appendChild(save); bar.appendChild(cancel);
    editBox.appendChild(ta); editBox.appendChild(bar);

    body.style.display = 'none';
    actions.style.display = 'none';
    main.insertBefore(editBox, actions);
    ta.focus();
  }

  function bind(state) {
    state.root.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (!btn || !state.root.contains(btn)) return;
      const itemWrap = btn.closest('.comment-item');
      if (!itemWrap) return;
      const id = parseInt(itemWrap.dataset.commentId, 10);
      const act = btn.dataset.act;

      if (act === 'reply') {
        const sub = itemWrap.querySelector('.comment-sub');
        const existing = sub.querySelector('.comment-composer-reply');
        if (existing) { existing.remove(); return; }
        const c = composer(state, id);
        sub.appendChild(c);
        c.querySelector('.comment-input').focus();
      } else if (act === 'edit') {
        startEdit(state, itemWrap, id);
      } else if (act === 'delete') {
        if (!confirm(t('js.comment.deleteConfirm'))) return;
        api('DELETE', '/api/comments/' + id)
          .then(function () { load(state); })
          .catch(function (e) { console.error('Failed to delete comment', e); });
      }
    });
  }

  window.TaskComments = {
    mount: mount,
    reload: function (container) { const s = instances[container]; if (s) load(s); },
  };
})();
