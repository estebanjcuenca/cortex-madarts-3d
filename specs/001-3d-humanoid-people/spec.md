# Feature Specification: 3D Humanoid People

**Feature Branch**: `001-3d-humanoid-people`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Replace the 2D billboarded sprite people with real 3D humanoid figures with accurate proportions, using THREE.GLTFLoader and a free low-poly rigged human model, while preserving the existing click-to-add/click-to-remove interaction and the age/build randomization currently done via canvas-drawn silhouettes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Place and Remove 3D People (Priority: P1)

A visitor exploring the CORTEX central floor wants to populate the space with
realistic standing figures to simulate occupancy. They click the central circular
floor to add a person at that location, and click an existing person to remove them.
The interaction must feel identical to today: immediate visual feedback, no mode
switch required beyond normal navigation.

**Why this priority**: Click-to-add/remove is the core occupancy simulation workflow.
Without it, the feature delivers no user value regardless of visual quality.

**Independent Test**: Open the visualization, click three different points on the
central floor, confirm three distinct 3D figures appear standing on the floor.
Click each figure in turn and confirm all are removed. Occupancy count in the UI
updates correctly throughout.

**Acceptance Scenarios**:

1. **Given** the central floor is visible and no person is selected for removal,
   **When** the user clicks a point inside the central disc,
   **Then** a 3D humanoid figure appears standing at that point with feet on the floor.

2. **Given** at least one person exists in the scene,
   **When** the user clicks directly on a person figure,
   **Then** that person is removed and the occupancy count decreases by one.

3. **Given** a person exists in the scene,
   **When** the user orbits or walks the camera around the figure,
   **Then** the figure reads as a volumetric 3D body from all viewing angles (not a
   flat billboard).

---

### User Story 2 - Varied Age and Build Appearance (Priority: P2)

A visitor adding multiple people expects visual diversity representing different ages
and body builds — similar to today's randomized silhouettes (children, teens, adults;
broader vs. narrower builds). Each newly placed person should look distinct without
manual configuration.

**Why this priority**: Randomized variation is established behavior and supports
realistic crowd simulation demos. It depends on US1 (placing people) but is
 independently demonstrable once placement works.

**Independent Test**: Add 10 people via random occupancy or repeated floor clicks.
Verify the set includes visible height variation (child through adult range) and
at least two distinguishable build/proportion variants.

**Acceptance Scenarios**:

1. **Given** the user adds a new person,
   **When** the figure appears,
   **Then** its height falls within one of three age bands: child (~0.9–1.25 m),
   teen (~1.35–1.6 m), or adult (~1.55–1.9 m) — matching today's probability mix
   (~15% child, ~10% teen, ~75% adult).

2. **Given** multiple people are added,
   **When** viewed together,
   **Then** figures show at least two build variants (e.g., broader vs. narrower
   shoulder/hip proportions) derived from randomization, not identical clones.

3. **Given** a person is placed,
   **When** inspected from orbit view,
   **Then** proportions look humanoid and anatomically plausible at low-poly fidelity
   (head, torso, limbs recognizable; not stretched or flattened).

---

### User Story 3 - Bulk Occupancy Controls (Priority: P3)

A visitor using the "People in central space" panel wants bulk operations (set target
occupancy, clear all) to work with 3D figures exactly as they do today with sprites.

**Why this priority**: Panel controls are secondary to direct click interaction but
required for parity with existing demo workflows.

**Independent Test**: Set occupancy target to 20 via the panel, confirm 20 3D figures
appear within the central disc. Click "Clear all" and confirm zero figures remain.

**Acceptance Scenarios**:

1. **Given** the occupancy target field is set to N (0–60),
   **When** the user clicks "Set",
   **Then** exactly N 3D people appear at random valid positions within the central
   disc and previous people are replaced.

2. **Given** people exist in the scene,
   **When** the user clicks "Clear all",
   **Then** all people are removed and occupancy reads 0.

3. **Given** many people are placed (up to 60),
   **When** the user orbits the scene,
   **Then** interaction remains responsive (no permanently stuck orbit controls).

---

### Edge Cases

- Click on central floor **outside** the disc boundary: no person added (unchanged).
- Click person while other scene elements overlap in screen space: nearest raycast hit
  wins — person removal only when the person mesh is the top hit.
- Rapid repeated clicks on floor: each valid click adds a separate person; no duplicate
  at exact same point required.
- Model asset fails to load (network error): user sees a clear error or graceful
  fallback; scene remains usable for non-people features.
- GIF recording with 3D people visible: recording still captures all camera modes
  without breaking the render loop hook.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render each person as a 3D humanoid mesh visible from all
  camera angles, replacing 2D billboard sprites.
- **FR-002**: System MUST preserve click-on-floor → add person at hit point within
  the central disc (Ø4.8 m).
- **FR-003**: System MUST preserve click-on-person → remove that person.
- **FR-004**: System MUST update the occupancy readout when people are added or removed.
- **FR-005**: System MUST randomize each new person's height using the existing age
  band distribution (child / teen / adult probability mix).
- **FR-006**: System MUST randomize each new person's build/proportion variant (at
  least two variants) analogous to current shoulder/hip silhouette variation.
- **FR-007**: System MUST support "Set" occupancy target (0–60) and "Clear all"
  panel actions with 3D figures.
- **FR-008**: System MUST position each figure with feet on the floor plane (Y aligned
  to ground contact, not floating or sunken).
- **FR-009**: System MUST keep person objects in the raycast target list so click-to-
  remove continues to work.
- **FR-010**: System MUST NOT regress ceiling-light placement, ring selection, GIF
  recording, or scripted camera modes.

### Key Entities

- **Person**: A placed humanoid figure in the central disc; attributes include world
  position, age band (child/teen/adult), build variant, and scene graph reference for
  removal/raycasting.
- **PeopleCollection**: The set of active Person instances; drives occupancy count,
  bulk set/clear, and light-intensity occupancy factor (`MAX_PEOPLE_FOR_FULL_LIGHT`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of floor clicks inside the central disc produce a standing 3D
  figure within 1 second under normal network conditions.
- **SC-002**: 100% of direct clicks on a person figure remove that figure on first
  click (same as current sprite behavior).
- **SC-003**: In a sample of 10 randomly placed people, at least 3 distinct height
  bands and 2 build variants are visibly present.
- **SC-004**: Orbit controls remain usable (no permanently blocked navigation) with
  20 people + default rings/heatmap visible — matching or better than pre-change feel.
- **SC-005**: Bulk "Set to 20" and "Clear all" complete without error and match
  expected counts.
- **SC-006**: GIF export succeeds in orbit mode with at least 5 people visible
  (recording hook intact).

## Assumptions

- A single free, low-poly humanoid model (or small variant set) licensed for public
  demo use will be selected during planning; rigging/animation is not required for v1
  (static standing pose is sufficient).
- Height/build variation can be achieved via scale and morph targets, material tint,
  or a small pool of model variants — exact technique deferred to plan.
- The shareable demo on `main` is updated only after review; development happens on
  `dev` or feature branches.
- Accurate proportions means plausible human scale relative to room dimensions
  (confirmed ring diameters), not medical-grade anthropometry.
- Static hosting (GitHub Pages) remains the deployment target; asset paths must work
  without a backend.
