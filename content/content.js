// content/content.js
import { UI } from "../shell/uiBus.js";
import { applyI18nToDom } from "../i18n/i18n.js";
import { clampInt } from "../common/input.js";
import { createMatrix, cloneMatrix, resizeRectFillNew } from "../common/gridMath.js";
import {
  createPatternMatrix,
  getPatternCell,
  getPatternCellSymbol,
  isPatternCellPainted,
  digitToPatternSymbol,
  normalizePatternSymbol,
  patternCellToDigit,
  PATTERN_SYMBOLS,
} from "../common/patternGrid.js";
import { renderWizard } from "./wizard.js";
import { renderWorkspace } from "./workspace.js";
import * as ImportController from "../import/importController.js";
import { Hotkeys } from "../app.js";
import { HotkeyMode } from "../common/hotkeys.js";
import { startPosBR, nextPosBRLUp } from "../common/patternCursor.js";

const Steps = Object.freeze({
  HOME: "HOME",
  GAUGE: "GAUGE",
  MODE: "MODE",
  IMPORT: "IMPORT",
  SHAPE: "SHAPE",
  WORKSPACE: "WORKSPACE",
});

const TileMode = Object.freeze({
  ACROSS: "across",
  UP: "up",
  DEST: "dest",
});

const MAX_HISTORY = 100;

const DRAW_W_IN = 8;
const DRAW_H_IN = 10;

const PX_PER_IN = 100;
const RECT_W_PX = DRAW_W_IN * PX_PER_IN;
const RECT_H_PX = DRAW_H_IN * PX_PER_IN;

const state = {
  step: Steps.HOME,

  stitchesPerInch: "",
  rowsPerInch: "",
  yarnName: "",
  yarnDescriptors: "",

  knitMode: "flat",

  mirrorX: false,
  mirrorY: false,
  centeredResize: true,

  cols: 40,
  rows: 40,
  shape: createMatrix(40, 40, true),

  undoStack: [],
  redoStack: [],

  confirmedShape: null,

  workspace: {
    mode: "design",
    cursor: { r: 0, c: 0 },
    rowNotes: {},
    selectedRow: 0,
    pattern: null,

    selection: {
      active: false,
      role: "source",
      anchor: null,
      focus: null,
      rect: null,
    },

    tileSrc: {
      originR: 0,
      originC: 0,
      tileRows: 3,
      tileCols: 3,
      overwriteBlanks: true,
      confirmed: false,
    },

    tileApply: {
      mode: TileMode.ACROSS,
      destRect: null,
    },
  },

  import: {
    imageDataUrl: null,
    imageWidth: 0,
    imageHeight: 0,

    corners: null,
    cornersSource: "none",
    lastDetectErrorKey: null,

    rectifiedDataUrl: null,
    rectifiedWidth: RECT_W_PX,
    rectifiedHeight: RECT_H_PX,

    gridColsFromGauge: 0,
    gridRowsFromGauge: 0,

    isBusy: false,
  },
};

/* render scheduling */
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function mainEl() {
  const el = document.querySelector("main.content");
  if (!el) throw new Error("Main content element not found");
  return el;
}

/* Undo/Redo (shape editor only) */
function snapshot() {
  return { rows: state.rows, cols: state.cols, shape: cloneMatrix(state.shape) };
}
function restoreFromSnapshot(snap) {
  state.rows = snap.rows;
  state.cols = snap.cols;
  state.shape = cloneMatrix(snap.shape);
}
function pushUndo(snap) {
  state.undoStack.push(snap);
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  state.redoStack.length = 0;
}
function canUndo() {
  return state.undoStack.length > 0;
}
function canRedo() {
  return state.redoStack.length > 0;
}
function undo() {
  if (!canUndo()) return;
  const current = snapshot();
  const prev = state.undoStack.pop();
  state.redoStack.push(current);
  restoreFromSnapshot(prev);
  UI.statusRight("status.undo", { ttlMs: 900 });
  scheduleRender();
}
function redo() {
  if (!canRedo()) return;
  const current = snapshot();
  const next = state.redoStack.pop();
  state.undoStack.push(current);
  restoreFromSnapshot(next);
  UI.statusRight("status.redo", { ttlMs: 900 });
  scheduleRender();
}

