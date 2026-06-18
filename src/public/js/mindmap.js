const MM = {
  id: window.MINDMAP.id,
  slug: window.MINDMAP.projectSlug,
  nodes: window.MINDMAP_NODES || [],
  byId: new Map(),
  pan: { x: 80, y: 80 },
  zoom: 1,
};
const STATUS_COLORS = { todo:'#6B6B8E', inprogress:'#00D9FF', review:'#FFB347', done:'#00F5A0' };
const STATUS_LABELS = { todo:'To Do', inprogress:'In Progress', review:'In Review', done:'Completed' };

const canvasEl = document.getElementById('mmCanvas');
const viewportEl = document.getElementById('mmViewport');
const svgEl = document.getElementById('mmSvg');

function mmIndex() { MM.byId = new Map(MM.nodes.map(n => [n.id, n])); }
function mmHasChildren(id) { return MM.nodes.some(n => n.parentId === id); }

// A node is hidden when any ancestor is collapsed; hidden nodes are not rendered.
function mmVisibleNodes() {
  mmIndex();
  const collapsed = new Set(MM.nodes.filter(n => n.collapsed).map(n => n.id));
  return MM.nodes.filter(n => {
    let p = n.parentId;
    while (p != null && MM.byId.has(p)) {
      if (collapsed.has(p)) return false;
      p = MM.byId.get(p).parentId;
    }
    return true;
  });
}

// Resolve each node's render position: manual x/y wins, else auto-layout (over the visible set).
function mmPositions(visible) {
  const list = visible || mmVisibleNodes();
  const auto = computeMindmapLayout(list.map(n => ({ id:n.id, parentId:n.parentId, position:n.position })));
  const pos = {};
  for (const n of list) {
    const a = auto[n.id] || { x:0, y:0 };
    pos[n.id] = { x: n.x != null ? n.x : a.x, y: n.y != null ? n.y : a.y };
  }
  return pos;
}

function mmApplyTransform() {
  const t = `translate(${MM.pan.x}px, ${MM.pan.y}px) scale(${MM.zoom})`;
  viewportEl.style.transform = t;
  svgEl.style.transform = t;
}

function mmRender() {
  const visible = mmVisibleNodes();
  const pos = mmPositions(visible);
  viewportEl.innerHTML = '';
  for (const n of visible) {
    const p = pos[n.id];
    const el = document.createElement('div');
    el.className = 'mm-node';
    el.dataset.nodeId = n.id;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    if (n.color) el.style.borderLeftColor = n.color;
    let statusHtml = '';
    if (n.task) {
      const c = STATUS_COLORS[n.task.status] || '#6B6B8E';
      statusHtml = `<span class="mm-status" style="color:${c};border-color:${c}55;background:${c}14"><span class="mm-status-dot" style="background:${c}"></span>${STATUS_LABELS[n.task.status] || n.task.status}</span>`;
    }
    const collapseBtn = mmHasChildren(n.id)
      ? `<button class="mm-collapse" onclick="mmToggleCollapse(${n.id})" title="Collapse/expand">${n.collapsed ? '▸' : '▾'}</button>`
      : '';
    const taskBtn = n.taskId
      ? `<button onclick="mmOpenTask(${n.taskId})">Open task</button>`
      : `<button onclick="mmConvert(${n.id})">Create task</button>`;
    el.innerHTML = `
      <div class="mm-node-head">
        ${collapseBtn}
        <div class="mm-node-label" data-node-id="${n.id}">${escapeHtml(n.label)}</div>
      </div>
      ${statusHtml}
      <div class="mm-node-actions">
        <button onclick="mmAddChild(${n.id})">+ Child</button>
        <button onclick="mmEditLabel(${n.id})">Edit</button>
        <input type="color" class="mm-color" value="${n.color || '#6C63FF'}" title="Node color" onchange="mmSetColor(${n.id}, this.value)" onclick="event.stopPropagation()">
        ${taskBtn}
        ${n.parentId != null ? `<button onclick="mmDeleteNode(${n.id})">Delete</button>` : ''}
      </div>`;
    viewportEl.appendChild(el);
  }
  mmRenderEdges(pos);
  mmApplyTransform();
  mmBindNodeDrag();
}

