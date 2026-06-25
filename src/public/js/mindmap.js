const MM = {
  id: window.MINDMAP.id,
  slug: window.MINDMAP.projectSlug,
  nodes: window.MINDMAP_NODES || [],
  byId: new Map(),
  pan: { x: 80, y: 80 },
  zoom: 1,
  selectedId: null,
};
const STATUS_COLORS = { todo:'#6B6B8E', inprogress:'#2B9CD8', review:'#F59E0B', done:'#1E9E60' };
const STATUS_LABELS = { todo: t('js.mindmap.statusTodo'), inprogress: t('js.mindmap.statusInProgress'), review: t('js.mindmap.statusInReview'), done: t('js.mindmap.statusDone') };
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
function mmComputeAuto(list) {
  return computeMindmapLayout(list.map(n => ({ id: n.id, parentId: n.parentId, position: n.position })));
}

// Resolve top-down: a node with manual x/y (or the live-dragged override) is absolute;
// an auto node hangs off its parent's RESOLVED position, keeping the auto layout's
// relative offset. So a subtree follows a dragged ancestor instead of snapping to the
// global (root-anchored) layout. `auto` may be precomputed (cached during a drag).
function mmResolve(list, auto, overrideId, overridePos) {
  const childrenOf = new Map(list.map(n => [n.id, []]));
  let root = null;
  for (const n of list) {
    if (n.parentId != null && childrenOf.has(n.parentId)) childrenOf.get(n.parentId).push(n);
    else root = root || n;
  }
  const pos = {};
  function resolve(node, parentResolved, parentAuto) {
    const a = auto[node.id] || { x: 0, y: 0 };
    let p;
    if (overrideId != null && node.id === overrideId) {
      p = { x: overridePos.x, y: overridePos.y };
    } else if (node.x != null && node.y != null) {
      p = { x: node.x, y: node.y };
    } else if (parentResolved && parentAuto) {
      p = { x: parentResolved.x + (a.x - parentAuto.x), y: parentResolved.y + (a.y - parentAuto.y) };
    } else {
      p = { x: a.x, y: a.y };
    }
    pos[node.id] = p;
    for (const c of (childrenOf.get(node.id) || [])) resolve(c, p, a);
  }
  if (root) resolve(root, null, null);
  for (const n of list) if (!pos[n.id]) pos[n.id] = auto[n.id] || { x: 0, y: 0 }; // defensive
  return pos;
}

function mmPositions(visible) {
  const list = visible || mmVisibleNodes();
  return mmResolve(list, mmComputeAuto(list), null, null);
}

