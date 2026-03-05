import { UI } from "../shell/uiBus.js";
import { renderCard, mkButton, mkField } from "../common/domUI.js";
import { clampInt } from "../common/input.js";
import { renderImportStep } from "./wizard/importStep.js";

let shortcutsAttached = false;
let shapeResizeAbort = null;
let importAbort = null;

export function renderWizard({ state, actions }) {
  if (state.step === "HOME") return renderHome({ actions });
  if (state.step === "GAUGE") return renderGauge({ state, actions });
  if (state.step === "MODE") return renderMode({ state, actions });
  if (state.step === "IMPORT") return renderImportCard({ state, actions });
  if (state.step === "SHAPE") return renderShapeEditor({ state, actions });

  return renderHome({ actions });
}

/* HOME */
function renderHome({ actions }) {
  const body = document.createElement("div");
  body.className = "choice-grid";

  body.appendChild(renderChoice({
    titleKey: "home.choice.patternZone.title",
    textKey: "home.choice.patternZone.text",
    buttonKey: "home.choice.patternZone.button",
    onClick: () => UI.statusRight("status.notImplemented", { ttlMs: 1800 }),
  }));

  body.appendChild(renderChoice({
    titleKey: "home.choice.newToday.title",
    textKey: "home.choice.newToday.text",
    buttonKey: "home.choice.newToday.button",
    onClick: actions.goToGauge,
  }));

  body.appendChild(renderChoice({
    titleKey: "home.choice.openExisting.title",
    textKey: "home.choice.openExisting.text",
    buttonKey: "home.choice.openExisting.button",
    onClick: () => UI.statusRight("status.notImplemented", { ttlMs: 1800 }),
  }));

  return renderCard({
    titleKey: "home.title",
    subtitleKey: "home.subtitle",
    bodyEl: body,
  });
}

function renderChoice({ titleKey, textKey, buttonKey, onClick }) {
  const box = document.createElement("div");
  box.className = "choice";

  const title = document.createElement("p");
  title.className = "choice-title";
  title.setAttribute("data-i18n", titleKey);
  title.textContent = titleKey;

  const text = document.createElement("p");
  text.className = "choice-text";
  text.setAttribute("data-i18n", textKey);
  text.textContent = textKey;

  const btn = mkButton({ key: buttonKey, className: "btn btn-primary", onClick });

  box.appendChild(title);
  box.appendChild(text);
  box.appendChild(btn);
  return box;
}

/* GAUGE */
function renderGauge({ state, actions }) {
  const body = document.createElement("div");

  const row = document.createElement("div");
  row.className = "row";

  const stitches = document.createElement("input");
  stitches.className = "input";
  stitches.inputMode = "decimal";
  stitches.placeholder = "0";
  stitches.value = state.stitchesPerInch;
  stitches.addEventListener("input", () => actions.setGauge({ stitchesPerInch: stitches.value }));

  const rows = document.createElement("input");
  rows.className = "input";
  rows.inputMode = "decimal";
  rows.placeholder = "0";
  rows.value = state.rowsPerInch;
  rows.addEventListener("input", () => actions.setGauge({ rowsPerInch: rows.value }));

  row.appendChild(mkField({ labelKey: "gauge.stitchesPerInch", inputEl: stitches }));
  row.appendChild(mkField({ labelKey: "gauge.rowsPerInch", inputEl: rows }));

  const row2 = document.createElement("div");
  row2.className = "row";
  row2.style.marginTop = "12px";

  const yarnName = document.createElement("input");
  yarnName.className = "input";
  yarnName.value = state.yarnName;
  yarnName.addEventListener("input", () => actions.setGauge({ yarnName: yarnName.value }));

  const yarnDesc = document.createElement("textarea");
  yarnDesc.className = "textarea";
  yarnDesc.value = state.yarnDescriptors;
  yarnDesc.addEventListener("input", () => actions.setGauge({ yarnDescriptors: yarnDesc.value }));

  row2.appendChild(mkField({ labelKey: "yarn.name", inputEl: yarnName }));
  row2.appendChild(mkField({ labelKey: "yarn.descriptors", inputEl: yarnDesc }));

  body.appendChild(row);
  body.appendChild(row2);

  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";

  actionsEl.appendChild(mkButton({ key: "nav.back", className: "btn", onClick: actions.goHome }));
  actionsEl.appendChild(mkButton({
    key: "nav.next",
    className: "btn btn-primary",
    onClick: actions.completeGaugeAndGoMode,
  }));

  return renderCard({
    titleKey: "gauge.title",
    subtitleKey: "gauge.subtitle",
    bodyEl: body,
    actionsEl,
  });
}

