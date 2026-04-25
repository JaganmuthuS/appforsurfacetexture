# Surface Texture Analyzer (Web App)

A browser-based implementation of the MATLAB workflow you provided for surface-texture analysis.

## Features

- Upload any surface image (RGB or grayscale)
- Automatic grayscale conversion + centering
- Row/column linear slope correction
- Gaussian filtering by wavelength (`lambda`)
- Cropping (2% border drop)
- Abbott material ratio curve generation
- Roughness metrics:
  - `Sa`, `Sq`, `Ssk`, `Sku`
  - `Sk`, `Smr1`, `Smr2`
  - `Sak1`, `Sak2`, `Spk`, `Svk`
- Visual panels for:
  - Corrected surface `Z`
  - Waviness `Zw`
  - Roughness `Zr`
  - Abbott curve with key markers

## Run locally

No build tooling is required.

```bash
python -m http.server 8000
```

Open: `http://localhost:8000`

## Notes

- The implementation follows your MATLAB equations and processing order as closely as practical in browser JavaScript.
- Canvas visualizations are normalized grayscale renderings of matrices.
