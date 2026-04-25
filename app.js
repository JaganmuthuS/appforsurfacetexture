const imageInput = document.getElementById('imageInput');
const runButton = document.getElementById('runButton');
const statusText = document.getElementById('statusText');
const lxInput = document.getElementById('lxInput');
const lyInput = document.getElementById('lyInput');
const lambdaInput = document.getElementById('lambdaInput');
const resultSelector = document.getElementById('resultSelector');
const resultsBody = document.querySelector('#resultsTable tbody');

const inputCanvas = document.getElementById('inputCanvas');
const curveCanvas = document.getElementById('curveCanvas');
const zCanvas = document.getElementById('zCanvas');
const zwCanvas = document.getElementById('zwCanvas');
const zrCanvas = document.getElementById('zrCanvas');

let imageMatrix = null;
let imageDims = null;
let analysisResults = [];

imageInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const bitmap = await createImageBitmap(file);
  const [gray, width, height] = imageToGrayMatrix(bitmap);
  imageMatrix = gray;
  imageDims = { width, height };

  drawMatrixToCanvas(gray, width, height, inputCanvas);
  statusText.textContent = `Loaded image: ${file.name} (${width}x${height}).`;
});

runButton.addEventListener('click', () => {
  if (!imageMatrix || !imageDims) {
    statusText.textContent = 'Please upload an image first.';
    return;
  }

  try {
    statusText.textContent = 'Running analysis...';
    const Lx = Number(lxInput.value) || 100;
    const Ly = Number(lyInput.value) || 100;
    const wavelengths = parseWavelengths(lambdaInput.value);

    analysisResults = runSurfaceAnalysis(imageMatrix, imageDims.height, imageDims.width, Lx, Ly, wavelengths);
    populateSelector(analysisResults);
    renderSelectedResult();
    statusText.textContent = `Done. Computed ${analysisResults.length} wavelength result(s).`;
  } catch (error) {
    console.error(error);
    statusText.textContent = `Error: ${error.message}`;
  }
});

resultSelector.addEventListener('change', renderSelectedResult);