/* MODE */
function renderMode({ state, actions }) {
  const body = document.createElement("div");

  const row = document.createElement("div");
  row.className = "row";

  const left = document.createElement("div");
  left.className = "choice";

  const t1 = document.createElement("p");
  t1.className = "choice-title";
  t1.setAttribute("data-i18n", "mode.question");
  t1.textContent = "mode.question";

  const btnFlat = mkButton({
    key: "mode.flat",
    className: "btn",
    onClick: () => actions.setKnitMode("flat"),
  });

  const btnRound = mkButton({
    key: "mode.round",
    className: "btn",
    onClick: () => actions.setKnitMode("round"),
  });

  left.appendChild(t1);
  left.appendChild(btnFlat);
  left.appendChild(btnRound);

  const right = document.createElement("div");
  right.className = "choice";

  const t2 = document.createElement("p");
  t2.className = "choice-title";
  t2.setAttribute("data-i18n", "mode.importShape.title");
  t2.textContent = "mode.importShape.title";

  const p2 = document.createElement("p");
  p2.className = "choice-text";
  p2.setAttribute("data-i18n", "mode.importShape.text");
  p2.textContent = "mode.importShape.text";

  const importBtn = mkButton({
    key: "mode.importShape.button",
    className: "btn btn-primary",
    onClick: actions.goToImport,
  });

  right.appendChild(t2);
  right.appendChild(p2);
  right.appendChild(importBtn);

  row.appendChild(left);
  row.appendChild(right);
  body.appendChild(row);

  if (state.knitMode === "flat") btnFlat.classList.add("btn-primary");
  else btnRound.classList.add("btn-primary");

  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";

  actionsEl.appendChild(mkButton({ key: "nav.back", className: "btn", onClick: actions.goToGauge }));
  actionsEl.appendChild(mkButton({ key: "nav.next", className: "btn btn-primary", onClick: actions.goToShape }));

  return renderCard({
    titleKey: "mode.title",
    subtitleKey: "mode.subtitle",
    bodyEl: body,
    actionsEl,
  });
}
function renderImportCard({ state, actions }) {
  const { body, actionsEl } = renderImportStep({ state, actions });
  return renderCard({
    titleKey: "import.title",
    subtitleKey: "import.subtitle",
    bodyEl: body,
    actionsEl,
  });
}


