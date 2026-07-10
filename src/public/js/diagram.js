// Free-form diagram editor (flowchart + architecture). Shares the mindmap canvas
// shell (pan/zoom transform, mm-ui toasts/dialogs, html-to-image export) but uses
// a much simpler model: every node has an absolute x/y, edges are explicit
// source->target arrows, and "group" nodes are containers that carry their members.
const DG = {
  id: window.DIAGRAM.id,
  type: window.DIAGRAM.type,
  slug: window.DIAGRAM.projectSlug,
  nodes: window.MINDMAP_NODES || [],
  edges: window.DIAGRAM_EDGES || [],
  byId: new Map(),
  pan: { x: 120, y: 120 },
  zoom: 1,
  selectedId: null,
  selectedEdgeId: null,
};
DG.history = mmCreateHistory(50);

const canvasEl = document.getElementById('mmCanvas');
const viewportEl = document.getElementById('mmViewport');
const svgEl = document.getElementById('mmSvg');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function dgIndex() { DG.byId = new Map(DG.nodes.map(n => [n.id, n])); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Default footprint per shape (groups store their own width/height once resized).
const SHAPE_DEFAULT = {
  rect: { w: 140, h: 56 },
  diamond: { w: 130, h: 92 },
  ellipse: { w: 140, h: 84 },
  parallelogram: { w: 150, h: 56 },
  group: { w: 280, h: 190 },
};
function nodeSize(n) {
  const el = viewportEl.querySelector(`.dg-node[data-node-id="${n.id}"]`);
  if (n.shape === 'group') return { w: n.width || SHAPE_DEFAULT.group.w, h: n.height || SHAPE_DEFAULT.group.h };
  if (el) return { w: el.offsetWidth, h: el.offsetHeight };
  const d = SHAPE_DEFAULT[n.shape] || SHAPE_DEFAULT.rect;
  return { w: n.width || d.w, h: n.height || d.h };
}

// Snap-to-grid: box positions round to a tidy grid so diagrams stay aligned.
const GRID = 20;
const snap = v => Math.round(v / GRID) * GRID;

// Inline service-icon set (no external assets — CSP-safe). Values are inner SVG.
const ICON_PATHS = {
  server: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><line x1="7" y1="7.5" x2="7.01" y2="7.5"/><line x1="7" y1="16.5" x2="7.01" y2="16.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  queue: '<rect x="3" y="8" width="4" height="8"/><rect x="10" y="8" width="4" height="8"/><rect x="17" y="8" width="4" height="8"/>',
  cache: '<path d="M13 2L4 14h7l-1 8 10-12h-7z"/>',
  storage: '<rect x="4" y="6" width="16" height="12" rx="1"/><line x1="4" y1="10" x2="20" y2="10"/><circle cx="7" cy="14" r="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
  cloud: '<path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.5A4 4 0 0 1 18 18z"/>',
  api: '<path d="M8 4c-2 0-3 1-3 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 2-1 3-3 3"/>',
  function: '<path d="M5 20c3 0 3-16 7-16"/><line x1="7" y1="12" x2="15" y2="12"/>',
  loadbalancer: '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v3M12 10L5 17M12 10l7 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
};
const ICON_KEYS = Object.keys(ICON_PATHS);
function iconSvg(key) {
  const inner = ICON_PATHS[key];
  if (!inner) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function dgApplyTransform() {
  const t = `translate(${DG.pan.x}px, ${DG.pan.y}px) scale(${DG.zoom})`;
  viewportEl.style.transform = t;
  svgEl.style.transform = t;
}

// ── Render ──
function dgRender() {
  dgIndex();
  viewportEl.innerHTML = '';
  // Groups first so member boxes paint on top of their container.
  const ordered = [...DG.nodes].sort((a, b) => (a.shape === 'group' ? -1 : 0) - (b.shape === 'group' ? -1 : 0));
  for (const n of ordered) viewportEl.appendChild(buildNodeEl(n));
  dgRenderEdges();
  dgApplyTransform();
}

function buildNodeEl(n) {
  const el = document.createElement('div');
  const isGroup = n.shape === 'group';
  el.className = `dg-node dg-shape-${n.shape || 'rect'}` + (n.id === DG.selectedId ? ' selected' : '');
  el.dataset.nodeId = n.id;
  el.style.left = (n.x || 0) + 'px';
  el.style.top = (n.y || 0) + 'px';
  const size = SHAPE_DEFAULT[n.shape] || SHAPE_DEFAULT.rect;
  if (isGroup) { el.style.width = (n.width || size.w) + 'px'; el.style.height = (n.height || size.h) + 'px'; }
  else if (n.shape === 'diamond' || n.shape === 'ellipse') { el.style.width = size.w + 'px'; el.style.height = size.h + 'px'; }
  const accent = n.color || (isGroup ? '#8B8BA7' : '#2D6FE0');
  el.style.setProperty('--dg-accent', accent);
  const iconHtml = (!isGroup && n.icon && ICON_PATHS[n.icon]) ? `<span class="dg-node-icon">${iconSvg(n.icon)}</span>` : '';
  const iconBtn = isGroup ? '' : `<button onclick="dgPickIcon(${n.id})" title="${t('diagram.setIcon')}">◈</button>`;
  el.innerHTML = `
    ${iconHtml}
    <div class="dg-node-label" data-node-id="${n.id}">${escapeHtml(n.label)}</div>
    <div class="dg-node-actions">
      <button onclick="dgEditLabel(${n.id})" title="${t('js.mindmap.edit')}">✎</button>
      ${iconBtn}
      <input type="color" class="dg-color" value="${accent}" title="${t('js.mindmap.nodeColor')}" onchange="dgSetColor(${n.id}, this.value)" onpointerdown="event.stopPropagation()">
      <button onclick="dgDeleteNode(${n.id})" title="${t('js.mindmap.delete')}">🗑</button>
    </div>
    <span class="dg-handle" title="→" data-handle="${n.id}"></span>
    ${isGroup ? '<span class="dg-resize" data-resize="' + n.id + '"></span>' : ''}`;
  return el;
}

// Point where the center->toward ray crosses this node's bounding box border.
function borderPoint(cx, cy, w, h, tx, ty) {
  const dx = tx - cx, dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? (w / 2) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (h / 2) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

// Orthogonal (right-angle "elbow") connector between two node boxes.
// Exits/enters on facing sides; returns the path `d` and a midpoint for the label.
function orthPath(s, ss, tg, ts) {
  const scx = (s.x || 0) + ss.w / 2, scy = (s.y || 0) + ss.h / 2;
  const tcx = (tg.x || 0) + ts.w / 2, tcy = (tg.y || 0) + ts.h / 2;
  const dx = tcx - scx, dy = tcy - scy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const ax = dx >= 0 ? (s.x || 0) + ss.w : (s.x || 0), ay = scy;
    const bx = dx >= 0 ? (tg.x || 0) : (tg.x || 0) + ts.w, by = tcy;
    const mx = (ax + bx) / 2;
    return { d: `M${ax},${ay} L${mx},${ay} L${mx},${by} L${bx},${by}`, mid: { x: mx, y: (ay + by) / 2 } };
  }
  const ay = dy >= 0 ? (s.y || 0) + ss.h : (s.y || 0), ax = scx;
  const by = dy >= 0 ? (tg.y || 0) : (tg.y || 0) + ts.h, bx = tcx;
  const my = (ay + by) / 2;
  return { d: `M${ax},${ay} L${ax},${my} L${bx},${my} L${bx},${by}`, mid: { x: (ax + bx) / 2, y: my } };
}

function dgRenderEdges() {
  let defs = `<defs>
    <marker id="dgArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--border-light)"></path>
    </marker>
    <marker id="dgArrowSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"></path>
    </marker>
  </defs>`;
  let paths = '';
  const labelDivs = [];
  for (const e of DG.edges) {
    const s = DG.byId.get(e.sourceId), tg = DG.byId.get(e.targetId);
    if (!s || !tg) continue;
    const r = orthPath(s, nodeSize(s), tg, nodeSize(tg));
    const sel = e.id === DG.selectedEdgeId;
    const dashed = e.style === 'dashed' ? ' dg-edge-dashed' : '';
    paths += `<path class="dg-edge${sel ? ' selected' : ''}${dashed}" d="${r.d}" marker-end="url(#${sel ? 'dgArrowSel' : 'dgArrow'})"></path>`;
    paths += `<path class="dg-edge-hit" data-edge-id="${e.id}" d="${r.d}"></path>`;
    if (e.label) labelDivs.push({ id: e.id, x: r.mid.x, y: r.mid.y, label: e.label });
  }
  svgEl.innerHTML = defs + paths;
  for (const l of labelDivs) {
    const div = document.createElement('div');
    div.className = 'dg-edge-label';
    div.dataset.edgeId = l.id;
    div.style.left = l.x + 'px';
    div.style.top = l.y + 'px';
    div.textContent = l.label;
    div.ondblclick = (ev) => { ev.stopPropagation(); dgEditEdgeLabel(l.id); };
    viewportEl.appendChild(div);
  }
}

// ── Selection ──
function dgSelectNode(id) {
  DG.selectedId = id;
  DG.selectedEdgeId = null;
  dgRender();
}
function dgSelectEdge(id) {
  DG.selectedEdgeId = id;
  DG.selectedId = null;
  dgRender();
}
function dgClearSelection() {
  if (DG.selectedId == null && DG.selectedEdgeId == null) return;
  DG.selectedId = null; DG.selectedEdgeId = null; dgRender();
}

// ── Coordinate helpers ──
function clientToCanvas(clientX, clientY) {
  const r = canvasEl.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}
function clientToWorld(clientX, clientY) {
  const c = clientToCanvas(clientX, clientY);
  return { x: (c.x - DG.pan.x) / DG.zoom, y: (c.y - DG.pan.y) / DG.zoom };
}

// ── Pointer input: node drag, group move, resize, edge draw, pan, pinch ──
const pointers = new Map();
let gesture = null;
let pinch = null;

canvasEl.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { startPinch(); gesture = null; return; }
  if (e.target.closest('.mm-toolbar') || e.target.closest('.dg-node-actions') ||
      e.target.closest('[contenteditable="true"]') || e.target.closest('.dg-edge-label')) return;

  canvasEl.setPointerCapture(e.pointerId);

  // Start an arrow from a node's connection handle.
  const handle = e.target.closest('.dg-handle');
  if (handle) {
    const fromId = parseInt(handle.dataset.handle);
    gesture = { type: 'edge', pointerId: e.pointerId, fromId };
    return;
  }
  // Resize a group.
  const resize = e.target.closest('.dg-resize');
  if (resize) {
    const id = parseInt(resize.dataset.resize);
    const n = DG.byId.get(id);
    gesture = { type: 'resize', pointerId: e.pointerId, id,
      startX: e.clientX, startY: e.clientY,
      origW: n.width || SHAPE_DEFAULT.group.w, origH: n.height || SHAPE_DEFAULT.group.h };
    return;
  }
  // Select / drag a node (groups carry their members).
  const nodeEl = e.target.closest('.dg-node');
  if (nodeEl) {
    const id = parseInt(nodeEl.dataset.nodeId);
    const n = DG.byId.get(id);
    const members = n.shape === 'group'
      ? DG.nodes.filter(m => m.parentId === id).map(m => ({ id: m.id, ox: m.x || 0, oy: m.y || 0 }))
      : [];
    gesture = { type: 'drag', pointerId: e.pointerId, id, el: nodeEl,
      startX: e.clientX, startY: e.clientY, origX: n.x || 0, origY: n.y || 0,
      nx: n.x || 0, ny: n.y || 0, moved: false, members };
    return;
  }
  // Click an edge to select it.
  const hit = e.target.closest('.dg-edge-hit');
  if (hit) { dgSelectEdge(parseInt(hit.dataset.edgeId)); gesture = null; return; }

  // Empty canvas → pan.
  gesture = { type: 'pan', pointerId: e.pointerId, startX: e.clientX - DG.pan.x, startY: e.clientY - DG.pan.y, moved: false };
  canvasEl.classList.add('panning');
});

