/**
 * Matrix and array operations for surface texture analysis
 * Handles 2D matrix manipulations used in surface computations
 */

/**
 * Creates a clone of a matrix (deep copy)
 * @param {number[][]} matrix - 2D array to clone
 * @returns {number[][]} Cloned matrix
 */
export function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

/**
 * Flattens a 2D matrix into 1D array
 * @param {number[][]} matrix - 2D array to flatten
 * @returns {number[]} Flattened array
 */
export function flatten(matrix) {
  return matrix.flat();
}

/**
 * Calculates mean of all matrix elements
 * @param {number[][]} matrix - Input matrix
 * @returns {number} Mean value
 */
export function matrixMean(matrix) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + v, 0) / arr.length || 0;
}

/**
 * Calculates mean absolute value
 * @param {number[][]} matrix - Input matrix
 * @returns {number} Mean absolute value
 */
export function meanAbs(matrix) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + Math.abs(v), 0) / arr.length || 0;
}

/**
 * Calculates mean of power function
 * @param {number[][]} matrix - Input matrix
 * @param {number} power - Exponent
 * @returns {number} Mean of powered values
 */
export function meanPow(matrix, power) {
  const arr = flatten(matrix);
  return arr.reduce((sum, v) => sum + Math.pow(v, power), 0) / arr.length || 0;
}

/**
 * Subtracts two matrices element-wise
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {number[][]} Result matrix (a - b)
 */
export function subtractMatrices(a, b) {
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

/**
 * Crops a matrix by removing borders
 * @param {number[][]} matrix - Input matrix
 * @param {number} dropY - Rows to drop from top/bottom
 * @param {number} dropX - Columns to drop from left/right
 * @returns {number[][]} Cropped matrix
 */
export function cropMatrix(matrix, dropY, dropX) {
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

/**
 * Creates a linearly spaced array
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} count - Number of points
 * @returns {number[]} Linearly spaced array
 */
export function linspace(start, end, count) {
  if (count <= 1) return [start];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

/**
 * Finds nearest index in array to a target value
 * @param {number[]} arr - Array to search
 * @param {number} value - Target value
 * @returns {number} Index of nearest value
 */
export function nearestIndex(arr, value) {
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

/**
 * Linear interpolation of data
 * @param {number[]} x - X data points
 * @param {number[]} y - Y data points
 * @param {number[]} xq - Query points
 * @returns {number[]} Interpolated Y values
 */
export function interpLinear(x, y, xq) {
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

/**
 * Trapezoidal integration with mask
 * @param {number[]} x - X coordinates
 * @param {number[]} y - Y coordinates
 * @param {boolean[]} mask - Inclusion mask
 * @returns {number} Integrated area
 */
export function trapzMasked(x, y, mask) {
  let area = 0;
  for (let i = 1; i < x.length; i++) {
    if (!mask[i] && !mask[i - 1]) continue;
    area += ((y[i] + y[i - 1]) / 2) * (x[i] - x[i - 1]);
  }
  return area;
}

/**
 * Performs linear regression fit on indexed data
 * @param {number[]} y - Y values
 * @returns {Object} {slope, intercept} coefficients
 */
export function linearFitIndex(y) {
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

export default {
  cloneMatrix,
  flatten,
  matrixMean,
  meanAbs,
  meanPow,
  subtractMatrices,
  cropMatrix,
  linspace,
  nearestIndex,
  interpLinear,
  trapzMasked,
  linearFitIndex,
};