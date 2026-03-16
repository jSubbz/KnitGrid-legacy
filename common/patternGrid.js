// common/patternGrid.js
import { clampInt } from "./input.js";

export function createNumberMatrix(rows, cols, fillValue = 0) {
  const r = clampInt(rows, 1, 10000);
  const c = clampInt(cols, 1, 10000);
  const v = Number.isFinite(fillValue) ? fillValue : 0;

  const m = new Array(r);
  for (let i = 0; i < r; i++) {
    m[i] = new Array(c).fill(v);
  }
  return m;
}

export function cloneNumberMatrix(m) {
  return m.map((row) => row.map((v) => (Number.isFinite(v) ? v : 0)));
}