// Pure tidy-tree layout: returns auto x/y for every node.
// Renderer overlays a node's manual x/y (if set) on top of these.
(function (root) {
  const X_GAP = 220; // horizontal distance per depth level
  const Y_GAP = 90;  // vertical distance per leaf

  function computeMindmapLayout(nodes) {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const childrenOf = new Map(nodes.map(n => [n.id, []]));
    let rootNode = null;
    for (const n of nodes) {
      if (n.parentId != null && childrenOf.has(n.parentId)) {
        childrenOf.get(n.parentId).push(n);
      } else {
        rootNode = rootNode || n; // first parentless node is the root
      }
    }
    for (const list of childrenOf.values()) {
      list.sort((a, b) => (a.position - b.position) || (a.id - b.id));
    }

    const pos = {};
    let leafCursor = 0;
    function assign(node, depth) {
      const kids = childrenOf.get(node.id) || [];
      const x = depth * X_GAP;
      if (kids.length === 0) {
        const y = leafCursor * Y_GAP;
        leafCursor += 1;
        pos[node.id] = { x, y };
        return y;
      }
      const ys = kids.map(k => assign(k, depth + 1));
      const y = (ys[0] + ys[ys.length - 1]) / 2;
      pos[node.id] = { x, y };
      return y;
    }
    if (rootNode) assign(rootNode, 0);
    // Any orphans not reached (defensive): stack them below.
    for (const n of nodes) {
      if (!pos[n.id]) { pos[n.id] = { x: 0, y: leafCursor * Y_GAP }; leafCursor += 1; }
    }
    return pos;
  }

  root.computeMindmapLayout = computeMindmapLayout;
  if (typeof module !== 'undefined' && module.exports) module.exports = { computeMindmapLayout };
})(typeof window !== 'undefined' ? window : globalThis);
