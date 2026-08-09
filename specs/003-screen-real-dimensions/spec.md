# Feature Specification: Screen Regrouping, Real Dimensions & Projection Study

**Feature Branch**: `003-screen-real-dimensions`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "I think the first ring is also the screen. Adjust so they are grouped
correctly. Calculate all dimensions and add a separate layer. Calculate projection surface and
curvature to check if one projector is enough or we need two to join in one single screen. Use real
dimensions. (New architect SVG provided.) If you can, also add a layer with the technical and
ventilation system present in the floorplan. Check dimensions. Evaluate and scope to make sure you
don't break anything."

## Context (from drawing analysis)

The second architect export (`public/floorplan2.svg`) carries its own dimension labels. Two
independent straight dimension lines ("Ø4.800" and "4.695") agree on the drawing scale to within
0.1% (29.93 drawing units per metre). At that scale:

- The **innermost circle is the projection screen** — Ø4.800 m outer / Ø4.695 m projection face,
  drawn as two arcs (≈227° and ≈73°) separated by two entry gaps (≈27° and ≈34°). It is **not** a
  curtain ring.
- The **Ø6.533 m label belongs to the first curtain ring** (fitted at exactly 3.267 m radius).
- The **room is 10.12 × 22.34 m (≈226 m²)** — the current model is ~36% oversized in every linear
  dimension because the previous derivation attached the Ø6.533 label to the innermost circle
  (actually the Ø4.8 screen). Both architect exports agree on all ring radii once corrected.
- Technical elements in the drawing: 0.20 m walls, 2.52 m entrance corridor (bottom-right), a
  1.17 × 1.64 m booth (top-right), four 0.35 m × 0.08 m wall niches (left wall), four Ø0.31 m
  duct/sprinkler circles (right wall).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Screen and curtain rings grouped correctly at real scale (Priority: P1)

As the exhibit designer, I open the visualization and see the space at its true dimensions: the
central projection screen (Ø4.8 m, two curved segments with two entry gaps) stands inside the first
curtain ring (Ø6.533 m), the room measures 10.12 × 22.34 m, and every curtain ring sits at the
radius the architect drew. The screen is its own object on its own layer — selecting it reports
screen dimensions, not curtain-ring data.

**Why this priority**: Every other deliverable (projection study, technical layer, floorplan
overlay) is wrong if the underlying scale and grouping are wrong. This is the foundation.

**Independent Test**: Open the app; the dimensions panel shows the recalibrated room; clicking the
central screen selects "Projection screen" with its real dimensions; the screen renders as two arcs
matching the drawing; ring 1 is a curtain at Ø6.533 m with no screen fabric attached to it.

**Acceptance Scenarios**:

1. **Given** the app loads with defaults, **When** the user reads the dimensions panel, **Then** it
   reports the room as ≈10.1 × 22.3 m (≈226 m²) and the screen as Ø4.80 m.
2. **Given** the default scene, **When** the user toggles the "Projection screen" layer off,
   **Then** the two screen arcs disappear while curtain ring 1 (Ø6.533 m) remains.
3. **Given** the default scene, **When** the user clicks a screen arc, **Then** the selection panel
   shows screen dimensions (radius, arc sweeps, arc lengths, height, area) — not ring controls.
4. **Given** the technical drawing panel (X key), **Then** the screen appears as its own two-arc
   element, visually distinct from curtain rings, at Ø4.8 m scale.

---

### User Story 2 - Projection surface & projector-count study (Priority: P1)

As the production planner, I need the projection surface and curvature computed from real
dimensions, with a clear recommendation whether one projector suffices or two must be blended into
a single continuous image on the curved screen.

**Why this priority**: This is an explicit decision the user needs for equipment planning; it is
the main analytical deliverable of the feature.

**Independent Test**: Select the screen (or open the study section) and read: arc lengths, surface
areas, chord/sagitta curvature figures, per-projector angular coverage limits, and the one-vs-two
projector verdict — all consistent with Ø4.695 m projection face.

**Acceptance Scenarios**:

1. **Given** the screen is selected, **When** the user reads the info panel, **Then** it reports
   the main-arc length (≈9.3 m), total surface at the configured screen height, and the curvature
   (radius 2.35 m).
2. **Given** the study output, **Then** it states the maximum horizontal coverage of a single
   projector (~127° with 0.25:1 optics) versus the 227° main arc, and therefore recommends **two
   edge-blended projectors** for one continuous image (three if the rear 73° arc must also carry
   content).
3. **Given** the 3D scene, **Then** the number of projector models shown near the screen matches
   the recommendation (two, aimed to split the main arc, with a visible blend overlap zone).

---

### User Story 3 - Technical & ventilation layer (Priority: P2)

As the exhibit designer, I can toggle a "Technical / ventilation" layer that shows the drawing's
technical elements — wall niches, duct/sprinkler circles, entrance corridor walls, booth — in both
the 3D scene and the live floorplan, with their real dimensions.

**Why this priority**: Valuable for installation planning but independent of the core geometry fix.

**Independent Test**: Toggle the layer on/off; elements appear/disappear in 3D and the floorplan
panel; hovering/selecting reports their dimensions.

**Acceptance Scenarios**:

1. **Given** the layer is on, **When** the user looks at the left wall, **Then** four wall niches
   (0.35 m wide) appear at their drawn positions; the right wall shows four Ø0.31 m ducts.
