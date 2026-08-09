# Tasks: Screen Regrouping, Real Dimensions & Projection Study

**Input**: Design documents from `/specs/003-screen-real-dimensions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-layers.md, quickstart.md

**Tests**: Not requested as TDD. Validation via quickstart.md scenarios and extending `scripts/verify-maze.mjs` (SC-005); included as polish / story-check tasks.

**Organization**: Tasks are grouped by user story. US1 (real scale + screen/curtain grouping) is the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete work)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

## Path Conventions

Single-project Vite app at repository root: `src/`, `public/`, `Index.html`, `scripts/` (per plan.md).

---

## Phase 1: Setup

**Purpose**: Confirm baseline and drawing inputs before changing scale

- [x] T001 Verify baseline: `npm run dev` loads, current dims show ~13.77×30.39 m / ~418 m², screen hangs on Ø6.533 ring, `node .tmp/fit-floorplan2.mjs` runs and prints scale ≈29.93 u/m — no product file changes
- [x] T002 [P] Confirm `public/floorplan2.svg` is present and matches research.md class map (st8 screen, st9 dashed rings, st6 technical); note missing `content-1.png` / `content-2.png` for the technical-layer note later

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Recalibrate shared geometry constants and UI defaults so every story builds on the true metre space

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Rewrite scale and room anchors in `src/floorplan.js` per research.md R1/R6: `unitsPerMeter = 29.928`, `url = '/floorplan2.svg'`, updated `center` / `roomMidX` / `roomTopY` / `panelViewBox`, `ROOM_M = { width: 10.12, depth: 22.34 }`, `CENTER_M` ≈ `{ x: 0.08, z: 6.69 }`, recalibrated `DOOR_M`, `BOX_X_M`, `SPRINKLER_Z_M`
- [x] T004 Export `SCREEN` and `TECHNICAL` stubs in `src/floorplan.js` from data-model.md (screen center/outer/face/height/arcs; niches, ducts, booth, corridor sizes/positions) so US1–US3 import the same constants — values from research.md R2/R5; curtains stay in `PLAN_RINGS` only
- [x] T005 Re-derive `PLAN_RINGS` in `src/floorplan.js` at the new scale (research.md R3): ring 1 confirmed r=3.267 (Ø6.533); merge wobble pairs; door angles from solid-arc gaps; **do not** include the Ø4.8 screen circle as a curtain
- [x] T006 Update default metre inputs and `#dims` copy in `Index.html` to match `src/floorplan.js` (door, offX/offZ, boxX, room area/width/depth, ring count) so stale oversized defaults cannot place objects outside the room (contracts/ui-layers.md)

**Checkpoint**: Constants + HTML defaults agree at ~226 m² scale — story work can start

---

## Phase 3: User Story 1 - Screen & Curtains Grouped at Real Scale (Priority: P1) 🎯 MVP

**Goal**: True room/screen/ring dimensions; innermost circle is a selectable projection screen (two arcs), separate from curtain ring 1 (Ø6.533).

**Independent Test**: Quickstart SC-001 + SC-002 — dims show ~10.1×22.3 m / ~226 m² / screen Ø4.80; toggling Projection screen hides two arcs while Ø6.533 curtain remains; clicking screen selects screen dimensions, not ring controls.

### Implementation for User Story 1

- [x] T007 [US1] Wire imports of `SCREEN` (and updated floorplan constants) in `src/main.js`; initialize `circleCenter` / `doorPos` / `boxPos` from recalibrated exports; keep `RING_RADII` sourced only from `PLAN_RINGS`
- [x] T008 [US1] Replace `buildScreen()` in `src/main.js`: build **two** cylinder-arc meshes from `SCREEN.arcs` at `SCREEN.center` using face/outer radii and height; apply the same CylinderGeometry world-angle conversion as curtains (`θ = π/2 − (a+len)`); remove logic that parents the screen to the Ø6.533 ring index
- [x] T009 [US1] Ensure curtain path in `buildRings()` in `src/main.js` never fabricates the Ø4.8 circle; central floor marker may stay Ø4.8 under the screen but must not be labeled as a curtain ring; `CONFIRMED_RADII` keeps 3.267 only
- [x] T010 [US1] Selection + layer contract for screen in `src/main.js` / `Index.html`: `userData.kind === 'screen'` reports outer Ø, face Ø, height, per-arc sweep/length; Layers → Projection screen toggles only `gScreen` (contracts/ui-layers.md); curtain toggle does not hide screen
- [x] T011 [US1] Update `#dims` live text / handoff notes in `Index.html` for recalibrated room + screen grouping; smoke-check orbit and plan view still render

**Checkpoint**: MVP — real scale + correct screen/curtain grouping, demoable without projector study or technical layer

---

## Phase 4: User Story 2 - Projection Surface & Projector Count Study (Priority: P1)

**Goal**: Compute and display projection metrics from real face dimensions; recommend two blended projectors; show two aimed projectors + blend zone in 3D.

**Independent Test**: Quickstart SC-003 — study reports ~9.3 m main arc, area @2.4 m, two-projector verdict; scene shows exactly two projector models with blend overlap on the main arc.

### Implementation for User Story 2

- [x] T012 [US2] Add `computeProjectionStudy(screen)` helper (pure function) in `src/floorplan.js` or small `src/screen/projectionStudy.js`: arc lengths, main area, chord, sagitta, max single coverage (~127°), blend overlap, `recommendedCount` / verdict per research.md R4 and data-model.md ProjectionStudy
- [x] T013 [US2] Surface study numbers in the screen selection panel (and optional short “Projection study” block) in `src/main.js` / `Index.html` — explicit one-vs-two sentence; recompute if screen height is exposed as editable
- [x] T014 [US2] Rebuild projector visualization in `buildScreen()` in `src/main.js`: **two** ceiling-mounted projector models aimed at left/right thirds of the main 227° arc; translucent blend-overlap marker (~8–10°); hide with screen layer; keep central light as sole shadow caster
- [x] T015 [US2] Align screen spill / deep-space material to the two-arc screen (not the old single arc on ring 1) in `src/main.js`

