import { clampInt } from "./input.js";

/**
 * Create a matrix [rows][cols].
 */
export function createMatrix(rows, cols, fillValue) {
  const r = clampInt(rows, 1, 10000);
  const c = clampInt(cols, 1, 10000);

  const m = new Array(r);
  for (let i = 0; i < r; i++) {
    m[i] = new Array(c).fill(!!fillValue);
  }
  return m;
}

/**
 * Deep clone a boolean matrix.
 */
export function cloneMatrix(m) {
  return m.map((row) => row.map((v) => !!v));
}

/**
 * Resize rectangular matrix.
 * NEW cells default to included (true/on).
 *
 * If centered=false:
 *  - columns grow/shrink on the RIGHT
 *  - rows grow/shrink on the BOTTOM
 *
 * If centered=true:
 *  - columns grow/shrink evenly left+right (best effort)
 *  - rows grow/shrink evenly top+bottom (best effort)
 */
export function resizeRectFillNew(old, newRows, newCols, centered) {
  const oldRows = old.length;
  const oldCols = old[0]?.length ?? 0;

  const out = createMatrix(newRows, newCols, true);

  if (!centered) {
    const copyR = Math.min(oldRows, newRows);
    const copyC = Math.min(oldCols, newCols);
    for (let r = 0; r < copyR; r++) {
      for (let c = 0; c < copyC; c++) {
        out[r][c] = !!old[r][c];
      }
    }
    return out;
  }

  const dR = newRows - oldRows;
  const dC = newCols - oldCols;

  const dstStartR = dR >= 0 ? Math.floor(dR / 2) : 0;
  const dstStartC = dC >= 0 ? Math.floor(dC / 2) : 0;

  const srcStartR = dR < 0 ? Math.floor((-dR) / 2) : 0;
  const srcStartC = dC < 0 ? Math.floor((-dC) / 2) : 0;

  const copyR = Math.min(oldRows - srcStartR, newRows - dstStartR);
  const copyC = Math.min(oldCols - srcStartC, newCols - dstStartC);

  for (let r = 0; r < copyR; r++) {
    for (let c = 0; c < copyC; c++) {
      out[dstStartR + r][dstStartC + c] = !!old[srcStartR + r][srcStartC + c];
    }
  }

  return out;
}

/**
 * Apply a value to a cell with optional mirror behavior.
 * Mutates `shape` in place.
 *
 * mirrorX: reflect left-right within cols
 * mirrorY: reflect top-bottom within rows
 */
export function applyWithMirrors({ shape, rows, cols, r, c, value, mirrorX, mirrorY }) {
  const coords = new Set([`${r},${c}`]);

  if (mirrorX) coords.add(`${r},${cols - 1 - c}`);
  if (mirrorY) coords.add(`${rows - 1 - r},${c}`);
  if (mirrorX && mirrorY) coords.add(`${rows - 1 - r},${cols - 1 - c}`);

  coords.forEach((key) => {
    const [rr, cc] = key.split(",").map(Number);
    if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return;
    shape[rr][cc] = value;
  });
}