2. **Given** the floorplan panel, **Then** the same elements appear at matching positions.
3. **Given** the raster technical underlays referenced by the drawing (content-1/2.png) are not
   part of the SVG export, **Then** the layer is built from the vector elements only and this
   limitation is noted in the panel.

---

### User Story 4 - Live floorplan uses the new drawing (Priority: P3)

As the designer, the X-key floorplan panel uses the new architect export as its underlay, aligned
to the recalibrated metre space, so the live model and the architect drawing can be compared
directly at true scale.

**Independent Test**: Open the panel; the underlay is the new drawing; the live ring/screen overlay
registers with the drawn arcs.

**Acceptance Scenarios**:

1. **Given** the panel is open with the underlay on, **Then** drawn screen arcs coincide with the
   live screen overlay and drawn ring arcs coincide with live curtain arcs.

### Edge Cases

- Ring radii larger than the room's half-width (rings 6-10) must keep auto-trimming to the walls at
  the new scale; the maze route must remain valid on every regeneration.
- Existing saved defaults in UI inputs (door position, center offsets, box position) must be
  recalibrated; stale values would place objects outside the smaller room.
- The screen is no longer a "ring": ring index shifts must not break per-ring controls, door
  arrays, openings, or the walkthrough. Ring 1 (Ø6.533) keeps its confirmed status.
- People/walkthrough scale: character models are real-size; the smaller room must still fit the
  route between rings (ring gaps shrink ~27%).
- If the screen layer is hidden, projection light/projector models hide with it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The model MUST be recalibrated to the drawing's own dimension labels (29.93 units/m):
  room 10.12 × 22.34 m, wall 0.20 m, ring-field center on the centerline ≈6.69 m from the booth
  wall, entrance corridor 2.52 m wide at the bottom-right.
- **FR-002**: The innermost circle MUST be modeled as the projection screen (Ø4.800 m outer,
  Ø4.695 m projection face), built as two arcs (~227° and ~73°) with two gaps matching the drawing,
  positioned at the screen's fitted center; it MUST NOT carry curtain fabric or ring controls.
- **FR-003**: The screen MUST live on its own layer toggle (3D + floorplan) and be selectable,
  reporting computed dimensions: radius, per-arc sweep and length, height, total surface area,
  chord and sagitta of the main arc.
- **FR-004**: Curtain rings MUST be re-derived from the new drawing: ring 1 = Ø6.533 m (confirmed
  label), subsequent rings at the fitted radii with wobble pairs merged; per-ring door/trim
  controls, maze generation, and walkthrough MUST keep working at the new scale.
- **FR-005**: The system MUST compute and display a projection study from real dimensions: arc
  lengths, projection surface area (at configured screen height), curvature figures, single
  projector maximum horizontal coverage versus required coverage, and the resulting projector
  count recommendation (two blended for the 227° main arc).
- **FR-006**: The 3D scene MUST render the recommended number of projector models positioned and
  aimed to cover the main arc as one continuous image (including a marked blend overlap).
- **FR-007**: A "Technical / ventilation" layer MUST show wall niches, duct circles, entrance
  corridor, and booth at drawn positions/dimensions in 3D and in the live floorplan panel.
- **FR-008**: The X-key floorplan panel MUST use the new drawing (`floorplan2.svg`) as underlay,
  mapped through the recalibrated scale, with the live overlay registering with the drawn geometry.
- **FR-009**: All existing behaviors MUST keep working: maze route validity, walkthrough, video
  recording, people placement, layer toggles, ring controls, SVG export of the live floorplan.

### Key Entities

- **Screen**: two arcs on one circle (center, radius, per-arc start/sweep), height, layer state.
- **Curtain ring**: radius, door angles, trims — now excluding the screen circle.
- **Projection study**: derived metrics (arc lengths, area, chord, sagitta, coverage per projector,
  recommended count).
- **Technical element**: kind (niche, duct, corridor wall, booth), position, dimensions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The reported room area changes from ≈418 m² to ≈226 m² and matches the drawing's own
  dimension labels within 1%.
- **SC-002**: The screen renders as two arcs whose angular coverage matches the drawing within 2°,
  and selecting it reports all its dimensions.
- **SC-003**: The projection study reports surface, curvature, and an explicit one-vs-two projector
  verdict consistent with the computed geometry (227° required vs ~127° max per projector →
  two projectors).
- **SC-004**: The technical/ventilation layer shows 4 niches + 4 ducts + booth + corridor at drawn
  positions in both views, toggleable without affecting other layers.
- **SC-005**: 10/10 maze generation + walkthrough runs pass validation at the new scale.
- **SC-006**: Floorplan overlay and drawing underlay register visually (ring/screen arcs coincide)
  in the X panel.

## Assumptions

- The two dimension labels "Ø4.800" and "4.695" (agreeing within 0.1%) anchor the true scale; the
  Ø6.533 label marks the first curtain ring. Ø1.541 m center marker remains from prior data.
- Screen height is not given in the plan; assume 2.4 m (typical for immersive cylindrical screens),
  editable; projection study recomputes from the configured height.
- Projector feasibility uses commodity optics limits: widest practical ultra-short-throw ≈0.25:1
  (~127° horizontal coverage); edge blend overlap ≈8-10°.
- The raster technical/ventilation underlays (content-1.png, content-2.png) are not embedded in the
  provided SVG; the technical layer uses the drawing's vector elements only.
- The old `floorplan.svg` remains in the repo for reference; the new export becomes the active
  source of truth.
- Occupancy/people features are unaffected except for the smaller walkable space.
