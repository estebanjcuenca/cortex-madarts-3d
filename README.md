# CORTEX — MadArts 3D Visualization

Interactive 3D visualization of the MadArts CORTEX space — concentric ring curtains, walkthrough camera modes, heatmap overlays, 3D humanoid occupancy figures, and video recording.

**Live demo:** [https://estebanjcuenca.github.io/cortex-madarts-3d/](https://estebanjcuenca.github.io/cortex-madarts-3d/)

## Features

- Orbit, walkthrough, central-orbit, and plan-view camera modes
- Adjustable ring count, spacing, and per-ring gate angles
- **3D humanoid people** — click central floor to add, click figure to remove
- Circulation flow routes, heatmap, and ceiling-light interaction
- Live 2D floorplan panel (press `X`) with SVG export
- **Line drawing** mode — renders the 3D scene as a white-on-black technical drawing with
  hidden-line removal, curtain seams, and figures as silhouettes; works in every camera mode
- Show a video or image on the projection screen — drag a file onto the view, pick one, or
  paste a direct media URL (Screen content panel), mirrored for rear projection by default
- Autosaves the lighting scene, placed fixtures, and the screen media, restoring them on reload
- Export video (MP4/WebM) and PNG stills of the current view

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

## Verification

The lighting model is pure enough to check in Node, with no browser and no dev server:

```bash
node scripts/verify-lighting.mjs   # fixture catalogue, shadow budget, record lifecycle
```

The rest are headless browser checks against a live dev server. Playwright is a devDependency, but
its browser binary is downloaded separately and is **not** covered by `npm install`:

```bash
npx playwright install chromium   # once per machine
npm run dev                       # in one terminal
node scripts/verify-maze.mjs http://localhost:5173/        # 10 generated layouts must all validate
node scripts/verify-screen.mjs http://localhost:5173/      # screen geometry + projection study
node scripts/verify-persistence.mjs http://localhost:5173/ # autosave + default screen media
node scripts/verify-line-view.mjs http://localhost:5173/   # line-drawing mode swaps and restores cleanly
```

The browser scripts default to port `5174`; pass the URL Vite actually printed if it differs. All
of them exit non-zero on failure and are the regression gate for refactoring work.

`verify-maze.mjs` generates a fresh random layout per run, so an occasional single-run failure is
maze randomness rather than a regression — re-run before investigating.

## Branching

| Branch | Purpose |
|--------|---------|
| `main` | Stable public demo (auto-deployed) |
| `dev` | Active development |

## Spec-driven development

This project uses [GitHub Spec Kit](https://github.com/github/spec-kit). Feature specs live in `specs/`. Constitution: `.specify/memory/constitution.md`.

## Tech

- [Three.js](https://threejs.org/) (npm) + [Vite](https://vitejs.dev/)
- `MediaRecorder` for video capture (gif.js was removed after feature 002)
- GLTF humanoid models in `public/models/`, loaded with Draco compression
- [Playwright](https://playwright.dev/) for headless verification (dev-time only)
