# Implementation Plan: Stage Visualizer & Designer Components

**Branch**: `dev` (spec dir `005-stage-visualizer-components`) | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-stage-visualizer-components/spec.md`

## Summary

Turn the current single-purpose visualization into a stage visualizer and designer with granular
lighting and camera control, live dimension reporting, discipline-oriented layers, and a shareable
design file.

The technical approach is a **strangler refactor around a shared context, not a rewrite**. Today
`src/main.js` is ~1880 lines holding the scene, all geometry builders, ring/fabric maths, cameras,
every DOM handler, the floorplan panel, and the render loop as module-scope mutable state. We
introduce a small core (`StageContext` + `StageModel` + an event bus + a layer registry), then move
one domain at a time out of `main.js` into a documented component, verifying against the existing
maze-route validation and projection study after each move. New capability is added only into the
extracted components, never back into `main.js`.

The single most important structural rule: **pure calculation is separated from drawing.** Ring
fabric arc maths, measurements, flow routing, and projection study become pure functions with no
Three.js scene dependency, so the same numbers feed the 3D view, the SVG floorplan panel, the
dimension schedule, and any export. This is what makes the tool trustworthy to architects and cheap
to extend.

## Technical Context

**Language/Version**: JavaScript (ES2022 modules), no TypeScript

**Primary Dependencies**: Three.js (`WebGLRenderer`, `EffectComposer`, `UnrealBloomPass`,
`CSS2DRenderer`, `GLTFLoader` + Draco), Vite dev server and build

**Storage**: Browser `localStorage` for auto-restore of the working state; JSON file download/upload
for the shareable stage document. No server, no database.

**Testing**: Existing Playwright-driven smoke scripts under `scripts/` (e.g. `verify-maze.mjs`) plus
in-app validation (`validateRoute`). No unit test runner is currently configured; this plan adds a
lightweight pure-function test path for the measurement and geometry modules.

**Target Platform**: Modern desktop browsers with WebGL2 (Chrome, Safari, Firefox); static build
deployable to GitHub Pages

**Project Type**: Single-page browser application (front-end only)

**Performance Goals**: 60 fps in the default configuration; not below 30 fps with 12 user-added
fixtures plus 20 people; measurement recomputation under 100 ms so live dimension updates feel
instantaneous

**Constraints**: One shadow-casting light budget (currently the central rig); transparency and
additive material count is the known frame-rate risk; every frame must continue to route through
`renderFrame()` so image and video capture keep working in all camera modes

**Scale/Scope**: ~15 existing modules plus a ~1880-line orchestrator; target is roughly 30 focused
modules, none over 400 lines, plus a component documentation set. Six prioritised user stories.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` v1.1.0.

| Principle | Status | Assessment |
|---|---|---|
| **I. No Build Step by Default** | ⚠️ **Stale — amendment required** | The constitution requires the project to run without a bundler. This was already superseded when Vite was adopted (spec 002). The constitution text was never updated. This plan does not change the toolchain, but it cannot honestly claim to pass a principle the repository already contradicts. See Complexity Tracking. |
| **II. Render Loop Integrity** | ⚠️ **Stale text, substantively PASS** | The principle protects `captureGifFrame()` and gif.js; recording is now `MediaRecorder` via `captureVideoFrame()`. The *intent* — capture must work in every camera mode — is preserved and strengthened: extracting the camera controller keeps a single `renderFrame()` entry point that all modes and both capture paths use. Constitution text needs updating to name the current mechanism. |
| **III. Camera Mode Safety (NON-NEGOTIABLE)** | ✅ **PASS — enforced structurally** | Today `startWalk` and `startCentralOrbit` each hand-roll the try/catch-and-always-stop pattern, and they share a single `walking` flag. The extracted `cameraModes` component makes this a property of the framework: every scripted mode runs through one runner that guarantees the stop/reset call on error or interruption. FR-019 and User Story 3 scenario 5 encode this. |
| **IV. Raycasting Correctness** | ✅ **PASS** | New interaction surfaces (fixture placement, measurement picking, aim handles) must use `side: THREE.DoubleSide`. This becomes a documented requirement of the picking registry rather than a convention each call site must remember. |
| **V. Scene Object & Transparency Budget** | ✅ **PASS with an explicit gate** | This feature adds fixtures, dimension annotations, and beam volumes — all of which are exactly the transparent/additive objects the principle warns about. FR-008 and SC-010 make the budget an enforced, user-visible limit rather than an aspiration. Phase 0 research records the mesh cost per fixture and per annotation. |
| **VI. Shareable Demo Stability** | ✅ **PASS** | Work proceeds on `dev`. The restructure is staged so `dev` stays runnable after each domain extraction; `main` is only updated when a stage is complete and verified. |
| **VII. Geometry Fidelity Transparency** | ✅ **PASS — directly advanced** | This principle demands confirmed-versus-estimated dimensions be visible rather than silently corrected. FR-014 and SC-005 promote it from a code comment convention into a first-class, user-facing property of every reported measurement. This is the strongest alignment in the feature. |

