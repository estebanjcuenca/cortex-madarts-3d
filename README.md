# CORTEX — MadArts 3D Visualization

Interactive 3D visualization of the MadArts CORTEX space — concentric ring curtains, walkthrough camera modes, heatmap overlays, and GIF recording.

**Live demo:** [https://estebanjcuenca.github.io/cortex-madarts-3d/](https://estebanjcuenca.github.io/cortex-madarts-3d/)

## Features

- Orbit, walkthrough, central-orbit, and plan-view camera modes
- Adjustable ring count, spacing, and per-ring gate angles
- Circulation heatmap and ceiling-light interaction
- Export animated GIFs of the current view

## Run locally

No build step required — open `index.html` in a modern browser, or serve it locally:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Tech

Single-file prototype using [Three.js](https://threejs.org/) (CDN) and [gif.js](https://github.com/jnordberg/gif.js) for recording.
