# Feature Specification: Central Light Realism & Maze Path Reliability

**Feature Branch**: `002-light-realism-maze-fix`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "Central light needs realism. Maybe switch to WebGPU so curtain textures can be worked on later. Important: adjust the maze path generation — it has bugs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable Maze Walkthrough (Priority: P1)

A viewer (or the project owner demoing the space) clicks "Generate new maze & walk it" or "Walk through (POV)". The camera walks the route a real visitor would take: enters at the outermost curtain ring's opening, follows the corridor between rings to the next opening, and repeats inward until reaching the center. The route never passes through curtain fabric, never leaves the room, and the camera never jumps, stutters, or freezes.

**Why this priority**: This is a bug fix for existing, demoed functionality. A walkthrough that clips through curtains or gets stuck undermines the credibility of the whole visualization, regardless of how good the lighting looks.

**Independent Test**: Click "Generate new maze & walk it" ten times in a row. Every generated layout must produce a complete, smooth walkthrough that visibly threads each ring opening and ends at the center.

**Acceptance Scenarios**:

1. **Given** any generated maze layout, **When** the walkthrough plays, **Then** the camera passes through each ring's opening in order (outermost to innermost) and ends at the center.
2. **Given** any generated maze layout, **When** the walkthrough plays, **Then** the camera path never intersects curtain fabric and never exits the room boundary.
3. **Given** rings whose circumference extends beyond the room walls, **When** a maze is generated, **Then** every ring's opening is placed at an angle that lies inside the room, and the corridor route between openings stays inside the room.
4. **Given** a walkthrough in progress, **When** it reaches the center, **Then** it stops cleanly and orbit controls return (no frozen camera, no stuck state).
5. **Given** the circulation "Path" layer is enabled, **When** a new maze is generated, **Then** the drawn path line matches the route the walkthrough camera actually takes.

---

### User Story 2 - Realistic Central Light (Priority: P2)

A viewer looks at the central pulsing light — the emotional focal point of the exhibit. Instead of a flat translucent cylinder, they see a convincing volumetric-feeling beam: a soft glowing halo around the light, believable light falloff onto the floor and nearby people, and soft shadows cast by people standing near it. The light still pulses, and the pulse still responds to occupancy (more people = stronger, faster pulse).

**Why this priority**: The central light is the core of the exhibit concept (the "heartbeat" of the space). Realism here is the highest-impact visual upgrade and the owner's stated next goal.

**Independent Test**: Set occupancy to 6 and view the central space from the default start view. The light must visibly illuminate the people and floor around it with a soft glow/halo, people must cast soft shadows away from the light, and the pulse must still track occupancy.

**Acceptance Scenarios**:

1. **Given** the default view with people present, **When** the central light pulses, **Then** a soft glow/halo is visible around the beam and base (not a hard-edged cylinder).
2. **Given** people standing within the central circle, **When** the light is active, **Then** they are visibly lit from the light's direction and cast soft shadows away from it.
3. **Given** occupancy changes from 0 to 20+, **When** the pulse updates, **Then** intensity and speed still scale with occupancy exactly as before.
4. **Given** the new lighting, **When** GIF recording is used in any camera mode, **Then** recording still works and captures the improved lighting.
5. **Given** the new lighting, **When** orbiting with 60 occupants, **Then** the scene remains smoothly interactive.

---

### User Story 3 - Rendering Platform Decision & Material Groundwork (Priority: P3)

The project owner wants a clear, documented decision on whether to switch to WebGPU now or stay on WebGL for this stage — so that upcoming work (curtain fabric textures, more advanced materials) has a stable foundation and the shareable demo keeps working for every viewer, including Safari users.

**Why this priority**: It gates future material work but delivers no direct visual change by itself. The wrong choice risks breaking the shareable demo; the decision needs to be made deliberately, not implied.