**Checkpoint**: Equipment planning answer is visible in UI and matched in 3D

---

## Phase 5: User Story 3 - Technical / Ventilation Layer (Priority: P2)

**Goal**: Toggleable technical layer showing niches, ducts, booth, and entrance corridor at drawn metres in 3D and the live floorplan.

**Independent Test**: Quickstart SC-004 — layer on shows 4 niches + 4 ducts + booth + corridor helpers; off removes them from both views; vector-only limitation noted.

### Implementation for User Story 3

- [x] T016 [US3] Add `gTechnical` group + layer wiring in `src/main.js` and a “Technical / ventilation” checkbox in `Index.html` Layers section (contracts/ui-layers.md `technical` id)
- [x] T017 [US3] Implement `buildTechnical()` in `src/main.js` from `TECHNICAL` in `src/floorplan.js`: 4 left niches, 4 right Ø0.31 m ducts, booth box, entrance corridor helpers; selectable or hoverable with dimensions; mesh budget ≤ ~12 (Constitution V)
- [x] T018 [US3] Draw the same technical elements into the live floorplan overlay in `src/main.js` when the technical layer is on; add short vector-only note (missing content-*.png) in the panel title or dims footer

**Checkpoint**: Installation planning layer works independently of projector study visuals

---

## Phase 6: User Story 4 - Live Floorplan Uses New Drawing (Priority: P3)

**Goal**: X-panel underlay is `floorplan2.svg` in recalibrated metre space; live screen overlay is distinct from curtains and registers with drawn arcs.

**Independent Test**: Quickstart SC-006 — underlay is floorplan2; live screen arcs coincide with st8; curtain ring 1 with Ø6.533; SVG download still works.

### Implementation for User Story 4

- [x] T019 [US4] Point floorplan panel underlay at `FLOORPLAN_SVG.url` (`/floorplan2.svg`) with recalibrated transform in `src/main.js` `initFloorplanPanel()` (already driven by constants from T003 — verify registration visually)
- [x] T020 [US4] Extend `updateFloorplanOverlay()` in `src/main.js`: draw screen as its own two-arc group (distinct stroke from curtain red); clicking screen selects screen / does not flash a curtain `ringrow`; dims footer includes screen Ø
- [x] T021 [US4] Confirm Download SVG and underlay toggle still work after overlay changes in `src/main.js`

**Checkpoint**: Live plan and architect drawing compare at true scale

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regression gates and handoff clarity across all stories

- [x] T022 Run `node scripts/verify-maze.mjs` at the new scale (SC-005); if failures, apply **minimal** trim/clearance or retry tweaks in `src/main.js` / `src/maze/route.js` only — no algorithm rewrite unless required
- [x] T023 [P] Update handoff notes in `Index.html` for floorplan2 scale, screen≠ring, two-projector study, technical layer, and the CylinderGeometry angle gotcha (still valid for screen arcs)
- [x] T024 Smoke quickstart.md: orbit / plan / walk / central / video record / add person / X panel — fix any regressions in `src/main.js`
- [x] T025 [P] Optional: add `scripts/verify-screen.mjs` (Playwright) asserting dims text, screen layer independence, and projector count === 2 — only if it speeds SC-001…SC-003 re-checks

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After US1 (needs two-arc screen + `SCREEN` entity)
- **US3 (Phase 5)**: After Foundational; can proceed in parallel with US2 once T003–T006 done (same `main.js` — serialize if one agent)
- **US4 (Phase 6)**: After US1 (needs screen overlay data); best after US3 if technical overlay is in scope for the same panel pass
- **Polish (Phase 7)**: After desired stories complete

### User Story Dependencies

| Story | Depends on | Independently testable? |
|-------|------------|-------------------------|
| US1 | Foundational | Yes (MVP) |
| US2 | US1 screen mesh API | Yes (study + two projectors) |
| US3 | Foundational (`TECHNICAL`) | Yes (layer toggle) |
| US4 | US1 (+ US3 for technical marks) | Yes (X-panel registration) |

### Parallel Opportunities

- T001 ∥ T002 (Setup)
- After Foundational: US3 can start while US2 is in progress **only if** different owners / careful `main.js` merge; single agent → US1 → US2 → US3 → US4
- T023 ∥ T025 in Polish

### Parallel Example: After Foundational

```bash
# Single agent (recommended — heavy main.js touch):
# US1 → US2 → US3 → US4 → Polish

# Two agents (coordinate main.js):
Agent A: T007–T011 (US1) then T012–T015 (US2)
Agent B: wait for T003–T006, then T016–T018 (US3) on a branch; merge before T019–T021
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational (constants + HTML defaults)  
3. Phase 3 US1 (screen regroup + real scale)  
4. **STOP** — validate SC-001 / SC-002  
5. Demo true room + screen vs curtains  

### Incremental Delivery

1. Setup + Foundational → metre space ready  
2. US1 → real scale + grouping (MVP)  
3. US2 → projector study + two projectors  
4. US3 → technical layer  
5. US4 → floorplan2 registration polish  
6. Polish → maze 10/10 + smoke  

### Notes

- Do not reintroduce 3D dashed door markers or gate-post tubes  
- Preserve `renderFrame()` / video capture hook  
- Screen and curtains may use different centers (research.md R3)  
- Prefer labeled Ø4.800 / 4.695 for reported dimensions; fitted center for placement  
