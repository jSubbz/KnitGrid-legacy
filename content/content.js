// content/content.js
import { UI } from "../shell/uiBus.js";
import { applyI18nToDom } from "../i18n/i18n.js";
import { clampInt } from "../common/input.js";
import { createMatrix, cloneMatrix, resizeRectFillNew } from "../common/gridMath.js";
import { createNumberMatrix } from "../common/patternGrid.js";
import { renderWizard } from "./wizard.js";
import { renderWorkspace } from "./workspace.js";
import * as ImportController from "../import/importController.js";
import { Hotkeys } from "../app.js";
import { HotkeyMode } from "../common/hotkeys.js";
import { startPosBR, nextPosBRLUp, prevPosBRLUp } from "../common/patternCursor.js";

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
function snapshot() { return { rows: state.rows, cols: state.cols, shape: cloneMatrix(state.shape) }; }
function restoreFromSnapshot(snap) { state.rows = snap.rows; state.cols = snap.cols; state.shape = cloneMatrix(snap.shape); }
function pushUndo(snap) { state.undoStack.push(snap); if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift(); state.redoStack.length = 0; }
function canUndo() { return state.undoStack.length > 0; }
function canRedo() { return state.redoStack.length > 0; }
function undo() { if (!canUndo()) return; const current = snapshot(); const prev = state.undoStack.pop(); state.redoStack.push(current); restoreFromSnapshot(prev); UI.statusRight("status.undo", { ttlMs: 900 }); scheduleRender(); }
function redo() { if (!canRedo()) return; const current = snapshot(); const next = state.redoStack.pop(); state.undoStack.push(current); restoreFromSnapshot(next); UI.statusRight("status.redo", { ttlMs: 900 }); scheduleRender(); }

/* Shape stroke handling */
let strokeInProgress = false;
let strokeSnapshot = null;
function beginStroke() { if (strokeInProgress) return; strokeInProgress = true; strokeSnapshot = snapshot(); }
function endStroke() { if (!strokeInProgress) return; strokeInProgress = false; if (strokeSnapshot) { pushUndo(strokeSnapshot); strokeSnapshot = null; UI.statusRight("status.shape.edited", { ttlMs: 700 }); } }
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
function changeCols(direction) { const delta = state.centeredResize ? 2 : 1; setExact(state.rows, state.cols + direction * delta); }
function changeRows(direction) { const delta = state.centeredResize ? 2 : 1; setExact(state.rows + direction * delta, state.cols); }
function resetShape() { pushUndo(snapshot()); state.shape = createMatrix(state.rows, state.cols, true); UI.statusRight("status.shape.reset", { ttlMs: 1200 }); scheduleRender(); }

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
  if (isInShape(start.r, start.c)) { state.workspace.cursor = start; return; }
  for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) if (isInShape(r, c)) { state.workspace.cursor = { r, c }; return; }
}
function stepCursorNext() {
  const { rows, cols } = getWorkspaceGrid();
  ensureWorkspaceCursorValid();
  let { r, c } = state.workspace.cursor;
  for (let i = 0; i < rows * cols; i++) {
    const nxt = nextPosBRLUp({ r, c, rows, cols });
    r = nxt.r; c = nxt.c;
    if (isInShape(r, c)) { state.workspace.cursor = { r, c }; state.workspace.selectedRow = r; return; }
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
    if (isInShape(r, c)) { state.workspace.cursor = { r, c }; state.workspace.selectedRow = r; return; }
  }
}
function jumpToNextRowStart() {
  const { rows, cols } = getWorkspaceGrid();
  ensureWorkspaceCursorValid();
  const startRow = state.workspace.cursor.r - 1;
  if (startRow < 0) return;
  for (let r = startRow; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) if (isInShape(r, c)) { state.workspace.cursor = { r, c }; state.workspace.selectedRow = r; return; }
}
function paintPatternAtCursor(value) {
  if (!state.confirmedShape || !state.workspace.pattern) return;
  const r = state.workspace.cursor.r;
  const c = state.workspace.cursor.c;
  if (!isInShape(r, c)) return;
  state.workspace.pattern[r][c] = clampInt(value, 0, 9);
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
  sel.rect = { minR: sel.anchor.r, minC: sel.anchor.c, maxR: sel.anchor.r, maxC: sel.anchor.c };
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
  if (!sel.active || !sel.rect) { UI.statusRight("No selection to capture (Shift+Arrow).", { ttlMs: 1600 }); return; }

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
  UI.emit("workspace:selection", { active: false, rect: null, role: state.workspace.selection.role });
  UI.statusRight("Select motif zone (Shift+Arrow), then press T to confirm.", { ttlMs: 2600 });
}

