# Implementation Plan: 3D Humanoid People

**Branch**: `001-3d-humanoid-people` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-3d-humanoid-people/spec.md`

## Summary

Replace canvas-drawn 2D sprite people with instanced or cloned 3D low-poly humanoid
meshes loaded via `THREE.GLTFLoader`, preserving click-to-add/remove on the central
floor, occupancy panel controls, age/build randomization, and raycast-based removal.
This requires introducing a minimal Vite + npm build (justified constitution
violation) to load GLTF assets and Three.js modules cleanly, while keeping GitHub
Pages deployment as static output from `vite build`.

## Technical Context

**Language/Version**: JavaScript (ES modules), HTML5, CSS3

**Primary Dependencies**: Three.js (npm, r16x+), Vite 6.x, GLTFLoader
(`three/examples/jsm/loaders/GLTFLoader.js`); existing gif.js remains CDN

**Storage**: N/A (in-memory scene graph only); GLTF/GLB assets in `public/models/`

**Testing**: Manual browser validation per [quickstart.md](./quickstart.md); no
automated test suite today

**Target Platform**: Modern desktop/mobile browsers with WebGL; GitHub Pages static host

**Project Type**: Single-page 3D web visualization (prototype → modular SPA)

**Performance Goals**: Maintain interactive orbit at 60 fps with 20 people + default
rings/heatmap; total scene mesh count increase ≤ 20 draw calls worth of low-poly
figures (prefer instancing or shared geometry)

**Constraints**:
- Constitution I: build step introduced — must ship static `dist/` to Pages
- Constitution II: preserve `captureGifFrame()` render-loop hook
- Constitution III: no new camera loops in this feature
- Constitution IV: no new raycast planes
- Constitution V: monitor object count — use cloned mesh + shared geometry, not
  unique high-poly meshes per person
- Static asset size: target < 2 MB per humanoid GLB (low-poly, CC0)

**Scale/Scope**: Up to 60 simultaneous people; 1 base model (+ optional 2 build
variants or scale-only variation)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. No Build Step by Default | ⚠️ VIOLATION (justified) | GLTFLoader + asset pipeline require modules; Vite is minimal scope. `main` Pages deploy becomes `dist/` artifact. Documented in Complexity Tracking. |
| II. Render Loop Integrity | ✅ PASS | Plan preserves single render loop; GIF hook untouched. |
| III. Camera Mode Safety | ✅ PASS | No new scripted camera modes in scope. |
| IV. Raycasting Correctness | ✅ PASS | Reuses existing floor/person raycast paths; no new planes. |
| V. Scene Object Budget | ⚠️ WATCH | 60 clones risk perf hit — mandate shared geometry + `Mesh` reuse; cap instancing review at 20 people benchmark. |
| VI. Shareable Demo Stability | ✅ PASS | Work on `dev`; merge to `main` only after quickstart validation. |
| VII. Geometry Fidelity | ✅ PASS | People scale relative to confirmed room dimensions; no room geometry changes. |

**Post-design re-check**: All gates satisfied with documented Vite exception. Shared
GLB geometry + scale randomization keeps object budget within watch threshold.

## Project Structure

### Documentation (this feature)

```text
specs/001-3d-humanoid-people/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Person entity model
├── quickstart.md        # Manual validation steps
├── contracts/           # JS module interfaces
│   └── people-api.md
├── tasks.md             # Phase 2 (/speckit-tasks)
└── spec.md
```

### Source Code (target after implementation)

```text
/
├── index.html              # Vite entry (slim shell — imports main.js)
├── src/
│   ├── main.js             # Bootstrap, render loop, GIF hook
│   ├── scene/              # Room, rings, lights (split from monolith)
│   ├── people/
│   │   ├── personFactory.js   # createPersonMesh, randomize traits
│   │   ├── peopleManager.js   # add/remove/clear/setOccupancy
│   │   └── modelLoader.js     # GLTFLoader singleton + cache
│   └── interaction/
│       └── raycastHandlers.js   # floor/person click routing
├── public/
│   └── models/
│       └── humanoid-lowpoly.glb # CC0 asset (TBD in research)
├── vite.config.js
├── package.json
└── dist/                   # GitHub Pages build output (not committed; CI/build deploy)
```

**Structure Decision**: Migrate from single inline `index.html` to Vite ES modules.
Initial implementation may keep most scene code in migrated chunks rather than full
modular split — people subsystem gets dedicated files first; broader split is
follow-up per handoff notes.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Vite build step (Principle I) | `GLTFLoader` is an ES module in `three/examples/jsm/`; loading binary `.glb` from static paths requires module bundler or fragile importmap + separate loader script. Handoff notes explicitly state single inline HTML block cannot sanely host GLTFLoader. | CDN `<script>` GLTFLoader copies exist but are unmaintained, version-mismatched with core Three.js, and still need fetchable `.glb` assets with correct MIME on Pages. |
| Partial file split | People logic isolated in `src/people/` for testability; full monolith split deferred to reduce blast radius. | Keeping all GLTF code inline in 1300-line file repeats unmaintainability the handoff notes warn against. |

## Out of Scope (documented future intent)

Per constitution **Future Direction** (v1.1.0):

- **WebGPU** — not part of this feature; requires separate spec when browser support
  and fallback strategy are defined.
- **Advanced materials/lighting push** — HDRI, shadow maps, bloom, and photo-derived
  textures are staged as **follow-up WebGL features**, not blockers for 3D people.
- This plan deliberately stays on **WebGL + GLTF** so US1–US3 ship without a renderer migration.

## Phase 0 & 1 Artifacts

See [research.md](./research.md), [data-model.md](./data-model.md),
[quickstart.md](./quickstart.md), and [contracts/people-api.md](./contracts/people-api.md).
