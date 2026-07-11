const test = require('node:test');
const assert = require('node:assert');
const en = require('../src/locales/en.json');
const vi = require('../src/locales/vi.json');

const REQUIRED = [
  'diagram.toolbar.add', 'diagram.toolbar.arrange', 'diagram.toolbar.zoomIn',
  'diagram.toolbar.zoomOut', 'diagram.toolbar.fit', 'diagram.toolbar.undo',
  'diagram.toolbar.redo', 'diagram.toolbar.export', 'diagram.toolbar.shortcuts',
  'js.diagram.descPlaceholder', 'js.diagram.editDescription', 'js.diagram.nSelected',
  'diagram.shortcuts.title', 'diagram.shortcuts.editTitle', 'diagram.shortcuts.newline',
  'diagram.shortcuts.copy', 'diagram.shortcuts.paste', 'diagram.shortcuts.duplicate',
  'diagram.shortcuts.selectAll', 'diagram.shortcuts.nudge', 'diagram.shortcuts.delete',
  'diagram.shortcuts.deselect', 'diagram.shortcuts.connect', 'diagram.shortcuts.undoRedo',
  'diagram.shortcuts.zoom', 'diagram.shortcuts.fit', 'diagram.shortcuts.dashEdge',
];

test('every new diagram key exists in both en and vi', () => {
  for (const k of REQUIRED) {
    assert.ok(k in en, `missing in en.json: ${k}`);
    assert.ok(k in vi, `missing in vi.json: ${k}`);
  }
});