/* Shape stroke handling */
let strokeInProgress = false;
let strokeSnapshot = null;
function beginStroke() {
  if (strokeInProgress) return;
  strokeInProgress = true;
  strokeSnapshot = snapshot();
}
function endStroke() {
  if (!strokeInProgress) return;
  strokeInProgress = false;
  if (strokeSnapshot) {
    pushUndo(strokeSnapshot);
    strokeSnapshot = null;
    UI.statusRight("status.shape.edited", { ttlMs: 700 });
  }
}
function paintCellAndGetAffected(r, c, value) {
  const affected = [];
  const coords = new Set([`${r},${c}`]);

  if (state.mirrorX) coords.add(`${r},${state.cols - 1 - c}`);
  if (state.mirrorY) coords.add(`${state.rows - 1 - r},${c}`);
  if (state.mirrorX && state.mirrorY) coords.add(`${state.rows - 1 - r},${state.cols - 1 - c}`);

  coords.forEach((key) => {
    const [rr, cc] = key.split(",").map(Number);
    if (rr < 0 || rr >= state.rows || cc < 0 || cc >= state.cols) return;
    state.shape[rr][cc] = value;
    affected.push({ rr, cc, vv: value });
  });

  return affected;
}

/* Resizing */
function setExact(newRows, newCols) {
  const r = clampInt(newRows, 1, 300);
  const c = clampInt(newCols, 1, 300);
  if (r === state.rows && c === state.cols) return;

  pushUndo(snapshot());
  state.shape = resizeRectFillNew(state.shape, r, c, state.centeredResize);
  state.rows = r;
  state.cols = c;
  UI.statusRight("status.shape.resized", { ttlMs: 900 });
  scheduleRender();
}
function changeCols(direction) {
  const delta = state.centeredResize ? 2 : 1;
  setExact(state.rows, state.cols + direction * delta);
}
function changeRows(direction) {
  const delta = state.centeredResize ? 2 : 1;
  setExact(state.rows + direction * delta, state.cols);
}
function resetShape() {
  pushUndo(snapshot());
  state.shape = createMatrix(state.rows, state.cols, true);
  UI.statusRight("status.shape.reset", { ttlMs: 1200 });
  scheduleRender();
}

/* Workspace grid helpers */
function getWorkspaceGrid() {
  const s = state.confirmedShape;
  if (!s) return { rows: state.rows, cols: state.cols, mask: state.shape };
  return { rows: s.rows, cols: s.cols, mask: s.data };
}

function isInShape(r, c) {
  const { rows, cols, mask } = getWorkspaceGrid();
  if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
  return !!mask[r][c];
}

function ensureWorkspaceCursorValid() {
  const { rows, cols } = getWorkspaceGrid();
  const cur = state.workspace.cursor;

  if (isInShape(cur.r, cur.c)) return;

  const start = startPosBR(rows, cols);
  if (isInShape(start.r, start.c)) {
    state.workspace.cursor = start;
    return;
  }

  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      if (isInShape(r, c)) {
        state.workspace.cursor = { r, c };
        return;
      }
    }
  }
}

function stepCursorNext() {
  const { rows, cols } = getWorkspaceGrid();
  ensureWorkspaceCursorValid();

  let { r, c } = state.workspace.cursor;
  for (let i = 0; i < rows * cols; i++) {
    const nxt = nextPosBRLUp({ r, c, rows, cols });
    r = nxt.r;
    c = nxt.c;
    if (isInShape(r, c)) {
      state.workspace.cursor = { r, c };
      state.workspace.selectedRow = r;
      return;
    }
    if (nxt.done) break;
  }
}

function moveCursorDir(dir) {
  const { rows, cols } = getWorkspaceGrid();
  ensureWorkspaceCursorValid();

  let r = state.workspace.cursor.r;
  let c = state.workspace.cursor.c;

  for (let i = 0; i < rows * cols; i++) {
    if (dir === "left") c -= 1;
    else if (dir === "right") c += 1;
    else if (dir === "up") r -= 1;
    else if (dir === "down") r += 1;

    if (r < 0 || r >= rows || c < 0 || c >= cols) return;

    if (isInShape(r, c)) {
      state.workspace.cursor = { r, c };
      state.workspace.selectedRow = r;
      return;
    }
  }
}

