# Tasks: 3D Humanoid People

**Input**: Design documents from `/specs/001-3d-humanoid-people/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/people-api.md

**Tests**: Manual validation per quickstart.md (no automated test tasks)

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Vite + Three.js npm foundation and asset directory

- [x] T001 Create `package.json` with `three`, `vite` dependencies and scripts `dev`, `build`, `preview` in repository root
- [x] T002 [P] Create `vite.config.js` with `base: './'` for GitHub Pages relative asset paths in repository root
- [x] T003 [P] Create `public/models/` directory and add CC0 `humanoid-lowpoly.glb` asset per research.md R2
- [x] T004 Add `public/models/README.md` documenting asset source, license (CC0), and triangle count in `public/models/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Vite entry migration and GLTF loader — MUST complete before people replacement

**⚠️ CRITICAL**: No user story work until this phase is complete

- [x] T005 Scaffold Vite entry: slim `index.html` shell importing `src/main.js`; move existing inline script/CSS into `src/main.js` (or minimal split) preserving render loop and GIF hook intact
- [x] T006 Implement `src/people/modelLoader.js` — singleton GLTFLoader, load `public/models/humanoid-lowpoly.glb`, export `loadHumanoidTemplate()` and `isHumanoidReady()` per contracts/people-api.md
- [x] T007 Wire async model preload in `src/main.js` bootstrap with console/user-visible error if load fails (scene still usable)
- [x] T008 Verify `npm run dev` serves scene with all existing features working (rings, cameras, GIF) before people swap — regression gate

**Checkpoint**: Foundation ready — Vite dev runs, model loads, legacy sprites still in place

---

## Phase 3: User Story 1 - Place and Remove 3D People (Priority: P1) 🎯 MVP

**Goal**: Click floor to add 3D humanoid; click person to remove; volumetric from all angles

**Independent Test**: VS-1 in quickstart.md

### Implementation for User Story 1

- [x] T009 [P] [US1] Implement `src/people/personFactory.js` — `createPersonMesh()` cloning cached template with default adult scale; `placePersonOnFloor()` using Box3 ground alignment in `src/people/personFactory.js`
- [x] T010 [US1] Implement `src/people/peopleManager.js` — `addPersonAtPoint`, `removePerson`, `getPeopleCount`, `getPersonRaycastRoots` with disc boundary check in `src/people/peopleManager.js`
- [x] T011 [US1] Replace `createPersonSprite` / sprite usage in click flow: `addDotAtPoint` → `addPersonAtPoint`; `removeDot` → `removePerson` in `src/main.js` (or extracted interaction module)
- [x] T012 [US1] Ensure person `THREE.Group` roots use `userData.kind='person'` and register/deregister in `raycastTargets` in `src/people/peopleManager.js`
- [x] T013 [US1] Remove dead sprite code: `createPersonSilhouetteTexture`, `createPersonSprite`, `THREE.SpriteMaterial` imports in `src/main.js`
- [x] T014 [US1] Run quickstart VS-1 validation and fix ground alignment or raycast misses

**Checkpoint**: US1 complete — add/remove 3D people works; MVP demoable

---

## Phase 4: User Story 2 - Varied Age and Build Appearance (Priority: P2)

**Goal**: Port age/build randomization from legacy `createPersonSprite()` logic

**Independent Test**: VS-2 in quickstart.md

### Implementation for User Story 2

- [x] T015 [US2] Port age band random roll (15/10/75%) and height ranges to `createPersonMesh()` in `src/people/personFactory.js`
- [x] T016 [US2] Port build variant random roll (50% broad / 50% narrow) via non-uniform X/Z scale in `src/people/personFactory.js`
- [x] T017 [P] [US2] Add optional subtle material hue variation for visual diversity in `src/people/personFactory.js`
- [x] T018 [US2] Store `ageBand`, `buildVariant`, `heightM` on `userData` for debugging/tooltips in `src/people/personFactory.js`
- [x] T019 [US2] Run quickstart VS-2 — confirm 10-person sample shows height and build diversity

**Checkpoint**: US2 complete — randomized appearance matches legacy behavior

---

## Phase 5: User Story 3 - Bulk Occupancy Controls (Priority: P3)

**Goal**: Panel "Set" and "Clear all" work with 3D figures; perf acceptable at 20 people

**Independent Test**: VS-3 and VS-4 in quickstart.md

### Implementation for User Story 3

- [x] T020 [US3] Wire `#setOccupancy` handler to `setOccupancy(targetN)` in `src/people/peopleManager.js`
- [x] T021 [US3] Wire `#clearPeople` handler to `clearAllPeople()` in `src/people/peopleManager.js`
- [x] T022 [US3] Verify `updateOccupancyUI()` and glow light occupancy factor still use `getPeopleCount()` in `src/main.js`
- [x] T023 [US3] Performance check: 20 people + default rings/heatmap — orbit remains responsive; document mesh count in plan if tuning needed
- [x] T024 [US3] Run quickstart VS-3 and VS-4 (bulk, boundary, GIF, camera modes)

**Checkpoint**: All user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Deploy path, docs, branch hygiene

- [x] T025 [P] Add GitHub Actions workflow `.github/workflows/deploy-pages.yml` — build Vite `dist/` and deploy to GitHub Pages on `main` push
- [x] T026 [P] Update root `README.md` with npm install/dev/build instructions and note constitution build-step change
- [x] T027 Run `npm run build` + serve `dist/` — repeat VS-1 smoke test per quickstart.md
- [x] T028 Add `.gitignore` entries for `node_modules/`, `dist/` if not present in repository root
- [x] T029 Commit spec artifacts and implementation on `dev`; hold merge to `main` until user approval after review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 — MVP
- **US2 (Phase 4)**: Depends on Phase 3 (needs createPersonMesh pipeline)
- **US3 (Phase 5)**: Depends on Phase 3 (needs peopleManager); perf check after US2 recommended
- **Polish (Phase 6)**: Depends on Phase 5 completion

### User Story Dependencies

- **US1 (P1)**: Foundational only — no dependency on US2/US3
- **US2 (P2)**: Extends US1 factory — independently testable via bulk add
- **US3 (P3)**: Uses US1 manager — independently testable via panel only

### Parallel Opportunities

- T002 + T003 + T004 can run parallel after T001
- T009 + T017 can run parallel (different files) once Phase 2 done
- T025 + T026 parallel in Polish phase

---

## Parallel Example: Phase 1

```bash
# After T001 completes, launch in parallel:
Task T002: vite.config.js
Task T003: public/models/humanoid-lowpoly.glb
Task T004: public/models/README.md
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (Vite migration + model load)
3. Complete Phase 3: US1 — 3D add/remove
4. **STOP and VALIDATE**: quickstart VS-1
5. Demo to user before US2/US3

### Incremental Delivery

1. Setup + Foundational → dev server works
2. US1 → 3D people MVP
3. US2 → randomization parity
4. US3 → bulk + perf validation
5. Polish → Pages deploy pipeline

---

## Summary

| Metric | Value |
|--------|-------|
| **Total tasks** | 29 |
| **US1 tasks** | 6 (T009–T014) |
| **US2 tasks** | 5 (T015–T019) |
| **US3 tasks** | 5 (T020–T024) |
| **Suggested MVP scope** | Phase 1–3 (T001–T014) |
| **Parallel opportunities** | 8 tasks marked [P] |

**Format validation**: All tasks use `- [x] Tnnn [P?] [USn?] Description with file path` format.