canvasEl.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) { movePinch(); return; }
  if (!gesture || e.pointerId !== gesture.pointerId) return;

  if (gesture.type === 'pan') {
    DG.pan.x = e.clientX - gesture.startX; DG.pan.y = e.clientY - gesture.startY;
    gesture.moved = true; dgApplyTransform();
  } else if (gesture.type === 'drag') {
    const dx = (e.clientX - gesture.startX) / DG.zoom, dy = (e.clientY - gesture.startY) / DG.zoom;
    gesture.nx = gesture.origX + dx; gesture.ny = gesture.origY + dy;
    if (Math.abs(e.clientX - gesture.startX) + Math.abs(e.clientY - gesture.startY) > 3) gesture.moved = true;
    gesture.el.style.left = gesture.nx + 'px';
    gesture.el.style.top = gesture.ny + 'px';
    for (const m of gesture.members) {
      const mEl = viewportEl.querySelector(`.dg-node[data-node-id="${m.id}"]`);
      if (mEl) { mEl.style.left = (m.ox + dx) + 'px'; mEl.style.top = (m.oy + dy) + 'px'; }
    }
    liveSyncModel(gesture);
    dgRenderEdges();
  } else if (gesture.type === 'resize') {
    const w = Math.max(120, gesture.origW + (e.clientX - gesture.startX) / DG.zoom);
    const h = Math.max(90, gesture.origH + (e.clientY - gesture.startY) / DG.zoom);
    const el = viewportEl.querySelector(`.dg-node[data-node-id="${gesture.id}"]`);
    if (el) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
    gesture.w = w; gesture.h = h;
    dgRenderEdges();
  } else if (gesture.type === 'edge') {
    const from = DG.byId.get(gesture.fromId);
    const fs = nodeSize(from);
    const w = clientToWorld(e.clientX, e.clientY);
    const a = borderPoint((from.x || 0) + fs.w / 2, (from.y || 0) + fs.h / 2, fs.w, fs.h, w.x, w.y);
    setTempEdge(`M${a.x},${a.y} L${w.x},${w.y}`);
  }
});

