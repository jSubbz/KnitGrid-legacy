// content/workspace.js
import { renderCard, mkButton } from "../common/domUI.js";
import { UI } from "../shell/uiBus.js";

let cleanup = null;

function hotkeyBadge(hotkeys, commandId) {
  const key = hotkeys?.getKeyForCommand?.(commandId) ?? "";
  const el = document.createElement("span");
  el.className = "hotkey";
  el.textContent = key ? `(${key})` : "";
  return el;
}

function drawMinimap(canvas, { rows, cols, mask, cursor }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const cellW = w / Math.max(1, cols);
  const cellH = h / Math.max(1, rows);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask[r][c]) continue;
      ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
    }
  }

  if (cursor) {
    ctx.strokeStyle = "rgba(0, 200, 255, 0.9)";
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.18));
    ctx.strokeRect(cursor.c * cellW, cursor.r * cellH, cellW, cellH);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
}

function fitWorkspaceCellSize(wrapEl, rows, cols) {
  const pad = 28;
  const availW = Math.max(80, wrapEl.clientWidth - pad);
  const availH = Math.max(80, wrapEl.clientHeight - pad);
  const cell = Math.floor(Math.min(availW / Math.max(1, cols), availH / Math.max(1, rows)));
  const clamped = Math.max(6, Math.min(18, cell));
  wrapEl.style.setProperty("--cell", `${clamped}px`);
}

/** internal row index -> display row number (1..rows), bottom is 1 */
function toDisplayRow(internalRow, rows) {
  return rows - internalRow;
}

/** display row number (1..rows) -> internal row index (0..rows-1) */
function toInternalRow(displayRow, rows) {
  return rows - displayRow;
}

function makeModal() {
  const backdrop = document.createElement("div");
  backdrop.style.position = "fixed";
  backdrop.style.inset = "0";
  backdrop.style.background = "rgba(0,0,0,0.55)";
  backdrop.style.display = "flex";
  backdrop.style.alignItems = "center";
  backdrop.style.justifyContent = "center";
  backdrop.style.zIndex = "9999";

  const box = document.createElement("div");
  box.style.width = "min(520px, 92vw)";
  box.style.border = "1px solid rgba(255,255,255,0.18)";
  box.style.borderRadius = "14px";
  box.style.background = "rgba(20,24,34,0.98)";
  box.style.boxShadow = "0 18px 60px rgba(0,0,0,0.55)";
  box.style.padding = "14px";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.marginBottom = "8px";
  title.textContent = "Tiling check";

  const msg = document.createElement("pre");
  msg.style.whiteSpace = "pre-wrap";
  msg.style.margin = "0 0 12px 0";
  msg.style.color = "rgba(233,238,247,0.92)";
  msg.style.fontFamily = "inherit";
  msg.style.fontSize = "13px";
  msg.textContent = "";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.justifyContent = "flex-end";

  const btnCancel = document.createElement("button");
  btnCancel.type = "button";
  btnCancel.className = "btn";
  btnCancel.textContent = "Cancel";

  const btnTrunc = document.createElement("button");
  btnTrunc.type = "button";
  btnTrunc.className = "btn";
  btnTrunc.textContent = "Truncate";

  const btnContinue = document.createElement("button");
  btnContinue.type = "button";
  btnContinue.className = "btn btn-primary";
  btnContinue.textContent = "Continue (partial)";

  row.appendChild(btnCancel);
  row.appendChild(btnTrunc);
  row.appendChild(btnContinue);

  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(row);
  backdrop.appendChild(box);

  return { backdrop, msg, btnCancel, btnTrunc, btnContinue };
}