function jumpToNextRowStart() {
  const { rows, cols } = getWorkspaceGrid();
  ensureWorkspaceCursorValid();

  const startRow = state.workspace.cursor.r - 1;
  if (startRow < 0) return;

  for (let r = startRow; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      if (isInShape(r, c)) {
        state.workspace.cursor = { r, c };
        state.workspace.selectedRow = r;
        return;
      }
    }
  }
}

function normalizePaintInput(value) {
  if (typeof value === "string") return normalizePatternSymbol(value);
  if (Number.isFinite(value)) return digitToPatternSymbol(value);
  return PATTERN_SYMBOLS.EMPTY;
}

function getWorkspaceDigitValue(r, c) {
  return patternCellToDigit(getPatternCell(state.workspace.pattern, r, c));
}

function paintPatternAtCursor(value) {
  if (!state.confirmedShape || !state.workspace.pattern) return;

  const r = state.workspace.cursor.r;
  const c = state.workspace.cursor.c;
  if (!isInShape(r, c)) return;

  const symbol = normalizePaintInput(value);
  state.workspace.pattern[r][c] = { symbol };
}

/* Selection helpers */
function updateSelectionRect() {
  const sel = state.workspace.selection;
  if (!sel.active || !sel.anchor || !sel.focus) return;

  const minR = Math.min(sel.anchor.r, sel.focus.r);
  const maxR = Math.max(sel.anchor.r, sel.focus.r);
  const minC = Math.min(sel.anchor.c, sel.focus.c);
  const maxC = Math.max(sel.anchor.c, sel.focus.c);

  sel.rect = { minR, minC, maxR, maxC };
}

function setSelectionAnchorIfNeeded() {
  const sel = state.workspace.selection;
  if (sel.active) return;

  ensureWorkspaceCursorValid();
  sel.active = true;
  sel.anchor = { ...state.workspace.cursor };
  sel.focus = { ...state.workspace.cursor };
  sel.rect = {
    minR: sel.anchor.r,
    minC: sel.anchor.c,
    maxR: sel.anchor.r,
    maxC: sel.anchor.c,
  };
}

function clearSelection() {
  const sel = state.workspace.selection;
  sel.active = false;
  sel.anchor = null;
  sel.focus = null;
  sel.rect = null;
}

function selectionStep(dir) {
  setSelectionAnchorIfNeeded();
  moveCursorDir(dir);
  const sel = state.workspace.selection;
  sel.focus = { ...state.workspace.cursor };
  updateSelectionRect();
}

function captureSelection() {
  const sel = state.workspace.selection;
  if (!sel.active || !sel.rect) {
    UI.statusRight("No selection to capture (Shift+Arrow).", { ttlMs: 1600 });
    return;
  }

  const { rows, cols } = getWorkspaceGrid();
  const minR = clampInt(sel.rect.minR, 0, rows - 1);
  const minC = clampInt(sel.rect.minC, 0, cols - 1);
  const maxR = clampInt(sel.rect.maxR, 0, rows - 1);
  const maxC = clampInt(sel.rect.maxC, 0, cols - 1);

  if (sel.role === "dest") {
    state.workspace.tileApply.destRect = { minR, minC, maxR, maxC };
    UI.emit("workspace:tileApplyConfig", { ...state.workspace.tileApply });
    UI.statusRight("Destination box set.", { ttlMs: 1200 });
    return;
  }

  state.workspace.tileSrc.originR = minR;
  state.workspace.tileSrc.originC = minC;
  state.workspace.tileSrc.tileRows = Math.max(1, maxR - minR + 1);
  state.workspace.tileSrc.tileCols = Math.max(1, maxC - minC + 1);
  state.workspace.tileSrc.confirmed = true;
  UI.emit("workspace:tileSrcConfig", { ...state.workspace.tileSrc });
  UI.statusRight("Motif captured.", { ttlMs: 1200 });
}

function beginSetMotif() {
  state.workspace.selection.role = "source";
  clearSelection();
  UI.emit("workspace:selection", {
    active: false,
    rect: null,
    role: state.workspace.selection.role,
  });
  UI.statusRight("Select motif zone (Shift+Arrow), then press T to confirm.", { ttlMs: 2600 });
}

