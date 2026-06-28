// Balanced two-sided tidy-tree layout: root centered, top-level branches split
// left/right to balance, vertical placement driven by each subtree's measured
// height so variable-height (multi-line) nodes never overlap. Returns {x,y,side}.
// The renderer overlays a node's manual x/y (if set) on top of these auto positions.
(function (root) {
  const DEF = { hGap: 70, vGap: 22, defaultW: 180, defaultH: 46 };

  function computeMindmapLayout(nodes, opts) {
    const o = Object.assign({}, DEF, opts || {});
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map(nodes.map((n) => [n.id, []]));
    let rootNode = null;
    for (const n of nodes) {
      if (n.parentId != null && childrenOf.has(n.parentId)) childrenOf.get(n.parentId).push(n);
      else rootNode = rootNode || n;
    }
    for (const list of childrenOf.values())
      list.sort((a, b) => (a.position - b.position) || (a.id - b.id));

    const W = (n) => (n && n.w) || o.defaultW;
    const H = (n) => (n && n.h) || o.defaultH;

    // subtree vertical extent: max(own height, stacked children heights + gaps)
    const heightCache = new Map();
    function subtreeHeight(node) {
      if (heightCache.has(node.id)) return heightCache.get(node.id);
      const kids = childrenOf.get(node.id) || [];
      let h;
      if (!kids.length) h = H(node);
      else {
        let sum = 0;
        for (const k of kids) sum += subtreeHeight(k);
        sum += (kids.length - 1) * o.vGap;
        h = Math.max(H(node), sum);
      }
      heightCache.set(node.id, h);
      return h;
    }

    const pos = {};
    // place a subtree growing toward `side`; `x` is this node's left edge, `top` its band top
    function place(node, side, x, top) {
      const h = subtreeHeight(node);
      pos[node.id] = { x, y: top + (h - H(node)) / 2, side };
      const kids = childrenOf.get(node.id) || [];
      let cursor = top;
      for (const k of kids) {
        const kx = side === 'left' ? x - o.hGap - W(k) : x + W(node) + o.hGap;
        place(k, side, kx, cursor);
        cursor += subtreeHeight(k) + o.vGap;
      }
    }

    if (rootNode) {
      const branches = childrenOf.get(rootNode.id) || [];
      // balance: assign each branch to the lighter side (by accumulated subtree height)
      const left = [], right = [];
      let lh = 0, rh = 0;
      for (const b of branches) {
        const bh = subtreeHeight(b);
        if (lh <= rh) { left.push(b); lh += bh + o.vGap; }
        else { right.push(b); rh += bh + o.vGap; }
      }
      const sideTotal = (arr) =>
        arr.reduce((s, b) => s + subtreeHeight(b), 0) + Math.max(0, arr.length - 1) * o.vGap;
      const leftH = sideTotal(left), rightH = sideTotal(right);
      const contentH = Math.max(leftH, rightH, H(rootNode));
      pos[rootNode.id] = { x: 0, y: (contentH - H(rootNode)) / 2, side: 'root' };
      let lc = (contentH - leftH) / 2;
      for (const b of left) { place(b, 'left', 0 - o.hGap - W(b), lc); lc += subtreeHeight(b) + o.vGap; }
      let rc = (contentH - rightH) / 2;
      for (const b of right) { place(b, 'right', W(rootNode) + o.hGap, rc); rc += subtreeHeight(b) + o.vGap; }
    }
    // defensive: any unreached node stacks below origin
    let orphanY = 0;
    for (const n of nodes) if (!pos[n.id]) { pos[n.id] = { x: 0, y: -200 - orphanY, side: 'right' }; orphanY += H(n) + o.vGap; }
    return pos;
  }

  root.computeMindmapLayout = computeMindmapLayout;
  if (typeof module !== 'undefined' && module.exports) module.exports = { computeMindmapLayout };
})(typeof window !== 'undefined' ? window : globalThis);
