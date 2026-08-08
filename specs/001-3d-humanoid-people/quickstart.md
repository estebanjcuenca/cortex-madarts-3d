# Quickstart: Validate 3D Humanoid People

**Feature**: 001-3d-humanoid-people | **Date**: 2026-08-08

Manual validation checklist for reviewers before merging to `main`.

## Prerequisites

- Node.js 20+ and npm
- Modern browser (Chrome, Firefox, Safari)
- Feature branch checked out (`dev` or `001-3d-humanoid-people`)

## Setup

```bash
cd /Users/esteban/Documents/CORTEX-MA
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

Verify GLB present:

```bash
ls public/models/humanoid-lowpoly.glb
```

## Validation Scenarios

### VS-1: Single add/remove (US1)

1. Orbit to view central floor.
2. Click center of floor → 3D figure appears, feet on ground.
3. Orbit 360° → figure looks volumetric from all sides.
4. Click the figure → removed; occupancy shows 0.

**Pass**: All four steps succeed.

### VS-2: Random variation (US2)

1. Click "Set" with occupancy target **10**.
2. Inspect figures from plan view and orbit.
3. Confirm height variation (short + tall) and at least two build widths.

**Pass**: Visible diversity in height and shoulder/hip width.

### VS-3: Bulk controls (US3)

1. Set occupancy to **20** → count reads 20.
2. Orbit/zoom — controls feel responsive (no permanent lock).
3. Click **Clear all** → count 0, no leftover meshes.

**Pass**: Counts accurate; navigation usable.

### VS-4: Boundary & regression

1. Click outside central disc (on ring area) → no new person.
2. Toggle circulation heatmap + rings on → add 5 people → still interactive.
3. Start GIF recording in orbit mode with people visible → completes without error.
4. Run walk + central orbit camera modes → no stuck navigation after completion.

**Pass**: No regressions on boundaries, heatmap, GIF, or camera modes.

## Production Build Smoke Test

```bash
npm run build
npx serve dist
```

Repeat VS-1 on served `dist/` URL (simulates GitHub Pages).

## Failure Indicators

- Flat billboard appearance from any angle → FAIL US1
- Orbit permanently stuck after camera mode → FAIL Constitution III regression
- GIF recording broken → FAIL Constitution II regression
- Console GLTF load error with no user-visible fallback → FAIL FR-010 edge case
