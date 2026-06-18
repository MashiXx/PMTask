const MM = {
  id: window.MINDMAP.id,
  slug: window.MINDMAP.projectSlug,
  nodes: window.MINDMAP_NODES || [],
  byId: new Map(),
  pan: { x: 80, y: 80 },
  zoom: 1,
  selectedId: null,
};
const STATUS_COLORS = { todo:'#6B6B8E', inprogress:'#00D9FF', review:'#FFB347', done:'#00F5A0' };
const STATUS_LABELS = { todo:'To Do', inprogress:'In Progress', review:'In Review', done:'Completed' };
const NODE_W = 180, NODE_H = 70; // approx, for fit bounds

const canvasEl = document.getElementById('mmCanvas');
const viewportEl = document.getElementById('mmViewport');
const svgEl = document.getElementById('mmSvg');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
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

// Resolve render positions: manual x/y wins, else auto-layout over the visible set.
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function mmRender() {
  const visible = mmVisibleNodes();
  const pos = mmPositions(visible);
  viewportEl.innerHTML = '';
  for (const n of visible) {
    const p = pos[n.id];
    const el = document.createElement('div');
    el.className = 'mm-node' + (n.id === MM.selectedId ? ' selected' : '');
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
        <input type="color" class="mm-color" value="${n.color || '#6C63FF'}" title="Node color" onchange="mmSetColor(${n.id}, this.value)" onpointerdown="event.stopPropagation()">
        ${taskBtn}
        ${n.parentId != null ? `<button onclick="mmDeleteNode(${n.id})">Delete</button>` : ''}
      </div>`;
    viewportEl.appendChild(el);
  }
  mmRenderEdges(pos);
  mmApplyTransform();
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

// ── Selection ──
function mmSelect(id) {
  if (MM.selectedId === id) return;
  MM.selectedId = id;
  viewportEl.querySelectorAll('.mm-node.selected').forEach(el => el.classList.remove('selected'));
  if (id != null) {
    const el = viewportEl.querySelector(`.mm-node[data-node-id="${id}"]`);
    if (el) el.classList.add('selected');
  }
}

// ── Unified pointer input: node drag, canvas pan, pinch-zoom ──
const pointers = new Map();
let gesture = null; // { type:'drag'|'pan', ... } or null
let pinch = null;   // { startDist, startZoom, cx, cy }

function clientToCanvas(clientX, clientY) {
  const r = canvasEl.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

canvasEl.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { startPinch(); gesture = null; return; }
  if (e.target.closest('.mm-toolbar') || e.target.closest('.mm-node-actions') ||
      e.target.closest('.mm-collapse') || e.target.closest('[contenteditable="true"]')) return;

  const nodeEl = e.target.closest('.mm-node');
  canvasEl.setPointerCapture(e.pointerId);
  if (nodeEl) {
    const id = parseInt(nodeEl.dataset.nodeId);
    const cached = mmPositions(); // compute layout ONCE for the whole drag (perf)
    gesture = {
      type: 'drag', pointerId: e.pointerId, el: nodeEl, id, cached,
      startX: e.clientX, startY: e.clientY,
      origLeft: parseFloat(nodeEl.style.left), origTop: parseFloat(nodeEl.style.top),
      moved: false, nx: parseFloat(nodeEl.style.left), ny: parseFloat(nodeEl.style.top),
    };
  } else {
    gesture = { type: 'pan', pointerId: e.pointerId, startX: e.clientX - MM.pan.x, startY: e.clientY - MM.pan.y, moved: false };
    canvasEl.classList.add('panning');
  }
});

canvasEl.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) { movePinch(); return; }
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  if (gesture.type === 'pan') {
    MM.pan.x = e.clientX - gesture.startX; MM.pan.y = e.clientY - gesture.startY;
    gesture.moved = true; mmApplyTransform();
  } else if (gesture.type === 'drag') {
    gesture.nx = gesture.origLeft + (e.clientX - gesture.startX) / MM.zoom;
    gesture.ny = gesture.origTop + (e.clientY - gesture.startY) / MM.zoom;
    if (Math.abs(e.clientX - gesture.startX) + Math.abs(e.clientY - gesture.startY) > 3) gesture.moved = true;
    gesture.el.style.left = gesture.nx + 'px'; gesture.el.style.top = gesture.ny + 'px';
    if (!gesture.el.classList.contains('dragging')) gesture.el.classList.add('dragging');
    const pos = { ...gesture.cached, [gesture.id]: { x: gesture.nx, y: gesture.ny } };
    mmRenderEdges(pos);
  }
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) pinch = null;
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture; gesture = null;
  canvasEl.classList.remove('panning');
  if (g.type === 'drag') {
    g.el.classList.remove('dragging');
    if (g.moved) {
      const node = MM.byId.get(g.id);
      const prevX = node.x, prevY = node.y;
      node.x = g.nx; node.y = g.ny;
      apiUpdateNode(g.id, { x: g.nx, y: g.ny }, () => { node.x = prevX; node.y = prevY; mmRender(); });
    } else {
      mmSelect(g.id); // a click (no movement) selects the node
    }
  } else if (g.type === 'pan' && !g.moved) {
    mmSelect(null); // click on empty canvas clears selection
  }
}
canvasEl.addEventListener('pointerup', endPointer);
canvasEl.addEventListener('pointercancel', endPointer);

function startPinch() {
  const pts = [...pointers.values()];
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  const mid = clientToCanvas((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  pinch = { startDist: dist, startZoom: MM.zoom, cx: mid.x, cy: mid.y };
}
function movePinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return;
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  const target = clamp(pinch.startZoom * (dist / pinch.startDist), 0.3, 2);
  zoomTo(target, pinch.cx, pinch.cy);
}

// ── Zoom (toward a canvas point) ──
function zoomTo(newZoom, cx, cy) {
  newZoom = clamp(+newZoom.toFixed(3), 0.3, 2);
  const k = newZoom / MM.zoom;
  MM.pan.x = cx - k * (cx - MM.pan.x);
  MM.pan.y = cy - k * (cy - MM.pan.y);
  MM.zoom = newZoom;
  mmApplyTransform();
}
function mmZoom(delta) { zoomTo(MM.zoom + delta, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2); }
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const c = clientToCanvas(e.clientX, e.clientY);
  zoomTo(MM.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), c.x, c.y);
}, { passive: false });

// Fit all nodes into view (centered).
function mmFit() {
  const pos = mmPositions();
  const ids = Object.keys(pos);
  const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight, pad = 60;
  if (!ids.length) { MM.zoom = 1; MM.pan = { x: 80, y: 80 }; mmApplyTransform(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const p = pos[id];
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE_W); maxY = Math.max(maxY, p.y + NODE_H);
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const zoom = clamp(Math.min((cw - 2 * pad) / w, (ch - 2 * pad) / h, 1), 0.3, 2);
  MM.zoom = zoom;
  MM.pan.x = (cw - w * zoom) / 2 - minX * zoom;
  MM.pan.y = (ch - h * zoom) / 2 - minY * zoom;
  mmApplyTransform();
}

// ── API helper with rollback ──
async function apiUpdateNode(id, data, onError) {
  try {
    const res = await fetch(`/api/mindmap-nodes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('save failed');
  } catch (err) {
    console.error('Mindmap save failed:', err);
    mmToast('Could not save change', 'error');
    if (onError) onError();
  }
}