// Keep the model x/y in sync mid-drag so edge math uses live positions.
function liveSyncModel(g) {
  const n = DG.byId.get(g.id);
  if (n) { n.x = g.nx; n.y = g.ny; }
  const dx = g.nx - g.origX, dy = g.ny - g.origY;
  for (const m of g.members) { const mm = DG.byId.get(m.id); if (mm) { mm.x = m.ox + dx; mm.y = m.oy + dy; } }
}

function setTempEdge(d) {
  let p = svgEl.querySelector('#dgTempEdge');
  if (!p) { svgEl.insertAdjacentHTML('beforeend', `<path id="dgTempEdge" class="dg-edge dg-edge-temp" marker-end="url(#dgArrowSel)"></path>`); p = svgEl.querySelector('#dgTempEdge'); }
  p.setAttribute('d', d);
}
function clearTempEdge() { const p = svgEl.querySelector('#dgTempEdge'); if (p) p.remove(); }

function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch && pointers.size < 2) pinch = null;
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture; gesture = null;
  canvasEl.classList.remove('panning');

  if (g.type === 'drag') {
    if (g.moved) commitDrag(g, e);
    else dgSelectNode(g.id);
  } else if (g.type === 'resize') {
    if (g.w) commitResize(g);
  } else if (g.type === 'edge') {
    clearTempEdge();
    finishEdge(g, e);
  } else if (g.type === 'pan' && !g.moved) {
    dgClearSelection();
  }
}
canvasEl.addEventListener('pointerup', endPointer);
canvasEl.addEventListener('pointercancel', endPointer);