function beginSetDestination() {
  state.workspace.selection.role = "dest";
  clearSelection();
  UI.emit("workspace:selection", {
    active: false,
    rect: null,
    role: state.workspace.selection.role,
  });
  UI.statusRight("Select destination zone (Shift+Arrow), then press T to confirm.", { ttlMs: 2600 });
}

function clearDestination() {
  state.workspace.tileApply.destRect = null;
  UI.emit("workspace:tileApplyConfig", { ...state.workspace.tileApply });
  UI.statusRight("Destination cleared.", { ttlMs: 1200 });
}

/* Auto motif bounds (contiguous region) */
function findSeedPaintedCell() {
  const { rows, cols, mask } = getWorkspaceGrid();
  const p = state.workspace.pattern;
  if (!p) return null;

  const cr = state.workspace.cursor.r;
  const cc = state.workspace.cursor.c;
  if (mask?.[cr]?.[cc] && isPatternCellPainted(p[cr]?.[cc])) return { r: cr, c: cc };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (mask[r][c] && isPatternCellPainted(p[r]?.[c])) return { r, c };
    }
  }

  return null;
}

function detectMotifBounds() {
  if (!state.confirmedShape || !state.workspace.pattern) return null;

  const { rows, cols, mask } = getWorkspaceGrid();
  const p = state.workspace.pattern;
  const seed = findSeedPaintedCell();
  if (!seed) return null;

  const seen = new Set();
  const q = [seed];
  let minR = seed.r;
  let maxR = seed.r;
  let minC = seed.c;
  let maxC = seed.c;

  const key = (r, c) => `${r},${c}`;

  while (q.length) {
    const { r, c } = q.pop();
    const k = key(r, c);
    if (seen.has(k)) continue;
    seen.add(k);

    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;

    const nbs = [
      { r: r - 1, c },
      { r: r + 1, c },
      { r, c: c - 1 },
      { r, c: c + 1 },
    ];

    for (const nb of nbs) {
      if (nb.r < 0 || nb.r >= rows || nb.c < 0 || nb.c >= cols) continue;
      if (!mask[nb.r][nb.c]) continue;
      if (!isPatternCellPainted(p[nb.r]?.[nb.c])) continue;

      const kk = key(nb.r, nb.c);
      if (!seen.has(kk)) q.push(nb);
    }
  }

  return { minR, minC, maxR, maxC };
}

