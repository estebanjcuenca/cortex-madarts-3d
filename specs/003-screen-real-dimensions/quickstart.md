# Quickstart Validation: 003 Screen Real Dimensions

## Prerequisites

```bash
npm install
npm run dev
# optional: npx playwright install chromium
```

Geometry derivation (offline):

```bash
node .tmp/fit-floorplan2.mjs
```

## SC-001 — Room & screen scale

1. Open the app.  
2. Read `#dims`: room ≈ **10.12 × 22.34 m**, ≈ **226 m²**, screen Ø **4.80**.  
3. Fail if values still show 13.77 × 30.39 / 418 m².

## SC-002 — Screen grouping

1. Toggle **Projection screen** off → two innermost curved panels disappear; Ø6.533 curtain remains.  
2. Toggle **Curtain rings** off → screen remains.  
3. Click a screen arc → selection title is Projection screen with dimension list (not “Ring N”).

## SC-003 — Projection study / two projectors

1. With screen selected (or study section open), confirm: main arc ≈9.3 m, area at 2.4 m height ≈22 m², verdict **two projectors**.  
2. In 3D, exactly **two** projector models aim at the main arc with a visible blend overlap marker.

## SC-004 — Technical layer

1. Enable **Technical / ventilation**.  
2. Confirm 4 left niches, 4 right ducts, booth, entrance helpers in 3D.  
3. Press **X** → same elements in the live plan; underlay is `floorplan2.svg`.  
4. Disable layer → they disappear from both views.

## SC-005 — Maze regression

```bash
node scripts/verify-maze.mjs
```

Expect **10/10** valid routes with clean walk start/stop.

## SC-006 — Floorplan registration

1. Plan view + **X** panel, underlay on.  
2. Live screen arcs sit on drawn st8 arcs; curtain ring 1 on Ø6.533 cluster.  
3. Download SVG still produces a file.

## Smoke (non-SC but required)

- Orbit / plan / walk / central space still switch.  
- Record video start/stop does not throw.  
- Add a person on central floor still works.

## Done when

All SC-001…SC-006 pass and smoke checks are clean.