function commitDrag(g, e) {
  const n = DG.byId.get(g.id);
  const prevX = g.origX, prevY = g.origY;
  g.nx = snap(g.nx); g.ny = snap(g.ny); // snap-to-grid on drop
  n.x = g.nx; n.y = g.ny;
  apiUpdateNode(g.id, { x: g.nx, y: g.ny });
  // Persist moved group members too.
  const dx = g.nx - g.origX, dy = g.ny - g.origY;
  for (const m of g.members) { const mm = DG.byId.get(m.id); if (mm) { mm.x = m.ox + dx; mm.y = m.oy + dy; apiUpdateNode(m.id, { x: mm.x, y: mm.y }); } }
  // A non-group node dropped over a group joins it; dropped elsewhere leaves any group.
  if (n.shape !== 'group') updateMembership(n);
  DG.history.push({ label: 'move',
    undo: () => { n.x = prevX; n.y = prevY; apiUpdateNode(g.id, { x: prevX, y: prevY }); dgRender(); },
    redo: () => { n.x = g.nx; n.y = g.ny; apiUpdateNode(g.id, { x: g.nx, y: g.ny }); dgRender(); } });
  dgRender();
}

function updateMembership(n) {
  const size = nodeSize(n);
  const cx = (n.x || 0) + size.w / 2, cy = (n.y || 0) + size.h / 2;
  let host = null;
  for (const gnode of DG.nodes) {
    if (gnode.shape !== 'group' || gnode.id === n.id) continue;
    const gs = nodeSize(gnode);
    if (cx >= (gnode.x || 0) && cx <= (gnode.x || 0) + gs.w && cy >= (gnode.y || 0) && cy <= (gnode.y || 0) + gs.h) { host = gnode.id; break; }
  }
  const newParent = host;
  if ((n.parentId || null) !== newParent) { n.parentId = newParent; apiUpdateNode(n.id, { parentId: newParent }); }
}

function commitResize(g) {
  const n = DG.byId.get(g.id);
  n.width = g.w; n.height = g.h;
  apiUpdateNode(g.id, { width: g.w, height: g.h });
  dgRender();
}

