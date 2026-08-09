# Tasks: Central Light Realism & Maze Path Reliability

**Status**: ✅ Complete — all 24 tasks delivered.

> **Stale references, kept for the historical record.** Tasks T001, T003, T012, and T019 verify
> **GIF recording** via gif.js. That subsystem was later replaced by `MediaRecorder` video capture
> (`captureVideoFrame()`), so those acceptance steps can no longer be re-run as written. The
> tasks were valid when completed and are **not** being unchecked — but if you re-validate this
> feature, substitute the video capture path.
>
> The same substitution is pending in two other places: Constitution Principle II still names
> `captureGifFrame()` (fixed by 005 task T001), and `research.md` R1 gates the WebGPU re-evaluation
> on GIF capture working (see [BACKLOG B1](../BACKLOG.md#b1--webgpu-migration)).
>
> Tasks T020 and T024 refer to `index.html`. The working tree now shows `Index.html`, but git still
> tracks it as lowercase `index.html` — macOS's case-insensitive filesystem hid the rename. Harmless
> here (a site root wants the lowercase name anyway), but worth knowing before anyone "fixes" the
> casing on a case-sensitive host.

**Input**: Design documents from `/specs/002-light-realism-maze-fix/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-controls.md, quickstart.md

**Tests**: Not requested as TDD; validation is via the quickstart scenarios and a headless verification script (research.md R5), included as tasks below.

**Organization**: Tasks are grouped by user story. US1 (maze reliability) is the MVP and is deliverable independently of the lighting work.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single-project Vite app at repository root: `src/`, `scripts/`, `index.html` (per plan.md structure).

---

## Phase 1: Setup

**Purpose**: Baseline guard before touching the render loop or route code

- [x] T001 Verify baseline: `npm run dev` renders, `npm run build` exits 0, GIF recording works in orbit mode, and "Generate new maze & walk it" runs (note current clipping defects for before/after comparison) — no file changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: One shared render entry point — required by US2 (composer) and touched by US1 (walk mode renders); doing this first prevents both stories colliding in `src/main.js`

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Consolidate all render calls into a single `renderFrame()` in `src/main.js`: main animate loop, `startWalk` step, `startCentralOrbit` step, and the Save-image button all call it; it renders scene + CSS2D labels; the `captureGifFrame()` hook keeps reading the visible canvas every main-loop frame (Constitution II)
- [x] T003 Re-verify GIF capture in all four camera modes (orbit, plan, walk, central) after render consolidation, plus Save image — quickstart V4 smoke pass on `src/main.js` changes

**Checkpoint**: Foundation ready — user story phases can start

---

## Phase 3: User Story 1 - Reliable Maze Walkthrough (Priority: P1) 🎯 MVP

**Goal**: Every generated maze produces a walkthrough that threads each ring opening, stays inside the room, never clips curtain fabric, and terminates cleanly at the center.

**Independent Test**: Quickstart V1 — click "Generate new maze & walk it" 10×; every run completes with zero clipping and controls restored (SC-001, SC-002).

### Implementation for User Story 1

- [x] T004 [US1] Extract route computation into new `src/maze/route.js` as pure functions of `(ringRadii, openings, gapDeg, circleCenter, isInsideRoomXZ, clampPointToRoom)` — move `computeMazeRoutePolar()` + polar→world mapping out of `src/main.js`, wire `buildCirculation()` and `computeWalkCurve()` to the new module, no behavior change yet
- [x] T005 [US1] Fix degenerate final segment (research.md R4 defect 3) in `src/maze/route.js`: deduplicate consecutive points (ε = 1 cm) and replace the six identical inner points with 2–3 distinct waypoints from ring-0 opening to center (kills NaN/jerk at walk end)
- [x] T006 [US1] Add radial guard points before/after each opening pass (R4 defect 1) in `src/maze/route.js` so the Catmull-Rom tangent is radial through every gap and the spline cannot bulge into adjacent fabric
- [x] T007 [US1] Clamp corridor arcs in polar space per angle sample (R4 defect 2) in `src/maze/route.js`: when a corridor sample falls outside the room, shrink its radius toward the inner ring (+0.15 m margin) until inside — never hand wall-clamped shortcuts to the spline
- [x] T008 [US1] Per-ring opening selection (R4 defect 4) in `src/maze/route.js`: route targets the first opening whose world position is inside the room, falling back to the nearest inside-the-room angle; slider values never rewritten (contracts/ui-controls.md)
- [x] T009 [US1] Implement `validateRoute(route)` (R4 defect 5) in `src/maze/route.js`: sample ≥200 curve points; assert inside-room (margin 0.05 m), angular clearance from fabric arcs at each ring radius (tolerance 2°), strict ring order, no NaN — per data-model.md MazeRoute rules
- [x] T010 [US1] Wire bounded retry into `genMaze` handler in `src/main.js`: regenerate openings until `validateRoute` passes (max 10 attempts, then keep best attempt + console warning); clicking during an active walkthrough calls `stopWalk()` first (Camera Mode Safety preserved)
- [x] T011 [US1] Confirm circulation "Path" drawing and walkthrough camera consume the identical computed route object (FR-006) in `src/main.js` — single `MazeRoute` source of truth per data-model.md
- [x] T012 [US1] Write headless verification script `scripts/verify-maze.mjs` (Playwright, dev-time): loads dev server, clicks genMaze 10×, asserts `validateRoute` result 10/10 and clean walk termination — automates quickstart V1 (SC-001, SC-002); run it and fix any failures

**Checkpoint**: Maze walkthrough is reliable — MVP deliverable, demoable independently of lighting

---

## Phase 4: User Story 2 - Realistic Central Light (Priority: P2)

**Goal**: The central light reads as a soft glowing beam with physical falloff and soft shadows, pulse still driven by occupancy.

**Independent Test**: Quickstart V2 + V3 — at occupancy 6, glow/halo visible, people lit with falloff and casting soft shadows; ≥50 fps at 6 people, ≥30 fps at 60 (SC-003, SC-004).

### Implementation for User Story 2

- [x] T013 [US2] Create `src/lighting/centralLight.js` rig: move beam mesh, base glow, and `glowLight` out of `buildRig()` in `src/main.js`; expose `update(t, occupancyFactor)` preserving the current pulse formulas verbatim (data-model.md CentralLightRig contract)
- [x] T014 [US2] Soft-edge beam visual in `src/lighting/centralLight.js`: radial-gradient additive material for the beam cylinder (soft edges, no hard silhouette) and upgraded additive base-glow sprite (research.md R3)
- [x] T015 [US2] Physical falloff in `src/lighting/centralLight.js`: PointLight `decay = 2`, position raised to ~1.6 m mid-beam, distance/intensity tuned so the Ø4.8 m floor and first rings are visibly lit (FR-008)
- [x] T016 [US2] Enable shadows in `src/main.js`: `renderer.shadowMap.enabled = true` + `PCFSoftShadowMap`; central PointLight `castShadow` with 1024 map and `shadow.camera.far ≈ 10`; floor and ring fabric meshes `receiveShadow = true`; key/rim lights stay shadowless (research.md R3 budget)
- [x] T017 [P] [US2] People shadow flags in `src/people/modelLoader.js`: one traverse at template load setting `castShadow = true` / `receiveShadow = true` on character meshes (FR-009)
- [x] T018 [US2] Bloom pipeline in `src/main.js`: `EffectComposer` (RenderPass → UnrealBloomPass → OutputPass) inside `renderFrame()`; threshold tuned so only emissive lights bloom; bloom strength modulated by `occupancyFactor`; `composer.setSize()` added to the resize handler (research.md R2, Constitution II)
- [x] T019 [US2] Validate and tune: quickstart V2 (visual), V3 (fps at occupancy 6 and 60 — drop shadow map to 512 if under budget), V4 (GIF capture in all four modes shows bloomed lighting, Save image captures post-processed frame) — fix regressions found

**Checkpoint**: Central light realism complete; US1 and US2 both independently functional

---

## Phase 5: User Story 3 - Rendering Platform Decision & Material Groundwork (Priority: P3)

**Goal**: Renderer decision (defer WebGPU) is documented, discoverable, and the shipped demo renders on all three major browsers.

**Independent Test**: Quickstart V5 + V6 — research.md R1 answers decision/rationale/re-evaluation triggers; built site renders correctly in current Chrome, Firefox, Safari (SC-005, SC-007).

### Implementation for User Story 3

- [x] T020 [P] [US3] Verify research.md R1 satisfies SC-007 (decision, rationale, four re-evaluation triggers) and add a short "Renderer: WebGL (Stage 1) — WebGPU deferred, see specs/002-light-realism-maze-fix/research.md" note to the handoff comment block in `index.html`
- [x] T021 [US3] Cross-browser validation: `npm run build && npm run preview`; open in current Chrome, Firefox, and Safari; verify scene, bloom, shadows, and maze walkthrough render correctly in all three (quickstart V5, SC-005) — document results in `specs/002-light-realism-maze-fix/quickstart.md` notes

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, docs, and full validation sweep

- [x] T022 [P] Remove dead route/lighting code and stale comments from `src/main.js` after extractions; keep handoff comments accurate
- [x] T023 Run full quickstart validation V1–V6 end-to-end on the built site; record pass/fail per scenario in `specs/002-light-realism-maze-fix/quickstart.md`
- [x] T024 Update handoff notes in `index.html` (maze route module, lighting rig, renderFrame/composer contract, shadow budget) so the known-limitations block reflects the new architecture

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on T001 — BLOCKS all user stories (render-loop consolidation)
- **US1 (Phase 3)**: Depends on Phase 2. Sequential within story: T004 → T005–T008 (all edit `src/maze/route.js`, ordered) → T009 → T010 → T011 → T012
- **US2 (Phase 4)**: Depends on Phase 2 (composer hooks into `renderFrame()`). Independent of US1. T013 → T014/T015 → T016; T017 [P] anytime; T018 after T013–T016; T019 last
- **US3 (Phase 5)**: T020 [P] anytime (docs only); T021 after US2 (validates shipped lighting) — or after US1 alone if shipping MVP first
- **Polish (Phase 6)**: After desired stories complete

### User Story Dependencies

- **US1 (P1)**: Independent — MVP
- **US2 (P2)**: Independent of US1 (different modules; both consume Phase 2's `renderFrame()`)
- **US3 (P3)**: T020 independent; T021 validates whatever is being shipped

### Parallel Opportunities

- T017 (people shadow flags, `src/people/modelLoader.js`) parallel with anything
- T020 (docs note, `index.html` comment) parallel with anything
- After Phase 2: US1 (Phase 3, `src/maze/route.js`) and US2 (Phase 4, `src/lighting/centralLight.js`) can proceed in parallel — different modules, `src/main.js` wiring touchpoints are distinct (genMaze handler vs. buildRig/composer)
- T022 parallel with T023 within Polish

## Parallel Example: after Phase 2 completes

```bash
# Stream A (maze):    T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012
# Stream B (light):   T013 → T014 → T015 → T016 → T018 → T019
# Anytime:            T017, T020
```

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (T001) → Phase 2 (T002–T003)
2. Phase 3 (T004–T012): maze reliability
3. **STOP and VALIDATE**: quickstart V1 (10-run loop) — demoable fix, mergeable to `main` on its own
4. Then Phase 4 (lighting), Phase 5, Phase 6

### Incremental Delivery

- Each checkpoint is independently shippable to `main` (Constitution VI: merge only validated states)
- US1 fixes a live defect → highest merge priority; US2 is the visual upgrade; US3 is documentation + cross-browser sign-off

## Notes

- All `src/maze/route.js` tasks are sequential (same file); same for `src/lighting/centralLight.js`
- Constitution guards to respect while implementing: `renderFrame()` must keep the GIF hook (II); `startWalk` try/catch + `stopWalk()` pattern untouched (III); exactly one shadow-casting light (V); confirmed dimensions untouched (VII)
- Commit after each task or logical group; user review gate applies before `/speckit-implement`
