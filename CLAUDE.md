# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step is required. Serve the root directory with any static HTTP server:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Or use the included helper that also opens Chrome:

```bash
./preview.sh          # defaults to port 8000
./preview.sh 9000     # custom port
```

## Architecture

This is a zero-dependency, single-page vanilla JavaScript application — no bundler, no framework. The entire app runs in the browser from three flat files:

- **`index.html`** — UI layout: file input, physical dimension inputs, wavelength list, and five `<canvas>` elements for visualizations
- **`app.js`** — All application logic as plain global functions (loaded via `<script src="app.js">`, not as an ES module)
- **`styles.css`** — CSS custom properties (`--bg`, `--panel`, `--accent`, etc.) and grid layouts

### Analysis pipeline (`runSurfaceAnalysis` in `app.js`)

The pipeline mirrors a MATLAB surface-texture workflow:

1. **Grayscale conversion** — ITU-R BT.601 luminance weighting (0.2989R + 0.587G + 0.114B), values in [0, 1]
2. **Mean-centering** — subtract global mean from every pixel
3. **Slope correction** — column-wise then row-wise least-squares linear detrend (using 1-indexed `x = i+1` to match MATLAB convention)
4. **Per-wavelength decomposition** — for each λ in the comma-separated input:
   - Gaussian sigma derived as `(λ/dx) / (2√(2 ln 2))` to match MATLAB's `fspecial('gaussian')` FWHM convention
   - Separable convolution (rows then columns) with clamp-at-border padding → **Zw** (waviness)
   - **Zr** = Z − Zw (roughness)
5. **2% border crop** of Zr → **Zc**
6. **Abbott–Firestone material ratio curve** — flatten and sort Zc descending; x-axis is material ratio 0–100%
7. **Core zone detection** — slide a 40-unit-wide window across x ∈ [0, 40] to find the minimum-slope segment; this defines the reference line and core zone boundaries [x1, x2]
8. **Roughness metrics** computed from Zc: Sa, Sq, Ssk, Sku; from the core zone: Sk, Smr1, Smr2, Sak1, Sak2, Spk, Svk

### `src/modules/matrix-ops.js`

This file exports ES module versions of the matrix utilities (cloneMatrix, flatten, gaussianBlur, etc.) with JSDoc comments. **It is not currently imported by `app.js`** — the same functions are duplicated inline there. It exists as a starting point for future modularization. If you extract logic from `app.js` into modules, import them consistently and switch `<script src="app.js">` to `<script type="module" src="app.js">`.

## `package.json` Scripts

`webpack` and `jest` are listed as devDependencies but are **not currently wired up** — no webpack config exists and there are no test files. Running `npm test` or `npm run build` will fail. These scripts are stubs for future use.

## Key Conventions

- **Matrix indexing**: `matrix[row][col]`, row = Y, col = X throughout
- **Physical coordinates**: `dx = Lx / nc`, `dy = Ly / nr` (mm per pixel); `Lx`/`Ly` are the surface dimensions entered by the user
- **Number.EPSILON guards**: used in denominators wherever divide-by-zero is possible (e.g. `Sq³ + EPSILON` when computing Ssk/Sku)
- **Canvas rendering**: all matrix visualizations are normalized to [0, 255] grayscale; the Abbott curve is drawn with manual canvas 2D API calls, not a charting library
