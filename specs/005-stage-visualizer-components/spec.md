# Feature Specification: Stage Visualizer & Designer Components

**Feature Branch**: `005-stage-visualizer-components`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "Deep review and plan on what is needed to create well documented components of light, space, dimensions, layers. Goal is to set this up so it works as our own stage visualizer / designer, with granular control of lighting and cameras to create a visual mood and an interactive preview of space and stage settings. Extra goals: interactively check dimensions and changes if we modify the space, measure inner distance between rings, dimensions of curtains. Think of it as a collaborator tool for us with architects, technicians, lighting staff, and the museum itself."

## Overview

Today the project is a single-purpose visualization: it renders one specific room with one specific curtain-ring layout, one hardcoded red central light, and a fixed set of camera presets. Everything a designer would want to adjust is either hardcoded or spread across one very large orchestration file, so only the original author can change it safely.

This feature turns that visualization into a **stage visualizer and designer** — a shared tool that four distinct collaborator groups can open and use for their own purpose:

| Collaborator | What they need from it |
|---|---|
| **Lighting staff** | Place and aim fixtures, set colour and intensity, save named looks, preview mood |
| **Architects** | Verify real dimensions, check clearances, see what changes when the space is modified |
| **Technicians** | Read fixture positions, mounting heights, cable/rig implications, ventilation and access |
| **Museum** | Preview the visitor experience, review moods and sightlines, approve the result |

The work has two inseparable halves: the **capabilities** each group needs, and the **documented component structure** that makes those capabilities safe to build and extend.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Design a lighting mood (Priority: P1)

A lighting designer opens the visualizer and wants to create the mood for a scene. They select an existing light — the central beam, a ceiling fixture, or the background wash — and adjust its colour, intensity, beam width, and aim until the space feels right. They add a new fixture where they want one, position it, and aim it at the curtains. When they are happy they save the result as a named look, for example "Opening — cold blue", and continue building a second look. Later they recall either look instantly and compare them.

**Why this priority**: This is the core purpose stated by the owner — granular control of lighting to create visual mood. Without it the tool is still only a viewer. Every other story is either supporting infrastructure or a secondary audience.

**Independent Test**: Can be fully tested by opening the app, changing a fixture's colour and intensity, saving it as a named look, changing the lighting again, then recalling the saved look and confirming the scene returns to the saved appearance.

**Acceptance Scenarios**:

1. **Given** the visualizer is open, **When** the designer selects any light in the scene, **Then** an inspector shows that light's editable properties (colour, intensity, position, aim, beam width where applicable) with its current values.
2. **Given** a light is selected, **When** the designer changes its colour or intensity, **Then** the rendered scene updates immediately and continuously while dragging, with no page reload.
3. **Given** the designer has arranged a lighting state they like, **When** they save it under a name, **Then** that name appears in a list of looks and can be recalled later.
4. **Given** two or more saved looks exist, **When** the designer recalls one, **Then** every light returns to the exact values stored in that look.
5. **Given** the designer adds a new fixture, **When** they place and aim it, **Then** it illuminates the scene and appears in the fixture list with an editable identity.

---

### User Story 2 - Verify space and curtain dimensions live (Priority: P2)

An architect wants to confirm the physical reality of the design. They open a dimensions view and read the measurements that matter: the clear walking distance between each pair of curtain rings, the diameter and circumference of each ring, the fabric width and height of each curtain panel, the width of each door opening, and the clearance between the outermost ring and the walls. They then change the ring spacing or move the ring field within the room, and every measurement updates immediately so they can see exactly what the change costs.

**Why this priority**: Stated explicitly as an extra goal and it is what makes the tool credible to architects and the museum. It is second only to lighting because it validates decisions rather than creating them.

**Independent Test**: Can be fully tested by opening the dimensions view, recording the ring-to-ring distances, changing the ring growth or gap width, and confirming every affected measurement changes correspondingly and remains internally consistent.

**Acceptance Scenarios**:

1. **Given** the visualizer is open, **When** the architect opens the dimensions view, **Then** they see, per ring: diameter, radius, circumference, curtain height, total fabric length, panel count, and door opening width.
2. **Given** the dimensions view is open, **When** the architect looks at the spacing between rings, **Then** they see the clear distance between each adjacent pair of rings, expressed as a walkable gap.
3. **Given** a measurement is displayed, **When** the architect changes ring spacing, ring count, opening width, or the position of the ring field, **Then** all affected measurements update without a manual refresh.
4. **Given** a ring would extend beyond the room walls, **When** the dimensions view is displayed, **Then** that ring is clearly flagged as exceeding the available space, with the shortfall stated.
5. **Given** the architect wants a record, **When** they export the dimensions, **Then** they receive a readable schedule of all current measurements.

---

### User Story 3 - Frame and save camera views (Priority: P3)

