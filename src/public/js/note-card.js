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

  if (typeof window !== 'undefined') {
    window.pickNoteCover = pickNoteCover;
    window.isNoteEmpty = isNoteEmpty;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { pickNoteCover, isNoteEmpty };
})();