function mmRenderEdges(pos) {
  let paths = '';
  for (const n of MM.nodes) {
    if (n.parentId == null) continue;
    const a = pos[n.parentId], b = pos[n.id];
    if (!a || !b) continue; // skip edges to/from collapsed (hidden) nodes
    const x1 = a.x + 60, y1 = a.y + 18, x2 = b.x + 10, y2 = b.y + 18;
    const mx = (x1 + x2) / 2;
    paths += `<path class="mm-edge" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
  }
  svgEl.innerHTML = paths;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ── Pan & zoom ──
let panning = false, panStart = null;
canvasEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('.mm-node') || e.target.closest('.mm-toolbar')) return;
  panning = true; panStart = { x: e.clientX - MM.pan.x, y: e.clientY - MM.pan.y };
  canvasEl.classList.add('panning');
});
window.addEventListener('mousemove', (e) => {
  if (!panning) return;
  MM.pan.x = e.clientX - panStart.x; MM.pan.y = e.clientY - panStart.y; mmApplyTransform();
});
window.addEventListener('mouseup', () => { panning = false; canvasEl.classList.remove('panning'); });
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  mmZoom(e.deltaY < 0 ? 0.1 : -0.1);
}, { passive: false });

function mmZoom(delta) {
  MM.zoom = Math.min(2, Math.max(0.3, +(MM.zoom + delta).toFixed(2)));
  mmApplyTransform();
}
function mmFit() { MM.zoom = 1; MM.pan = { x: 80, y: 80 }; mmApplyTransform(); }

// ── Node drag (persists x/y; never reparents) ──
function mmBindNodeDrag() {
  viewportEl.querySelectorAll('.mm-node').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.mm-node-actions') || e.target.closest('.mm-collapse') || e.target.closest('[contenteditable="true"]')) return;
      e.stopPropagation();
      const id = parseInt(el.dataset.nodeId);
      const startX = e.clientX, startY = e.clientY;
      const origLeft = parseFloat(el.style.left), origTop = parseFloat(el.style.top);
      el.classList.add('dragging');
      let nx = origLeft, ny = origTop;
      function move(ev) {
        nx = origLeft + (ev.clientX - startX) / MM.zoom;
        ny = origTop + (ev.clientY - startY) / MM.zoom;
        el.style.left = nx + 'px'; el.style.top = ny + 'px';
        mmRenderEdges(mmPositionsWithOverride(id, nx, ny));
      }
      async function up() {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        el.classList.remove('dragging');
        const node = MM.byId.get(id); node.x = nx; node.y = ny;
        await fetch(`/api/mindmap-nodes/${id}`, {
          method:'PUT', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ x: nx, y: ny }),
        });
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  });
}

// positions but with one node overridden mid-drag (for live edge redraw)
function mmPositionsWithOverride(id, x, y) {
  const pos = mmPositions(); pos[id] = { x, y }; return pos;
}

// ── Node mutations ──
async function mmAddChild(parentId) {
  const label = prompt('New node:');
  if (!label || !label.trim()) return;
  const res = await fetch('/api/mindmap-nodes', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ mindmapId: MM.id, parentId, label: label.trim() }),
  });
  const data = await res.json();
  if (data.success) { MM.nodes.push({ ...data.node, task: null }); mmRender(); }
}

function mmEditLabel(id) {
  const labelEl = viewportEl.querySelector(`.mm-node-label[data-node-id="${id}"]`);
  if (!labelEl) return;
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();
  document.getSelection().selectAllChildren(labelEl);
  function finish() {
    labelEl.removeAttribute('contenteditable');
    labelEl.removeEventListener('blur', finish);
    const text = labelEl.textContent.trim();
    const node = MM.byId.get(id);
    if (text && text !== node.label) {
      node.label = text;
      fetch(`/api/mindmap-nodes/${id}`, {
        method:'PUT', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ label: text }),
      });
    } else { labelEl.textContent = node.label; }
  }
  labelEl.addEventListener('blur', finish);
}

async function mmDeleteNode(id) {
  const node = MM.byId.get(id);
  if (node.parentId == null) return; // never delete the root
  if (!confirm('Delete this node and all its children?')) return;
  const res = await fetch(`/api/mindmap-nodes/${id}`, { method:'DELETE' });
  if ((await res.json()).success) {
    const remove = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of MM.nodes) {
        if (n.parentId != null && remove.has(n.parentId) && !remove.has(n.id)) { remove.add(n.id); grew = true; }
      }
    }
    MM.nodes = MM.nodes.filter(n => !remove.has(n.id));
    mmRender();
  }
}

async function mmToggleCollapse(id) {
  const node = MM.byId.get(id);
  node.collapsed = !node.collapsed;
  mmRender();
  await fetch(`/api/mindmap-nodes/${id}`, {
    method:'PUT', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ collapsed: node.collapsed }),
  });
}

async function mmSetColor(id, color) {
  const node = MM.byId.get(id);
  node.color = color;
  const el = viewportEl.querySelector(`.mm-node[data-node-id="${id}"]`);
  if (el) el.style.borderLeftColor = color;
  await fetch(`/api/mindmap-nodes/${id}`, {
    method:'PUT', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ color }),
  });
}

async function mmConvert(id) {
  const node = MM.byId.get(id);
  if (!node || node.taskId) return;
  const res = await fetch(`/api/mindmap-nodes/${id}/convert`, { method:'POST' });
  const data = await res.json();
  if (data.success) {
    node.taskId = data.task.id;
    node.task = { id: data.task.id, status: data.task.status, title: data.task.title };
    mmRender();
  } else {
    alert(data.error || 'Failed to create task');
  }
}

function mmOpenTask(taskId) {
  if (typeof openTaskPreview === 'function') openTaskPreview(taskId);
  else window.location.href = `/dashboard/${MM.slug}`;
}

mmRender();
