# Pre-refactor baseline (T005)

**Captured**: 2026-08-09 · branch `dev` · before any feature 005 code change

This is the reference every extraction stage is compared against. If a Phase 2 task changes any
value below, the extraction changed behaviour — fix it before continuing (FR-031, SC-011).

## Environment

| | |
|---|---|
| Node | via `npm run dev` (Vite 6.4.3) |
| Three.js | ^0.172.0 |
| Playwright | devDependency (added in T002), chromium installed |
| Dev server | `http://localhost:5175/` (5173 and 5174 were occupied) |
| `src/main.js` | 1880 lines |
| Total `src/` | 3574 lines across 14 modules |

## `scripts/verify-maze.mjs` — exit 0

```
run  1: route VALID | walk started: true | stopped cleanly: true
run  2: route VALID | walk started: true | stopped cleanly: true
run  3: route VALID | walk started: true | stopped cleanly: true
run  4: route VALID | walk started: true | stopped cleanly: true
run  5: route VALID | walk started: true | stopped cleanly: true
run  6: route VALID | walk started: true | stopped cleanly: true
run  7: route VALID | walk started: true | stopped cleanly: true
run  8: route VALID | walk started: true | stopped cleanly: true
run  9: route VALID | walk started: true | stopped cleanly: true
run 10: route VALID | walk started: true | stopped cleanly: true

10/10 runs passed
```

**No page errors.** All ten generated layouts produced a walkable route that validated, started the
walkthrough, and restored controls cleanly on stop (Constitution III).

## `scripts/verify-screen.mjs` — exit 0

```
dims HUD: Room: ≈ 226 m² (from plan) Width: 10.12 m Depth: 22.34 m
          Screen: Ø 4.80 m (face 4.695) Curtain ring 1: Ø 6.533 m Rings: 10
dimsOk: true
layers: { screen: true, technical: true }
panel: {
  open: true,
  screenPaths: 2,
  ringGroups: 10,
  dims: 'room 10.12 × 22.34 m · screen Ø4.80 · center (0.08, 6.69) m · 10 rings ·
         technical layer is vector-only (raster MEP underlay not bundled)'
}
toggle smoke: { toggled: true }
page errors: none
```

## Invariants to preserve

These are the concrete numbers a regression would move. They are also the seed assertions for
`scripts/verify-measurements.mjs` (task T044).

| Value | Baseline | Provenance |
|---|---|---|
| Room width | 10.12 m | confirmed |
| Room depth | 22.34 m | confirmed |
| Room area | ≈226 m² | derived |
| Screen outer diameter | 4.80 m | confirmed |
| Screen face diameter | 4.695 m | confirmed |
| Curtain ring 1 diameter | 6.533 m | confirmed |
| Ring count (default) | 10 | derived |
| Ring-field centre | (0.08, 6.69) m | derived |
| Floorplan screen paths | 2 | main arc + rear arc |
| Floorplan ring groups | 10 | one per ring |
| Route validation rate | 10/10 | — |

## How to re-run

```bash
npm run dev                                            # note the port Vite prints
node scripts/verify-maze.mjs   http://localhost:PORT/
node scripts/verify-screen.mjs http://localhost:PORT/
```

Both default to port 5174. Combined runtime is roughly 70 seconds, dominated by the ten maze runs.

**Run both after every Phase 2 task**, not just at the T012 and T022 checkpoints — the whole point
of the incremental extraction is that a regression is caught while the change that caused it is
still one task wide.
