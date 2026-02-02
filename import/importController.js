// /import/importController.js
// All import-specific actions in one place.
// It mutates state.import and calls scheduleRender.

import { clampInt } from "../common/input.js";
import { detectMarkersFastJS } from "./markerDetect.js";
import { rectifyFromCorners, RECT_W_PX, RECT_H_PX } from "./rectify.js";

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("import.image.loadFailed"));
    im.src = dataUrl;
  });
}

export function resetImportState(state, keepImage = false) {
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

    gridColsFromGauge: state.import?.gridColsFromGauge || 0,
    gridRowsFromGauge: state.import?.gridRowsFromGauge || 0,

    isBusy: false,
  };
}

export async function setImage({ state, UI, file, scheduleRender, computeGridFromGauge }) {
  if (!file) return;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("import.image.readFailed"));
    reader.readAsDataURL(file);
  });

  const img = await loadImage(dataUrl);

  resetImportState(state, false);
  state.import.imageDataUrl = dataUrl;
  state.import.imageWidth = img.naturalWidth || img.width;
  state.import.imageHeight = img.naturalHeight || img.height;

  if (computeGridFromGauge) {
    const g = computeGridFromGauge();
    state.import.gridColsFromGauge = g.cols;
    state.import.gridRowsFromGauge = g.rows;
  }

  UI.statusRight("import.status.imageLoaded", { ttlMs: 1400 });
  scheduleRender();
}

export function setCorners({ state, corners, source = "manual", scheduleRender }) {
  if (!Array.isArray(corners) || corners.length !== 4) return;
  state.import.corners = corners.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  state.import.cornersSource = source;
  scheduleRender();
}

export async function autoDetect({ state, UI, scheduleRender }) {
  if (!state.import.imageDataUrl) return;
  if (state.import.isBusy) return;

  state.import.isBusy = true;
  scheduleRender();

  try {
    UI.statusRight("import.status.detecting", { ttlMs: 2000 });

    const corners = await detectMarkersFastJS(state.import.imageDataUrl);

    state.import.corners = corners;
    state.import.cornersSource = "auto";
    state.import.lastDetectErrorKey = null;

    UI.statusRight("import.status.detectSuccess", { ttlMs: 1400 });
    scheduleRender();
  } catch (err) {
    const key =
      err && err.message && String(err.message).startsWith("import.")
        ? String(err.message)
        : "import.detect.failed";

    state.import.lastDetectErrorKey = key;
    state.import.corners = null;
    state.import.cornersSource = "none";
    state.import.rectifiedDataUrl = null;

    UI.statusRight(key, { ttlMs: 2600 });
    scheduleRender();
  } finally {
    state.import.isBusy = false;
    scheduleRender();
  }
}

export async function rectifyManual({ state, UI, scheduleRender }) {
  if (!state.import.imageDataUrl) return;
  if (state.import.isBusy) return;

  if (!state.import.corners || state.import.corners.length !== 4) {
    UI.statusRight("import.manual.needCorners", { ttlMs: 2200 });
    return;
  }

  state.import.isBusy = true;
  scheduleRender();

  try {
    UI.statusRight("import.status.rectifying", { ttlMs: 2000 });

    const rectified = await rectifyFromCorners({
      imageDataUrl: state.import.imageDataUrl,
      corners: state.import.corners,
    });

    state.import.rectifiedDataUrl = rectified;

    UI.statusRight("import.status.rectified", { ttlMs: 1400 });
    scheduleRender();
  } catch {
    UI.statusRight("import.rectify.failed", { ttlMs: 2200 });
  } finally {
    state.import.isBusy = false;
    scheduleRender();
  }
}

export function openGridEditor({ state, UI, scheduleRender, setStep, Steps, cols, rows }) {
  const r = clampInt(rows, 1, 300);
  const c = clampInt(cols, 1, 300);

  // This doesn’t own shape state, it just triggers the next step.
  // content.js still decides what to do with these values.
  UI.statusRight("import.status.gridReady", { ttlMs: 1600 });
  scheduleRender();
  setStep(Steps.SHAPE);

  return { cols: c, rows: r };
}
