import { UI } from "../shell/uiBus.js";
import { applyI18nToDom } from "../i18n/i18n.js";
import { clampInt } from "../common/input.js";
import { createMatrix, cloneMatrix, resizeRectFillNew } from "../common/gridMath.js";
import { renderWizard } from "./wizard.js";
import { renderWorkspace } from "./workspace.js";
import { loadOpenCv } from "../common/opencvLoader.js";
import * as ImportController from "../import/importController.js";

const Steps = Object.freeze({
  HOME: "HOME",
  GAUGE: "GAUGE",
  MODE: "MODE",
  IMPORT: "IMPORT",
  SHAPE: "SHAPE",
  WORKSPACE: "WORKSPACE",
});

const MAX_HISTORY = 100;

// Drawing area physical size (inches)
const DRAW_W_IN = 8;
const DRAW_H_IN = 10;

// Rectified output resolution
const PX_PER_IN = 100;
const RECT_W_PX = DRAW_W_IN * PX_PER_IN; // 800
const RECT_H_PX = DRAW_H_IN * PX_PER_IN; // 1000

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

  import: {
    imageDataUrl: null,
    imageWidth: 0,
    imageHeight: 0,

    corners: null,               // [{x,y} TL/TR/BR/BL in ORIGINAL image coords]
    cornersSource: "none",
    lastDetectErrorKey: null,

    rectifiedDataUrl: null,
    rectifiedWidth: RECT_W_PX,
    rectifiedHeight: RECT_H_PX,

    gridColsFromGauge: 0,
    gridRowsFromGauge: 0,

    isBusy: false,               // NEW: prevents double-running detect/rectify
  },
};

// Render scheduling
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

/* ----------------------------
   Undo/Redo (store-owned)
---------------------------- */
function snapshot() {
  return {
    rows: state.rows,
    cols: state.cols,
    shape: cloneMatrix(state.shape),
  };
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

function canUndo() { return state.undoStack.length > 0; }
function canRedo() { return state.redoStack.length > 0; }

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

/* ----------------------------
   Stroke handling (shape editor)
---------------------------- */
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

/* ----------------------------
   Grid resizing
---------------------------- */
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
  const target = state.cols + direction * delta;
  setExact(state.rows, target);
}

function changeRows(direction) {
  const delta = state.centeredResize ? 2 : 1;
  const target = state.rows + direction * delta;
  setExact(target, state.cols);
}

function resetShape() {
  pushUndo(snapshot());
  state.shape = createMatrix(state.rows, state.cols, true);
  UI.statusRight("status.shape.reset", { ttlMs: 1200 });
  scheduleRender();
}

/* ----------------------------
   Import helpers
---------------------------- */
function clearImportState(keepImage = false) {
  const imgUrl = keepImage ? state.import.imageDataUrl : null;
  const w = keepImage ? state.import.imageWidth : 0;
  const h = keepImage ? state.import.imageHeight : 0;

  state.import = {
    imageDataUrl: imgUrl,
    imageWidth: w,
    imageHeight: h,

    corners: null,
    cornersSource: "none",
    lastDetectErrorKey: null,

    rectifiedDataUrl: null,
    rectifiedWidth: RECT_W_PX,
    rectifiedHeight: RECT_H_PX,

    gridColsFromGauge: 0,
    gridRowsFromGauge: 0,

    isBusy: false,
  };
}

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

function orderCornersTLTRBRBL(points) {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.x - p.y);

  const tl = points[sums.indexOf(Math.min(...sums))];
  const br = points[sums.indexOf(Math.max(...sums))];
  const tr = points[diffs.indexOf(Math.min(...diffs))];
  const bl = points[diffs.indexOf(Math.max(...diffs))];

  return [tl, tr, br, bl];
}

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("import.image.loadFailed"));
    im.src = dataUrl;
  });
}


/* ----------------------------
   Navigation / Actions
---------------------------- */
function setStep(step) {
  state.step = step;
  scheduleRender();
}

const actions = {
  // Wizard navigation
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

  // Gauge setters
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
    UI.statusRight(state.knitMode === "round" ? "status.mode.round" : "status.mode.flat", { ttlMs: 1200 });
    scheduleRender();
  },

  // Shape toggles
  toggleMirrorX: () => {
    state.mirrorX = !state.mirrorX;
    UI.statusRight(state.mirrorX ? "status.mirrorX.on" : "status.mirrorX.off", { ttlMs: 1100 });
    scheduleRender();
  },

  toggleMirrorY: () => {
    state.mirrorY = !state.mirrorY;
    UI.statusRight(state.mirrorY ? "status.mirrorY.on" : "status.mirrorY.off", { ttlMs: 1100 });
    scheduleRender();
  },

  toggleCenteredResize: () => {
    state.centeredResize = !state.centeredResize;
    UI.statusRight(state.centeredResize ? "status.centered.on" : "status.centered.off", { ttlMs: 1200 });
    scheduleRender();
  },

  // Shape edit + undo/redo
  canUndo,
  canRedo,
  undo,
  redo,
  beginStroke,
  endStroke,
  paintCellAndGetAffected,

  // Resizing
  setExact,
  changeCols,
  changeRows,
  resetShape,

  // Confirm shape -> workspace
  confirmShape: () => {
    state.confirmedShape = {
      rows: state.rows,
      cols: state.cols,
      data: cloneMatrix(state.shape),
    };
    UI.statusRight("status.shape.confirmed", { ttlMs: 1400 });
    setStep(Steps.WORKSPACE);
  },

  // Workspace actions
  startOver: () => {
    state.step = Steps.HOME;
    state.stitchesPerInch = "";
    state.rowsPerInch = "";
    state.yarnName = "";
    state.yarnDescriptors = "";
    state.knitMode = "flat";

    state.mirrorX = false;
    state.mirrorY = false;
    state.centeredResize = true;

    state.cols = 40;
    state.rows = 40;
    state.shape = createMatrix(40, 40, true);

    state.undoStack = [];
    state.redoStack = [];
    state.confirmedShape = null;

    clearImportState(false);

    UI.statusRight("status.startOver", { ttlMs: 1600 });
    scheduleRender();
  },

  /* ----------------------------
     Import actions
  ---------------------------- */
    importSetImage: async (file) => {
    await ImportController.setImage({
      state,
      UI,
      file,
      scheduleRender,
      computeGridFromGauge,
    });
  },

  importAutoDetect: async () => {
    await ImportController.autoDetect({ state, UI, scheduleRender });
  },

  importSetCorners: (corners, source = "manual") => {
    ImportController.setCorners({ state, corners, source, scheduleRender });
  },

  importRectifyManual: async () => {
    await ImportController.rectifyManual({ state, UI, scheduleRender });
  },


  importOpenGridEditor: (cols, rows) => {
    const r = clampInt(rows, 1, 300);
    const c = clampInt(cols, 1, 300);

    state.rows = r;
    state.cols = c;
    state.shape = createMatrix(r, c, true);
    state.undoStack = [];
    state.redoStack = [];
    state.confirmedShape = null;

    UI.statusRight("import.status.gridReady", { ttlMs: 1600 });
    setStep(Steps.SHAPE);
  },

  importNextStub: () => {
    UI.statusRight("import.next.stub", { ttlMs: 2400 });
  },
};

function render() {
  const root = mainEl();
  root.innerHTML = "";

  const wizard = document.createElement("div");
  wizard.className = "wizard";
  root.appendChild(wizard);

  if (state.step === Steps.WORKSPACE) {
    wizard.appendChild(renderWorkspace({ state, actions: { ...actions, goToShape: () => setStep(Steps.SHAPE) } }));
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
