// /import/rectify.js
import { loadOpenCv } from "../common/opencvLoader.js";

export const RECT_W_PX = 800;
export const RECT_H_PX = 1000;

const OPENCV_WORKER_URL = new URL("../common/vendor/opencv.js", import.meta.url).href;

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("import.image.loadFailed"));
    im.src = dataUrl;
  });
}

export async function makeDownscaledCanvas(dataUrl, maxDim) {
  const img = await loadImage(dataUrl);
  const ow = img.naturalWidth || img.width;
  const oh = img.naturalHeight || img.height;

  const scale = Math.min(1, maxDim / Math.max(ow, oh));
  const dw = Math.max(1, Math.round(ow * scale));
  const dh = Math.max(1, Math.round(oh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, dw, dh);

  return { canvas, scale };
}

function dataUrlFromImageData(outW, outH, outBuffer) {
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW;
  outCanvas.height = outH;

  const ctx = outCanvas.getContext("2d");
  const u8 = new Uint8ClampedArray(outBuffer);
  const imageData = new ImageData(u8, outW, outH);
  ctx.putImageData(imageData, 0, 0);

  return outCanvas.toDataURL("image/png");
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = pts[i], q = pts[(i + 1) % 4];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Robust ordering: angle sort around centroid, rotate to TL-first, enforce winding.
function orderCorners(pts) {
  const c = pts.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
  c.x /= 4; c.y /= 4;

  const s = pts
    .map((p) => ({ p, a: Math.atan2(p.y - c.y, p.x - c.x) }))
    .sort((u, v) => u.a - v.a)
    .map((u) => u.p);

  // rotate so first is TL (min x+y)
  let k = 0, best = Infinity;
  for (let i = 0; i < 4; i++) {
    const v = s[i].x + s[i].y;
    if (v < best) { best = v; k = i; }
  }
  const r = [...s.slice(k), ...s.slice(0, k)];

  // consistent winding
  if (signedArea(r) < 0) r.reverse();

  // after reverse, rotate again to keep TL first
  let k2 = 0, best2 = Infinity;
  for (let i = 0; i < 4; i++) {
    const v = r[i].x + r[i].y;
    if (v < best2) { best2 = v; k2 = i; }
  }
  return [...r.slice(k2), ...r.slice(0, k2)];
}

function cornersLookLikeDownscaled(corners, dw, dh) {
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const slack = 2;

  return (
    minX >= -slack &&
    minY >= -slack &&
    maxX <= dw - 1 + slack &&
    maxY <= dh - 1 + slack
  );
}

async function rectifyWithWorker({ imageDataUrl, corners, maxDim }) {
  const { canvas: srcCanvas, scale } = await makeDownscaledCanvas(imageDataUrl, maxDim);

  const ctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  const ordered = orderCorners(corners);

  // If corners are already in the downscaled coordinate system, do not scale again.
  // Otherwise, corners are in original-image coords -> scale into downscaled canvas.
  const alreadyDownscaled = cornersLookLikeDownscaled(ordered, srcCanvas.width, srcCanvas.height);

  const scaledCorners = alreadyDownscaled
    ? ordered.map((p) => ({ x: p.x, y: p.y }))
    : ordered.map((p) => ({ x: p.x * scale, y: p.y * scale }));

    console.log("OPENCV_WORKER_URL", OPENCV_WORKER_URL);

  const workerUrl = new URL("./rectifyWorker.js", import.meta.url);
  const worker = new Worker(workerUrl);

  const result = await new Promise((resolve) => {
    const cleanup = () => { try { worker.terminate(); } catch {} };

    worker.onmessage = (e) => { cleanup(); resolve(e.data); };
    worker.onerror = () => { cleanup(); resolve({ ok: false, error: "import.worker.error" }); };

    worker.postMessage(
      {
        opencvUrl: OPENCV_WORKER_URL,
        width: srcCanvas.width,
        height: srcCanvas.height,
        imageBuffer: imgData.data.buffer,
        corners: scaledCorners,
        outW: RECT_W_PX,
        outH: RECT_H_PX,
      },
      [imgData.data.buffer]
    );
  });

  if (!result || !result.ok) {
    throw new Error(result?.error || "import.worker.failed");
  }

  return dataUrlFromImageData(result.outW, result.outH, result.outBuffer);
}

async function rectifyWithMainThreadOpenCv({ imageDataUrl, corners, maxDim }) {
  await new Promise((r) => setTimeout(r, 0));

  const cv = await loadOpenCv();
  const { canvas: srcCanvas, scale } = await makeDownscaledCanvas(imageDataUrl, maxDim);

  const ordered = orderCorners(corners);
  const alreadyDownscaled = cornersLookLikeDownscaled(ordered, srcCanvas.width, srcCanvas.height);

  const scaled = alreadyDownscaled
    ? ordered.map((p) => ({ x: p.x, y: p.y }))
    : ordered.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  const src = cv.imread(srcCanvas);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    scaled[0].x, scaled[0].y,
    scaled[1].x, scaled[1].y,
    scaled[2].x, scaled[2].y,
    scaled[3].x, scaled[3].y,
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    RECT_W_PX - 1, 0,
    RECT_W_PX - 1, RECT_H_PX - 1,
    0, RECT_H_PX - 1,
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();

  cv.warpPerspective(
    src,
    dst,
    M,
    new cv.Size(RECT_W_PX, RECT_H_PX),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  const outCanvas = document.createElement("canvas");
  outCanvas.width = RECT_W_PX;
  outCanvas.height = RECT_H_PX;
  cv.imshow(outCanvas, dst);

  const dataUrl = outCanvas.toDataURL("image/png");

  src.delete();
  srcTri.delete();
  dstTri.delete();
  M.delete();
  dst.delete();

  return dataUrl;
}

export async function rectifyFromCorners({ imageDataUrl, corners }) {
  const maxDim = 900;

  if (typeof Worker !== "undefined") {
    try {
      return await rectifyWithWorker({ imageDataUrl, corners, maxDim });
    } catch {
      // fallback below
    }
  }

  return await rectifyWithMainThreadOpenCv({ imageDataUrl, corners, maxDim });
}
