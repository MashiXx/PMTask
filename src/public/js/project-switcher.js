// ── Project switcher popup + browser-remembered last project ──
(function () {
  const LAST_KEY = 'pmtask:lastProject';

  function getStored() {
    try { return localStorage.getItem(LAST_KEY); } catch (e) { return null; }
  }
  function setStored(slug) {
    try { localStorage.setItem(LAST_KEY, slug); } catch (e) {}
  }

  // ── Remember the last opened project, and honor it on entry ──
  // Runs on every page. window.ACTIVE_PROJECT_SLUG is set by the dashboard
  // when a project board is rendered.
  (function rememberLastProject() {
    const slug = window.ACTIVE_PROJECT_SLUG || null;
    const path = window.location.pathname;
    const isBareDashboard = (path === '/dashboard' || path === '/dashboard/');
    const stored = getStored();

    // Opened the app without picking a project, but the browser remembers a
    // different one than the server fell back to → go to the remembered one.
    if (isBareDashboard && stored && stored !== slug) {
      window.location.replace('/dashboard/' + stored);
      return;
    }
    // Viewing a project board → remember it for next time.
    if (slug) setStored(slug);
  })();

  // ── Popup ──
  let loaded = false;
  let allProjects = [];

  function modalEl() { return document.getElementById('projectSwitcherModal'); }

  window.openProjectSwitcher = function (event) {
    if (event) event.preventDefault();
    const modal = modalEl();
    if (!modal) return; // sidebar (and its modal) not present on this page
    modal.classList.add('active');
    const search = document.getElementById('projectSwitcherSearch');
    if (search) { search.value = ''; setTimeout(function () { search.focus(); }, 50); }
    if (!loaded) {
      fetchProjects();
    } else {
      renderList(allProjects);
    }
  };

  window.closeProjectSwitcher = function () {
    const modal = modalEl();
    if (modal) modal.classList.remove('active');
  };

  async function fetchProjects() {
    const list = document.getElementById('projectSwitcherList');
    try {
      const res = await fetch('/api/projects/list');
      if (!res.ok) throw new Error('Failed');
      allProjects = await res.json();
      loaded = true;
      renderList(allProjects);
    } catch (err) {
      console.error('Failed to load projects:', err);
      if (list) list.innerHTML = '<p class="project-switcher-empty">Failed to load projects.</p>';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function currentProjectId() {
    const slug = window.ACTIVE_PROJECT_SLUG;
    if (!slug) return null;
    const m = String(slug).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function renderList(projects) {
    const list = document.getElementById('projectSwitcherList');
    if (!list) return;
    if (!projects.length) {
      list.innerHTML = '<p class="project-switcher-empty">No projects found.</p>';
      return;
    }
    const activeId = currentProjectId();
    list.innerHTML = projects.map(function (p) {
      const isActive = p.id === activeId;
      const label = p.taskCount === 1 ? '1 task' : (p.taskCount + ' tasks');
      return '<button type="button" class="project-switcher-item' + (isActive ? ' active' : '') +
        '" data-slug="' + p.id + '-' + escapeHtml(p.slug) + '">' +
        '<span class="project-dot" style="background:' + escapeHtml(p.color) + '; box-shadow:0 0 6px ' + escapeHtml(p.color) + '55;"></span>' +
        '<span class="project-switcher-item-name">' + escapeHtml(p.name) + '</span>' +
        '<span class="project-switcher-item-count">' + label + '</span>' +
        '</button>';
    }).join('');
  }

  // Delegated handlers (modal markup is always in the DOM via the sidebar partial)
  document.addEventListener('click', function (e) {
    const item = e.target.closest && e.target.closest('.project-switcher-item');
    if (item) {
      const slug = item.dataset.slug;
      setStored(slug);
      window.location.href = '/dashboard/' + slug;
      return;
    }
    // Click on the dimmed overlay closes the popup
    const modal = modalEl();
    if (modal && e.target === modal) {
      modal.classList.remove('active');
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'projectSwitcherSearch') {
      const q = e.target.value.trim().toLowerCase();
      renderList(q ? allProjects.filter(function (p) { return p.name.toLowerCase().indexOf(q) !== -1; }) : allProjects);
    }
  });

  document.addEventListener('keydown', function (e) {
    const modal = modalEl();
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
})();
