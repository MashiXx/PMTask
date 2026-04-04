function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80) || 'untitled';
}

// Parse ID from an ID-prefixed slug like "42-my-project-name"
// Returns the numeric ID, or null if not a valid format
function parseIdFromSlug(slugOrId) {
  const match = String(slugOrId).match(/^(\d+)(?:-|$)/);
  return match ? parseInt(match[1]) : null;
}

module.exports = { generateSlug, parseIdFromSlug };
