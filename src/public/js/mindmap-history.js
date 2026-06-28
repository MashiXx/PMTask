// Bounded undo/redo command stack (mechanics only). Commands are { undo, redo, label }
// objects; the caller executes the returned command's closures.
(function (root) {
  function mmCreateHistory(limit) {
    limit = limit || 50;
    let undoStack = [];
    let redoStack = [];
    return {
      push(cmd) {
        undoStack.push(cmd);
        if (undoStack.length > limit) undoStack.shift();
        redoStack = [];
      },
      undo() {
        if (!undoStack.length) return null;
        const cmd = undoStack.pop();
        redoStack.push(cmd);
        return cmd;
      },
      redo() {
        if (!redoStack.length) return null;
        const cmd = redoStack.pop();
        undoStack.push(cmd);
        return cmd;
      },
      canUndo() { return undoStack.length > 0; },
      canRedo() { return redoStack.length > 0; },
      clear() { undoStack = []; redoStack = []; },
      sizes() { return { undo: undoStack.length, redo: redoStack.length }; },
    };
  }

  root.mmCreateHistory = mmCreateHistory;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mmCreateHistory };
})(typeof window !== 'undefined' ? window : globalThis);
