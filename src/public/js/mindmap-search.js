// Diacritic-insensitive node search. Returns matching ids (in input order) plus
// the set of ancestor ids that must be expanded for every match to be visible.
(function (root) {
  function mmNormalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining marks
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();
  }

  function mmSearchNodes(nodes, query) {
    const q = mmNormalize(query);
    if (!q) return { matches: [], expand: new Set() };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const matches = [];
    const expand = new Set();
    for (const n of nodes) {
      if (mmNormalize(n.label).includes(q)) {
        matches.push(n.id);
        let p = n.parentId;
        while (p != null && byId.has(p)) { expand.add(p); p = byId.get(p).parentId; }
      }
    }
    return { matches, expand };
  }

  Object.assign(root, { mmNormalize, mmSearchNodes });
  if (typeof module !== 'undefined' && module.exports) module.exports = { mmNormalize, mmSearchNodes };
})(typeof window !== 'undefined' ? window : globalThis);