async function finishEdge(g, e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const nodeEl = el && el.closest('.dg-node');
  if (!nodeEl) return;
  const toId = parseInt(nodeEl.dataset.nodeId);
  if (toId === g.fromId) return;
  const res = await fetch('/api/diagram-edges', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mindmapId: DG.id, sourceId: g.fromId, targetId: toId }),
  });
  const data = await res.json();
  if (!data.success) { mmToast(data.error || t('js.diagram.couldNotSave'), 'error'); return; }
  DG.edges.push(data.edge);
  dgRender();
}

// ── Zoom / pan / fit ──
function startPinch() {
  const pts = [...pointers.values()];
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  const mid = clientToCanvas((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  pinch = { startDist: dist, startZoom: DG.zoom, cx: mid.x, cy: mid.y };
}
function movePinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return;
  const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  zoomTo(clamp(pinch.startZoom * (dist / pinch.startDist), 0.3, 2), pinch.cx, pinch.cy);
}
function zoomTo(newZoom, cx, cy) {
  newZoom = clamp(+newZoom.toFixed(3), 0.3, 2);
  const k = newZoom / DG.zoom;
  DG.pan.x = cx - k * (cx - DG.pan.x);
  DG.pan.y = cy - k * (cy - DG.pan.y);
  DG.zoom = newZoom;
  dgApplyTransform();
}
function dgZoom(delta) { zoomTo(DG.zoom + delta, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2); }
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const c = clientToCanvas(e.clientX, e.clientY);
  zoomTo(DG.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), c.x, c.y);
}, { passive: false });

function dgFit() {
  if (!DG.nodes.length) { DG.zoom = 1; DG.pan = { x: 120, y: 120 }; dgApplyTransform(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of DG.nodes) {
    const s = nodeSize(n);
    minX = Math.min(minX, n.x || 0); minY = Math.min(minY, n.y || 0);
    maxX = Math.max(maxX, (n.x || 0) + s.w); maxY = Math.max(maxY, (n.y || 0) + s.h);
  }
  const cw = canvasEl.clientWidth, ch = canvasEl.clientHeight, pad = 70;
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const zoom = clamp(Math.min((cw - 2 * pad) / w, (ch - 2 * pad) / h, 1), 0.3, 2);
  DG.zoom = zoom;
  DG.pan.x = (cw - w * zoom) / 2 - minX * zoom;
  DG.pan.y = (ch - h * zoom) / 2 - minY * zoom;
  dgApplyTransform();
}

// ── API helpers ──
async function apiUpdateNode(id, data, onError) {
  try {
    const res = await fetch(`/api/diagram-nodes/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('save failed');
  } catch (err) {
    console.error('Diagram save failed:', err);
    mmToast(t('js.diagram.couldNotSave'), 'error');
    if (onError) onError();
  }
}

// ── Node mutations ──
async function dgAddNode(shape) {
  const s = SHAPE_DEFAULT[shape] || SHAPE_DEFAULT.rect;
  // Drop it near the middle of the current view.
  const center = clientToWorld(canvasEl.getBoundingClientRect().left + canvasEl.clientWidth / 2,
                               canvasEl.getBoundingClientRect().top + canvasEl.clientHeight / 2);
  const x = snap(center.x - s.w / 2), y = snap(center.y - s.h / 2);
  const res = await fetch('/api/diagram-nodes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mindmapId: DG.id, label: t('js.diagram.newBox'), shape, x, y }),
  });
  const data = await res.json();
  if (!data.success) { mmToast(data.error || t('js.diagram.couldNotSave'), 'error'); return; }
  DG.nodes.push(data.node);
  dgSelectNode(data.node.id);
  dgEditLabel(data.node.id);
}
function dgAddGroup() { return dgAddNode('group'); }

function dgEditLabel(id) {
  const labelEl = viewportEl.querySelector(`.dg-node-label[data-node-id="${id}"]`);
  if (!labelEl) return;
  const n = DG.byId.get(id);
  labelEl.setAttribute('contenteditable', 'true');
  labelEl.focus();
  document.getSelection().selectAllChildren(labelEl);
  let done = false;
  function finish(save) {
    if (done) return;
    done = true;
    labelEl.removeAttribute('contenteditable');
    labelEl.removeEventListener('blur', onBlur);
    labelEl.removeEventListener('keydown', onKey);
    const text = labelEl.innerText.trim();
    if (save && text && text !== n.label) {
      const prev = n.label;
      n.label = text;
      apiUpdateNode(id, { label: text }, () => { n.label = prev; labelEl.textContent = prev; });
      DG.history.push({ label: 'label',
        undo: () => { n.label = prev; apiUpdateNode(id, { label: prev }); dgRender(); },
        redo: () => { n.label = text; apiUpdateNode(id, { label: text }); dgRender(); } });
    } else {
      labelEl.textContent = n.label;
    }
  }
  function onKey(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
  }
  function onBlur() { finish(true); }
  labelEl.addEventListener('keydown', onKey);
  labelEl.addEventListener('blur', onBlur);
}

function dgSetColor(id, value) {
  const n = DG.byId.get(id);
  const prev = n.color || null;
  n.color = value;
  apiUpdateNode(id, { color: value });
  DG.history.push({ label: 'color',
    undo: () => { n.color = prev; apiUpdateNode(id, { color: prev }); dgRender(); },
    redo: () => { n.color = value; apiUpdateNode(id, { color: value }); dgRender(); } });
  dgRender();
}

async function dgDeleteNode(id) {
  const n = DG.byId.get(id);
  const msg = n.shape === 'group' ? t('js.diagram.confirmDeleteGroup') : t('js.diagram.confirmDeleteNode');
  if (!(await mmConfirm(msg))) return;
  const res = await fetch(`/api/diagram-nodes/${id}`, { method: 'DELETE' });
  if (!(await res.json()).success) { mmToast(t('js.diagram.couldNotSave'), 'error'); return; }
  // Local state: drop the node, its incident edges, and (for groups) detach members.
  DG.nodes = DG.nodes.filter(x => x.id !== id);
  DG.edges = DG.edges.filter(x => x.sourceId !== id && x.targetId !== id);
  if (n.shape === 'group') DG.nodes.forEach(x => { if (x.parentId === id) x.parentId = null; });
  DG.selectedId = null;
  DG.history.clear();
  dgRender();
}

async function dgEditEdgeLabel(id) {
  const edge = DG.edges.find(e => e.id === id);
  if (!edge) return;
  const label = await mmPrompt(t('js.diagram.edgeLabel'), edge.label || '');
  if (label === null) return;
  edge.label = label;
  const res = await fetch(`/api/diagram-edges/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }),
  });
  if (!(await res.json()).success) mmToast(t('js.diagram.couldNotSave'), 'error');
  dgRender();
}