Any collaborator wants to look at the space from a specific, repeatable point of view — a visitor's eye height at the entrance, a technician's view of the ceiling rig, a plan view for the architect, a hero shot for the museum. They frame the view they want, save it with a name, and later return to it exactly. They can also step through saved views in sequence to review a design, and control the lens so a preview matches what a real camera or a human eye would see.

**Why this priority**: Explicitly requested alongside lighting, and it is what makes moods shareable — a mood only reads correctly from the viewpoint it was designed for. It ranks below dimensions because the existing camera presets are already partially usable.

**Independent Test**: Can be fully tested by framing a view, saving it, moving the camera far away, recalling the saved view, and confirming the framing is identical.

**Acceptance Scenarios**:

1. **Given** the collaborator has framed a view, **When** they save it with a name, **Then** it appears in a list of saved views.
2. **Given** a saved view exists, **When** the collaborator recalls it, **Then** the camera returns to the saved position, orientation, and lens setting.
3. **Given** the collaborator is reviewing, **When** they move between saved views, **Then** the camera transitions smoothly rather than jumping, and the transition can be skipped.
4. **Given** a lens control is available, **When** the collaborator changes it, **Then** the perspective changes accordingly and the current value is displayed in familiar photographic or angular terms.
5. **Given** an automated camera move is running, **When** anything fails during that move, **Then** manual control is always restored rather than left blocked.

---

### User Story 4 - Work in a discipline-specific view (Priority: P4)

Each collaborator group cares about a different subset of the model. A lighting designer does not want ventilation ducts on screen; a technician does not want the circulation flow analysis; the museum wants the finished space with none of the analysis overlays. Each person selects their discipline and the scene shows the layers relevant to them, organised into meaningful groups rather than one flat list of checkboxes.

**Why this priority**: It makes the tool usable by four audiences without four separate builds, but each group can still reach their layers manually today, so it is an ergonomics and clarity gain rather than a new capability.

**Independent Test**: Can be fully tested by choosing each discipline preset in turn and confirming the visible layers match that discipline's documented set, and that manual overrides still work afterwards.

**Acceptance Scenarios**:

1. **Given** the visualizer is open, **When** a collaborator selects a discipline preset, **Then** the layer visibility changes to that discipline's documented default set.
2. **Given** a discipline preset is active, **When** the collaborator toggles an individual layer, **Then** that override is respected and the preset is shown as modified.
3. **Given** layers are listed, **When** a collaborator reads the list, **Then** layers are grouped by domain (space, lighting, analysis, technical) with human-readable names.

---

### User Story 5 - Save and share a design state (Priority: P5)

A collaborator finishes a session and wants the next person to see exactly what they saw. They save the current design — the space configuration, the fixtures and their settings, the saved looks, and the saved views — as a single shareable file. Another collaborator opens that file and the visualizer reproduces the same state.

**Why this priority**: This is what turns a personal tool into a collaboration tool. It ranks last because each preceding story delivers value on its own, and this one depends on all of them being modelled as data first.

**Independent Test**: Can be fully tested by configuring the space, lights, looks, and views, exporting the design, reloading the app fresh, importing the file, and confirming the restored state matches.

**Acceptance Scenarios**:

1. **Given** a configured design, **When** the collaborator exports it, **Then** a single file is produced containing the space, lighting, looks, views, and layer state.
2. **Given** an exported file, **When** another collaborator imports it, **Then** the visualizer reproduces the same visual state.
3. **Given** an imported file references something no longer valid (for example a fixture type that was removed), **When** it is loaded, **Then** the rest of the design still loads and the problem is reported rather than failing silently.
4. **Given** a collaborator returns to the app without importing anything, **When** the app opens, **Then** their most recent working state is restored automatically.

---

### User Story 6 - Extend the tool without reading everything (Priority: P6)

A developer — or a future collaborator's technical contact — needs to change one thing: add a fixture type, adjust how curtain fabric is measured, or add a new analysis layer. They open the component documentation, identify the single module that owns that concern, read its documented inputs and outputs, and make the change without needing to understand the rest of the application.

**Why this priority**: This is the enabling half of the request ("well documented components"). It is listed last because it is verified through the other stories rather than demonstrated on its own, but it is a hard requirement for all of them: without it, each story above grows the existing monolith.

**Independent Test**: Can be fully tested by giving a developer unfamiliar with the project a small change request and confirming they can locate the owning module from documentation alone, within a few minutes, without opening the main orchestration file.

**Acceptance Scenarios**:

1. **Given** the component documentation, **When** a developer looks for the owner of a given concern (space, dimensions, lighting, cameras, layers, analysis), **Then** exactly one module is identified as responsible.
2. **Given** a module, **When** a developer reads its documentation, **Then** its inputs, outputs, and side effects are stated without needing to read its implementation.
3. **Given** the main orchestration file, **When** it is reviewed after this feature, **Then** it composes documented components rather than containing the domain logic itself.