**Gate result**: Proceed. Two principles (I and II) describe a codebase state that no longer exists;
they are documentation debt, not design violations by this feature. A constitution amendment to
v1.2.0 is a prerequisite task and is recorded in Complexity Tracking.

**Post-Phase 1 re-check**: Re-evaluated after `data-model.md` and `contracts/` were written. No new
violations. The fixture model in Phase 1 deliberately caps shadow casters and requires the beam
volume to be a single merged mesh per fixture, which keeps Principle V satisfied by construction.

## Project Structure

### Documentation (this feature)

```text
specs/005-stage-visualizer-components/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions and rationale
├── data-model.md        # Phase 1 output — entities and relationships
├── quickstart.md        # Phase 1 output — validation scenarios
├── contracts/           # Phase 1 output — component and file contracts
│   ├── components.md    #   module boundaries, inputs, outputs, side effects
│   ├── ui-panels.md     #   panel mount points and DOM contract
│   └── stage-document.md#   the shareable design file schema
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

Existing modules are marked, so the delta is visible. Everything else is new or extracted from
`src/main.js`.

```text
src/
├── main.js                        # (exists, ~1880 → target <200) composition root only
│
├── core/
│   ├── stageContext.js            # scene, renderer, composer, cameras, groups — created once, passed in
│   ├── stageModel.js              # authoritative space+design state, invalidation graph
│   ├── eventBus.js                # named change events, replaces the buildRings() cascade
│   ├── pickRegistry.js            # raycast target lifecycle, replaces raycastTargets array
│   └── units.js                   # metres/degrees formatting, confirmed-vs-estimated tagging
│
├── space/
│   ├── floorplanData.js           # (from src/floorplan.js) confirmed source dimensions
│   ├── roomShell.js               # floor, walls, clip planes, isInsideRoomXZ, clampPointToRoom
│   ├── ringField.js               # PURE: radii, door angles, fabric arcs, trim windows
│   ├── ringBuilder.js             # curtain meshes from ringField output
│   ├── screenAssembly.js          # projection screen, projectors, throw cones
│   └── technicalLayer.js          # niches, ducts, booth, entrance posts
│
├── dimensions/
│   ├── measurements.js            # PURE: ring gaps, fabric lengths/areas, clearances, warnings
│   ├── measurementOverlay.js      # dimension lines and labels in the 3D view
│   └── schedule.js                # export a readable measurement schedule
│
├── lighting/
│   ├── centralLight.js            # (exists) becomes one fixture type behind the fixture API
│   ├── fixtureTypes.js            # type catalogue: properties, defaults, limits per type
│   ├── fixtureFactory.js          # build/update Three.js objects for a fixture record
│   ├── lightingRig.js             # fixture registry, add/remove/update, shadow budget guard
│   └── looks.js                   # named looks: capture, recall, crossfade
│
├── cameras/
│   ├── cameraController.js        # orbit/pan/zoom state and input handling
│   ├── cameraModes.js             # scripted modes behind one safe runner (Principle III)
│   └── views.js                   # saved views, fly-to transitions
│
├── layers/
│   ├── layerRegistry.js           # layer id → group + domain + metadata
│   └── disciplinePresets.js       # lighting / architecture / technical / museum visibility sets
│
├── project/
│   ├── stageDocument.js           # serialize + deserialize the full design, with version handling
│   └── autosave.js                # localStorage working-state restore
│
├── ui/
│   ├── layersPanel.js             # (exists) extended with discipline presets
│   ├── lightingControls.js        # (exists) extended to fixtures and looks
│   ├── heatmapControls.js         # (exists)
│   ├── inspector.js               # selection-driven property editor (fixtures, rings, screen)
│   ├── dimensionsPanel.js         # live measurement table
│   ├── camerasPanel.js            # saved views list
│   ├── circulationControls.js     # extracted from the layersPanel HTML injection
│   └── controls/                  # shared slider/colour/number primitives
│
├── analysis/
│   ├── route.js                   # (from src/maze/route.js)
│   └── flowRoutes.js              # (from src/maze/flowRoutes.js)
│
├── people/                        # (exists, unchanged) modelLoader, peopleManager, personFactory…
├── floorplanPanel/
│   ├── panel.js                   # SVG shell, underlay, export
│   └── overlay.js                 # live overlay driven by the same pure geometry as the 3D view
├── settings/visualSettings.js     # (exists) folded into stageModel, kept as a compatibility shim
└── style.css                      # (exists)