/* Auto motif bounds (contiguous region) */
function findSeedNonZeroCell() {
  const { rows, cols, mask } = getWorkspaceGrid();
  const p = state.workspace.pattern;
  if (!p) return null;
  const cr = state.workspace.cursor.r;
  const cc = state.workspace.cursor.c;
  if (mask?.[cr]?.[cc] && (p[cr]?.[cc] ?? 0) !== 0) return { r: cr, c: cc };
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (mask[r][c] && (p[r]?.[c] ?? 0) !== 0) return { r, c };
  return null;
}
function detectMotifBounds() {
  if (!state.confirmedShape || !state.workspace.pattern) return null;
  const { rows, cols, mask } = getWorkspaceGrid();
  const p = state.workspace.pattern;
  const seed = findSeedNonZeroCell();
  if (!seed) return null;

  const seen = new Set();
  const q = [seed];
  let minR = seed.r, maxR = seed.r, minC = seed.c, maxC = seed.c;
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

    const nbs = [{ r: r - 1, c }, { r: r + 1, c }, { r, c: c - 1 }, { r, c: c + 1 }];
    for (const nb of nbs) {
      if (nb.r < 0 || nb.r >= rows || nb.c < 0 || nb.c >= cols) continue;
      if (!mask[nb.r][nb.c]) continue;
      if ((p[nb.r]?.[nb.c] ?? 0) === 0) continue;
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

const actions = {
  goHome: () => setStep(Steps.HOME),
  goToGauge: () => { UI.statusRight("status.startNew", { ttlMs: 1400 }); setStep(Steps.GAUGE); },
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
    if (!state.stitchesPerInch || !state.rowsPerInch) { UI.statusRight("status.gauge.required", { ttlMs: 2200 }); return; }
    UI.statusRight("status.gauge.saved", { ttlMs: 1500 });
    setStep(Steps.MODE);
  },

  canUndo, canRedo, undo, redo, beginStroke, endStroke, paintCellAndGetAffected,
  setExact, changeCols, changeRows, resetShape,

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
    state.confirmedShape = { rows: state.rows, cols: state.cols, data: cloneMatrix(state.shape) };
    state.workspace.pattern = createNumberMatrix(state.confirmedShape.rows, state.confirmedShape.cols, 0);
    const start = startPosBR(state.confirmedShape.rows, state.confirmedShape.cols);
    state.workspace.cursor = start;
    state.workspace.selectedRow = start.r;
    ensureWorkspaceCursorValid();
    state.workspace.tileSrc.confirmed = false;
    scheduleRender();
    setStep(Steps.WORKSPACE);
  },

  setSelectionRole: (role) => {
    state.workspace.selection.role = role === "dest" ? "dest" : "source";
    UI.emit("workspace:selection", { active: state.workspace.selection.active, rect: state.workspace.selection.rect, role: state.workspace.selection.role });
  },

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
    if (!b) { UI.statusRight("No motif found (need at least one non-zero cell).", { ttlMs: 1800 }); return; }
    state.workspace.tileSrc.originR = b.minR;
    state.workspace.tileSrc.originC = b.minC;
    state.workspace.tileSrc.tileRows = b.maxR - b.minR + 1;
    state.workspace.tileSrc.tileCols = b.maxC - b.minC + 1;
    state.workspace.tileSrc.confirmed = false;
    UI.emit("workspace:tileSrcConfig", { ...state.workspace.tileSrc });

    // KEY FIX: immediately put user into motif capture flow so T confirms motif
    beginSetMotif();
  },

  // these are read by workspace.js, which shows modal prompts and calls tileApply
  tileCheck: () => ({ ok: true, needsConfirm: false, message: "" }),
  tileApply: () => {},
};

/* Hotkey routing */
function emitCursorPatch() {
  UI.emit("workspace:cursor", { r: state.workspace.cursor.r, c: state.workspace.cursor.c, selectedRow: state.workspace.selectedRow });
}
function emitSelectionPatch() {
  const sel = state.workspace.selection;
  UI.emit("workspace:selection", { active: !!sel.active, rect: sel.rect ? { ...sel.rect } : null, role: sel.role });
}

UI.on("hotkey:command", ({ commandId }) => {
  const inWs = state.step === Steps.WORKSPACE;

  switch (commandId) {
    case "design.cursor.left":
      if (inWs) { moveCursorDir("left"); emitCursorPatch(); }
      return;
    case "design.cursor.right":
      if (inWs) { moveCursorDir("right"); emitCursorPatch(); }
      return;
    case "design.cursor.up":
      if (inWs) { moveCursorDir("up"); emitCursorPatch(); }
      return;
    case "design.cursor.down":
      if (inWs) { moveCursorDir("down"); emitCursorPatch(); }
      return;
    case "design.cursor.nextRowStart":
      if (inWs) { jumpToNextRowStart(); emitCursorPatch(); }
      return;

    case "design.select.left":
      if (inWs) { selectionStep("left"); emitCursorPatch(); emitSelectionPatch(); }
      return;
    case "design.select.right":
      if (inWs) { selectionStep("right"); emitCursorPatch(); emitSelectionPatch(); }
      return;
    case "design.select.up":
      if (inWs) { selectionStep("up"); emitCursorPatch(); emitSelectionPatch(); }
      return;
    case "design.select.down":
      if (inWs) { selectionStep("down"); emitCursorPatch(); emitSelectionPatch(); }
      return;

    case "design.select.clear":
      if (inWs) { clearSelection(); emitSelectionPatch(); }
      return;

    case "design.select.capture":
      if (inWs) { captureSelection(); }
      return;

    default:
      if (inWs && typeof commandId === "string" && commandId.startsWith("design.paint.digit.")) {
        const digit = Number(commandId.split(".").pop());
        if (!Number.isFinite(digit)) return;
        const r0 = state.workspace.cursor.r;
        const c0 = state.workspace.cursor.c;
        paintPatternAtCursor(digit);
        stepCursorNext();
        UI.emit("workspace:paint", { r: r0, c: c0, value: clampInt(digit, 0, 9) });
        emitCursorPatch();
        if (state.workspace.selection.active) {
          state.workspace.selection.focus = { ...state.workspace.cursor };
          updateSelectionRect();
          emitSelectionPatch();
        }
      }
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
    Hotkeys.setMode(HotkeyMode.DESIGN);
    wizard.appendChild(renderWorkspace({ state, actions, hotkeys: Hotkeys }));
  } else {
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