// ── Node mutations ──
async function mmAddChild(parentId) {
  const res = await fetch('/api/mindmap-nodes', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ mindmapId: MM.id, parentId, label: 'New idea' }),
  });
  const data = await res.json();
  if (!data.success) { mmToast(data.error || 'Could not add node', 'error'); return; }
  // expanding a collapsed parent so the new child is visible
  const parent = MM.byId.get(parentId);
  if (parent && parent.collapsed) { parent.collapsed = false; apiUpdateNode(parentId, { collapsed: false }); }
  MM.nodes.push({ ...data.node, task: null });
  mmRender();
  mmSelect(data.node.id);
  mmEditLabel(data.node.id); // inline-edit the fresh node (type over "New idea")
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
      const prev = node.label;
      node.label = text;
      apiUpdateNode(id, { label: text }, () => { node.label = prev; labelEl.textContent = prev; });
    } else {
      labelEl.textContent = node.label; // revert empty/unchanged
    }
  }
  labelEl.addEventListener('blur', finish);
}

async function mmDeleteNode(id) {
  const node = MM.byId.get(id);
  if (!node || node.parentId == null) return; // never delete the root
  if (!(await mmConfirm('Delete this node and all its children?'))) return;
  let res;
  try { res = await fetch(`/api/mindmap-nodes/${id}`, { method:'DELETE' }); } catch (e) { res = null; }
  if (!res || !res.ok) { mmToast('Could not delete node', 'error'); return; }
  const remove = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of MM.nodes) {
      if (n.parentId != null && remove.has(n.parentId) && !remove.has(n.id)) { remove.add(n.id); grew = true; }
    }
  }
  if (remove.has(MM.selectedId)) MM.selectedId = null;
  MM.nodes = MM.nodes.filter(n => !remove.has(n.id));
  mmRender();
}

async function mmToggleCollapse(id) {
  const node = MM.byId.get(id);
  const prev = node.collapsed;
  node.collapsed = !node.collapsed;
  mmRender();
  apiUpdateNode(id, { collapsed: node.collapsed }, () => { node.collapsed = prev; mmRender(); });
}

async function mmSetColor(id, color) {
  const node = MM.byId.get(id);
  const prev = node.color;
  node.color = color;
  const el = viewportEl.querySelector(`.mm-node[data-node-id="${id}"]`);
  if (el) el.style.borderLeftColor = color;
  apiUpdateNode(id, { color }, () => {
    node.color = prev;
    if (el) el.style.borderLeftColor = prev || '#6C63FF';
  });
}

async function mmConvert(id) {
  const node = MM.byId.get(id);
  if (!node || node.taskId) return;
  let data;
  try { data = await (await fetch(`/api/mindmap-nodes/${id}/convert`, { method:'POST' })).json(); }
  catch (e) { data = { error: 'Network error' }; }
  if (data.success) {
    node.taskId = data.task.id;
    node.task = { id: data.task.id, status: data.task.status, title: data.task.title };
    mmRender();
    mmToast('Task created');
  } else {
    mmToast(data.error || 'Failed to create task', 'error');
  }
}

function mmOpenTask(taskId) {
  if (typeof openTaskPreview === 'function') openTaskPreview(taskId);
  else window.location.href = `/dashboard/${MM.slug}`;
}

// init
mmRender();
mmFit();
