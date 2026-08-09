# Implementation Plan: Central Light Realism & Maze Path Reliability

**Branch**: `002-light-realism-maze-fix` (work happens on `dev`) | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-light-realism-maze-fix/spec.md`

## Summary

Two workstreams in one feature:

1. **Maze path reliability (P1)**: Fix route generation so the walkthrough always threads ring openings, stays inside the room, never clips curtain fabric, and always terminates cleanly. Root causes identified: Catmull-Rom spline overshoot near openings, corridor arcs pushed outside the room then wall-clamped through fabric, degenerate duplicate control points in the final segment, and opening angles that can resolve to world positions outside the room.
2. **Central light realism (P2/P3)**: Replace the flat translucent beam impression with bloom-driven glow, physical light falloff, and soft shadows from the central light — implemented on **WebGL (Stage 1)** per the research decision. WebGPU switch is **deferred with documented re-evaluation criteria** (see [research.md](./research.md)); curtain texture work is not blocked by staying on WebGL.

## Technical Context

**Language/Version**: JavaScript (ES modules), browser runtime

**Primary Dependencies**: Three.js ^0.172.0 (npm), Vite 6 (build/dev), Three.js addons: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`; existing: `GLTFLoader`, `DRACOLoader`, `CSS2DRenderer`

**Storage**: N/A (static site; no persistence)

**Testing**: Headless browser validation scripts (Playwright, ad hoc via `.tmp/`), manual visual pass, `npm run build` gate

**Target Platform**: Modern desktop browsers (Chrome, Firefox, Safari current); GitHub Pages static hosting from `dist/`

**Project Type**: Single-page 3D web application

**Performance Goals**: ≥50 fps at default occupancy (6); ≥30 fps at max occupancy (60) with shadows + bloom on a mid-range laptop

**Constraints**: GIF capture reads `renderer.domElement` every frame — post-processing must keep the visible canvas the capture source; single shadow-casting light budget; no new per-ring meshes

**Scale/Scope**: One scene, ~1,050-line `main.js` + `src/people/` modules; this feature adds 2 small modules and modifies the render loop, maze route, and light rig

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. No Build Step by Default | PASS (pre-existing) | Vite was adopted in feature 001 with documented justification; this feature does not add further toolchain. |
| II. Render Loop Integrity | PASS with care | Bloom moves rendering to `EffectComposer.render()`. All four camera modes' render calls MUST route through one shared `renderFrame()` that preserves the `captureGifFrame()` hook. GIF capture via `drawImage(renderer.domElement)` keeps working because the composer outputs to the same canvas. Validated in quickstart SC-006. |
| III. Camera Mode Safety | PASS | Maze fix touches `startWalk` route computation only; existing try/catch + `stopWalk()` pattern is preserved. No new scripted camera mode is added. |
| IV. Raycasting Correctness | PASS (N/A) | No new click-interaction planes. |
| V. Scene Object & Transparency Budget | PASS with budget | Bloom = 3 full-screen passes (fixed cost, no per-object growth). Shadows: exactly ONE shadow-casting light (central PointLight, 1024px map); key/rim lights stay shadowless. No new per-ring meshes; route validation is compute-only. |
| VI. Shareable Demo Stability | PASS | Work on `dev`; merge to `main` only after quickstart validation (incl. Safari check). |
| VII. Geometry Fidelity Transparency | PASS | Confirmed dimensions untouched. Maze fix changes routing logic only, not ring geometry. Route margins (±0.15 m around openings) documented as estimates. |
| Future Direction (WebGPU gates) | PASS | WebGPU deferred per Stage 1/Stage 2 staging; gates and re-evaluation criteria documented in research.md (R1). This satisfies FR-013/SC-007. |

**Post-Phase-1 re-check**: No violations introduced by the design. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-light-realism-maze-fix/
├── plan.md              # This file
├── research.md          # Phase 0: renderer decision, bloom/shadow/route approaches
├── data-model.md        # Phase 1: route, opening, light-rig entities
├── quickstart.md        # Phase 1: validation scenarios (SC-001..SC-007)
├── contracts/
│   └── ui-controls.md   # Phase 1: UI behavior contracts (unchanged controls, new guarantees)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── main.js              # MODIFIED: shared renderFrame() with composer, shadow config,
│                        #   maze route fixes (or delegation to src/maze/), light rig hookup
├── maze/
│   └── route.js         # NEW: computeMazeRoutePolar + room-aware corridor clamping,
│                        #   guard points, dedupe, route validation (extracted from main.js)
├── lighting/
│   └── centralLight.js  # NEW: central light rig — beam shader/gradient, glow sprite,
│                        #   PointLight with shadows, occupancy pulse API (same signature)
├── people/              # UNCHANGED (already casts/receives shadows via flags only)
│   ├── modelLoader.js   # MODIFIED (one line): castShadow/receiveShadow on loaded meshes
│   └── ...
└── style.css            # UNCHANGED

index.html               # UNCHANGED (no new controls required)
```

**Structure Decision**: Extract the maze route computation and the central light rig into `src/maze/route.js` and `src/lighting/centralLight.js`. Both are currently inline in `main.js`; extraction keeps the render-loop diff reviewable and gives the route a pure-function shape that the validation script can import directly. All other code stays in place — this is not a general refactor.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
