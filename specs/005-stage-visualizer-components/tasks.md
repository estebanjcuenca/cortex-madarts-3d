---
description: "Task list for Stage Visualizer & Designer Components"
---

# Tasks: Stage Visualizer & Designer Components

**Status**: 17 of 78 done (T065 partial). Phase 1 complete; Phase 2 complete along the
[lean path](#-lean-path-selected-2026-08-09) below, with the rest deferred to the stories that need
it. Phase 3 (US1) has its engine layer — fixture types, factory, rig, shadow budget, migrated
lights — plus the shared control primitives. Baseline captured in [baseline.md](./baseline.md)
(verify-maze 10/10, verify-screen clean; both still pass). Next up: **T032**, the inspector panel —
the first consumer of the primitives, and what makes a fixture selectable.

**Absorbs**: [Feature 004](../004-visual-controls-components/spec.md) — its shipped modules are
extended, not replaced. Deferred ideas live in [BACKLOG.md](../BACKLOG.md).

**Input**: Design documents from `/specs/005-stage-visualizer-components/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: TDD was not requested. Verification tasks appear only where the spec demands them —
FR-031 and SC-011 require the existing route validation to keep passing, and SC-005 / SC-004 require
measurement correctness that is cheapest to prove headlessly.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`–`[US6]` map to the user stories in `spec.md`
- Every task names its exact file path

## Path Conventions

Single front-end project. Source at `src/`, verification scripts at `scripts/`, component
documentation at `docs/components/`. Structure per `plan.md` → Source Code.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Unblock the gate, make verification reproducible, create the target structure.

- [x] T001 Amend `.specify/memory/constitution.md` to v1.2.0 — update Principle I to record that Vite is the adopted toolchain (superseding "No Build Step by Default") and Principle II to protect `captureVideoFrame()` / `MediaRecorder` instead of the removed gif.js path; add a Sync Impact Report comment
- [x] T002 [P] Add `playwright` to `devDependencies` in `package.json` and document `npx playwright install chromium` as a verification prerequisite in `README.md`
- [x] T003 [P] Create the domain directories `src/core/`, `src/space/`, `src/dimensions/`, `src/cameras/`, `src/layers/`, `src/project/`, `src/analysis/`, `src/floorplanPanel/`, `src/ui/controls/`
- [x] T004 [P] Create `docs/components/README.md` containing the concern→component table from `specs/005-stage-visualizer-components/contracts/components.md` and the required module-header convention (responsibility, inputs, outputs, side effects)
- [x] T005 Record the pre-refactor baseline: run `node scripts/verify-maze.mjs` and `node scripts/verify-screen.mjs`, save their passing output to `specs/005-stage-visualizer-components/baseline.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared core plus the space extraction. Every user story reads space geometry or
attaches to the stage context, so none can start until this is done.

**Rule for this phase**: behaviour must not change. Every task is a move, not a redesign.

> ### ⚡ Lean path selected (2026-08-09)
>
> Phase 2 was originally a hard gate on all 19 tasks. Audit showed only four block User Story 1:
> **lighting is purely additive and does not touch ring geometry.** The rest is deferred to the
> story that actually needs it, so US1 ships in 18 tasks instead of 38.
>
> | Verdict | Tasks | Rationale |
> |---|---|---|
> | **Do now** | T006, T009, T011 *(partial)*, T012 | Event bus and picking are what new components attach to |
> | **Defer → US2 (dimensions)** | T007, T013, T014, T015, T021, T022 | `ringField` is the keystone for measurements, not for lighting |
> | **Defer → US4 (layers)** | T023, T024 | Gizmos register in the existing `layers` object meanwhile |
> | **Defer → US5 (sharing)** | T008, T010 | Stage context and model matter for export, not for mood |
> | **Optional tidying** | T016, T017, T018, T019, T020 | Unlocks nothing; needed only for the US6 documentation goal |
>
> **T011 is partial**: rewire only what T006 and T009 touch. `main.js` keeps its scene, groups, and
> geometry builders for now, and hands them to the new lighting modules as arguments.
>
> **Known cost**: deferring T008 means some lighting wiring gets redone when US5 lands, and
> `main.js` stays around 1500 lines until the optional tidying is picked up. Accepted deliberately.

### Core

- [x] T006 [P] Create `src/core/eventBus.js` with `emit(event, payload)` and `on(event, fn) -> unsubscribe`, supporting the event names in `contracts/components.md` (`space:changed`, `rings:rebuilt`, `fixtures:changed`, `look:recalled`, `camera:changed`, `layers:changed`, `selection:changed`, `document:loaded`)
- [ ] T007 [P] Create `src/core/units.js` with `formatMetres`, `formatDegrees`, `formatArea`, and `weakestSource(...sources)` implementing the source-inheritance rule from `data-model.md` §7
- [ ] T008 Create `src/core/stageContext.js` — move renderer, scene, camera, `EffectComposer`, `bloomPass`, `CSS2DRenderer`, scene groups, the resize handler, and `renderFrame()` (as `render()`) out of `src/main.js` lines ~24–53, 281–303, 1388–1394
- [x] T009 Create `src/core/pickRegistry.js` with `register`, `unregisterGroup`, `pick`, replacing the `raycastTargets` and `ceilingRaycastTargets` arrays in `src/main.js`; warn when a registered interaction plane is not `THREE.DoubleSide` (Constitution IV)
- [ ] T010 Create `src/core/stageModel.js` holding `SpaceConfig`, `MoodSettings`, `LayerState`, and analysis mode per `data-model.md`, exposing `getSpace`/`updateSpace`/`getMood`/`updateMood`/`getLayerState`/`updateLayerState`/`subscribe`
- [x] T011 Rewire `src/main.js` to obtain scene objects from `stageContext` and picking from `pickRegistry`, deleting the corresponding module-scope variables
- [x] T012 Verify no behaviour change: run `node scripts/verify-maze.mjs` and `node scripts/verify-screen.mjs`, compare against `baseline.md`

### Space

- [ ] T013 [P] Move `src/floorplan.js` to `src/space/floorplanData.js`, update all importers, and add the `PROVENANCE` map marking each constant `confirmed` (room 10.12 × 22.34, ring 1 Ø6.533, screen Ø4.800 / 4.695) or `estimated` (wall height, room taper, door position)
- [ ] T014 [P] Create `src/space/ringField.js` as a pure module — move `genRadii`, `gapAngleDeg`, `computeFabricArcs`, `autoTrimWindowsForRadius`, `trimForRing`, `trimArcsToWindows`, and `ringFabricArcs` out of `src/main.js` lines 74–232; no Three.js import
- [ ] T015 Create `src/space/roomShell.js` — move the trapezoid corners, `halfWidthAtZ`, `computeClipPlanes`, `applyClipping`, `isInsideRoomXZ`, `clampPointToRoom`, and the floor/wall meshes out of `src/main.js` lines 234–303; keep the predicates pure and separate from `buildRoomShell`
- [ ] T016 Create `src/space/ringBuilder.js` — move `buildRings` out of `src/main.js` lines 429–500; this file is the **only** place the plan-angle (+x CCW) to `CylinderGeometry` (+Z CW) conversion may live, and it must be documented in the module header
- [ ] T017 Create `src/space/screenAssembly.js` — move `buildScreen` and `getSpaceTexture` out of `src/main.js` lines 502–623, returning `computeProjectionStudy()` output for the inspector
- [ ] T018 [P] Create `src/space/technicalLayer.js` — move `buildTechnical` out of `src/main.js` lines 625–665
- [ ] T019 [P] Move `src/maze/route.js` to `src/analysis/route.js` and `src/maze/flowRoutes.js` to `src/analysis/flowRoutes.js`, updating all importers; remove the now-empty `src/maze/`
- [ ] T020 Create `src/floorplanPanel/panel.js` and `src/floorplanPanel/overlay.js` — move the SVG shell, underlay toggle, download, and `updateFloorplanOverlay` out of `src/main.js` lines 1684–1855, with the overlay consuming `ringField.ringFabricArcs()` rather than the `builtRingArcs` snapshot. Moves with it: the central-beam plan symbol, which reads its radii from `centralLight.centralBeamPlanFootprint()` and re-renders on occupancy, mood, and `rig` layer changes
- [ ] T021 Replace the implicit `buildRings()` → `buildScreen()` → `buildCirculation()` → `updateFloorplanOverlay()` cascade in `src/main.js` with `eventBus` subscriptions in each builder
- [ ] T022 Verify the space extraction: run `node scripts/verify-maze.mjs` and `node scripts/verify-screen.mjs` against `baseline.md`

### Layers

- [ ] T023 [P] Create `src/layers/layerRegistry.js` with `registerLayer({ id, label, domain, group })`, `setVisible`, `getVisibility`, `listByDomain`, preserving the existing layer ids
- [ ] T024 Wire `src/ui/layersPanel.js` to `layerRegistry` instead of the `layers` object passed from `src/main.js`

**Checkpoint**: Core and space are components, verification passes, `main.js` no longer owns geometry maths. User stories can now start — US1 and US2 in parallel.

---

## Phase 3: User Story 1 — Design a lighting mood (Priority: P1) 🎯 MVP

**Goal**: Every light becomes an editable fixture; a designer can change colour, intensity, and aim
live, add fixtures, and save and recall named looks.

**Independent Test**: Change a light's colour and intensity, save it as a named look, change the
lighting again, recall the look, and confirm the scene returns to the saved appearance.

- [x] T025 [P] [US1] Create `src/lighting/fixtureTypes.js` (pure) with the `FIXTURE_TYPES` catalogue from `data-model.md` §3.1 — `ambient`, `directional`, `point`, `spot`, `centralBeam`, `wash`, `projector` — plus `defaultsFor`, `paramSchema`, `canCastShadow`
- [x] T026 [P] [US1] Create `src/ui/controls/` primitives — `slider.js`, `colorField.js`, `numberField.js`, `vectorField.js`, `toggle.js`, `namedList.js` — per `contracts/ui-panels.md`. Two files beyond the contract: `dom.js` (internal element/format helpers, not for panels) and `index.js` (barrel). Every primitive returns `{ el, get, set, destroy }`; `set()` is deliberately silent so syncing a panel from state cannot be mistaken for a user edit. Styles live under the `/* Shared control primitives */` block in `src/style.css`
- [x] T027 [US1] Create `src/lighting/fixtureFactory.js` with `createFixtureObjects(ctx, fixture) -> { objects, update(fixture), dispose() }`; `update()` MUST mutate existing Three.js objects in place and never recreate a light (FR-003)
- [x] T028 [US1] Create `src/lighting/lightingRig.js` with `list/get/add/remove/update/applyAll/setMood/tick`, owning the lighting groups and emitting `fixtures:changed`
- [x] T029 [US1] Enforce the shadow budget in `src/lighting/lightingRig.js`, returning a stated reason (FR-008, Constitution V) — **revised**: budgeted in render passes rather than fixture count, because a point light costs 6 passes and a spot costs 1. Soft budget 12 warns, hard ceiling 18 refuses. See `data-model.md` §3.1
- [x] T030 [US1] Adapt `src/lighting/centralLight.js` to the `centralBeam` fixture type — driven through the rig, with `intensity`/`beamScale`/`glowScale` as params. *Partial*: `BEAM_COLOR`/`uColor` are not yet driven from `fixture.color`, and the occupancy pulse is still hard-coded rather than declared as `dynamic: { kind: 'occupancyPulse', amount }`. Remainder folded into T033
- [x] T031 [US1] Migrate the existing lights in `src/main.js` (ambient, key/rim, screen spill, box spill, ceiling lights) into the default fixture inventory in `data-model.md` §3.2, registered through `lightingRig`. Verified numerically identical: housing 0.45×0.12×0.45 at `WALL_H-0.1`, light at `WALL_H-0.2`, `0xffe9a8 @ 1.4, d=8, decay=2`
- [ ] T032 [US1] Add `<div id="inspectorRoot">` to `Index.html` and create `src/ui/inspector.js` rendering fixture, ring, and screen properties on `selection:changed`, preserving today's screen projection-study panel
- [ ] T033 [US1] Extend `src/ui/lightingControls.js` with a fixture `namedList`, an add-fixture type picker, and the `MoodSettings` sliders, remapping the existing ids (`#ltIntensity`, `#ltBeam`, `#ltGlow`, `#ltBloom`, `#fbBrightness`, `#fbWash`, `#scAmbient`, `#scFill`) onto fixtures and mood
- [ ] T034 [US1] Expose `bloomRadius` and `bloomThreshold` in `src/ui/lightingControls.js` and drive `bloomPass.radius` / `bloomPass.threshold` from `MoodSettings` in `src/core/stageContext.js`
- [ ] T035 [US1] Create `src/lighting/looks.js` with `captureLook`, `recallLook(rig, look, { fadeMs }) -> { applied, missing }`, `listLooks`, `deleteLook`; recall must never throw on a missing fixture and must leave untouched any fixture absent from the look
- [ ] T036 [US1] Add the looks `namedList` with save, recall, rename, and delete to `src/ui/lightingControls.js`, surfacing the `missing` report
- [ ] T037 [US1] Add fixture position and aim gizmos in `src/lighting/fixtureFactory.js`, registered through `pickRegistry` with `THREE.DoubleSide` interaction planes, under a new `fixtureGizmos` layer
- [ ] T038 [US1] Validate User Story 1 against `quickstart.md` → Stage 4, including the 60-second timed check (SC-001) and the deleted-fixture recall case

**Checkpoint**: A lighting designer can build and recall moods. This is the MVP.

---

## Phase 4: User Story 2 — Verify space and curtain dimensions live (Priority: P2)

**Goal**: Every dimension an architect needs is reported, tagged confirmed or estimated, and updates
live when the space changes.

**Independent Test**: Record the ring-to-ring distances, change ring growth or gap width, and
confirm every affected measurement updates correspondingly and stays internally consistent.

**Parallel with**: Phase 3 — disjoint files.

- [ ] T039 [P] [US2] Create `src/dimensions/measurements.js` (pure, no Three.js) exporting `computeAllMeasurements`, `computeRingMeasurements`, `computeSpacingMeasurements`, `computeCurtainMeasurements`, `computeClearances`, returning `Measurement` records per `data-model.md` §7
- [ ] T040 [US2] Implement the spacing calculation in `src/dimensions/measurements.js` reporting both the centreline difference and the **clear walkable gap** with a documented, editable fabric-thickness allowance tagged `estimated` (research R6)
- [ ] T041 [US2] Implement the curtain calculation in `src/dimensions/measurements.js` — per-panel arc length and area using each ring's own tapered height, panel count, ring totals, and per-door angular width plus chord width `2r·sin(θ/2)` (research R7)
- [ ] T042 [US2] Implement clearance and warning cases in `src/dimensions/measurements.js` — ring-to-wall distance, quantified overflow when a ring exceeds the room, and an explicit result when a ring has no usable openings; never clamp silently
- [ ] T043 [US2] Apply source inheritance in `src/dimensions/measurements.js` using `units.weakestSource` and `floorplanData.PROVENANCE` so every measurement carries a `source` (FR-014)
- [ ] T044 [P] [US2] Create `scripts/verify-measurements.mjs` asserting the seed set in `research.md` R12 — room 10.12 × 22.34 confirmed, ring 1 Ø6.533 confirmed, wall height estimated, clear gap < centreline difference for every pair, chord width grows with radius, projection study 227° main sweep, 100% `source` coverage, and 20 rings under 100 ms
- [ ] T045 [P] [US2] Create `src/dimensions/schedule.js` (pure) with `toScheduleText` and `toScheduleCsv` (FR-013)
- [ ] T046 [US2] Add `<div id="dimensionsPanelRoot">` to `Index.html` and create `src/ui/dimensionsPanel.js` — a table grouped by measurement group with provenance badges, distinct warning rows, an export button, and a per-row annotation toggle
- [ ] T047 [US2] Create `src/dimensions/measurementOverlay.js` drawing dimension lines and CSS2D labels from `Measurement.anchors`, registered as the new `dimensions` layer
- [ ] T048 [US2] Subscribe `src/ui/dimensionsPanel.js` and `src/dimensions/measurementOverlay.js` to `space:changed` so displayed values refresh within one second with no manual refresh (SC-004)
- [ ] T049 [US2] Validate User Story 2 against `quickstart.md` → Stage 3, headless and in browser

**Checkpoint**: An architect can read and trust every dimension, and see what a change costs.

---

## Phase 5: User Story 3 — Frame and save camera views (Priority: P3)

**Goal**: Repeatable, named viewpoints with safe scripted transitions and a real lens control.

**Independent Test**: Frame a view, save it, move the camera far away, recall it, and confirm the
framing is identical.

- [ ] T050 [US3] Create `src/cameras/cameraController.js` — move the orbit state (`target`, `radius`, `theta`, `phi`) and the drag, shift-pan, and wheel handlers out of `src/main.js` lines 1377–1380 and 1482–1519; expose `getState`, `setState`, `enable`, `disable` (idempotent), `dispose`
- [ ] T051 [US3] Create `src/cameras/cameraModes.js` with a single `createModeRunner(ctx, controller)` whose `run(modeDefinition)` wraps every per-frame step in `try/catch` and guarantees `stop()` — restoring manual control and resetting FOV — on completion, error, or interruption (Constitution III, FR-019)
- [ ] T052 [US3] Port `startWalk`/`stopWalk` (`src/main.js` lines 1382–1450) and `startCentralOrbit` (lines 1452–1480) to `walkMode(route)` and `centralOrbitMode(center)` mode definitions in `src/cameras/cameraModes.js`, deleting the shared `walking` flag
- [ ] T053 [US3] Add `flyToMode(view)` to `src/cameras/cameraModes.js` for interruptible transitions between saved views (FR-017)
- [ ] T054 [US3] Create `src/cameras/views.js` with `saveView`, `recallView`, `listViews`, `deleteView`, `markStale(views, room)` per `data-model.md` §6
- [ ] T055 [US3] Add `<div id="camerasPanelRoot">` to `Index.html` and create `src/ui/camerasPanel.js` — mode buttons, a saved-views `namedList`, a step-through control, stale badges, and an FOV slider showing degrees and the 35 mm equivalent (research R9)
- [ ] T056 [US3] Confirm image save and video recording still route through `stageContext.render()` in every camera mode after the extraction (Constitution II)
- [ ] T057 [US3] Validate User Story 3 against `quickstart.md` → Stage 5, including the forced-error check that manual control is always restored

**Checkpoint**: Moods are shareable because the viewpoint they were designed for is reproducible.

---

## Phase 6: User Story 4 — Work in a discipline-specific view (Priority: P4)

**Goal**: Each collaborator group reaches its relevant view in one action.

**Independent Test**: Choose each discipline preset in turn, confirm visible layers match the
documented set, and confirm manual overrides still work afterwards.

- [ ] T058 [P] [US4] Create `src/layers/disciplinePresets.js` (pure) with the `lighting`, `architecture`, `technical`, and `museum` visibility sets tabulated in `research.md` R11
- [ ] T059 [US4] Add a discipline selector to `src/ui/layersPanel.js` that applies a preset, marks it modified on any manual toggle, and offers a reset (FR-023)
- [ ] T060 [US4] Register the new `dimensions` and `fixtureGizmos` layers in `src/layers/layerRegistry.js` with their domain grouping and per-discipline defaults
- [ ] T061 [US4] Add `<div id="circulationControlsRoot">` to `Index.html` and create `src/ui/circulationControls.js`, moving the circulation buttons and flow slider out of the HTML string currently injected through `initLayersPanel`, preserving the ids `#circPath`, `#circHeat`, `#circFlow`, `#flowRouteSlider`, `#flowPrev`, `#flowNext`, `#ceilingModeBtn`
- [ ] T062 [US4] Validate User Story 4 against `quickstart.md` → Stage 6

**Checkpoint**: Four audiences, one build.

---

## Phase 7: User Story 5 — Save and share a design state (Priority: P5)

**Goal**: A design survives a reload and travels between collaborators as one readable file.

**Independent Test**: Configure space, lights, looks, and views; export; reload with cleared storage;
import; confirm the restored state matches.

- [ ] T063 [P] [US5] Create `src/project/stageDocument.js` (pure) with `SCHEMA_VERSION`, `serialize(state)`, and `deserialize(doc) -> { state, warnings }` per `contracts/stage-document.md`
- [ ] T064 [US5] Implement the degradation table in `src/project/stageDocument.js` — throw only on an unrecognised `schemaVersion`; warn and continue for unknown fixture types, missing look references, stale views, missing params, and invalid colours; reject out-of-order ring radii
- [~] T065 [US5] Create `src/project/autosave.js` writing to `localStorage` key `cortex.stage.autosave.v1` on a 500 ms debounce, restoring before the first frame, and never overwriting an imported document until the user makes a change (FR-025) — **partial, delivered early**: key, debounce, and restore-before-autosave-starts are in place and cover mood, user-placed fixtures, and the screen media descriptor. Blobs go to `src/project/mediaStore.js` (IndexedDB), since `localStorage` is strings only with a ~5 MB quota. Still to do: space, cameras, and layers in the record, and the import interaction (needs T063)
- [ ] T066 [US5] Add `<div id="projectPanelRoot">` to `Index.html` and create `src/ui/projectPanel.js` with export, import, a warning report area, and an unsaved-work confirmation before import
- [ ] T067 [US5] Validate User Story 5 against `quickstart.md` → Stage 7, including the hand-edited unknown fixture type and the `schemaVersion: 99` rejection

**Checkpoint**: The tool is now a collaboration tool.

---

## Phase 8: User Story 6 — Extend the tool without reading everything (Priority: P6)

**Goal**: Any concern resolves to exactly one documented module.

**Independent Test**: Give a developer unfamiliar with the project a small change request; confirm
they locate the owning module from documentation alone, in minutes, without opening `main.js`.

- [ ] T068 [P] [US6] Write `docs/components/space.md`, `docs/components/dimensions.md`, `docs/components/lighting.md`, `docs/components/cameras.md`, and `docs/components/layers.md` from `contracts/components.md`, each covering data, public functions, and side effects
- [ ] T069 [US6] Add the required header comment (responsibility, inputs, outputs, side effects) to every module under `src/core/`, `src/space/`, `src/dimensions/`, `src/lighting/`, `src/cameras/`, `src/layers/`, and `src/project/` (FR-028)
- [ ] T070 [US6] Reduce `src/main.js` to a composition root under 200 lines — context creation, component construction in dependency order, panel wiring, autosave restore, and the render loop only (FR-029)
- [ ] T071 [US6] Audit file sizes with `find src -name '*.js' -exec wc -l {} + | sort -rn`; split any file over 400 lines or record a justified exemption in `docs/components/README.md` (SC-012)
- [ ] T072 [US6] Update the `docs/components/README.md` concern→component table to match the delivered code, and validate against `quickstart.md` → Stage 8

**Checkpoint**: All six user stories complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T073 Run the performance check in `quickstart.md` → Performance: 20 people, 12 user fixtures, dimensions and circulation layers on, 30 seconds of continuous orbit at 30 fps or better (SC-010)
- [ ] T074 Add the transparency and object-count warning that fires before frame rate degrades (Constitution V), surfaced in `src/ui/projectPanel.js`
- [ ] T075 Remove the `src/settings/visualSettings.js` compatibility shim once nothing imports it, folding its state into `src/core/stageModel.js` (research Part C item 3); on completion, delete [BACKLOG B9](../BACKLOG.md#b9--persist-visual-settings-to-localstorage) as resolved
- [ ] T076 [P] Update the handoff comment block at the top of `Index.html` to describe the component structure and remove the now-obsolete "split the monolith" suggestion
- [ ] T077 [P] Resolve research Part C open items — record the fabric-thickness allowance from the technicians and the confirmed ceiling height, or keep both explicitly tagged `estimated` in `src/space/floorplanData.js`
- [ ] T078 Run the complete `quickstart.md` end to end, plus `verify-maze.mjs`, `verify-screen.mjs`, and `verify-measurements.mjs`

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup**: no dependencies; T001 should land before any code task so the gate is honest
- **Phase 2 Foundational**: depends on Phase 1 — **blocks every user story**
- **Phase 3 (US1)** and **Phase 4 (US2)**: both depend only on Phase 2 and touch disjoint files — run in parallel
- **Phase 5 (US3)**: depends on Phase 2; independent of US1 and US2
- **Phase 6 (US4)**: depends on Phase 2; T060 also needs the `dimensions` layer from T047 and the `fixtureGizmos` layer from T037
- **Phase 7 (US5)**: depends on US1 (fixtures and looks), US3 (views), and US4 (layer state) being modelled as data
- **Phase 8 (US6)**: depends on everything it documents
- **Phase 9 Polish**: depends on all desired stories

### Within Phase 2

```
T006, T007 [P] ─┐
                ├→ T008 → T009 → T010 → T011 → T012 ✓
                │
T013, T014 [P] ─┤
                ├→ T015 → T016 → T017 → T020 → T021 → T022 ✓
T018, T019 [P] ─┘
                   T023 [P] → T024
```

T016 depends on T014 (it consumes `ringFabricArcs`). T020 depends on T014 for the same reason —
that shared dependency is the point of the extraction.

### Within Phase 3 (US1)

```
T025, T026 [P] → T027 → T028 → T029
                          ↓
                   T030 → T031 → T032 → T033 → T034
                                          ↓
                                   T035 → T036 → T037 → T038 ✓
```

### Within Phase 4 (US2)

```
T039 → T040, T041, T042, T043 → T044 [P], T045 [P]
                                   ↓
                            T046 → T047 → T048 → T049 ✓
```

### Parallel opportunities

- Phase 1: T002, T003, T004 together
- Phase 2: T006 + T007; then T013 + T014 + T018 + T019 + T023
- **Phases 3 and 4 run fully in parallel** — the biggest scheduling win, roughly a third of the feature
- Phase 5 can start alongside them if a third person is available
- Phase 8: T068 can be written while T069–T071 are in progress

---

## Parallel Example: Phases 3 and 4

```bash
# Developer A — lighting (US1, MVP)
Task: "Create src/lighting/fixtureTypes.js with the FIXTURE_TYPES catalogue"
Task: "Create src/ui/controls/ primitives"

# Developer B — dimensions (US2), simultaneously
Task: "Create src/dimensions/measurements.js as a pure module"
Task: "Create scripts/verify-measurements.mjs with the seed assertions"
```

Neither touches the other's files. The only shared surface is `Index.html` mount points (T032 and
T046), which are additive one-line insertions.

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup — T001 first, so the Constitution Check is honest
2. Phase 2 Foundational — the largest single investment; do not shortcut T012 and T022
3. Phase 3 User Story 1
4. **Stop and validate**: `quickstart.md` Stage 4, including the 60-second timed check
5. Demo — a working lighting designer on top of the existing space

### Incremental delivery

Setup + Foundational → US1 (lighting, demo) → US2 (dimensions, demo to architects) → US3 (cameras)
→ US4 (disciplines) → US5 (sharing) → US6 (documentation). Each adds value without breaking the
previous.

### Risk notes

- **Phase 2 is where this succeeds or fails.** It is a pure refactor with no visible payoff, and the
  temptation to start US1 early is exactly what recreates the monolith. T012 and T022 are the gates.
- **T014 is the keystone.** `ringFabricArcs` feeds the 3D rings, the maze route, the floorplan
  overlay, and all curtain measurements. Getting it pure and correct makes four later tasks small.
- **T016 carries the trap.** The plan-angle to `CylinderGeometry` conversion is the documented
  gotcha in `Index.html`; if curtains render rotated after this task, that conversion is why.
- **T027 is a correctness requirement, not an optimisation.** Recreating lights on every slider
  frame drops shadow maps and produces a visible hitch, which fails FR-003.
- **`projectorA`/`projectorB` are not registered yet.** The `projector` type exists in the
  catalogue and contributes no illumination, but the throw cones are still owned by
  `screenAssembly`. Register them when the inspector needs projectors to be selectable (T032).

## Notes

- `[P]` means different files with no incomplete dependency
- Commit after each task or logical group; every task should leave `dev` runnable
- Run `verify-maze.mjs` and `verify-screen.mjs` after every Phase 2 task, not just at the gates
- Preserve every DOM id listed in `contracts/ui-panels.md` → Preserved DOM contract, or update the
  verification scripts in the same commit
- Ideas deliberately left out of this feature are parked in [BACKLOG.md](../BACKLOG.md) with the
  reason and the trigger for revisiting. Two are worth knowing while you work: **B4** (bind the
  walkthrough to the selected flow route) becomes nearly free once T052 lands, and **B5** (DMX and
  real fixture profiles) is why the `Fixture` record reserves a `dmx` field it does not yet use