// Move existing node elements to `pos` without rebuilding the DOM (used during drag).
function applyPositions(pos) {
  viewportEl.querySelectorAll('.mm-node').forEach(el => {
    const p = pos[el.dataset.nodeId];
    if (p) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
  });
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
      ? `<button class="mm-collapse" onclick="mmToggleCollapse(${n.id})" title="${t('js.mindmap.collapseExpand')}">${n.collapsed ? '▸' : '▾'}</button>`
      : '';
    const taskBtn = n.taskId
      ? `<button onclick="mmOpenTask(${n.taskId})">${t('js.mindmap.openTask')}</button>`
      : `<button onclick="mmConvert(${n.id})">${t('js.mindmap.createTask')}</button>`;
    el.innerHTML = `
      <div class="mm-node-head">
        ${collapseBtn}
        <div class="mm-node-label" data-node-id="${n.id}">${escapeHtml(n.label)}</div>
      </div>
      ${statusHtml}
      <div class="mm-node-actions">
        <button onclick="mmAddChild(${n.id})">${t('js.mindmap.addChild')}</button>
        <button onclick="mmEditLabel(${n.id})">${t('js.mindmap.edit')}</button>
        <input type="color" class="mm-color" value="${n.color || '#2D6FE0'}" title="${t('js.mindmap.nodeColor')}" onchange="mmSetColor(${n.id}, this.value)" onpointerdown="event.stopPropagation()">
        ${taskBtn}
        ${n.parentId != null ? `<button onclick="mmDeleteNode(${n.id})">${t('js.mindmap.delete')}</button>` : ''}
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
      e.target.closest('.mm-collapse') || e.target.closest('.mm-help') ||
      e.target.closest('[contenteditable="true"]')) return;

  const nodeEl = e.target.closest('.mm-node');
  canvasEl.setPointerCapture(e.pointerId);
  if (nodeEl) {
    const id = parseInt(nodeEl.dataset.nodeId);
    // Cache the auto layout ONCE for the whole drag (tree is stable); resolve live.
    const list = mmVisibleNodes();
    const auto = mmComputeAuto(list);
    gesture = {
      type: 'drag', pointerId: e.pointerId, el: nodeEl, id, list, auto,
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
    if (!gesture.el.classList.contains('dragging')) gesture.el.classList.add('dragging');
    // Reflow the dragged node AND its auto-descendants live, so children follow.
    const pos = mmResolve(gesture.list, gesture.auto, gesture.id, { x: gesture.nx, y: gesture.ny });
    applyPositions(pos);
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
      mmRender(); // settle: auto-descendants keep following the dropped parent
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
    mmToast(t('js.mindmap.couldNotSave'), 'error');
    if (onError) onError();
  }
}

// ── Node mutations ──
async function mmAddChild(parentId) {
  const res = await fetch('/api/mindmap-nodes', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ mindmapId: MM.id, parentId, label: t('js.mindmap.newIdea') }),
  });
  const data = await res.json();
  if (!data.success) { mmToast(data.error || 'Could not add node', 'error'); return; }
  // expanding a collapsed parent so the new child is visible
  const parent = MM.byId.get(parentId);
  if (parent && parent.collapsed) { parent.collapsed = false; apiUpdateNode(parentId, { collapsed: false }); }
  MM.nodes.push({ ...data.node, task: null });
  mmRender();
  mmDeoverlap(data.node.id); // keep the fresh node off any node it landed on
  mmEnsureVisible(data.node.id);
  mmSelect(data.node.id);
  mmEditLabel(data.node.id); // inline-edit the fresh node (type over "New idea")
}

// A freshly-added node inherits an auto position relative to its parent; with manual
// drags in play that slot can land on top of an existing node. Push it straight down
// past anything it overlaps, then pin (persist x/y) so it keeps the clear slot.
function mmDeoverlap(newId) {
  const els = new Map([...viewportEl.querySelectorAll('.mm-node')].map(el => [parseInt(el.dataset.nodeId), el]));
  const newEl = els.get(newId);
  if (!newEl) return;
  const pos = mmPositions();
  const start = pos[newId];
  if (!start) return;
  const GAP = 16;
  const nw = newEl.offsetWidth, nh = newEl.offsetHeight;
  const boxes = [];
  for (const [id, el] of els) {
    if (id === newId) continue;
    const q = pos[id];
    if (q) boxes.push({ x: q.x, y: q.y, w: el.offsetWidth, h: el.offsetHeight });
  }
  const x = start.x;
  let y = start.y;
  const hits = (b) => x < b.x + b.w + GAP && x + nw + GAP > b.x && y < b.y + b.h + GAP && y + nh + GAP > b.y;
  let moved = false, pass = true, guard = 0;
  while (pass && guard++ < 500) {
    pass = false;
    for (const b of boxes) if (hits(b)) { y = b.y + b.h + GAP; moved = true; pass = true; }
  }
  if (moved) {
    const node = MM.byId.get(newId);
    node.x = x; node.y = y;
    mmRender();
    apiUpdateNode(newId, { x, y });
  }
}

// Inline-edit a node's label. Enter/Tab (or blur) commits; Escape cancels and reverts.
function mmEditLabel(id) {
  const labelEl = viewportEl.querySelector(`.mm-node-label[data-node-id="${id}"]`);
  if (!labelEl) return;
  const node = MM.byId.get(id);
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();
  document.getSelection().selectAllChildren(labelEl);
  let done = false;
  function finish(save) {
    if (done) return; // guard: blur fires after Enter/Esc already finished
    done = true;
    labelEl.removeAttribute('contenteditable');
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
    const text = labelEl.textContent.trim();
    if (save && text && text !== node.label) {
      const prev = node.label;
      node.label = text;
      apiUpdateNode(id, { label: text }, () => { node.label = prev; labelEl.textContent = prev; });
    } else {
      labelEl.textContent = node.label; // revert on empty / unchanged / cancel
    }
  }
  function onBlur() { finish(true); }
  function onKey(e) {
    if (e.isComposing) return; // let an IME (e.g. Vietnamese) finish composing first
    // Labels are single-line: any Enter commits (no newline). stopPropagation so this
    // same keypress can't bubble to the canvas handler and immediately re-open edit mode.
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); finish(true); labelEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); labelEl.blur(); }
  }
  labelEl.addEventListener('blur', onBlur);
  labelEl.addEventListener('keydown', onKey);
}

async function mmDeleteNode(id) {
  const node = MM.byId.get(id);
  if (!node || node.parentId == null) return; // never delete the root
  if (!(await mmConfirm(t('js.mindmap.confirmDeleteNode')))) return;
  let res;
  try { res = await fetch(`/api/mindmap-nodes/${id}`, { method:'DELETE' }); } catch (e) { res = null; }
  if (!res || !res.ok) { mmToast(t('js.mindmap.couldNotDeleteNode'), 'error'); return; }
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
    if (el) el.style.borderLeftColor = prev || '#2D6FE0';
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
    mmToast(t('js.mindmap.taskCreated'));
  } else {
    mmToast(data.error || t('js.mindmap.failedCreateTask'), 'error');
  }
}

function mmOpenTask(taskId) {
  if (typeof openTaskPreview === 'function') openTaskPreview(taskId);
  else window.location.href = `/dashboard/${MM.slug}`;
}

// ── Keyboard interaction ──
function mmRootId() { const r = MM.nodes.find(n => n.parentId == null); return r ? r.id : null; }
function mmChildrenOf(id) { return MM.nodes.filter(n => n.parentId === id).sort((a, b) => a.position - b.position); }
function mmSiblingsOf(node) { return MM.nodes.filter(n => n.parentId === node.parentId).sort((a, b) => a.position - b.position); }

// Add a sibling = add a child to this node's parent (root has none → add its own child).
function mmAddSibling(id) {
  const node = MM.byId.get(id);
  if (!node) return;
  mmAddChild(node.parentId != null ? node.parentId : id);
}

// Pan (only when needed) so the node sits inside the visible canvas with padding.
function mmEnsureVisible(id) {
  const p = mmPositions()[id];
  if (!p) return;
  const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight, pad = 80;
  const sx = MM.pan.x + p.x * MM.zoom, sy = MM.pan.y + p.y * MM.zoom;
  const nw = NODE_W * MM.zoom, nh = NODE_H * MM.zoom;
  let dx = 0, dy = 0;
  if (sx < pad) dx = pad - sx; else if (sx + nw > cw - pad) dx = (cw - pad) - (sx + nw);
  if (sy < pad) dy = pad - sy; else if (sy + nh > ch - pad) dy = (ch - pad) - (sy + nh);
  if (dx || dy) { MM.pan.x += dx; MM.pan.y += dy; mmApplyTransform(); }
}
function mmSelectReveal(id) { if (id != null) { mmSelect(id); mmEnsureVisible(id); } }

// Arrow-key tree navigation: ←parent, →first child (expand if collapsed), ↑/↓ siblings.
function mmNavigate(key) {
  const node = MM.byId.get(MM.selectedId);
  if (!node) return;
  if (key === 'ArrowLeft') {
    if (node.parentId != null) mmSelectReveal(node.parentId);
  } else if (key === 'ArrowRight') {
    if (mmHasChildren(node.id)) {
      if (node.collapsed) mmToggleCollapse(node.id); // expands + re-renders synchronously
      const kids = mmChildrenOf(node.id);
      if (kids.length) mmSelectReveal(kids[0].id);
    }
  } else { // ArrowUp / ArrowDown
    const sibs = mmSiblingsOf(node);
    const i = sibs.findIndex(n => n.id === node.id);
    const j = key === 'ArrowUp' ? i - 1 : i + 1;
    if (j >= 0 && j < sibs.length) mmSelectReveal(sibs[j].id);
  }
}

const MM_NAV_KEYS = ['Enter', 'Tab', 'F2', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return; // already handled elsewhere (e.g. inline label edit)
  // Ignore while typing in a field, editing a label inline, or any modal/dialog is open.
  const ae = document.activeElement;
  if (ae && (ae.isContentEditable || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
  if (document.querySelector('.modal-overlay.active') || document.querySelector('.mm-dialog-overlay')) return;

  if (e.key === '?') { e.preventDefault(); mmToggleHelp(); return; }
  if (e.key === 'Escape') { // an open cheat-sheet swallows Esc before it clears selection
    const help = document.getElementById('mmHelp');
    if (help && help.classList.contains('show')) { e.preventDefault(); mmToggleHelp(false); return; }
  }

  const id = MM.selectedId;
  if (id == null) { // first keypress with nothing selected → grab the root as an entry point
    if (MM_NAV_KEYS.includes(e.key)) { e.preventDefault(); mmSelectReveal(mmRootId()); }
    return;
  }
  switch (e.key) {
    case 'Enter': e.preventDefault(); if (e.shiftKey) mmAddSibling(id); else mmEditLabel(id); break;
    case 'F2': e.preventDefault(); mmEditLabel(id); break;
    case 'Tab': e.preventDefault(); mmAddChild(id); break;
    case 'Delete': case 'Backspace': e.preventDefault(); mmDeleteNode(id); break;
    case 'Escape': e.preventDefault(); mmSelect(null); break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
      e.preventDefault(); mmNavigate(e.key); break;
  }
});

// ── Shortcuts cheat-sheet overlay (toggle with the toolbar "?" or the ? key) ──
function mmToggleHelp(force) {
  let el = document.getElementById('mmHelp');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mmHelp';
    el.className = 'mm-help';
    el.innerHTML = `
      <div class="mm-help-head">
        <span>${t('js.mindmap.keyboardShortcuts')}</span>
        <button class="mm-help-close" onclick="mmToggleHelp(false)" title="${t('js.mindmap.close')}">&times;</button>
      </div>
      <dl>
        <dt>Enter</dt><dd>${t('js.mindmap.helpEnter')}</dd>
        <dt>Esc</dt><dd>${t('js.mindmap.helpEsc')}</dd>
        <dt>Tab</dt><dd>${t('js.mindmap.helpTab')}</dd>
        <dt>Shift + Enter</dt><dd>${t('js.mindmap.helpShiftEnter')}</dd>
        <dt>Delete</dt><dd>${t('js.mindmap.helpDelete')}</dd>
        <dt>&uarr; &darr;</dt><dd>${t('js.mindmap.helpUpDown')}</dd>
        <dt>&larr; &rarr;</dt><dd>${t('js.mindmap.helpLeftRight')}</dd>
        <dt>?</dt><dd>${t('js.mindmap.helpQuestion')}</dd>
      </dl>`;
    canvasEl.appendChild(el);
  }
  const show = force === undefined ? !el.classList.contains('show') : force;
  el.classList.toggle('show', show);
}

// init
mmRender();
mmFit();
