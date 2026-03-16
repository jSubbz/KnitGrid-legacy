// common/patternCursor.js

export function startPosBR(rows, cols) {
  return { r: Math.max(0, rows - 1), c: Math.max(0, cols - 1) };
}

/**
 * Next position in knitting-chart order:
 * bottom-right start, move left, then move up a row.
 */
export function nextPosBRLUp({ r, c, rows, cols }) {
  if (rows <= 0 || cols <= 0) return { r: 0, c: 0, done: true };

  if (c > 0) return { r, c: c - 1, done: false };
  if (r > 0) return { r: r - 1, c: cols - 1, done: false };

  return { r, c, done: true };
}

export function prevPosBRLUp({ r, c, rows, cols }) {
  // Reverse traversal of the same scan order
  if (rows <= 0 || cols <= 0) return { r: 0, c: 0, done: true };

  if (c < cols - 1) return { r, c: c + 1, done: false };
  if (r < rows - 1) return { r: r + 1, c: 0, done: false };

  return { r, c, done: true };
}