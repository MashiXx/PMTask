// Shared lightweight UI helpers for mindmap pages: toast + prompt/confirm modals
// (replaces native prompt/alert/confirm with on-brand, non-blocking UI).
(function () {
  function toast(message, type) {
    let host = document.getElementById('mmToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'mmToastHost';
      host.className = 'mm-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'mm-toast' + (type === 'error' ? ' mm-toast-error' : '');
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2800);
  }

  // Modal returning a Promise. input:true => resolves to trimmed string or null (cancel).
  // input:false => resolves to true/false.
  function dialog({ title, value, confirmText, input, danger }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'mm-dialog-overlay';
      overlay.innerHTML = `
        <div class="mm-dialog" role="dialog" aria-modal="true">
          <div class="mm-dialog-title"></div>
          ${input ? '<input class="mm-dialog-input" type="text" autocomplete="off">' : ''}
          <div class="mm-dialog-actions">
            <button class="mm-dialog-cancel" type="button">Cancel</button>
            <button class="mm-dialog-ok${danger ? ' danger' : ''}" type="button"></button>
          </div>
        </div>`;
      overlay.querySelector('.mm-dialog-title').textContent = title;
      overlay.querySelector('.mm-dialog-ok').textContent = confirmText || 'OK';
      document.body.appendChild(overlay);
      const inputEl = overlay.querySelector('.mm-dialog-input');
      if (inputEl) { inputEl.value = value || ''; setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30); }
      function close(result) { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(result); }
      function ok() { close(input ? (inputEl.value.trim() || null) : true); }
      function cancel() { close(input ? null : false); }
      overlay.querySelector('.mm-dialog-ok').onclick = ok;
      overlay.querySelector('.mm-dialog-cancel').onclick = cancel;
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) cancel(); });
      function onKey(e) {
        if (e.key === 'Escape') cancel();
        else if (e.key === 'Enter' && input) ok();
      }
      document.addEventListener('keydown', onKey);
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  window.mmToast = toast;
  window.mmPrompt = (title, value, confirmText) => dialog({ title, value, input: true, confirmText: confirmText || 'Save' });
  window.mmConfirm = (title, confirmText) => dialog({ title, input: false, danger: true, confirmText: confirmText || 'Delete' });
})();