docs/
└── components/                    # the "well documented components" deliverable
    ├── README.md                  # map: concern → owning component
    ├── space.md
    ├── dimensions.md
    ├── lighting.md
    ├── cameras.md
    └── layers.md

scripts/
├── verify-maze.mjs                # (exists) regression gate for FR-031
└── verify-measurements.mjs        # new: pure-function checks for dimensions
```

**Structure Decision**: A single front-end project organised by **domain**, not by technical
artifact type. `core/` holds only what every domain needs; each domain folder owns its data, its
maths, and its view; `ui/` holds only panels, which read and write domains through their public
API and never reach into Three.js objects directly. `main.js` becomes a composition root that wires
domains together and starts the render loop.

The `docs/components/` folder is a first-class deliverable of this feature, not an afterthought —
FR-027 to FR-029 and SC-009 are verified against it.

## Implementation Stages

Each stage leaves `dev` runnable and verified. This ordering front-loads the structural work that
every user story depends on, then delivers stories in priority order.

| Stage | Content | Verifies |
|---|---|---|
| **0. Prerequisite** | Amend constitution to v1.2.0 (build step, capture mechanism) | Gate honesty |
| **1. Core** | `stageContext`, `eventBus`, `pickRegistry`, `layerRegistry`; `main.js` wired through them | No behaviour change; `verify-maze` still passes |
| **2. Space** | Extract `floorplanData`, `roomShell`, `ringField` (pure), `ringBuilder`, `screenAssembly`, `technicalLayer`; floorplan overlay reads the same pure geometry | FR-030, FR-031 |
| **3. Dimensions (US2)** | `measurements.js` pure module, `dimensionsPanel`, `measurementOverlay`, `schedule` export | FR-009 to FR-015, SC-003 to SC-005 |
| **4. Lighting (US1)** | `fixtureTypes`, `fixtureFactory`, `lightingRig`, `looks`, `inspector`; central light becomes a fixture | FR-001 to FR-008, SC-001, SC-002 |
| **5. Cameras (US3)** | `cameraController`, `cameraModes` with the safe runner, `views` | FR-016 to FR-020, SC-006 |
| **6. Layers (US4)** | `disciplinePresets`, extended layers panel, `circulationControls` extraction | FR-021 to FR-023, SC-007 |
| **7. Document (US5)** | `stageDocument`, `autosave`, import/export UI, version handling | FR-024 to FR-026, SC-008 |
| **8. Documentation (US6)** | `docs/components/*`, per-module header docs, concern→component map | FR-027 to FR-029, SC-009, SC-012 |

Stages 3 and 4 can proceed in parallel once stage 2 lands, because they touch disjoint domains.

## Complexity Tracking

> Filled because the Constitution Check found two principles the repository already contradicts.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle I — a build step (Vite) is in use, contrary to "No Build Step by Default" | Already adopted in spec 002 and depended on by every module in `src/`. Reverting to a single static file is incompatible with FR-027 to FR-029, which require many small documented modules. | Reverting to CDN script tags and one file would directly contradict the entire purpose of this feature and would undo work already shipped. The correct resolution is to amend the constitution to reflect reality, not to change the code. |
| Principle II — the protected capture mechanism is named as gif.js / `captureGifFrame()`, which no longer exists | Recording moved to `MediaRecorder` / `captureVideoFrame()`. The principle's intent (capture works in every camera mode) is preserved and enforced by the single `renderFrame()` entry point. | Restoring gif.js to satisfy the letter of the principle would reintroduce the CORS/Worker fragility the constitution itself calls out. Amend the text to protect the intent and name the current mechanism. |
| `main.js` remains a large file during stages 1–7 | A big-bang rewrite would break the shareable demo and lose the regression safety of `verify-maze`. Incremental extraction keeps `dev` runnable throughout. | A clean-room rewrite was rejected: there is no test suite to catch regressions in ring/fabric arc maths, and the angle-convention mismatch documented in `Index.html` is exactly the kind of detail a rewrite loses. |

**Prerequisite action**: amend `.specify/memory/constitution.md` to v1.2.0 (MINOR — material
expansion of Principles I and II to match the current toolchain and capture mechanism) before
stage 1 begins.