export function renderWorkspace({ state, actions, hotkeys }) {
  if (typeof cleanup === "function") cleanup();
  cleanup = null;

  const body = document.createElement("div");
  const ws = document.createElement("div");
  ws.className = "workspace";

  const s = state.confirmedShape;
  const rows = s?.rows ?? state.rows;
  const cols = s?.cols ?? state.cols;
  const mask = s?.data ?? state.shape;

  /* ----------------------------
     LEFT
  ---------------------------- */
  const left = document.createElement("div");
  left.className = "sidepanel";

  const leftSection = document.createElement("div");
  leftSection.className = "panel-section";

  const editBtn = mkButton({
    key: "workspace.editShape",
    className: "btn",
    onClick: actions.goToShape,
  });
  editBtn.appendChild(hotkeyBadge(hotkeys, "workspace.editShape"));

  const modeBtn = mkButton({
    key: state.workspace.mode === "track" ? "workspace.mode.track" : "workspace.mode.design",
    className: "btn btn-primary",
    onClick: actions.toggleTrackingMode,
  });
  modeBtn.appendChild(hotkeyBadge(hotkeys, "workspace.mode.toggleTracking"));

  const undoBtn = mkButton({
    key: "workspace.undo",
    className: "btn",
    onClick: actions.undo,
    disabled: !actions.canUndo(),
  });
  undoBtn.appendChild(hotkeyBadge(hotkeys, "history.undo"));

  const redoBtn = mkButton({
    key: "workspace.redo",
    className: "btn",
    onClick: actions.redo,
    disabled: !actions.canRedo(),
  });
  redoBtn.appendChild(hotkeyBadge(hotkeys, "history.redo"));

  const hint = document.createElement("div");
  hint.className = "meta";
  hint.textContent = "0–9 paint | arrows move | Shift+arrows select | T capture | Esc clear";

  leftSection.appendChild(editBtn);
  leftSection.appendChild(modeBtn);
  leftSection.appendChild(undoBtn);
  leftSection.appendChild(redoBtn);
  leftSection.appendChild(hint);
  left.appendChild(leftSection);

  /* ----------------------------
     CENTER
  ---------------------------- */
  const center = document.createElement("div");
  center.className = "centerpanel";

  const header = document.createElement("div");
  header.className = "centerpanel-header";

  const title = document.createElement("h3");
  title.className = "centerpanel-title";
  title.setAttribute("data-i18n", "workspace.title");
  title.textContent = "workspace.title";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${cols} × ${rows} | ${state.knitMode} | ${state.workspace.mode}`;

  header.appendChild(title);
  header.appendChild(meta);
  center.appendChild(header);

  const wrap = document.createElement("div");
  wrap.className = "grid-wrap centered ws-grid-wrap";
  wrap.style.setProperty("--cell", "18px");
  wrap.tabIndex = 0;
  wrap.addEventListener("click", () => wrap.focus());
  wrap.style.position = "relative";

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, var(--cell))`;
  grid.style.gridTemplateRows = `repeat(${rows}, var(--cell))`;

  const cellByKey = new Map();
  let cursorKey = `${state.workspace.cursor.r},${state.workspace.cursor.c}`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement("div");
      const inShape = !!mask[r][c];
      const isCursor = state.workspace.cursor.r === r && state.workspace.cursor.c === c;
      const v = state.workspace.pattern ? (state.workspace.pattern[r]?.[c] ?? 0) : 0;

      cell.className = "cell" + (inShape ? " on" : "") + (isCursor ? " cursor" : "");
      if (inShape && v !== 0) cell.textContent = String(v);

      const k = `${r},${c}`;
      cellByKey.set(k, cell);
      grid.appendChild(cell);
    }
  }

  const selOverlay = document.createElement("div");
  selOverlay.hidden = true;
  selOverlay.style.position = "absolute";
  selOverlay.style.border = "2px solid rgba(0, 200, 255, 0.9)";
  selOverlay.style.borderRadius = "8px";
  selOverlay.style.pointerEvents = "none";
  selOverlay.style.boxSizing = "border-box";
  selOverlay.style.background = "rgba(0,200,255,0.08)";

  wrap.appendChild(grid);
  wrap.appendChild(selOverlay);
  center.appendChild(wrap);

  function positionSelectionOverlay(rect) {
    if (!rect) {
      selOverlay.hidden = true;
      return;
    }

    const tl = cellByKey.get(`${rect.minR},${rect.minC}`);
    const br = cellByKey.get(`${rect.maxR},${rect.maxC}`);
    if (!tl || !br) {
      selOverlay.hidden = true;
      return;
    }

    const wrapBox = wrap.getBoundingClientRect();
    const tlBox = tl.getBoundingClientRect();
    const brBox = br.getBoundingClientRect();

    const left = tlBox.left - wrapBox.left + wrap.scrollLeft;
    const top = tlBox.top - wrapBox.top + wrap.scrollTop;
    const right = brBox.right - wrapBox.left + wrap.scrollLeft;
    const bottom = brBox.bottom - wrapBox.top + wrap.scrollTop;

    selOverlay.style.left = `${left}px`;
    selOverlay.style.top = `${top}px`;
    selOverlay.style.width = `${Math.max(1, right - left)}px`;
    selOverlay.style.height = `${Math.max(1, bottom - top)}px`;
    selOverlay.hidden = false;
  }

  /* ----------------------------
     RIGHT
  ---------------------------- */
  const right = document.createElement("div");
  right.className = "sidepanel";

  const rightSection = document.createElement("div");
  rightSection.className = "panel-section";

  const canvas = document.createElement("canvas");
  canvas.className = "ws-minimap-canvas";
  canvas.width = 220;
  canvas.height = 220;
  rightSection.appendChild(canvas);

  // Motif / Destination buttons
  const roleRow = document.createElement("div");
  roleRow.style.display = "flex";
  roleRow.style.gap = "8px";

  const btnRoleMotif = document.createElement("button");
  btnRoleMotif.type = "button";
  btnRoleMotif.className = "btn";
  btnRoleMotif.textContent = "Motif";

  const btnRoleDest = document.createElement("button");
  btnRoleDest.type = "button";
  btnRoleDest.className = "btn";
  btnRoleDest.textContent = "Destination";

  roleRow.appendChild(btnRoleMotif);
  roleRow.appendChild(btnRoleDest);
  rightSection.appendChild(roleRow);

  function syncRoleButtons(role) {
    btnRoleMotif.setAttribute("aria-pressed", role === "source" ? "true" : "false");
    btnRoleDest.setAttribute("aria-pressed", role === "dest" ? "true" : "false");
  }
  syncRoleButtons(state.workspace.selection.role);

  btnRoleMotif.addEventListener("click", () => actions.setSelectionRole("source"));
  btnRoleDest.addEventListener("click", () => actions.setSelectionRole("dest"));

  const btnAuto = document.createElement("button");
  btnAuto.type = "button";
  btnAuto.className = "btn";
  btnAuto.textContent = "Auto-detect motif bounds";
  btnAuto.addEventListener("click", () => actions.autoTileFromPattern());
  rightSection.appendChild(btnAuto);

  const modeSel = document.createElement("select");
  modeSel.className = "ws-row-picker";
  modeSel.innerHTML = `
    <option value="across">Tile across to edge</option>
    <option value="up">Tile up to edge</option>
    <option value="dest">Tile into destination box</option>
  `;
  modeSel.value = state.workspace.tileApply.mode;
  rightSection.appendChild(modeSel);

  modeSel.addEventListener("change", () => actions.setTileApplyConfig({ mode: modeSel.value }));

  // Destination controls
  const destWrap = document.createElement("div");
  destWrap.style.display = "flex";
  destWrap.style.flexDirection = "column";
  destWrap.style.gap = "8px";

  const destMeta = document.createElement("div");
  destMeta.className = "meta";

  const destBtn = document.createElement("button");
  destBtn.type = "button";
  destBtn.className = "btn";
  destBtn.textContent = "Set destination…";
  destBtn.addEventListener("click", () => actions.beginSetDestination());

  const destClearBtn = document.createElement("button");
  destClearBtn.type = "button";
  destClearBtn.className = "btn";
  destClearBtn.textContent = "Clear destination";
  destClearBtn.addEventListener("click", () => actions.clearDestination());

  destWrap.appendChild(destMeta);
  destWrap.appendChild(destBtn);
  destWrap.appendChild(destClearBtn);
  rightSection.appendChild(destWrap);

  function syncDestUI(mode, destRect) {
    const show = mode === "dest";
    destWrap.style.display = show ? "" : "none";
    destMeta.textContent = destRect
      ? "Destination set (Apply will tile into it)."
      : "Destination not set. Select a box; Apply will use it even without pressing T.";
    destClearBtn.disabled = !destRect;
  }
  syncDestUI(modeSel.value, state.workspace.tileApply.destRect);

  // Overwrite blanks toggle
  const zerosWrap = document.createElement("label");
  zerosWrap.style.display = "flex";
  zerosWrap.style.gap = "8px";
  zerosWrap.style.alignItems = "center";

  const chkOverwrite = document.createElement("input");
  chkOverwrite.type = "checkbox";
  chkOverwrite.checked = !!state.workspace.tileSrc.overwriteBlanks;

  const zerosText = document.createElement("span");
  zerosText.textContent = "Overwrite blanks (erasure)";

  zerosWrap.appendChild(chkOverwrite);
  zerosWrap.appendChild(zerosText);

  const zerosHelp = document.createElement("div");
  zerosHelp.className = "meta";
  zerosHelp.textContent = "Off = overlay (blanks are transparent).";

  chkOverwrite.addEventListener("change", () => {
    actions.setTileSrcConfig({ overwriteBlanks: chkOverwrite.checked });
  });

  rightSection.appendChild(zerosWrap);
  rightSection.appendChild(zerosHelp);

  const btnApply = document.createElement("button");
  btnApply.type = "button";
  btnApply.className = "btn btn-primary";
  btnApply.textContent = "Apply tile";
  rightSection.appendChild(btnApply);

  btnApply.addEventListener("click", () => {
    const mode = modeSel.value;
    const check = actions.tileCheck(mode);

    if (!check.ok) {
      UI.statusRight(check.message || "Tile check failed.", { ttlMs: 2000 });
      return;
    }

    if (!check.needsConfirm) {
      actions.tileApply(mode, "partial");
      return;
    }

    const m = makeModal();
    m.msg.textContent = check.message;
    document.body.appendChild(m.backdrop);

    const close = () => m.backdrop.remove();

    m.btnCancel.addEventListener("click", () => close());
    m.btnTrunc.addEventListener("click", () => {
      close();
      actions.tileApply(mode, "truncate");
    });
    m.btnContinue.addEventListener("click", () => {
      close();
      actions.tileApply(mode, "partial");
    });
  });

  // Notes (row numbers bottom-up)
  const notesTitle = document.createElement("div");
  notesTitle.className = "panel-title";
  notesTitle.setAttribute("data-i18n", "workspace.notes.title");
  notesTitle.textContent = "workspace.notes.title";

  const rowPicker = document.createElement("select");
  rowPicker.className = "ws-row-picker";

  for (let displayRow = 1; displayRow <= rows; displayRow++) {
    const opt = document.createElement("option");
    opt.value = String(displayRow);
    opt.textContent = `Row ${displayRow}`;
    rowPicker.appendChild(opt);
  }

  rowPicker.value = String(toDisplayRow(state.workspace.selectedRow, rows));

  rowPicker.addEventListener("change", () => {
    const displayRow = Number(rowPicker.value);
    const internalRow = toInternalRow(displayRow, rows);
    actions.setSelectedRow(internalRow);
  });

  const area = document.createElement("textarea");
  area.className = "ws-notes-area";
  area.value = state.workspace.rowNotes?.[String(state.workspace.selectedRow)] ?? "";

  area.addEventListener("input", () => {
    actions.setRowNote(state.workspace.selectedRow, area.value);
  });

  rightSection.appendChild(notesTitle);
  rightSection.appendChild(rowPicker);
  rightSection.appendChild(area);

  right.appendChild(rightSection);

  ws.appendChild(left);
  ws.appendChild(center);
  ws.appendChild(right);
  body.appendChild(ws);

  requestAnimationFrame(() => {
    wrap.focus();
    drawMinimap(canvas, { rows, cols, mask, cursor: state.workspace.cursor });
    fitWorkspaceCellSize(wrap, rows, cols);
    positionSelectionOverlay(state.workspace.selection.rect);
  });

  const offPaint = UI.on("workspace:paint", ({ r, c, value }) => {
    const cell = cellByKey.get(`${r},${c}`);
    if (!cell) return;
    if (!mask[r]?.[c]) return;

    const v = Number(value) || 0;
    cell.textContent = v === 0 ? "" : String(v);
  });

  const offBulkPaint = UI.on("workspace:bulkPaint", ({ changes }) => {
    if (!Array.isArray(changes)) return;
    for (const ch of changes) {
      const r = ch?.r;
      const c = ch?.c;
      const value = ch?.value;
      if (!Number.isFinite(r) || !Number.isFinite(c)) continue;

      const cell = cellByKey.get(`${r},${c}`);
      if (!cell) continue;
      if (!mask[r]?.[c]) continue;

      const v = Number(value) || 0;
      cell.textContent = v === 0 ? "" : String(v);
    }
  });

  const offTileSrc = UI.on("workspace:tileSrcConfig", (cfg) => {
    if (!cfg || typeof cfg !== "object") return;
    chkOverwrite.checked = !!cfg.overwriteBlanks;
  });

  const offTileApply = UI.on("workspace:tileApplyConfig", (cfg) => {
    if (!cfg || typeof cfg !== "object") return;
    modeSel.value = cfg.mode ?? modeSel.value;
    syncDestUI(modeSel.value, cfg.destRect ?? null);
  });

  const offCursor = UI.on("workspace:cursor", ({ r, c, selectedRow }) => {
    const nextKey = `${r},${c}`;

    const prevEl = cellByKey.get(cursorKey);
    if (prevEl) prevEl.classList.remove("cursor");

    const nextEl = cellByKey.get(nextKey);
    if (nextEl) nextEl.classList.add("cursor");

    cursorKey = nextKey;

    drawMinimap(canvas, { rows, cols, mask, cursor: { r, c } });

    if (typeof selectedRow === "number") {
      rowPicker.value = String(toDisplayRow(selectedRow, rows));
      if (document.activeElement !== area) {
        area.value = state.workspace.rowNotes?.[String(selectedRow)] ?? "";
      }
    }
  });

  const offSelection = UI.on("workspace:selection", ({ active, rect, role }) => {
    syncRoleButtons(role || "source");
    if (!active || !rect) {
      selOverlay.hidden = true;
      return;
    }
    positionSelectionOverlay(rect);
  });

  let ro = null;
  try {
    ro = new ResizeObserver(() => {
      fitWorkspaceCellSize(wrap, rows, cols);
      if (state.workspace.selection?.active && state.workspace.selection?.rect) {
        positionSelectionOverlay(state.workspace.selection.rect);
      }
    });
    ro.observe(wrap);
  } catch {
    // ignore
  }

  cleanup = () => {
    offPaint?.();
    offBulkPaint?.();
    offTileSrc?.();
    offTileApply?.();
    offCursor?.();
    offSelection?.();
    ro?.disconnect?.();
  };

  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";
  actionsEl.appendChild(
    mkButton({
      key: "workspace.startOver",
      className: "btn btn-danger",
      onClick: actions.startOver,
    })
  );

  return renderCard({
    titleKey: "workspace.cardTitle",
    subtitleKey: "workspace.subtitle",
    bodyEl: body,
    actionsEl,
  });
}