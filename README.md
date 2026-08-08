# CORTEX — MadArts 3D Visualization

Interactive 3D visualization of the MadArts CORTEX space — concentric ring curtains, walkthrough camera modes, heatmap overlays, 3D humanoid occupancy figures, and GIF recording.

**Live demo:** [https://estebanjcuenca.github.io/cortex-madarts-3d/](https://estebanjcuenca.github.io/cortex-madarts-3d/)

## Features

- Orbit, walkthrough, central-orbit, and plan-view camera modes
- Adjustable ring count, spacing, and per-ring gate angles
- **3D humanoid people** — click central floor to add, click figure to remove
- Circulation heatmap and ceiling-light interaction
- Export animated GIFs of the current view

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview   # smoke-test dist/ locally
```

GitHub Pages (on `main`) builds via `.github/workflows/deploy-pages.yml` and serves the `dist/` output.

## Branching

| Branch | Purpose |
|--------|---------|
| `main` | Stable public demo (auto-deployed) |
| `dev` | Active development |

## Spec-driven development

This project uses [GitHub Spec Kit](https://github.com/github/spec-kit). Feature specs live in `specs/`. Constitution: `.specify/memory/constitution.md`.

## Tech

- [Three.js](https://threejs.org/) (npm) + [Vite](https://vitejs.dev/)
- [gif.js](https://github.com/jnordberg/gif.js) (CDN) for GIF recording
- GLTF humanoid model in `public/models/`
