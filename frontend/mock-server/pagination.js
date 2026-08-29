/**
 * Opaque cursor pagination (no offsets). Cursor encodes last seen item id.
 */
function clampLimit(limit) {
  const n = parseInt(limit, 10);
  if (Number.isNaN(n)) return 25;
  return Math.min(100, Math.max(1, n));
}

function encodeCursor(id) {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function paginate(items, { cursor, limit, sortFn }) {
  const lim = clampLimit(limit);
  let sorted = [...items];
  if (sortFn) sorted.sort(sortFn);

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      const idx = sorted.findIndex((item) => item.id === decoded.id);
      if (idx >= 0) sorted = sorted.slice(idx + 1);
    }
  }

  const page = sorted.slice(0, lim);
  const hasMore = sorted.length > lim;
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1].id) : null;

  return { items: page, nextCursor, hasMore };
}

function apiError(res, status, code, message, requestId = `req_${Date.now()}`) {
  return res.status(status).json({ code, message, requestId });
}

function toSummary(incident) {
  const {
    id,
    workspaceId,
    cameraId,
    category,
    state,
    severity,
    openedAt,
    lastObservedAt,
    assignedToSubjectId,
    version,
  } = incident;
  return {
    id,
    workspaceId,
    cameraId,
    category,
    state,
    severity,
    openedAt,
    lastObservedAt,
    assignedToSubjectId,
    version,
  };
}

function parseMulti(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

module.exports = { paginate, encodeCursor, decodeCursor, clampLimit, apiError, toSummary, parseMulti };
