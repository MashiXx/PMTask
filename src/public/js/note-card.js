// Pure, DOM-free helpers describing how a note appears on the board.
//
// Which single image represents a note on the board.
//
// A note can hold pictures in two unrelated places: the uploaded media gallery
// (`note.media`, files under uploads/notes/<id>/) and <img> tags pasted straight
// into the rich-text body. The card shows ONE cover, picked in this order:
//
//   1. the first image in the uploaded gallery — deliberately chosen media
//   2. the first image pasted into the body
//   3. the first video in the gallery — a note whose only media is a video
//      still deserves a thumbnail instead of a blank card
//
// Returns null when the note has nothing to show. Kept free of DOM access so it
// is unit-testable; the caller extracts `contentImageSrc` from the sanitized
// body and turns a media id into a URL.
(function () {
  function pickNoteCover(media, contentImageSrc) {
    var list = media || [];
    var i;

    for (i = 0; i < list.length; i++) {
      if (list[i].type !== 'video') return { source: 'media', type: 'image', id: list[i].id };
    }

    if (contentImageSrc) return { source: 'content', type: 'image', src: contentImageSrc };

    for (i = 0; i < list.length; i++) {
      if (list[i].type === 'video') return { source: 'media', type: 'video', id: list[i].id };
    }

    return null;
  }

  // Is a note blank enough to discard when the user closes it right after
  // creating it? `hasText` / `hasImage` are computed by the caller from the
  // sanitized body, since that needs the DOM.
  //
  // `autoLabelId` is the label the board attached on its own because the user
  // was filtering by it when they hit "Take a note...". That label says nothing
  // about whether the user actually wrote anything, so it must not keep an
  // untouched note alive -- otherwise every glance at a filtered board would
  // leave an "Untitled" note behind.
  function isNoteEmpty(note, autoLabelId) {
    if (note.title && note.title !== 'Untitled') return false;
    if (note.hasText || note.hasImage) return false;

    var labels = note.labels || [];
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].id !== autoLabelId) return false;
    }
    return true;
  }

  // ── Masonry layout ──────────────────────────────────────────────────────
  // The board can't use CSS multi-column: the browser reflows children across
  // column boxes, so a drag library has no stable geometry to hit-test against.
  // Instead the board renders real column elements and places cards itself.

  // How many columns fit in `width`, given a minimum column width and the gap
  // between columns. n columns need n*minWidth + (n-1)*gap.
  function columnCountFor(width, minWidth, gap) {
    if (!(width > 0)) return 1;
    return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  }

  // Split an ordered list of card heights into `count` CONTIGUOUS runs, one per
  // column, balancing the columns' total heights -- the same thing CSS
  // multi-column does with column-fill: balance.
  //
  // Contiguity is the point. Because each column holds an unbroken slice of the
  // order, reading the columns left to right, top to bottom recovers exactly the
  // order that was laid out. A distribution that scattered cards round-robin
  // would look similar but would not survive the round trip: ending a drag reads
  // the board back, so a lossy layout would scramble the order on every drop.
  function splitIntoColumns(heights, count) {
    var n = heights.length;
    if (count <= 1) return [n];

    var runs = [];
    var index = 0;
    var remaining = 0;
    for (var h = 0; h < n; h++) remaining += heights[h];

    for (var col = 0; col < count; col++) {
      var colsLeft = count - col;
      if (colsLeft === 1) { runs.push(n - index); break; }

      var available = n - index;
      if (available <= 0) { runs.push(0); continue; }

      var target = remaining / colsLeft;
      // Always leave at least one card for each column still to be filled.
      var maxLen = Math.min(available, Math.max(1, available - (colsLeft - 1)));

      var acc = 0;
      var len = 0;
      while (len < maxLen) {
        var next = acc + heights[index + len];
        // Take the card only while doing so gets closer to the target height.
        if (len > 0 && Math.abs(next - target) >= Math.abs(acc - target)) break;
        acc = next;
        len++;
      }

      runs.push(len);
      index += len;
      remaining -= acc;
    }
    return runs;
  }

  // Fold a drag's result back into the note order.
  //
  // A drag can only rearrange the notes currently on screen, but the order sent
  // to the server covers every note in the section. Notes hidden by a label
  // filter or a search query therefore keep the exact slots they already hold:
  // each slot that held a visible note takes the next id from the dragged order,
  // and slots holding hidden notes are left untouched.
  function applyVisualOrder(allIds, visibleIdsInNewOrder) {
    var slots = {};
    for (var i = 0; i < allIds.length; i++) slots[allIds[i]] = true;

    // Ignore anything that isn't actually part of this section.
    var queue = [];
    for (var j = 0; j < visibleIdsInNewOrder.length; j++) {
      if (slots[visibleIdsInNewOrder[j]]) queue.push(visibleIdsInNewOrder[j]);
    }

    var moving = {};
    for (var k = 0; k < queue.length; k++) moving[queue[k]] = true;

    var out = [];
    for (var m = 0; m < allIds.length; m++) {
      out.push(moving[allIds[m]] ? queue.shift() : allIds[m]);
    }
    return out;
  }

  if (typeof window !== 'undefined') {
    window.pickNoteCover = pickNoteCover;
    window.isNoteEmpty = isNoteEmpty;
    window.columnCountFor = columnCountFor;
    window.splitIntoColumns = splitIntoColumns;
    window.applyVisualOrder = applyVisualOrder;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      pickNoteCover, isNoteEmpty, columnCountFor, splitIntoColumns, applyVisualOrder,
    };
  }
})();