---

### Edge Cases

- **A look references a deleted fixture.** Recalling it must restore every fixture that still exists and report which ones are missing, rather than failing to load.
- **The space changes after looks and views were saved.** Moving the ring field or changing the room must not invalidate saved looks; saved views that end up inside geometry or outside the room must still be recallable and must be flagged as needing review.
- **Ring geometry exceeds the room.** Measurements must still be reported, with the overflow explicitly quantified, rather than being hidden or silently clamped.
- **A ring has zero usable openings** (all doors fall outside the room). Dimension reporting must state this rather than showing a misleading opening width.
- **Many fixtures are added.** The tool must warn before interactive performance degrades, and must not silently drop to an unusable frame rate.
- **Two collaborators edit and export separately.** The tool does not merge changes; the second import replaces the current state, and the user is warned before unsaved work is lost.
- **An automated camera move is interrupted** by an error or by the user. Manual control must always be restored.
- **An imported file came from an older version of the tool.** It must either load with documented defaults for missing values, or be rejected with a clear explanation — never load into a corrupted half-state.

## Requirements *(mandatory)*

### Functional Requirements

#### Lighting

- **FR-001**: The system MUST maintain an explicit inventory of every light in the scene, each with a stable identity, a human-readable name, and a type.
- **FR-002**: Users MUST be able to select any light and edit its colour, intensity, position, and — where the type supports it — its aim direction and beam width.
- **FR-003**: The system MUST apply lighting edits to the rendered view continuously while the user is adjusting a control, with no confirmation step.
- **FR-004**: Users MUST be able to add a new light of a supported type at a chosen location, and remove any light they added.
- **FR-005**: The system MUST allow a complete lighting state to be saved as a named "look", and MUST allow any saved look to be recalled exactly.
- **FR-006**: The system MUST preserve the existing occupancy-driven behaviour of the central light as a property of that light that can be enabled, disabled, or scaled — not as fixed behaviour.
- **FR-007**: The system MUST provide global mood controls (overall exposure or brightness, and bloom or glow amount) that apply on top of individual fixture settings.
- **FR-008**: The system MUST report when the number of shadow-casting lights would exceed the documented performance budget, and MUST NOT silently exceed it.

#### Dimensions and measurement

- **FR-009**: The system MUST report, for every curtain ring: radius, diameter, circumference, curtain height, total fabric arc length, number of fabric panels, and the width of each door opening.
- **FR-010**: The system MUST report the clear distance between each adjacent pair of rings, presented as the walkable gap rather than only a centreline difference.
- **FR-011**: The system MUST report the clearance between the outermost ring and the room walls, and MUST flag any ring that exceeds the available space, stating the amount of overflow.
- **FR-012**: The system MUST recompute and redisplay all measurements whenever the space configuration changes, without requiring a manual refresh.
- **FR-013**: Users MUST be able to export the current measurements as a readable schedule.
- **FR-014**: The system MUST distinguish, in every measurement it reports, values derived from confirmed source dimensions from values that are interpolated or estimated.
- **FR-015**: Users MUST be able to display selected measurements as annotations in the view, so a dimension can be seen in context rather than only in a table.

#### Cameras

- **FR-016**: Users MUST be able to save the current camera framing as a named view and recall it exactly.
- **FR-017**: The system MUST transition between saved views smoothly, and MUST allow the transition to be skipped or interrupted.
- **FR-018**: Users MUST be able to control the camera lens, with the current value shown in familiar terms.
- **FR-019**: The system MUST always restore manual camera control when any automated camera movement ends, including when it ends because of an error.
- **FR-020**: The system MUST preserve the existing camera modes (free orbit, plan view, walkthrough at eye height, and central orbit) as named, selectable modes.

#### Layers and collaboration

- **FR-021**: The system MUST organise scene layers into named groups by domain rather than a single flat list.
- **FR-022**: The system MUST provide per-discipline visibility presets for at least the lighting, architecture, technical, and museum-preview audiences.
- **FR-023**: Users MUST be able to override any preset by toggling individual layers, and the system MUST indicate when a preset has been modified.
- **FR-024**: The system MUST allow the complete design state — space configuration, lights, looks, views, and layer state — to be exported to a single file and imported from one.
- **FR-025**: The system MUST restore the user's most recent working state automatically when the application is reopened on the same device.
- **FR-026**: When importing a design that references anything unavailable, the system MUST load everything valid and report what could not be restored.

#### Component structure and documentation

