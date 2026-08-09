# Implementation Plan: Screen Regrouping, Real Dimensions & Projection Study

**Branch**: `003-screen-real-dimensions` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-screen-real-dimensions/spec.md`

## Summary

Recalibrate the entire model to the architect's labeled dimensions in `public/floorplan2.svg` (≈29.93 svg units/m), regroup the innermost circle as the **projection screen** (not a curtain), keep curtain ring 1 at the confirmed Ø6.533 m, add a projection-surface / one-vs-two projector study with matching 3D projectors, and add a toggleable technical/ventilation layer. Preserve maze, walkthrough, people, video capture, and the live X-key floorplan.

**Root cause of current mis-scale**: the previous derivation treated the innermost drawn circle as Ø6.533 m. Dimension lines in the second export prove that circle is Ø4.800 / 4.695 m (screen); Ø6.533 m is the first curtain. Using the wrong anchor inflated every linear size by ~36% (room ≈418 m² → true ≈226 m²).

## Technical Context

**Language/Version**: JavaScript (ES modules), browser runtime

**Primary Dependencies**: Three.js ^0.172.0 (npm), Vite 6, existing CSS2D / EffectComposer stack; SVG vector floorplan panel already in `main.js`

**Storage**: N/A (static site; geometry constants in `src/floorplan.js`)

**Testing**: Playwright headless scripts (extend `scripts/verify-maze.mjs` + new geometry/projection checks); `npm run build`; manual X-panel registration check

**Target Platform**: Modern desktop browsers; GitHub Pages from `dist/`

**Project Type**: Single-page 3D web application

**Performance Goals**: No fps regression vs current default scene; technical layer ≤20 extra meshes; two projector models + blend marker only (no new per-curtain geometry)

**Constraints**: Single shadow-casting light remains the central rig; CylinderGeometry world-angle conversion (`θ = π/2 − α`) must be reused for screen arcs; video capture hook in `renderFrame()` must stay intact; raster underlays `content-1.png` / `content-2.png` are referenced by the SVG but **not present** — technical layer is vector-only

**Scale/Scope**: Touches `src/floorplan.js`, `src/main.js` (screen build, defaults, layers, floorplan panel), `Index.html` (dims + layer toggle + study readout), `src/style.css` (small); optional small `src/screen/` or `src/floorplan/` extract if it keeps `main.js` reviewable

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. No Build Step by Default | PASS (pre-existing) | Vite already adopted in 001; no new toolchain. |
| II. Render Loop Integrity | PASS | No render-loop change. Video capture (`captureVideoFrame`) stays in `animate` → `renderFrame()`. Constitution text still mentions GIF; implementation already uses MediaRecorder — do not regress. |
| III. Camera Mode Safety | PASS | No new scripted camera mode. Walk uses existing `try/catch` + `stopWalk()`. |
| IV. Raycasting Correctness | PASS with care | Screen arcs remain selectable meshes (`DoubleSide`). Any new technical click targets that are horizontal planes must use `DoubleSide`. |
| V. Scene Object & Transparency Budget | PASS with budget | Screen becomes 2 fabric arcs (replaces 1 wrong arc on ring). +2 projectors + blend marker + ≤12 technical meshes. No dashed door markers return. Estimate +15 meshes net — under prior "stuck orbit" threshold. |
| VI. Shareable Demo Stability | PASS | Work on feature branch; merge to `main` only after quickstart (incl. 10/10 maze). |
| VII. Geometry Fidelity Transparency | PASS | Scale and screen/ring grouping come from labeled drawing; residual ~1.5% screen-fit vs label difference documented in research (R2). Confirmed Ø6.533 curtain preserved. |

**Post-Phase-1 re-check**: No unjustified violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-screen-real-dimensions/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-layers.md
└── tasks.md             # /speckit-tasks — NOT created here
```

### Source Code (repository root)

```text
public/
├── floorplan2.svg       # ACTIVE source of truth (already present)
└── floorplan.svg        # retained for reference only

src/
├── floorplan.js         # REWRITE constants: scale, ROOM_M, CENTER_M, SCREEN,
│                        #   PLAN_RINGS (no screen), TECHNICAL, DOOR/BOX/SPRINKLER
├── main.js              # MODIFIED: buildScreen (two arcs + study + 2 projectors),
│                        #   layer technical, defaults, dims HUD, X-panel underlay
│                        #   + screen overlay, selection info for study metrics
├── maze/route.js        # UNCHANGED API; re-validate at new scale only
├── lighting/centralLight.js  # UNCHANGED
└── style.css            # MODIFIED: technical layer / study readout styles if needed

Index.html               # MODIFIED: dims text, layer checkbox, optional study section
```

**Structure Decision**: Keep geometry derivation in `src/floorplan.js` (single source for 3D + live SVG panel). Prefer updating `buildScreen` / floorplan overlay in place over a large extract unless `main.js` diffs become unreviewable. Do **not** change maze route algorithm in this feature — only re-run validation after scale change.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

## Implementation Phases (for `/speckit-tasks`)

1. **Geometry recalibration** — rewrite `floorplan.js` + HTML defaults; room/center/door/box/sprinklers at new metres.
2. **Screen regrouping** — screen entity separate from `PLAN_RINGS`; two-arc mesh; layer + selection study metrics.
3. **Projector study visualization** — two projectors + blend zone matching recommendation.
4. **Technical layer** — niches, ducts, booth, corridor; 3D + floorplan; toggle.
5. **Floorplan panel** — underlay → `floorplan2.svg`; screen overlay distinct from curtains.
6. **Regression** — maze 10/10, orbit, video hook, people, SVG download.

## Risk / Non-Break Scope

| Risk | Mitigation |
|------|------------|
| Maze fails in smaller room | Keep auto-trim; re-run `verify-maze.mjs`; bump retries only if needed |
| Stale UI defaults place door/box outside room | Update all numeric inputs in `Index.html` in the same change as `floorplan.js` |
| Ring index / confirmed Ø6.533 drift | Ring 1 stays r=3.267; screen is not in `RING_RADII` |
| People / central floor confusion | Keep Ø4.8 as screen outer; central floor marker stays under screen; document in selection text |
| Missing content-*.png | Document; vector technical layer only (FR-007 / US3) |
| Angle convention regression | Reuse `cylStart = π/2 − (aStart+aLen)` for screen cylinders |
