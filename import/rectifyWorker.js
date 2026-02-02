// /import/rectifyWorker.js
// Classic worker (not module) so we can use importScripts for opencv.js.

let cvReadyPromise = null;

function ensureCv(opencvUrl) {
  if (cvReadyPromise) return cvReadyPromise;

  cvReadyPromise = new Promise((resolve, reject) => {
    try {
      self.importScripts(opencvUrl);
    } catch (e) {
      reject(new Error("import.worker.opencvLoadFailed"));
      return;
    }

    // opencv.js sets global `cv` and calls `cv.onRuntimeInitialized`
    if (!self.cv) {
      reject(new Error("import.worker.cvMissing"));
      return;
    }

    self.cv.onRuntimeInitialized = () => resolve(self.cv);

    // Safety: if initialization never happens
    setTimeout(() => {
      // If already resolved, this does nothing.
      // If not resolved by now, treat as failure.
      // (Keeps worker from "hanging forever")
      // eslint-disable-next-line no-undef
      if (cvReadyPromise && self.cv && !self.cv.__runtimeReadyFlag) {
        // We'll set a flag once resolved below
      }
    }, 15000);
  }).then((cv) => {
    // mark ready
    cv.__runtimeReadyFlag = true;
    return cv;
  });

  return cvReadyPromise;
}

self.onmessage = async (e) => {
  const msg = e.data;
  const { opencvUrl, width, height, imageBuffer, corners, outW, outH } = msg;

  try {
    const cv = await ensureCv(opencvUrl);

    // Reconstruct ImageData from transferred buffer
    const u8 = new Uint8ClampedArray(imageBuffer);
    const imageData = new ImageData(u8, width, height);

    const src = cv.matFromImageData(imageData);

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y,
    ]);

    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outW - 1, 0,
      outW - 1, outH - 1,
      0, outH - 1,
    ]);

    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();

    cv.warpPerspective(
      src,
      dst,
      M,
      new cv.Size(outW, outH),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar()
    );

    // dst is RGBA
    const out = new Uint8ClampedArray(dst.data);

    // Cleanup
    src.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();
    dst.delete();

    // Transfer buffer back
    self.postMessage(
      { ok: true, outW, outH, outBuffer: out.buffer },
      [out.buffer]
    );
  } catch (err) {
    self.postMessage({
      ok: false,
      error: (err && err.message) ? String(err.message) : "import.worker.unknownError",
    });
  }
};