async function dgDeleteEdge(id) {
  const res = await fetch(`/api/diagram-edges/${id}`, { method: 'DELETE' });
  if (!(await res.json()).success) { mmToast(t('js.diagram.couldNotSave'), 'error'); return; }
  DG.edges = DG.edges.filter(e => e.id !== id);
  DG.selectedEdgeId = null;
  dgRender();
}

// ── Undo / redo ──
async function dgUndo() { const c = DG.history.undo(); if (c) await c.undo(); }
async function dgRedo() { const c = DG.history.redo(); if (c) await c.redo(); }

// ── Keyboard ──
document.addEventListener('keydown', (e) => {
  if (e.target.closest('[contenteditable="true"]') || e.target.matches('input, textarea')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (DG.selectedEdgeId != null) { e.preventDefault(); dgDeleteEdge(DG.selectedEdgeId); }
    else if (DG.selectedId != null) { e.preventDefault(); dgDeleteNode(DG.selectedId); }
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) dgRedo(); else dgUndo();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault(); dgRedo();
  } else if (e.key.toLowerCase() === 'd' && DG.selectedEdgeId != null) {
    e.preventDefault(); dgToggleEdgeStyle(DG.selectedEdgeId); // toggle dashed on selected arrow
  }
});

// Double-click an empty spot adds a default box there.
canvasEl.addEventListener('dblclick', (e) => {
  if (e.target.closest('.dg-node') || e.target.closest('.mm-toolbar') || e.target.closest('.dg-edge-label') || e.target.closest('.dg-edge-hit')) return;
  dgAddNode('rect');
});

// ── Export ──
async function dgExportPng() {
  if (!window.htmlToImage) { mmToast(t('js.mindmap.exportUnavailable'), 'error'); return; }
  const prevSel = DG.selectedId, prevEdge = DG.selectedEdgeId;
  DG.selectedId = null; DG.selectedEdgeId = null; dgRender();
  try {
    const dataUrl = await window.htmlToImage.toPng(canvasEl, {
      backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg') || '#ffffff',
      pixelRatio: 2,
    });
    const a = document.createElement('a');
    a.download = `${(window.MINDMAP_NAME || 'diagram').replace(/[^\w\-]+/g, '_')}.png`;
    a.href = dataUrl; a.click();
  } catch (err) {
    console.error(err); mmToast(t('js.mindmap.exportFailed'), 'error');
  } finally {
    DG.selectedId = prevSel; DG.selectedEdgeId = prevEdge; dgRender();
  }
}