- **FR-027**: Each domain — space, dimensions, lighting, cameras, layers, and analysis — MUST be owned by an identifiable component with a documented responsibility.
- **FR-028**: Each component MUST document its inputs, its outputs, and any side effects it has on the shared scene.
- **FR-029**: Components MUST be usable without reading the main orchestration file; the orchestration file MUST compose components rather than own domain logic.
- **FR-030**: The system MUST keep the calculations that produce measurements, routes, and lighting values separate from the code that draws them, so the same calculation can serve both the 3D view and the plan view.
- **FR-031**: Existing behaviour that is already verified — the walkable route validation and the projection study — MUST continue to pass its existing checks after restructuring.

### Key Entities

- **Stage Document**: The complete saved design. Contains a space configuration, a fixture list, saved looks, saved views, and layer state. This is the unit that is exported, imported, and auto-restored.
- **Space Configuration**: The physical model of the room — room outline and height, the ring field's centre position, and each ring's radius, height, door angles, door width, and trim. Distinguishes confirmed dimensions from estimated ones.
- **Ring**: One curtain ring. Has a radius, a height, a set of fabric panels, and a set of door openings. Belongs to a ring field and is ordered from innermost to outermost.
- **Fixture**: One light. Has an identity, a name, a type, a position, an aim, a colour, an intensity, type-specific properties such as beam width, and optional dynamic behaviour such as the occupancy pulse. Some fixtures are fixed parts of the installation; others are user-added.
- **Look**: A named, complete snapshot of every fixture's settings plus the global mood settings. Recalling a look restores that state.
- **Camera View**: A named snapshot of camera position, orientation, and lens. May record which mode it belongs to.
- **Measurement**: A derived value about the space — a distance, a length, an area, or a clearance — with a unit, a label, a source classification (confirmed or estimated), and optionally a warning when a limit is exceeded.
- **Layer**: A named, toggleable group of scene content, belonging to a domain group, with a documented default visibility per discipline.
- **Discipline Preset**: A named set of layer visibilities associated with a collaborator group.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A lighting designer can select a light, change its colour and intensity, and save the result as a named look in under 60 seconds, without written instructions.
- **SC-002**: Recalling a saved look reproduces the previously saved appearance exactly, for 100% of saved looks, across a page reload.
- **SC-003**: An architect can read the clear distance between every adjacent pair of rings, and the fabric dimensions of every curtain, without leaving the application.
- **SC-004**: After any change to ring count, ring spacing, opening width, or ring-field position, all displayed measurements reflect the change within one second and with no manual refresh.
- **SC-005**: Every reported measurement is labelled as confirmed or estimated, for 100% of reported values.
- **SC-006**: A collaborator can save a camera view and return to identical framing later, including after a page reload.
- **SC-007**: Each of the four collaborator groups can reach their relevant view in a single action from the opening state.
- **SC-008**: A design exported by one collaborator and imported by another reproduces the same visual state, with any unrestorable item explicitly reported.
- **SC-009**: A developer new to the project can identify the single component responsible for a given concern within 2 minutes, using the component documentation alone.
- **SC-010**: Interactive frame rate stays at or above 30 frames per second in the default configuration with up to 12 user-added fixtures on a mid-range laptop.
- **SC-011**: The existing walkable-route validation continues to pass on 10 consecutive generated layouts after restructuring.
- **SC-012**: No single source file exceeds 400 lines after restructuring, except where a documented exemption is recorded.

## Assumptions

These are reasonable defaults chosen where the request did not specify. They define the scope boundary and should be confirmed — each one materially changes the size of the work.

- **Local-first, not multi-user.** Collaboration happens by exporting and sharing a design file, and by each person running the tool locally. There is no server, no login, and no simultaneous multi-user editing. Real-time co-editing is out of scope for this feature.
- **Visual approximation, not photometric simulation.** Lighting aims to communicate mood and intent convincingly. It does not compute physically accurate illuminance, does not use manufacturer photometric data, and does not produce lux values. Real fixture profiles and a DMX patch are out of scope for this feature, though the fixture model is expected to leave room for them later.
- **Indicative dimensions, not fabrication drawings.** Measurements are accurate to the source floorplan and are intended for design review and coordination. They are not a substitute for CAD or for a fabrication drawing set, and the confirmed-versus-estimated labelling exists precisely because parts of the model are approximated.
- **The existing build toolchain continues.** The project already runs on a bundled development server rather than as a plain static page; this feature continues on that basis and does not revisit that decision.
- **Existing verified behaviour is preserved.** The walkable route, its validation, the projection study, and the people/occupancy behaviour keep working as they do today; this feature restructures and extends around them rather than replacing them.
- **Browser-based, desktop-first.** The tool targets a modern desktop browser with a mouse. Touch and mobile layouts are out of scope.
- **Units are metric.** All measurements are expressed in metres and degrees, consistent with the existing floorplan source.
- **The circulation and flow analysis remains a layer.** It stays available as an analysis layer within the new structure but is not extended by this feature.