/* SHAPE EDITOR (unchanged from your working version) */
function renderShapeEditor({ state, actions }) {
  const body = document.createElement("div");

  const toolbar = document.createElement("div");
  toolbar.className = "shape-toolbar";

  toolbar.appendChild(mkButton({
    key: "shape.undo",
    className: "btn",
    disabled: !actions.canUndo(),
    onClick: actions.undo,
  }));

  toolbar.appendChild(mkButton({
    key: "shape.redo",
    className: "btn",
    disabled: !actions.canRedo(),
    onClick: actions.redo,
  }));

  toolbar.appendChild(mkButton({
    key: "shape.mirrorX",
    className: "btn",
    pressed: state.mirrorX,
    onClick: actions.toggleMirrorX,
  }));

  toolbar.appendChild(mkButton({
    key: "shape.mirrorY",
    className: "btn",
    pressed: state.mirrorY,
    onClick: actions.toggleMirrorY,
  }));

  toolbar.appendChild(mkButton({
    key: "shape.centeredResize",
    className: "btn",
    pressed: state.centeredResize,
    onClick: actions.toggleCenteredResize,
  }));

  toolbar.appendChild(mkButton({
    key: "shape.addColumn",
    className: "btn btn-primary",
    onClick: () => actions.changeCols(+1),
  }));

  toolbar.appendChild(mkButton({
    key: "shape.removeColumn",
    className: "btn",
    onClick: () => actions.changeCols(-1),
  }));

  toolbar.appendChild(mkButton({
    key: "shape.addRow",
    className: "btn btn-primary",
    onClick: () => actions.changeRows(+1),
  }));

  toolbar.appendChild(mkButton({
    key: "shape.removeRow",
    className: "btn",
    onClick: () => actions.changeRows(-1),
  }));

  toolbar.appendChild(mkButton({
    key: "shape.reset",
    className: "btn btn-danger",
    onClick: actions.resetShape,
  }));

  body.appendChild(toolbar);

  const info = document.createElement("div");
  info.className = "shape-info";

  const infoLabel = document.createElement("span");
  infoLabel.setAttribute("data-i18n", "shape.gridSize");
  infoLabel.textContent = "shape.gridSize";

  const colsInput = document.createElement("input");
  colsInput.className = "input";
  colsInput.type = "number";
  colsInput.min = "1";
  colsInput.max = "300";
  colsInput.step = "1";
  colsInput.value = String(state.cols);

  const times = document.createElement("span");
  times.className = "times";
  times.textContent = "×";

  const rowsInput = document.createElement("input");
  rowsInput.className = "input";
  rowsInput.type = "number";
  rowsInput.min = "1";
  rowsInput.max = "300";
  rowsInput.step = "1";
  rowsInput.value = String(state.rows);

  colsInput.addEventListener("change", () => {
    const c = clampInt(Number(colsInput.value), 1, 300);
    actions.setExact(state.rows, c);
  });

  rowsInput.addEventListener("change", () => {
    const r = clampInt(Number(rowsInput.value), 1, 300);
    actions.setExact(r, state.cols);
  });

  info.appendChild(infoLabel);
  info.appendChild(colsInput);
  info.appendChild(times);
  info.appendChild(rowsInput);

  body.appendChild(info);

  const hint = document.createElement("div");
  hint.className = "label";
  hint.style.margin = "0 0 10px 2px";
  hint.setAttribute("data-i18n", "shape.hint");
  hint.textContent = "shape.hint";
  body.appendChild(hint);

  const wrap = document.createElement("div");
  wrap.className = "grid-wrap editor";

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell))`;
  grid.style.gridTemplateRows = `repeat(${state.rows}, var(--cell))`;

  grid.addEventListener("contextmenu", (e) => e.preventDefault());

  if (shapeResizeAbort) shapeResizeAbort.abort();
  shapeResizeAbort = new AbortController();

  const applyCellSize = () => {
    const rect = wrap.getBoundingClientRect();
    const padding = 24;

    const availableW = Math.max(120, rect.width - padding);
    const availableH = Math.max(120, rect.height - padding);

    const gap = 1;
    const maxCell = 18;
    const minCell = 6;

    const cellW = Math.floor((availableW - (state.cols + 1) * gap) / state.cols);
    const cellH = Math.floor((availableH - (state.rows + 1) * gap) / state.rows);
    const cell = clampInt(Math.min(cellW, cellH, maxCell), minCell, maxCell);

    wrap.style.setProperty("--cell", `${cell}px`);
  };

  requestAnimationFrame(applyCellSize);
  window.addEventListener("resize", applyCellSize, { signal: shapeResizeAbort.signal });

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = document.createElement("div");
      cell.className = "cell" + (state.shape[r][c] ? " on" : "");
      cell.setAttribute("data-r", String(r));
      cell.setAttribute("data-c", String(c));
      grid.appendChild(cell);
    }
  }

  const setCellClass = (r, c, value) => {
    const idx = r * state.cols + c;
    const el = grid.children[idx];
    if (el) el.classList.toggle("on", value);
  };

  const paintAndUpdateDom = (r, c, value) => {
    const affected = actions.paintCellAndGetAffected(r, c, value);
    for (const { rr, cc, vv } of affected) setCellClass(rr, cc, vv);
  };

  let isPointerDown = false;
  let strokeStarted = false;
  let strokeValue = false;

  grid.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;

    isPointerDown = true;
    try { grid.setPointerCapture(e.pointerId); } catch {}

    if (!strokeStarted) {
      strokeStarted = true;
      actions.beginStroke();
    }

    strokeValue = (e.button === 2);
    const r = Number(cell.getAttribute("data-r"));
    const c = Number(cell.getAttribute("data-c"));
    paintAndUpdateDom(r, c, strokeValue);
  });

  grid.addEventListener("pointermove", (e) => {
    if (!isPointerDown) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.(".cell");
    if (!cell) return;
    const r = Number(cell.getAttribute("data-r"));
    const c = Number(cell.getAttribute("data-c"));
    paintAndUpdateDom(r, c, strokeValue);
  });

  const endStroke = () => {
    if (!strokeStarted) return;
    strokeStarted = false;
    actions.endStroke();
  };

  grid.addEventListener("pointerup", () => { isPointerDown = false; endStroke(); });
  grid.addEventListener("pointercancel", () => { isPointerDown = false; endStroke(); });

  wrap.appendChild(grid);
  body.appendChild(wrap);

  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";

  actionsEl.appendChild(mkButton({ key: "nav.back", className: "btn", onClick: actions.goToMode }));
  actionsEl.appendChild(mkButton({ key: "shape.confirm", className: "btn btn-primary", onClick: actions.confirmShape }));

  attachShortcutsOnce({ actions, state });

  return renderCard({
    titleKey: "shape.title",
    subtitleKey: "shape.subtitle",
    bodyEl: body,
    actionsEl,
  });
}

function attachShortcutsOnce({ actions, state }) {
  if (shortcutsAttached) return;
  shortcutsAttached = true;

  window.addEventListener("keydown", (e) => {
    if (state.step !== "SHAPE") return;

    const isMac = navigator.platform.toLowerCase().includes("mac");
    const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    if (!ctrlOrCmd) return;

    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) {
      e.preventDefault();
      actions.undo();
      return;
    }
    if (k === "y" || (k === "z" && e.shiftKey)) {
      e.preventDefault();
      actions.redo();
    }
  }, { passive: false });
}
