// /import/rectify.js
import { loadOpenCv } from "../common/opencvLoader.js";

// Rectified output size (8x10 inches @ 100 px/in)
export const RECT_W_PX = 800;
export const RECT_H_PX = 1000;

// Your opencv.js lives at: /common/vendor/opencv.js (per your folder screenshot)
// Use an absolute URL so worker importScripts can always find it reliably.
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

async function rectifyWithWorker({ imageDataUrl, corners, maxDim }) {
  // Downscale on main thread first (fast), then send pixels to worker.
  const { canvas: srcCanvas, scale } = await makeDownscaledCanvas(imageDataUrl, maxDim);

  const ctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);

  // Scale corners into downscaled space
  const scaledCorners = corners.map((p) => ({ x: p.x * scale, y: p.y * scale }));

  // Worker file is /import/rectifyWorker.js relative to this module
  const workerUrl = new URL("./rectifyWorker.js", import.meta.url);
  const worker = new Worker(workerUrl); // classic worker by default

  const result = await new Promise((resolve) => {
    const cleanup = () => {
      try { worker.terminate(); } catch {}
    };

    worker.onmessage = (e) => {
      cleanup();
      resolve(e.data);
    };

    worker.onerror = () => {
      cleanup();
      resolve({ ok: false, error: "import.worker.error" });
    };

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
  // Fallback: main thread OpenCV (may freeze, but should rarely be used)
  await new Promise((r) => setTimeout(r, 0));

  const cv = await loadOpenCv();
  const { canvas: srcCanvas, scale } = await makeDownscaledCanvas(imageDataUrl, maxDim);

  const scaled = corners.map((p) => ({ x: p.x * scale, y: p.y * scale }));

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

  // Try worker first (keeps UI responsive)
  if (typeof Worker !== "undefined") {
    try {
      return await rectifyWithWorker({ imageDataUrl, corners, maxDim });
    } catch {
      // fallback below
    }
  }

  return await rectifyWithMainThreadOpenCv({ imageDataUrl, corners, maxDim });
}
