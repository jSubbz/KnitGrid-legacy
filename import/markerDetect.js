// /import/markerDetect.js
// Fast JS detector for black square-ish corner markers.
// Returns corners in ORIGINAL image coords: [TL, TR, BR, BL]

async function loadImage(dataUrl) {
  return await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("import.image.loadFailed"));
    im.src = dataUrl;
  });
}

async function makeDownscaledCanvas(dataUrl, maxDim) {
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

  return { canvas, scale, ow, oh };
}

function orderCornersTLTRBRBL(points) {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.x - p.y);

  const tl = points[sums.indexOf(Math.min(...sums))];
  const br = points[sums.indexOf(Math.max(...sums))];

  // In image coords (y down): TR has max (x - y), BL has min (x - y)
  const tr = points[diffs.indexOf(Math.max(...diffs))];
  const bl = points[diffs.indexOf(Math.min(...diffs))];

  return [tl, tr, br, bl];
}


export async function detectMarkersFastJS(dataUrl) {
  // Run on a small canvas for speed
  const { canvas, scale } = await makeDownscaledCanvas(dataUrl, 700);
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, w, h).data;

  // Coarse sampling
  const step = 2;
  const gw = Math.floor(w / step);
  const gh = Math.floor(h / step);

  const dark = new Uint8Array(gw * gh);

  // Threshold: "dark"
  const TH = 95;

  for (let gy = 0; gy < gh; gy++) {
    const py = gy * step;
    for (let gx = 0; gx < gw; gx++) {
      const px = gx * step;
      const idx = (py * w + px) * 4;
      const r = img[idx];
      const g = img[idx + 1];
      const b = img[idx + 2];
      const lum = (r * 30 + g * 59 + b * 11) / 100;
      dark[gy * gw + gx] = lum < TH ? 1 : 0;
    }
  }

  // Connected components to find blobs
  const visited = new Uint8Array(gw * gh);
  const comps = [];
  const neighbors = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  for (let i = 0; i < dark.length; i++) {
    if (!dark[i] || visited[i]) continue;

    // Stack BFS (explicit, no recursion)
    let sp = 0;
    const stack = new Int32Array(250000);
    stack[sp++] = i;
    visited[i] = 1;

    let count = 0;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;

    while (sp > 0) {
      const cur = stack[--sp];
      const y = Math.floor(cur / gw);
      const x = cur - y * gw;

      count++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (!dark[ni] || visited[ni]) continue;
        visited[ni] = 1;
        if (sp < stack.length) stack[sp++] = ni;
      }

      // Safety break on absurdly large blobs (like table shadows)
      if (count > gw * gh * 0.25) break;
    }

    const bw = (maxX - minX + 1) * step;
    const bh = (maxY - minY + 1) * step;

    const areaPx = count * step * step;
    const imgArea = w * h;

    // Reject specks
    if (areaPx < imgArea * 0.0004) continue;
    // Reject huge blobs
    if (areaPx > imgArea * 0.15) continue;

    // Rough square-ish
    const aspect = bw / bh;
    if (aspect < 0.55 || aspect > 1.9) continue;

    const cx = (minX + maxX) / 2 * step;
    const cy = (minY + maxY) / 2 * step;

    comps.push({ areaPx, cx, cy });
  }

  if (comps.length < 4) throw new Error("import.detect.tooFew");

  // Choose 4 biggest
  comps.sort((a, b) => b.areaPx - a.areaPx);
  const best4 = comps.slice(0, 4).map((c) => ({ x: c.cx / scale, y: c.cy / scale }));
  return orderCornersTLTRBRBL(best4);
}
