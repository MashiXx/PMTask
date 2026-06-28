// Deterministic per-branch coloring for the mindmap. The top-level branch (a
// direct child of the root) owns a palette color; all its descendants inherit it.
// A node's explicit `color` overrides the derived branch color.
(function (root) {
  const MM_PALETTE = ['#2D6FE0', '#1E9E60', '#F59E0B', '#E0526A', '#8B5CF6', '#0EA5A4', '#D9760A', '#3B82F6'];

  // climb to the top-level branch (the node whose parent is the root); null for the root
  function topBranch(id, byId) {
    let node = byId.get(id);
    if (!node || node.parentId == null) return null;
    while (node && node.parentId != null) {
      const parent = byId.get(node.parentId);
      if (!parent || parent.parentId == null) return node; // parent is the root
      node = parent;
    }
    return node;
  }

  function mmBranchColor(id, byId) {
    const branch = topBranch(id, byId);
    if (!branch) return null;
    const idx = ((branch.position % MM_PALETTE.length) + MM_PALETTE.length) % MM_PALETTE.length;
    return MM_PALETTE[idx];
  }

  function mmHexAlpha(hex, alpha) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function mmNodeColors(node, byId) {
    const accent = (node && node.color) || mmBranchColor(node.id, byId) || '#2D6FE0';
    return { accent, bg: mmHexAlpha(accent, 0.10) };
  }

  Object.assign(root, { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors });
  if (typeof module !== 'undefined' && module.exports) module.exports = { MM_PALETTE, mmBranchColor, mmHexAlpha, mmNodeColors };
})(typeof window !== 'undefined' ? window : globalThis);
