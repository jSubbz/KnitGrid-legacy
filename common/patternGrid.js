// common/patternGrid.js
import { clampInt } from "./input.js";

/**
 * Legacy numeric grid helpers
 * Kept intact so the current app continues to run while we migrate
 * workspace pattern storage from numbers to symbol-based cells.
 */
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

/**
 * New symbol-based pattern model
 *
 * A cell is an object so the renderer can evolve independently from the
 * workspace logic. For now we keep the structure intentionally small.
 */
export const PATTERN_SYMBOLS = Object.freeze({
  EMPTY: "empty",
  DOT: "dot",
  H: "h",
  V: "v",
  DIAG_FWD: "diagFwd",
  DIAG_BACK: "diagBack"
});

export const PATTERN_SYMBOL_ORDER = Object.freeze([
  PATTERN_SYMBOLS.EMPTY,
  PATTERN_SYMBOLS.DOT,
  PATTERN_SYMBOLS.H,
  PATTERN_SYMBOLS.V,
  PATTERN_SYMBOLS.DIAG_FWD,
  PATTERN_SYMBOLS.DIAG_BACK
]);

/**
 * Optional display fallback for simple DOM/text rendering.
 * This lets us move to symbol cells before adding full draw functions.
 */
export const PATTERN_SYMBOL_TEXT = Object.freeze({
  [PATTERN_SYMBOLS.EMPTY]: "",
  [PATTERN_SYMBOLS.DOT]: "·",
  [PATTERN_SYMBOLS.H]: "—",
  [PATTERN_SYMBOLS.V]: "|",
  [PATTERN_SYMBOLS.DIAG_FWD]: "/",
  [PATTERN_SYMBOLS.DIAG_BACK]: "\\"
});

/**
 * Legacy numeric -> symbol mapping.
 * This preserves the current paint-digit workflow while we migrate the UI.
 */
export const DIGIT_TO_SYMBOL = Object.freeze({
  0: PATTERN_SYMBOLS.EMPTY,
  1: PATTERN_SYMBOLS.DOT,
  2: PATTERN_SYMBOLS.H,
  3: PATTERN_SYMBOLS.V,
  4: PATTERN_SYMBOLS.DIAG_FWD,
  5: PATTERN_SYMBOLS.DIAG_BACK,
  6: PATTERN_SYMBOLS.DOT,
  7: PATTERN_SYMBOLS.H,
  8: PATTERN_SYMBOLS.V,
  9: PATTERN_SYMBOLS.DOT
});

export const SYMBOL_TO_DIGIT = Object.freeze({
  [PATTERN_SYMBOLS.EMPTY]: 0,
  [PATTERN_SYMBOLS.DOT]: 1,
  [PATTERN_SYMBOLS.H]: 2,
  [PATTERN_SYMBOLS.V]: 3,
  [PATTERN_SYMBOLS.DIAG_FWD]: 4,
  [PATTERN_SYMBOLS.DIAG_BACK]: 5
});

export function isPatternSymbol(value) {
  return PATTERN_SYMBOL_ORDER.includes(value);
}

export function normalizePatternSymbol(symbol) {
  return isPatternSymbol(symbol) ? symbol : PATTERN_SYMBOLS.EMPTY;
}

export function digitToPatternSymbol(value) {
  const n = clampInt(value, 0, 9);
  return DIGIT_TO_SYMBOL[n] || PATTERN_SYMBOLS.EMPTY;
}

export function patternSymbolToDigit(symbol) {
  const s = normalizePatternSymbol(symbol);
  return SYMBOL_TO_DIGIT[s] ?? 0;
}

export function createPatternCell(symbol = PATTERN_SYMBOLS.EMPTY) {
  return {
    symbol: normalizePatternSymbol(symbol)
  };
}

export function clonePatternCell(cell) {
  return {
    symbol: normalizePatternSymbol(cell?.symbol)
  };
}

export function normalizePatternCell(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return createPatternCell(value.symbol);
  }

  if (typeof value === "string") {
    return createPatternCell(value);
  }

  if (Number.isFinite(value)) {
    return createPatternCell(digitToPatternSymbol(value));
  }

  return createPatternCell(PATTERN_SYMBOLS.EMPTY);
}

export function createPatternMatrix(rows, cols, fillValue = PATTERN_SYMBOLS.EMPTY) {
  const r = clampInt(rows, 1, 10000);
  const c = clampInt(cols, 1, 10000);
  const cell = normalizePatternCell(fillValue);

  const m = new Array(r);
  for (let i = 0; i < r; i++) {
    m[i] = new Array(c);
    for (let j = 0; j < c; j++) {
      m[i][j] = clonePatternCell(cell);
    }
  }
  return m;
}

export function clonePatternMatrix(matrix) {
  return matrix.map((row) => row.map((cell) => clonePatternCell(cell)));
}

export function getPatternCell(matrix, row, col) {
  return normalizePatternCell(matrix?.[row]?.[col]);
}

export function getPatternCellSymbol(matrix, row, col) {
  return getPatternCell(matrix, row, col).symbol;
}

export function setPatternCellSymbol(matrix, row, col, symbol) {
  if (!Array.isArray(matrix) || !Array.isArray(matrix[row]) || !matrix[row][col]) return;
  matrix[row][col] = createPatternCell(symbol);
}

export function isPatternCellEmpty(cell) {
  return normalizePatternCell(cell).symbol === PATTERN_SYMBOLS.EMPTY;
}

export function isPatternCellPainted(cell) {
  return !isPatternCellEmpty(cell);
}

export function patternCellToText(cell) {
  const symbol = normalizePatternCell(cell).symbol;
  return PATTERN_SYMBOL_TEXT[symbol] ?? "";
}

export function patternCellToDigit(cell) {
  const symbol = normalizePatternCell(cell).symbol;
  return patternSymbolToDigit(symbol);
}

/**
 * Utilities for gradual migration from number[][] to cell[][]
 */
export function convertNumberMatrixToPatternMatrix(matrix) {
  if (!Array.isArray(matrix)) return [];

  return matrix.map((row) =>
    Array.isArray(row)
      ? row.map((value) => createPatternCell(digitToPatternSymbol(value)))
      : []
  );
}

export function convertPatternMatrixToNumberMatrix(matrix) {
  if (!Array.isArray(matrix)) return [];

  return matrix.map((row) =>
    Array.isArray(row)
      ? row.map((cell) => patternCellToDigit(cell))
      : []
  );
}