/* ----------------------------
   Tiling helpers used by workspace.js
---------------------------- */
function parseGaugeNumber(str) {
  const n = Number(String(str).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function computeGridFromGauge() {
  const spi = parseGaugeNumber(state.stitchesPerInch);
  const rpi = parseGaugeNumber(state.rowsPerInch);
  if (!spi || !rpi) return { cols: 0, rows: 0 };

  const cols = clampInt(Math.round(DRAW_W_IN * spi), 1, 300);
  const rows = clampInt(Math.round(DRAW_H_IN * rpi), 1, 300);
  return { cols, rows };
}

function getTileSourceCells() {
  const { pattern, tileSrc } = state.workspace;
  if (!pattern) return null;

  const out = [];
  for (let rr = 0; rr < tileSrc.tileRows; rr++) {
    const row = [];
    for (let cc = 0; cc < tileSrc.tileCols; cc++) {
      const srcR = tileSrc.originR + rr;
      const srcC = tileSrc.originC + cc;
      row.push(getPatternCell(pattern, srcR, srcC));
    }
    out.push(row);
  }
  return out;
}

function buildTileTargets(mode) {
  const { rows, cols, mask } = getWorkspaceGrid();
  const { tileSrc, tileApply } = state.workspace;
  const srcRows = Math.max(1, tileSrc.tileRows);
  const srcCols = Math.max(1, tileSrc.tileCols);

  if (mode === TileMode.DEST) {
    const rect = tileApply.destRect;
    if (!rect) return null;

    return {
      startR: rect.minR,
      endR: rect.maxR,
      startC: rect.minC,
      endC: rect.maxC,
      maxRows: rect.maxR - rect.minR + 1,
      maxCols: rect.maxC - rect.minC + 1,
      mask,
      rows,
      cols,
      bounded: true,
    };
  }

  if (mode === TileMode.UP) {
    return {
      startR: tileSrc.originR,
      endR: 0,
      startC: tileSrc.originC,
      endC: tileSrc.originC + srcCols - 1,
      maxRows: tileSrc.originR + 1,
      maxCols: srcCols,
      mask,
      rows,
      cols,
      bounded: false,
    };
  }

  return {
    startR: tileSrc.originR,
    endR: tileSrc.originR + srcRows - 1,
    startC: tileSrc.originC,
    endC: cols - 1,
    maxRows: srcRows,
    maxCols: cols - tileSrc.originC,
    mask,
    rows,
    cols,
    bounded: false,
  };
}

function tileCheck(mode = state.workspace.tileApply.mode) {
  const { tileSrc, tileApply } = state.workspace;
  if (!state.workspace.pattern) {
    return { ok: false, needsConfirm: false, message: "No workspace pattern." };
  }
  if (!tileSrc.confirmed) {
    return { ok: false, needsConfirm: false, message: "No motif confirmed. Capture a motif first." };
  }

  if (mode === TileMode.DEST && !tileApply.destRect) {
    return { ok: false, needsConfirm: false, message: "No destination box set." };
  }

  const srcRows = Math.max(1, tileSrc.tileRows);
  const srcCols = Math.max(1, tileSrc.tileCols);

  let partialRows = false;
  let partialCols = false;

  if (mode === TileMode.DEST) {
    const destRows = tileApply.destRect.maxR - tileApply.destRect.minR + 1;
    const destCols = tileApply.destRect.maxC - tileApply.destRect.minC + 1;
    partialRows = destRows % srcRows !== 0;
    partialCols = destCols % srcCols !== 0;
  } else if (mode === TileMode.ACROSS) {
    const { cols } = getWorkspaceGrid();
    const width = cols - tileSrc.originC;
    partialCols = width % srcCols !== 0;
  } else if (mode === TileMode.UP) {
    const height = tileSrc.originR + 1;
    partialRows = height % srcRows !== 0;
  }

  if (!partialRows && !partialCols) {
    return { ok: true, needsConfirm: false, message: "" };
  }

  const lines = ["Tile area is not an exact multiple of motif size."];
  if (partialRows) lines.push("Rows will end with a partial motif.");
  if (partialCols) lines.push("Columns will end with a partial motif.");
  lines.push("");
  lines.push("Continue with partial fill, or truncate?");

  return { ok: true, needsConfirm: true, message: lines.join("\n") };
}

function tileApply(mode = state.workspace.tileApply.mode, strategy = "partial") {
  const src = getTileSourceCells();
  const target = buildTileTargets(mode);
  if (!src || !target) return;

  const { tileSrc } = state.workspace;
  const { rows, cols, mask } = getWorkspaceGrid();
  const srcRows = Math.max(1, tileSrc.tileRows);
  const srcCols = Math.max(1, tileSrc.tileCols);
  const overwriteBlanks = !!tileSrc.overwriteBlanks;

  const changes = [];

  const rowStarts = [];
  const colStarts = [];

  if (mode === TileMode.DEST) {
    for (let r = target.startR; r <= target.endR; r += srcRows) rowStarts.push(r);
    for (let c = target.startC; c <= target.endC; c += srcCols) colStarts.push(c);
  } else if (mode === TileMode.UP) {
    for (let r = tileSrc.originR; r >= 0; r -= srcRows) rowStarts.push(r);
    colStarts.push(tileSrc.originC);
  } else {
    rowStarts.push(tileSrc.originR);
    for (let c = tileSrc.originC; c < cols; c += srcCols) colStarts.push(c);
  }

  for (const baseR of rowStarts) {
    for (const baseC of colStarts) {
      for (let rr = 0; rr < srcRows; rr++) {
        for (let cc = 0; cc < srcCols; cc++) {
          const destR = mode === TileMode.UP ? baseR - rr : baseR + rr;
          const destC = baseC + cc;

          if (destR < 0 || destR >= rows || destC < 0 || destC >= cols) continue;
          if (!mask[destR]?.[destC]) continue;

          if (mode === TileMode.DEST) {
            if (destR > target.endR || destC > target.endC) continue;
          }

          if (strategy === "truncate") {
            if (mode === TileMode.DEST) {
              if (baseR + srcRows - 1 > target.endR || baseC + srcCols - 1 > target.endC) continue;
            }
            if (mode === TileMode.UP && baseR - (srcRows - 1) < 0) continue;
            if (mode === TileMode.ACROSS && baseC + srcCols - 1 >= cols) continue;
          }

          const srcCell = src[rr]?.[cc] ?? { symbol: PATTERN_SYMBOLS.EMPTY };
          const srcSymbol = getPatternCellSymbol([[srcCell]], 0, 0);

          if (!overwriteBlanks && srcSymbol === PATTERN_SYMBOLS.EMPTY) continue;

          state.workspace.pattern[destR][destC] = { symbol: srcSymbol };
          changes.push({
            r: destR,
            c: destC,
            value: patternCellToDigit(srcCell),
            symbol: srcSymbol,
          });
        }
      }
    }
  }

  if (changes.length) {
    UI.emit("workspace:bulkPaint", { changes });
    UI.statusRight("Tile applied.", { ttlMs: 1400 });
  } else {
    UI.statusRight("No cells changed.", { ttlMs: 1400 });
  }
}

function startOver() {
  state.confirmedShape = null;
  state.workspace.pattern = null;
  state.workspace.rowNotes = {};
  state.workspace.selectedRow = 0;
  state.workspace.mode = "design";
  state.workspace.selection.active = false;
  state.workspace.selection.anchor = null;
  state.workspace.selection.focus = null;
  state.workspace.selection.rect = null;
  state.workspace.tileSrc.confirmed = false;
  state.workspace.tileApply.destRect = null;
  setStep(Steps.SHAPE);
}

const actions = {
  goHome: () => setStep(Steps.HOME),
  goToGauge: () => {
    UI.statusRight("status.startNew", { ttlMs: 1400 });
    setStep(Steps.GAUGE);
  },
  goToMode: () => setStep(Steps.MODE),
  goToShape: () => setStep(Steps.SHAPE),
  goToWorkspace: () => setStep(Steps.WORKSPACE),

  goToImport: () => {
    const g = computeGridFromGauge();
    state.import.gridColsFromGauge = g.cols;
    state.import.gridRowsFromGauge = g.rows;
    setStep(Steps.IMPORT);
  },

  setGauge: (patch) => {
    if (typeof patch.stitchesPerInch === "string") state.stitchesPerInch = patch.stitchesPerInch;
    if (typeof patch.rowsPerInch === "string") state.rowsPerInch = patch.rowsPerInch;
    if (typeof patch.yarnName === "string") state.yarnName = patch.yarnName;
    if (typeof patch.yarnDescriptors === "string") state.yarnDescriptors = patch.yarnDescriptors;
  },

  completeGaugeAndGoMode: () => {
    if (!state.stitchesPerInch || !state.rowsPerInch) {
      UI.statusRight("status.gauge.required", { ttlMs: 2200 });
      return;
    }
    UI.statusRight("status.gauge.saved", { ttlMs: 1500 });
    setStep(Steps.MODE);
  },

  setKnitMode: (mode) => {
    state.knitMode = mode === "round" ? "round" : "flat";
    scheduleRender();
  },

  canUndo,
  canRedo,
  undo,
  redo,
  beginStroke,
  endStroke,
  paintCellAndGetAffected,
  setExact,
  changeCols,
  changeRows,
  resetShape,

  toggleMirrorX: () => {
    state.mirrorX = !state.mirrorX;
    UI.statusRight(state.mirrorX ? "status.mirrorX.on" : "status.mirrorX.off", { ttlMs: 1000 });
    scheduleRender();
  },

  toggleMirrorY: () => {
    state.mirrorY = !state.mirrorY;
    UI.statusRight(state.mirrorY ? "status.mirrorY.on" : "status.mirrorY.off", { ttlMs: 1000 });
    scheduleRender();
  },

  toggleCenteredResize: () => {
    state.centeredResize = !state.centeredResize;
    UI.statusRight(
      state.centeredResize ? "Centered resize on" : "Centered resize off",
      { ttlMs: 1000 }
    );
    scheduleRender();
  },

  setSelectedRow: (r) => {
    const { rows } = getWorkspaceGrid();
    state.workspace.selectedRow = clampInt(r, 0, rows - 1);
    scheduleRender();
  },

  setRowNote: (rowIndex, text) => {
    state.workspace.rowNotes[String(rowIndex)] = String(text ?? "");
    scheduleRender();
  },

  confirmShape: () => {
    state.confirmedShape = {
      rows: state.rows,
      cols: state.cols,
      data: cloneMatrix(state.shape),
    };

    state.workspace.pattern = createPatternMatrix(
      state.confirmedShape.rows,
      state.confirmedShape.cols,
      PATTERN_SYMBOLS.EMPTY
    );

    const start = startPosBR(state.confirmedShape.rows, state.confirmedShape.cols);
    state.workspace.cursor = start;
    state.workspace.selectedRow = start.r;
    ensureWorkspaceCursorValid();
    state.workspace.tileSrc.confirmed = false;
    scheduleRender();
    setStep(Steps.WORKSPACE);
  },

  toggleTrackingMode: () => {
    state.workspace.mode = state.workspace.mode === "track" ? "design" : "track";
    scheduleRender();
  },

  startOver,

  setSelectionRole: (role) => {
    state.workspace.selection.role = role === "dest" ? "dest" : "source";
    UI.emit("workspace:selection", {
      active: state.workspace.selection.active,
      rect: state.workspace.selection.rect,
      role: state.workspace.selection.role,
    });
  },

  beginSetDestination,
  clearDestination,

  setTileApplyConfig: (patch) => {
    if (patch.mode != null) state.workspace.tileApply.mode = patch.mode;
    UI.emit("workspace:tileApplyConfig", { ...state.workspace.tileApply });
  },

  setTileSrcConfig: (patch) => {
    const t = state.workspace.tileSrc;
    if (patch.overwriteBlanks != null) t.overwriteBlanks = !!patch.overwriteBlanks;
    UI.emit("workspace:tileSrcConfig", { ...state.workspace.tileSrc });
  },

  autoTileFromPattern: () => {
    const b = detectMotifBounds();
    if (!b) {
      UI.statusRight("No motif found (need at least one painted cell).", { ttlMs: 1800 });
      return;
    }

    state.workspace.tileSrc.originR = b.minR;
    state.workspace.tileSrc.originC = b.minC;
    state.workspace.tileSrc.tileRows = b.maxR - b.minR + 1;
    state.workspace.tileSrc.tileCols = b.maxC - b.minC + 1;
    state.workspace.tileSrc.confirmed = true;
    UI.emit("workspace:tileSrcConfig", { ...state.workspace.tileSrc });

    clearSelection();
    UI.emit("workspace:selection", {
      active: false,
      rect: null,
      role: state.workspace.selection.role,
    });

    UI.statusRight("Motif auto-detected and ready to tile.", { ttlMs: 1800 });
  },

  tileCheck,
  tileApply,
};

/* Hotkey routing */
function emitCursorPatch() {
  UI.emit("workspace:cursor", {
    r: state.workspace.cursor.r,
    c: state.workspace.cursor.c,
    selectedRow: state.workspace.selectedRow,
  });
}

function emitSelectionPatch() {
  const sel = state.workspace.selection;
  UI.emit("workspace:selection", {
    active: !!sel.active,
    rect: sel.rect ? { ...sel.rect } : null,
    role: sel.role,
  });
}

function handleWorkspacePaint(commandId) {
  let symbol = null;
  let digit = null;

  if (typeof commandId === "string" && commandId.startsWith("design.paint.digit.")) {
    digit = Number(commandId.split(".").pop());
    if (Number.isFinite(digit)) symbol = digitToPatternSymbol(digit);
  } else if (commandId === "design.paint.symbol.empty") {
    symbol = PATTERN_SYMBOLS.EMPTY;
  } else if (commandId === "design.paint.symbol.dot") {
    symbol = PATTERN_SYMBOLS.DOT;
  } else if (commandId === "design.paint.symbol.h") {
    symbol = PATTERN_SYMBOLS.H;
  } else if (commandId === "design.paint.symbol.v") {
    symbol = PATTERN_SYMBOLS.V;
  } else if (commandId === "design.paint.symbol.diagFwd") {
    symbol = PATTERN_SYMBOLS.DIAG_FWD;
  } else if (commandId === "design.paint.symbol.diagBack") {
    symbol = PATTERN_SYMBOLS.DIAG_BACK;
  }

  if (!symbol) return false;

  const r0 = state.workspace.cursor.r;
  const c0 = state.workspace.cursor.c;

  paintPatternAtCursor(symbol);
  stepCursorNext();

  UI.emit("workspace:paint", {
    r: r0,
    c: c0,
    value: digit ?? getWorkspaceDigitValue(r0, c0),
    symbol: getPatternCellSymbol(state.workspace.pattern, r0, c0),
  });

  emitCursorPatch();

  if (state.workspace.selection.active) {
    state.workspace.selection.focus = { ...state.workspace.cursor };
    updateSelectionRect();
    emitSelectionPatch();
  }

  return true;
}

UI.on("hotkey:command", ({ commandId }) => {
  const inShape = state.step === Steps.SHAPE;
  const inWs = state.step === Steps.WORKSPACE;

  switch (commandId) {
    case "history.undo":
      if (inShape || inWs) actions.undo();
      return;

    case "history.redo":
      if (inShape || inWs) actions.redo();
      return;

    case "shape.mirrorX":
      if (inShape) actions.toggleMirrorX();
      return;

    case "shape.mirrorY":
      if (inShape) actions.toggleMirrorY();
      return;

    case "shape.centeredResize":
      if (inShape) actions.toggleCenteredResize();
      return;

    case "shape.addColumn":
      if (inShape) actions.changeCols(+1);
      return;

    case "shape.removeColumn":
      if (inShape) actions.changeCols(-1);
      return;

    case "shape.addRow":
      if (inShape) actions.changeRows(+1);
      return;

    case "shape.removeRow":
      if (inShape) actions.changeRows(-1);
      return;

    case "shape.reset":
      if (inShape) actions.resetShape();
      return;

    case "workspace.editShape":
      if (inWs) actions.goToShape();
      return;

    case "workspace.startOver":
      if (inWs) actions.startOver();
      return;

    case "workspace.mode.toggleTracking":
      if (inWs) actions.toggleTrackingMode();
      return;

    case "design.cursor.left":
      if (inWs) {
        moveCursorDir("left");
        emitCursorPatch();
      }
      return;

    case "design.cursor.right":
      if (inWs) {
        moveCursorDir("right");
        emitCursorPatch();
      }
      return;

    case "design.cursor.up":
      if (inWs) {
        moveCursorDir("up");
        emitCursorPatch();
      }
      return;

    case "design.cursor.down":
      if (inWs) {
        moveCursorDir("down");
        emitCursorPatch();
      }
      return;

    case "design.cursor.nextRowStart":
      if (inWs) {
        jumpToNextRowStart();
        emitCursorPatch();
      }
      return;

    case "design.select.left":
      if (inWs) {
        selectionStep("left");
        emitCursorPatch();
        emitSelectionPatch();
      }
      return;

    case "design.select.right":
      if (inWs) {
        selectionStep("right");
        emitCursorPatch();
        emitSelectionPatch();
      }
      return;

    case "design.select.up":
      if (inWs) {
        selectionStep("up");
        emitCursorPatch();
        emitSelectionPatch();
      }
      return;

    case "design.select.down":
      if (inWs) {
        selectionStep("down");
        emitCursorPatch();
        emitSelectionPatch();
      }
      return;

    case "design.select.clear":
      if (inWs) {
        clearSelection();
        emitSelectionPatch();
      }
      return;

    case "design.select.capture":
      if (inWs) captureSelection();
      return;

    default:
      if (inWs && handleWorkspacePaint(commandId)) return;
      return;
  }
});

function setStep(step) {
  state.step = step;
  scheduleRender();
}

function render() {
  const root = mainEl();
  root.innerHTML = "";

  const wizard = document.createElement("div");
  wizard.className = "wizard";
  root.appendChild(wizard);

  if (state.step === Steps.WORKSPACE) wizard.classList.add("wizard-wide");

  if (state.step === Steps.WORKSPACE) {
    Hotkeys.setMode(state.workspace.mode === "track" ? HotkeyMode.TRACK : HotkeyMode.DESIGN);
    wizard.appendChild(renderWorkspace({ state, actions, hotkeys: Hotkeys }));
  } else {
    Hotkeys.setMode(HotkeyMode.DESIGN);
    wizard.appendChild(renderWizard({ state, actions }));
  }

  applyI18nToDom();
}

export function initContent() {
  state.shape = createMatrix(state.rows, state.cols, true);
  UI.statusLeft("status.placeholder");
  UI.statusRight("status.content.ready", { ttlMs: 1200 });
  scheduleRender();
}