function populateSelector(results) {
  resultSelector.innerHTML = '';
  for (const [index, result] of results.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${result.lambda} mm`;
    resultSelector.appendChild(option);
  }
}

function renderSelectedResult() {
  if (!analysisResults.length) return;
  const index = Number(resultSelector.value || 0);
  const result = analysisResults[index];

  const rows = [
    ['Lambda (mm)', result.lambda],
    ['Sa', result.Sa],
    ['Sq', result.Sq],
    ['Ssk', result.Ssk],
    ['Sku', result.Sku],
    ['Sk', result.Sk],
    ['Smr1', result.Smr1],
    ['Smr2', result.Smr2],
    ['Sak1', result.Sak1],
    ['Sak2', result.Sak2],
    ['Spk', result.Spk],
    ['Svk', result.Svk],
  ];

  resultsBody.innerHTML = rows
    .map(([key, value]) => `<tr><td>${key}</td><td>${formatNumber(value)}</td></tr>`)
    .join('');

  drawAbbottCurve(curveCanvas, result);
  drawMatrixToCanvas(result.Z, result.nc, result.nr, zCanvas);
  drawMatrixToCanvas(result.Zw, result.nc, result.nr, zwCanvas);
  drawMatrixToCanvas(result.Zr, result.nc, result.nr, zrCanvas);
}

function runSurfaceAnalysis(Z0raw, nr, nc, Lx, Ly, wavelengths) {
  const centered = cloneMatrix(Z0raw);
  const mean = matrixMean(centered);
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) centered[r][c] -= mean;
  }

  const Z = cloneMatrix(centered);

  for (let col = 0; col < nc; col++) {
    const y = new Array(nr);
    for (let r = 0; r < nr; r++) y[r] = Z[r][col];
    const { slope, intercept } = linearFitIndex(y);
    for (let r = 0; r < nr; r++) Z[r][col] -= slope * (r + 1) + intercept;
  }

  for (let row = 0; row < nr; row++) {
    const y = Z[row];
    const { slope, intercept } = linearFitIndex(y);
    for (let c = 0; c < nc; c++) Z[row][c] -= slope * (c + 1) + intercept;
  }

  const dx = Lx / nc;
  const dy = Ly / nr;

  const results = [];
  for (const lambda of wavelengths) {
    const sigmaX = (lambda / dx) / (2 * Math.sqrt(2 * Math.log(2)));
    const sigmaY = (lambda / dy) / (2 * Math.sqrt(2 * Math.log(2)));
    const Zw = gaussianBlurSeparable(Z, sigmaY, sigmaX);
    const Zr = subtractMatrices(Z, Zw);

    const fdropX = Math.round(0.02 * nc);
    const fdropY = Math.round(0.02 * nr);
    const Zc = cropMatrix(Zr, fdropY, fdropX);

    const flat = flatten(Zc).sort((a, b) => b - a);
    const xMr = linspace(0, 100, flat.length);
    const yMr = flat;

    const store = [];
    for (let xi = 0; xi <= 40; xi++) {
      const yi = xi + 40;
      const i1 = nearestIndex(xMr, xi);
      const i2 = nearestIndex(xMr, yi);
      const y1 = yMr[i1];
      const y2 = yMr[i2];
      const slope = (y1 - y2) / (yi - xi);
      store.push({ xi, yi, y1, y2, slope });
    }

    const best = store.reduce((min, row) => (row.slope < min.slope ? row : min), store[0]);
    const x1 = best.xi;
    const x2 = best.yi;
    const minSlope = best.slope;

    const cLine = best.y1 + minSlope * x1;
    const Z0 = cLine;
    const Z100 = -minSlope * 100 + cLine;
    const Sk = Z0 - Z100;

    const i0 = nearestIndex(yMr, Z0);
    const i100 = nearestIndex(yMr, Z100);
    const Smr1 = xMr[i0];
    const Smr2 = xMr[i100];

    const Sa = meanAbs(Zc);
    const Sq = Math.sqrt(meanPow(Zc, 2));
    const Ssk = meanPow(Zc, 3) / (Math.pow(Sq, 3) + Number.EPSILON);
    const Sku = meanPow(Zc, 4) / (Math.pow(Sq, 4) + Number.EPSILON);

    const xd = linspace(0, 100, 2000);
    const yd = interpLinear(xMr, yMr, xd);
    const ys = xd.map((x) => -minSlope * x + cLine);

    const mask1 = xd.map((x) => x <= x1);
    const diff1 = yd.map((v, i) => (mask1[i] ? Math.max(0, v - ys[i]) : 0));
    const Sak1 = trapzMasked(xd, diff1, mask1);

    const mask2 = xd.map((x) => x >= x2);
    const diff2 = yd.map((v, i) => (mask2[i] ? Math.max(0, ys[i] - v) : 0));
    const Sak2 = trapzMasked(xd, diff2, mask2);

    const h1 = Math.abs((2 * Sak1) / Math.max(Smr1, Number.EPSILON));
    const h2 = Math.abs((2 * Sak2) / Math.max(100 - Smr2, Number.EPSILON));

    results.push({
      lambda,
      nr,
      nc,
      Z,
      Zw,
      Zr,
      xMr,
      yMr,
      x1,
      x2,
      Z0,
      Z100,
      Smr1,
      Smr2,
      Sa,
      Sq,
      Ssk,
      Sku,
      Sk,
      Sak1,
      Sak2,
      Spk: Z0 + h1,
      Svk: Z100 - h2,
    });
  }

  return results;
}

function imageToGrayMatrix(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);

  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const matrix = Array.from({ length: height }, () => new Array(width).fill(0));

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const R = data[idx] / 255;
      const G = data[idx + 1] / 255;
      const B = data[idx + 2] / 255;
      matrix[r][c] = 0.2989 * R + 0.587 * G + 0.114 * B;
    }
  }

  return [matrix, width, height];
}

function drawMatrixToCanvas(matrix, width, height, canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const flat = flatten(matrix);
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const span = max - min || 1;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const idx = (r * width + c) * 4;
      const norm = (matrix[r][c] - min) / span;
      const value = Math.round(norm * 255);
      img.data[idx] = value;
      img.data[idx + 1] = value;
      img.data[idx + 2] = value;
      img.data[idx + 3] = 255;
    }
  }

  const tmp = document.createElement('canvas');
  tmp.width = width;
  tmp.height = height;
  tmp.getContext('2d').putImageData(img, 0, 0);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

function drawAbbottCurve(canvas, result) {
  const ctx = canvas.getContext('2d');
  const { xMr, yMr, Z0, Z100, Smr1, Smr2, Spk, Svk } = result;
  const w = canvas.width;
  const h = canvas.height;
  const pad = 30;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);

  const yMin = Math.min(...yMr, Z100, Svk);
  const yMax = Math.max(...yMr, Z0, Spk);
  const xMap = (x) => pad + (x / 100) * (w - 2 * pad);
  const yMap = (y) => h - pad - ((y - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);

  ctx.beginPath();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  for (let i = 0; i < xMr.length; i++) {
    const x = xMap(xMr[i]);
    const y = yMap(yMr[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  drawLine(ctx, xMap(0), yMap(Z0), xMap(100), yMap(Z100), '#ef4444', [6, 4]);
  drawLine(ctx, xMap(0), yMap(Z0), xMap(100), yMap(Z0), '#d946ef', [4, 4]);
  drawLine(ctx, xMap(0), yMap(Z100), xMap(100), yMap(Z100), '#06b6d4', [4, 4]);

  drawPoint(ctx, xMap(Smr1), yMap(Z0), '#22c55e');
  drawPoint(ctx, xMap(Smr2), yMap(Z100), '#22c55e');
  drawPoint(ctx, xMap(0), yMap(Spk), '#111827');
  drawPoint(ctx, xMap(100), yMap(Svk), '#111827');

  ctx.fillStyle = '#374151';
  ctx.font = '12px sans-serif';
  ctx.fillText('Material Ratio (%)', w / 2 - 45, h - 8);
}

function drawLine(ctx, x1, y1, x2, y2, color, dash = []) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function linearFitIndex(y) {
  const n = y.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = i + 1;
    sx += x;
    sy += y[i];
    sxx += x * x;
    sxy += x * y[i];
  }
  const den = n * sxx - sx * sx || Number.EPSILON;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function gaussianBlurSeparable(matrix, sigmaY, sigmaX) {
  const ky = gaussianKernel1D(Math.max(sigmaY, 0.1));
  const kx = gaussianKernel1D(Math.max(sigmaX, 0.1));
  const temp = convolveRows(matrix, kx);
  return convolveCols(temp, ky);
}

function gaussianKernel1D(sigma) {
  const radius = Math.max(1, Math.ceil(3 * sigma));
  const size = radius * 2 + 1;
  const kernel = new Array(size);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;
  return kernel;
}

function convolveRows(matrix, kernel) {
  const nr = matrix.length;
  const nc = matrix[0].length;
  const r = Math.floor(kernel.length / 2);
  const out = Array.from({ length: nr }, () => new Array(nc).fill(0));

  for (let y = 0; y < nr; y++) {
    for (let x = 0; x < nc; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const xx = clamp(x + k, 0, nc - 1);
        sum += matrix[y][xx] * kernel[k + r];
      }
      out[y][x] = sum;
    }
  }
  return out;
}

function convolveCols(matrix, kernel) {
  const nr = matrix.length;
  const nc = matrix[0].length;
  const r = Math.floor(kernel.length / 2);
  const out = Array.from({ length: nr }, () => new Array(nc).fill(0));

  for (let y = 0; y < nr; y++) {
    for (let x = 0; x < nc; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        const yy = clamp(y + k, 0, nr - 1);
        sum += matrix[yy][x] * kernel[k + r];
      }
      out[y][x] = sum;
    }
  }
  return out;
}

function cropMatrix(matrix, dropY, dropX) {
  const nr = matrix.length;
  const nc = matrix[0].length;
  const y1 = Math.max(0, dropY);
  const y2 = Math.max(y1 + 1, nr - dropY);
  const x1 = Math.max(0, dropX);
  const x2 = Math.max(x1 + 1, nc - dropX);

  const out = [];
  for (let r = y1; r < y2; r++) {
    out.push(matrix[r].slice(x1, x2));
  }
  return out;
}

function flatten(matrix) {
  return matrix.flat();
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function subtractMatrices(a, b) {
  const nr = a.length;
  const nc = a[0].length;
  const out = Array.from({ length: nr }, () => new Array(nc).fill(0));
  for (let r = 0; r < nr; r++) {
    for (let c = 0; c < nc; c++) {
      out[r][c] = a[r][c] - b[r][c];
    }
  }
  return out;
}

function linspace(start, end, count) {
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function nearestIndex(arr, value) {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

function interpLinear(x, y, xq) {
  const out = new Array(xq.length);
  for (let i = 0; i < xq.length; i++) {
    const q = xq[i];
    if (q <= x[0]) {
      out[i] = y[0];
      continue;
    }
    if (q >= x[x.length - 1]) {
      out[i] = y[y.length - 1];
      continue;
    }

    let hi = 1;
    while (x[hi] < q) hi++;
    const lo = hi - 1;
    const t = (q - x[lo]) / (x[hi] - x[lo] || Number.EPSILON);
    out[i] = y[lo] + t * (y[hi] - y[lo]);
  }
  return out;
}

function trapzMasked(x, y, mask) {
  let area = 0;
  for (let i = 1; i < x.length; i++) {
    if (!mask[i] && !mask[i - 1]) continue;
    area += ((y[i] + y[i - 1]) / 2) * (x[i] - x[i - 1]);
  }
  return area;
}

function matrixMean(matrix) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function meanAbs(matrix) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + Math.abs(v), 0) / arr.length;
}

function meanPow(matrix, p) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + Math.pow(v, p), 0) / arr.length;
}

function parseWavelengths(value) {
  const values = value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (!values.length) throw new Error('Please enter at least one valid positive wavelength.');
  return values;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return Math.abs(value) >= 1e4 || (Math.abs(value) < 1e-3 && value !== 0)
    ? value.toExponential(4)
    : value.toFixed(6);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