**Independent Test**: A written decision exists (in this feature's planning artifacts) with explicit adoption criteria. The demo renders correctly on current Chrome, Firefox, and Safari after this feature ships.

**Acceptance Scenarios**:

1. **Given** the completed feature, **When** the owner reads the planning artifacts, **Then** the renderer decision (switch now vs. defer) is documented with rationale and re-evaluation criteria.
2. **Given** the shipped feature, **When** the demo is opened in current Chrome, Firefox, and Safari, **Then** the scene renders correctly in all three.
3. **Given** the chosen platform, **When** curtain texture work starts later, **Then** it requires no renderer change to proceed.

---

### Edge Cases

- Outermost rings partially outside the room: openings and corridor arcs must be placed/routed only through the inside-the-room portion.
- Maximum occupancy (60 people) with shadows enabled: framerate must stay interactive; shadow quality may degrade gracefully before framerate does.
- Browsers without WebGPU (or with broken WebGPU, e.g., current Safari regression): the demo must still render correctly.
- "Generate new maze" clicked while a walkthrough is already playing: must not corrupt the route or leave the camera stuck.
- Ring count changed to extremes (1 ring, or 12+ rings): route generation must still produce a valid path.
- GIF recording during the new lighting: capture must reflect what is on screen without blank or black frames.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The walkthrough route MUST pass through each ring's designated opening in order, from the outermost ring inward to the center.
- **FR-002**: Every point of the walkthrough route (including smoothed curve segments between control points) MUST remain inside the room boundary.
- **FR-003**: The walkthrough route MUST NOT intersect curtain fabric at any point, including the smoothed segments near openings.
- **FR-004**: The walkthrough camera motion MUST be continuous — no teleports, no stalls — and MUST always terminate cleanly at the center with controls restored.
- **FR-005**: Maze generation MUST only place ring openings at angles whose world position lies inside the room, for every ring including those larger than the room.
- **FR-006**: The drawn circulation path MUST match the walkthrough camera route.
- **FR-007**: The central light MUST render with a soft emissive glow/halo (no hard-edged translucent geometry as the dominant impression).
- **FR-008**: The central light MUST illuminate nearby people, floor, and curtains with physically plausible falloff.
- **FR-009**: People near the central light MUST cast soft real-time shadows away from it.
- **FR-010**: The occupancy-driven pulse behavior (intensity and speed scaling with people count) MUST be preserved.
- **FR-011**: GIF recording MUST continue to work in all four camera modes (orbit, plan, walk, central orbit) with the new lighting.
- **FR-012**: The demo MUST render correctly on current Chrome, Firefox, and Safari.
- **FR-013**: The rendering platform decision (WebGPU now vs. deferred) MUST be documented with rationale and explicit re-evaluation criteria.
- **FR-014**: The scene MUST remain interactively smooth with 60 occupants and the new lighting active.

### Key Entities

- **Maze Route**: Ordered sequence of waypoints from the outermost ring opening to the center; derived from ring radii, opening angles, and room boundary; consumed by both the walkthrough camera and the circulation path drawing.
- **Ring Opening**: An angular gap in a curtain ring; has a ring index, angle, and width; must resolve to a world position inside the room.
- **Central Light Rig**: The pulsing light at the room's focal point; has intensity, pulse speed, glow radius, and shadow-casting behavior; driven by occupancy.
- **Renderer Platform Decision**: A documented choice with rationale, gates, and re-evaluation criteria (not a runtime entity).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 10 out of 10 consecutively generated mazes produce a walkthrough with zero visible clipping through curtains and zero excursions outside the room.
- **SC-002**: 100% of walkthroughs terminate at the center with controls restored (no stuck camera states across 10 consecutive runs).
- **SC-003**: With 6 people at the default view, the central light produces visible illumination and soft shadows on people within the Ø4.8 m central floor.
- **SC-004**: With 60 occupants and new lighting, interaction (orbit, zoom) sustains at least 30 fps on a mid-range laptop; at default occupancy it sustains at least 50 fps.
- **SC-005**: The demo renders correctly (no black screen, no missing geometry) on current Chrome, Firefox, and Safari.
- **SC-006**: GIF recording produces a valid animated GIF in all four camera modes with the new lighting visible.
- **SC-007**: The renderer decision document exists and answers: switch now or defer, why, and what would trigger re-evaluation.

## Assumptions

- The maze bugs to fix are those observable today: route segments clipping through curtain fabric (especially where smoothing overshoots near openings), routes affected by rings extending beyond the room, and end-of-route camera irregularities. If the owner has seen other specific failures, they can be added during planning without changing scope.
- "Realism" for the central light means glow/halo, falloff, and soft shadows — not physically-exact photometric simulation.
- Curtain fabric texturing itself is **out of scope**; this feature only ensures the platform choice does not block it.
- The renderer decision follows the project constitution's staged approach (WebGL realism first; WebGPU gated by browser support, fallback, and GIF-capture validation) — the decision is made during planning, informed by current browser status.
- Confirmed dimensions (Ø6.533 m outer ring, Ø1.541 m center marker, Ø4.8 m central floor) are preserved untouched.
- The occupancy-driven pulse mapping (current intensity/speed formulas) is treated as correct authored behavior.
