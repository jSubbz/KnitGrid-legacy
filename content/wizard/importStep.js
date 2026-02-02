// /content/wizard/importStep.js
import { UI } from "../../shell/uiBus.js";
import { mkButton } from "../../common/domUI.js";
import { clampInt } from "../../common/input.js";

let importAbort = null;

export function renderImportStep({ state, actions }) {
  if (importAbort) importAbort.abort();
  importAbort = new AbortController();

  const body = document.createElement("div");

  // --- Upload row
  const fileRow = document.createElement("div");
  fileRow.className = "row";

  const left = document.createElement("div");
  left.className = "field";

  const label = document.createElement("div");
  label.className = "label";
  label.setAttribute("data-i18n", "import.pickImage");
  label.textContent = "import.pickImage";

  const fileInput = document.createElement("input");
  fileInput.className = "input";
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.addEventListener(
    "change",
    async () => {
      const file = fileInput.files && fileInput.files[0];
      await actions.importSetImage(file);
    },
    { signal: importAbort.signal }
  );

  left.appendChild(label);
  left.appendChild(fileInput);

  const right = document.createElement("div");
  right.className = "field";

  const hint = document.createElement("div");
  hint.className = "label";
  hint.setAttribute("data-i18n", "import.hint");
  hint.textContent = "import.hint";

  right.appendChild(hint);

  fileRow.appendChild(left);
  fileRow.appendChild(right);
  body.appendChild(fileRow);

  // --- Preview canvas + overlay handles
  const previewWrap = document.createElement("div");
  previewWrap.className = "import-wrap";

  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "import-canvas";
  previewCanvas.width = 900;
  previewCanvas.height = 600;

  const overlay = document.createElement("div");
  overlay.className = "import-overlay";

  previewWrap.appendChild(previewCanvas);
  previewWrap.appendChild(overlay);
  body.appendChild(previewWrap);

  // --- Controls
  const controls = document.createElement("div");
  controls.className = "shape-toolbar";

  const detectBtn = mkButton({
    key: "import.autoDetect",
    className: "btn",
    disabled: !!state.import.isBusy,
    onClick: async () => {
      await actions.importAutoDetect();
    },
  });

  const rectifyBtn = mkButton({
    key: "import.rectifyManual",
    className: "btn btn-primary",
    disabled: !!state.import.isBusy,
    onClick: async () => {
      await actions.importRectifyManual();
    },
  });

  controls.appendChild(detectBtn);
  controls.appendChild(rectifyBtn);
  body.appendChild(controls);

  // --- Draw image if present
  const ctx = previewCanvas.getContext("2d");

  if (state.import.imageDataUrl) {
    const img = new Image();
    img.src = state.import.imageDataUrl;

    img.onload = () => {
      const cw = previewCanvas.width;
      const ch = previewCanvas.height;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;

      const scale = Math.min(cw / iw, ch / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (cw - dw) / 2;
      const dy = (ch - dh) / 2;

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, dx, dy, dw, dh);

      const toImageSpace = (clientX, clientY) => {
        const rect = previewCanvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const x = (px - dx) / scale;
        const y = (py - dy) / scale;
        return {
          x: Math.max(0, Math.min(iw, x)),
          y: Math.max(0, Math.min(ih, y)),
        };
      };

      const toCanvasSpace = (ix, iy) => ({ x: dx + ix * scale, y: dy + iy * scale });

      overlay.innerHTML = "";

      const corners = state.import.corners;
      const hasCorners = Array.isArray(corners) && corners.length === 4;

      // --- If no corners yet: click 4 points in order (TL,TR,BR,BL)
      if (!hasCorners) {
        const picked = [];

        const drawTemp = () => {
          overlay.innerHTML = "";
          picked.forEach((p, i) => {
            const h = document.createElement("div");
            h.className = "corner-handle";
            h.setAttribute("data-i", String(i));
            const pos = toCanvasSpace(p.x, p.y);
            h.style.left = `${pos.x}px`;
            h.style.top = `${pos.y}px`;
            overlay.appendChild(h);
          });
        };

        overlay.addEventListener(
          "click",
          (e) => {
            if (picked.length >= 4) return;
            picked.push(toImageSpace(e.clientX, e.clientY));
            UI.statusRight("import.status.cornerAdded", { ttlMs: 900 });
            drawTemp();
            if (picked.length === 4) {
              actions.importSetCorners(picked, "manual");
              UI.statusRight("import.status.cornersSet", { ttlMs: 1400 });
            }
          },
          { signal: importAbort.signal }
        );

        return;
      }

      // --- If corners exist: draggable handles
      const local = corners.map((p) => ({ x: p.x, y: p.y }));
      const handles = local.map((p, i) => {
        const h = document.createElement("div");
        h.className = "corner-handle";
        h.setAttribute("data-i", String(i));
        const pos = toCanvasSpace(p.x, p.y);
        h.style.left = `${pos.x}px`;
        h.style.top = `${pos.y}px`;
        overlay.appendChild(h);
        return h;
      });

      let draggingIndex = null;

      const startDrag = (e) => {
        if (state.import.isBusy) return;
        const h = e.target.closest(".corner-handle");
        if (!h) return;
        e.preventDefault();
        draggingIndex = Number(h.getAttribute("data-i"));
        try {
          h.setPointerCapture(e.pointerId);
        } catch {}
      };

      const moveDrag = (e) => {
        if (draggingIndex === null) return;
        const pt = toImageSpace(e.clientX, e.clientY);
        local[draggingIndex] = pt;
        const pos = toCanvasSpace(pt.x, pt.y);
        handles[draggingIndex].style.left = `${pos.x}px`;
        handles[draggingIndex].style.top = `${pos.y}px`;
      };

      const endDrag = () => {
        if (draggingIndex === null) return;
        draggingIndex = null;
        actions.importSetCorners(local, "manual");
      };

      overlay.addEventListener("pointerdown", startDrag, { signal: importAbort.signal });
      overlay.addEventListener("pointermove", moveDrag, { signal: importAbort.signal });
      overlay.addEventListener("pointerup", endDrag, { signal: importAbort.signal });
      overlay.addEventListener("pointercancel", endDrag, { signal: importAbort.signal });
    };
  } else {
    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }

  // --- Rectified preview and grid overlay (shown after rectification succeeds)
  if (state.import.rectifiedDataUrl) {
    const divider = document.createElement("div");
    divider.style.height = "10px";
    body.appendChild(divider);

    const rectInfo = document.createElement("div");
    rectInfo.className = "shape-info";

    const lbl = document.createElement("span");
    lbl.setAttribute("data-i18n", "import.gridFromGauge");
    lbl.textContent = "import.gridFromGauge";

    const colsInput = document.createElement("input");
    colsInput.className = "input";
    colsInput.type = "number";
    colsInput.min = "1";
    colsInput.max = "300";
    colsInput.step = "1";
    colsInput.value = String(state.import.gridColsFromGauge || 1);

    const times = document.createElement("span");
    times.className = "times";
    times.textContent = "×";

    const rowsInput = document.createElement("input");
    rowsInput.className = "input";
    rowsInput.type = "number";
    rowsInput.min = "1";
    rowsInput.max = "300";
    rowsInput.step = "1";
    rowsInput.value = String(state.import.gridRowsFromGauge || 1);

    rectInfo.appendChild(lbl);
    rectInfo.appendChild(colsInput);
    rectInfo.appendChild(times);
    rectInfo.appendChild(rowsInput);

    body.appendChild(rectInfo);

    const btnRow = document.createElement("div");
    btnRow.className = "shape-toolbar";

    const openEditorBtn = mkButton({
      key: "import.openGridEditor",
      className: "btn btn-primary",
      onClick: () => {
        const cols = clampInt(Number(colsInput.value), 1, 300);
        const rows = clampInt(Number(rowsInput.value), 1, 300);
        actions.importOpenGridEditor(cols, rows);
      },
    });

    const nextStubBtn = mkButton({
      key: "import.nextStub",
      className: "btn",
      onClick: actions.importNextStub,
    });

    btnRow.appendChild(openEditorBtn);
    btnRow.appendChild(nextStubBtn);

    body.appendChild(btnRow);

    const rectWrap = document.createElement("div");
    rectWrap.className = "import-rect-wrap";

    const rectCanvas = document.createElement("canvas");
    rectCanvas.className = "import-rect-canvas";
    rectCanvas.width = state.import.rectifiedWidth;
    rectCanvas.height = state.import.rectifiedHeight;
    rectWrap.appendChild(rectCanvas);

    body.appendChild(rectWrap);

    const rctx = rectCanvas.getContext("2d");
    const rim = new Image();
    rim.src = state.import.rectifiedDataUrl;

    const redraw = () => {
      const cols = clampInt(Number(colsInput.value), 1, 300);
      const rows = clampInt(Number(rowsInput.value), 1, 300);

      rctx.clearRect(0, 0, rectCanvas.width, rectCanvas.height);
      rctx.drawImage(rim, 0, 0);

      rctx.save();
      rctx.globalAlpha = 0.35;
      rctx.lineWidth = 1;
      rctx.strokeStyle = "rgba(255,255,255,0.35)";

      const cellW = rectCanvas.width / cols;
      const cellH = rectCanvas.height / rows;

      for (let c = 1; c < cols; c++) {
        const x = Math.round(c * cellW) + 0.5;
        rctx.beginPath();
        rctx.moveTo(x, 0);
        rctx.lineTo(x, rectCanvas.height);
        rctx.stroke();
      }
      for (let r = 1; r < rows; r++) {
        const y = Math.round(r * cellH) + 0.5;
        rctx.beginPath();
        rctx.moveTo(0, y);
        rctx.lineTo(rectCanvas.width, y);
        rctx.stroke();
      }

      rctx.restore();
    };

    rim.onload = redraw;
    colsInput.addEventListener("change", redraw, { signal: importAbort.signal });
    rowsInput.addEventListener("change", redraw, { signal: importAbort.signal });
  }

  // --- Bottom buttons: Back + Confirm (Confirm = rectify)
  const actionsEl = document.createElement("div");
  actionsEl.className = "actions";

  actionsEl.appendChild(
    mkButton({
      key: "nav.back",
      className: "btn",
      onClick: actions.goToMode,
    })
  );

  actionsEl.appendChild(
    mkButton({
      key: "import.confirm",
      className: "btn btn-primary",
      disabled: !!state.import.isBusy,
      onClick: async () => {
        await actions.importRectifyManual();
      },
    })
  );

  return { body, actionsEl };
}