// ── Service icons ──
function dgPickIcon(id) {
  const overlay = document.createElement('div');
  overlay.className = 'mm-dialog-overlay';
  overlay.innerHTML = `
    <div class="mm-dialog" role="dialog" aria-modal="true">
      <div class="mm-dialog-title">${t('js.diagram.chooseIcon')}</div>
      <div class="dg-icon-grid">
        <button class="dg-icon-choice" data-icon="">${t('js.diagram.noIcon')}</button>
        ${ICON_KEYS.map(k => `<button class="dg-icon-choice" data-icon="${k}" title="${k}">${iconSvg(k)}</button>`).join('')}
      </div>
      <div class="mm-dialog-actions"><button class="mm-dialog-cancel" type="button">${t('js.mindmap.cancel')}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
  overlay.querySelectorAll('.dg-icon-choice').forEach(b => { b.onclick = () => { dgSetIcon(id, b.dataset.icon || null); close(); }; });
  overlay.querySelector('.mm-dialog-cancel').onclick = close;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => overlay.classList.add('show'));
}
function dgSetIcon(id, icon) {
  const n = DG.byId.get(id);
  const prev = n.icon || null;
  n.icon = icon;
  apiUpdateNode(id, { icon: icon || '' });
  DG.history.push({ label: 'icon',
    undo: () => { n.icon = prev; apiUpdateNode(id, { icon: prev || '' }); dgRender(); },
    redo: () => { n.icon = icon; apiUpdateNode(id, { icon: icon || '' }); dgRender(); } });
  dgRender();
}

// ── Edge style (dashed toggle) ──
function dgToggleEdgeStyle(id) {
  const e = DG.edges.find(x => x.id === id);
  if (!e) return;
  e.style = e.style === 'dashed' ? null : 'dashed';
  fetch(`/api/diagram-edges/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: e.style || '' }),
  }).then(r => r.json()).then(d => { if (!d.success) mmToast(t('js.diagram.couldNotSave'), 'error'); });
  dgRender();
}

// ── Auto-layout ──
function dgAutoArrange() {
  dgIndex();
  if (!DG.nodes.length) return;
  const snapshot = () => DG.nodes.map(n => ({ id: n.id, x: n.x || 0, y: n.y || 0, width: n.width || null, height: n.height || null }));
  const before = snapshot();
  if (DG.type === 'architecture') arrangeArchitecture(); else arrangeFlowchart();
  for (const n of DG.nodes) {
    apiUpdateNode(n.id, { x: n.x, y: n.y, ...(n.shape === 'group' ? { width: n.width, height: n.height } : {}) });
  }
  const after = snapshot();
  DG.history.push({ label: 'arrange', undo: () => applySnapshot(before), redo: () => applySnapshot(after) });
  dgRender();
  dgFit();
}
function applySnapshot(snap) {
  dgIndex();
  for (const s of snap) {
    const n = DG.byId.get(s.id);
    if (!n) continue;
    n.x = s.x; n.y = s.y;
    if (s.width != null) n.width = s.width;
    if (s.height != null) n.height = s.height;
    apiUpdateNode(s.id, { x: s.x, y: s.y, ...(n.shape === 'group' ? { width: s.width, height: s.height } : {}) });
  }
  dgRender();
}

function arrangeFlowchart() {
  const nodes = DG.nodes.filter(n => n.shape !== 'group');
  if (!nodes.length) return;
  const ids = new Set(nodes.map(n => n.id));
  const edges = DG.edges.filter(e => ids.has(e.sourceId) && ids.has(e.targetId));
  const pos = edges.length ? layeredLayout(nodes, edges) : gridLayoutNodes(nodes);
  for (const n of nodes) { const p = pos[n.id]; if (p) { n.x = p.x; n.y = p.y; } }
  for (const g of DG.nodes.filter(n => n.shape === 'group')) fitGroup(g);
}

// Longest-path layering, top-down rows. Cycles are bounded by the iteration cap.
function layeredLayout(nodes, edges) {
  const layer = {};
  nodes.forEach(n => { layer[n.id] = 0; });
  for (let it = 0; it < nodes.length; it++) {
    let changed = false;
    for (const e of edges) {
      if (layer[e.targetId] < layer[e.sourceId] + 1) { layer[e.targetId] = layer[e.sourceId] + 1; changed = true; }
    }
    if (!changed) break;
  }
  const layers = {};
  for (const n of nodes) { (layers[layer[n.id]] = layers[layer[n.id]] || []).push(n); }
  const keys = Object.keys(layers).map(Number).sort((a, b) => a - b);
  for (const k of keys) layers[k].sort((a, b) => (a.x || 0) - (b.x || 0));
  const HGAP = 60, VGAP = 80, X0 = 80, Y0 = 80;
  const pos = {};
  let y = Y0;
  for (const k of keys) {
    const row = layers[k];
    const sizes = row.map(nodeSize);
    const rowH = Math.max(...sizes.map(s => s.h));
    let x = X0;
    for (let i = 0; i < row.length; i++) {
      pos[row[i].id] = { x: snap(x), y: snap(y + (rowH - sizes[i].h) / 2) };
      x += sizes[i].w + HGAP;
    }
    y += rowH + VGAP;
  }
  return pos;
}

