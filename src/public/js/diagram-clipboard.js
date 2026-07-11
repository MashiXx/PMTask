// Pure, DOM-free helpers for the diagram editor's copy/paste + keyboard nudge.
// Browser global (window.diagramClipboard) and CommonJS export, like mindmap-history.js.
(function (root) {
  const VISUAL_KEYS = ['label', 'description', 'shape', 'color', 'icon', 'width', 'height'];

  // Snapshot selected nodes' visual props + absolute x/y (used to keep relative layout on paste).
  function cloneForClipboard(nodes) {
    return nodes.map((n) => {
      const c = {};
      for (const k of VISUAL_KEYS) if (n[k] !== undefined && n[k] !== null) c[k] = n[k];
      c.x = n.x || 0;
      c.y = n.y || 0;
      return c;
    });
  }

  // Turn clipboard entries into createNode payloads shifted by (dx,dy).
  function pastePayloads(clip, dx, dy) {
    return clip.map((c) => {
      const p = {};
      for (const k of VISUAL_KEYS) if (c[k] !== undefined) p[k] = c[k];
      p.x = (c.x || 0) + dx;
      p.y = (c.y || 0) + dy;
      return p;
    });
  }

  // Arrow-key nudge: grid step by default, 1px when fine (Shift). null for non-arrow keys.
  function nudgeDelta(key, fine, grid) {
    const step = fine ? 1 : grid;
    switch (key) {
      case 'ArrowLeft': return { dx: -step, dy: 0 };
      case 'ArrowRight': return { dx: step, dy: 0 };
      case 'ArrowUp': return { dx: 0, dy: -step };
      case 'ArrowDown': return { dx: 0, dy: step };
      default: return null;
    }
  }

  const api = { cloneForClipboard, pastePayloads, nudgeDelta };
  root.diagramClipboard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