function gridLayoutNodes(nodes) {
  const sizes = nodes.map(nodeSize);
  const cellW = Math.max(...sizes.map(s => s.w)), cellH = Math.max(...sizes.map(s => s.h));
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const GAP = 50, X0 = 80, Y0 = 80;
  const pos = {};
  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    pos[n.id] = { x: snap(X0 + c * (cellW + GAP)), y: snap(Y0 + r * (cellH + GAP)) };
  });
  return pos;
}

const GROUP_PAD = 22, GROUP_LABEL_H = 26;
function gridLocal(items) {
  const sizes = items.map(nodeSize);
  const cellW = Math.max(...sizes.map(s => s.w)), cellH = Math.max(...sizes.map(s => s.h));
  const cols = Math.ceil(Math.sqrt(items.length));
  const GAP = 30;
  const positions = new Map();
  items.forEach((n, i) => { const r = Math.floor(i / cols), c = i % cols; positions.set(n.id, { x: c * (cellW + GAP), y: r * (cellH + GAP) }); });
  const rows = Math.ceil(items.length / cols);
  return { positions, w: cols * cellW + (cols - 1) * GAP, h: rows * cellH + (rows - 1) * GAP };
}
function fitGroup(g) {
  const members = DG.nodes.filter(n => n.parentId === g.id && n.shape !== 'group');
  if (!members.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of members) {
    const s = nodeSize(m);
    minX = Math.min(minX, m.x || 0); minY = Math.min(minY, m.y || 0);
    maxX = Math.max(maxX, (m.x || 0) + s.w); maxY = Math.max(maxY, (m.y || 0) + s.h);
  }
  g.x = snap(minX - GROUP_PAD); g.y = snap(minY - GROUP_PAD - GROUP_LABEL_H);
  g.width = snap((maxX - minX) + 2 * GROUP_PAD); g.height = snap((maxY - minY) + 2 * GROUP_PAD + GROUP_LABEL_H);
}

function arrangeArchitecture() {
  const groups = DG.nodes.filter(n => n.shape === 'group');
  const ungrouped = DG.nodes.filter(n => n.shape !== 'group' && n.parentId == null);
  const GAP = 50, X0 = 80, Y0 = 80;
  const blocks = [];
  for (const g of groups) {
    const members = DG.nodes.filter(n => n.parentId === g.id && n.shape !== 'group');
    let layout = null, localW, localH;
    if (members.length) { layout = gridLocal(members); localW = layout.w; localH = layout.h; }
    else { localW = (g.width || SHAPE_DEFAULT.group.w) - 2 * GROUP_PAD; localH = (g.height || SHAPE_DEFAULT.group.h) - 2 * GROUP_PAD - GROUP_LABEL_H; }
    blocks.push({ type: 'group', node: g, members, layout, w: localW + 2 * GROUP_PAD, h: localH + 2 * GROUP_PAD + GROUP_LABEL_H });
  }
  for (const n of ungrouped) { const s = nodeSize(n); blocks.push({ type: 'node', node: n, w: s.w, h: s.h }); }
  if (!blocks.length) return;
  const cellW = Math.max(...blocks.map(b => b.w)), cellH = Math.max(...blocks.map(b => b.h));
  const cols = Math.ceil(Math.sqrt(blocks.length));
  blocks.forEach((b, i) => { const r = Math.floor(i / cols), c = i % cols; b.x = snap(X0 + c * (cellW + GAP)); b.y = snap(Y0 + r * (cellH + GAP)); });
  for (const b of blocks) {
    if (b.type === 'node') { b.node.x = b.x; b.node.y = b.y; continue; }
    const g = b.node;
    g.x = b.x; g.y = b.y; g.width = b.w; g.height = b.h;
    if (b.layout) for (const m of b.members) {
      const lp = b.layout.positions.get(m.id);
      if (lp) { m.x = snap(b.x + GROUP_PAD + lp.x); m.y = snap(b.y + GROUP_PAD + GROUP_LABEL_H + lp.y); }
    }
  }
}

// ── Boot ──
dgRender();
dgFit();
