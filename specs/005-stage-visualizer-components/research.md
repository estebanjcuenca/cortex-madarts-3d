# Phase 0 Research: Stage Visualizer & Designer Components

**Feature**: 005-stage-visualizer-components | **Date**: 2026-08-09

This document records the decisions taken before design, the reasoning behind each, and what was
rejected. Every "NEEDS CLARIFICATION" from the Technical Context is resolved here.

---

## Part A — Baseline findings

Established by reading the current codebase. These are facts, not decisions, but they constrain
every decision that follows.

### A1. The orchestrator holds the domain logic

`src/main.js` is ~1880 lines and owns, in one module scope: renderer and composer setup, room and
clip-plane geometry, the ring/curtain data model and fabric arc mathematics, screen construction,
the technical layer, five categories of light, circulation drawing, four camera modes, every DOM
event handler, the SVG floorplan panel, image and video export, and the render loop.

The mutable module-scope state that blocks extraction, named explicitly:

| Category | Variables |
|---|---|
| Ring model | `RING_RADII`, `ringDoors`, `baseAngles`, `ringVisible`, `ringDoorCount`, `ringTrims`, `OPENINGS`, `growthFactor`, `gapWidthM`, `openingSpacingDeg`, `builtRingArcs` |
| Positions | `circleCenter`, `boxPos`, `doorPos` |
| Scene | `scene`, `camera`, `renderer`, `composer`, `bloomPass`, `labelRenderer`, `ambient`, `key`, `rim`, all `g*` groups, `layers` |
| Picking | `raycastTargets`, `ceilingRaycastTargets`, `ceilingLights`, `ceilingPlacementMode`, `selected` |
| Camera | `target`, `radius`, `theta`, `phi`, `dragging`, `panMode`, `walking`, `walkT`, `walkCurve`, `walkRAF` |
| Analysis cache | `circulationMode`, `cachedPassageGraph`, `lastFlowCfgSig`, `flowRouteIndex` |
| Export | `videoRecording`, `videoRecorder`, `videoCanvas`, `videoCtx` |

Critically, most UI handlers call `buildRings()`, which internally cascades into `buildScreen()`,
`buildCirculation()`, and `updateFloorplanOverlay()`, and mutates `raycastTargets`. **This implicit
cascade is the real coupling**, more than any individual variable.

### A2. Lighting is five unrelated ad-hoc systems

There is no concept of a "fixture". Lights exist as: three scene fill lights created inline; a
central rig module with its own pulse maths; a screen spill point light buried in `buildScreen`; a
background box spill in `buildBox`; and an array of click-placed ceiling lights. Every colour is
hardcoded (`0xff3b30` central red, `0xffe9a8` ceiling warm, `0x3f5fd6` screen blue). The only
runtime control is a set of global multipliers in `visualSettings`. There is no colour control, no
per-light editing, no presets, and no persistence. The layers panel says "Sensor + DMX light" but no
DMX model exists.

Projector "beams" are translucent cones with no illumination effect. There is no `SpotLight` in the
codebase at all.

### A3. Measurement already exists but is not reusable

Real geometry maths is present and correct, but each piece is trapped where it was needed:

- `computeProjectionStudy()` in `src/floorplan.js` is the one genuinely pure, reusable calculation
  — it returns arc length, area, chord, sagitta, curvature, and a projector-count verdict. It is
  the model the rest should follow.
- `gapAngleDeg(r)`, `updateGapPreview()`, `halfWidthAtZ(z)`, `autoTrimWindowsForRadius(r)`, and
  `ringFabricArcs(i)` live inside `main.js` and cannot be called from anywhere else.
- `validateRoute()` in `src/maze/route.js` already measures radial and angular deviation.

What does **not** exist as an API: total curtain arc length per ring, the ring-to-ring radial gap
series, curtain panel dimensions, and wall-clearance warnings (currently only a `.warn` CSS class
on an oversized ring row).

### A4. Confirmed versus estimated dimensions are already tracked — in comments only

`src/floorplan.js` documents its provenance carefully: scale 29.928 SVG units/m derived from the
labelled Ø4.800 and 4.695 dimension lines; ring 1 confirmed at Ø6.533; outer dashed radii included
but auto-trimmed. Constitution Principle VII requires this distinction be preserved. Today it
survives only as source comments, so it is invisible to the architect actually reading a number on
screen. This is the single clearest gap between what the code knows and what the collaborator sees.

### A5. Toolchain

Three.js `^0.172.0`, Vite `^6.0.0`, ES modules, no TypeScript. Verification is Playwright-driven
browser scripts (`scripts/verify-maze.mjs`, `scripts/verify-screen.mjs`) — Playwright is invoked but
is not a declared dependency. There is no unit test runner.

---

## Part B — Decisions

### R1. Refactor strategy — strangler extraction, not rewrite

**Decision**: Extract one domain at a time from `main.js` behind a shared `StageContext`, keeping
`dev` runnable after every stage. Add new capability only into extracted components.

**Rationale**: There is no unit test suite. The only regression safety is `verify-maze.mjs` and
`verify-screen.mjs`, which exercise the app end to end. Incremental extraction lets those scripts
gate every step. The ring/fabric arc mathematics also contains a documented trap — `CylinderGeometry`
measures angles from +Z clockwise while the plan maths uses +X counter-clockwise — and that
conversion is exactly the sort of detail a rewrite silently loses.

**Alternatives rejected**:
- *Clean-room rewrite*: no regression net, high risk to the shareable demo, and would discard the
  angle-convention and trim-window knowledge encoded in the current code.
- *Leave `main.js` and only add new modules alongside*: the `buildRings()` cascade means any new
  feature still has to reach into `main.js`. The coupling would grow, not shrink.

### R2. Shared state — a context object plus an event bus, no framework

**Decision**: Introduce `core/stageContext.js` (scene, renderer, composer, camera, groups, created
once and passed to components) and `core/eventBus.js` (named change events). Components subscribe to
the events they care about; the `buildRings()` cascade is replaced by explicit event emission.

**Rationale**: The existing `visualSettings.js` already proves the pattern works in this codebase —
a plain module with `get`, `set`, and an `onChange` listener set, consumed by three UI modules. The
same shape, generalised, is enough. It requires no dependency, no build change, and no learning
curve for a collaborator's technical contact.

**Alternatives rejected**:
- *A reactive state library (Zustand, Valtio, MobX)*: adds a dependency and a paradigm for a
  single-page tool with one user. The event volume here is a handful of changes per interaction.
- *Passing everything as function arguments*: was the implicit status quo and is what produced the
  1880-line file.
- *An ECS*: massively over-engineered for ~30 scene objects and 6 domains.

### R3. Lighting model — a fixture record with a type catalogue

**Decision**: Every light becomes a plain data record — id, name, type, position, aim, colour,
intensity, plus type-specific properties — held in `lightingRig`. A `fixtureTypes` catalogue defines
which properties each type exposes, its defaults, and its limits. `fixtureFactory` turns a record
into Three.js objects and updates them in place. The existing central light rig becomes one fixture
type rather than a special case.

**Rationale**: This is the change that unlocks four separate requirements at once: per-light editing
(FR-002), adding fixtures (FR-004), saving looks (FR-005), and export (FR-024). Once lighting is
data rather than construction code, a look is simply a snapshot of that data, and the design file is
simply that data serialised. Doing this any other way means writing look capture and serialisation
three times.

Fixture types to support initially: `ambient`, `directional` (the existing key and rim),
`point`, `spot`, `centralBeam` (the pulsing rig), `wash` (the screen and box spills), and
`projector` (visual cone only, no illumination).

**Alternatives rejected**:
- *Keep imperative light creation and add UI on top*: every new control would need bespoke wiring,
  and looks would have to enumerate lights by hand.
- *Adopt a real DMX / fixture-profile model now*: correct eventually, but it requires photometric
  data and a patch model that nobody has asked to enter yet. The record shape deliberately leaves
  room for `dmx: { universe, address, profile }` to be added without restructuring.

### R4. Lighting fidelity — visual approximation with a shadow budget

**Decision**: Target convincing mood, not physical accuracy. Keep exactly one shadow-casting light
by default; allow a second only behind an explicit warning. Use inverse-square decay (already in
use, `decay: 2`), `SpotLight` with penumbra for aimed fixtures, and bloom for glow. Do not compute
or display lux.

**Rationale**: Constitution Principle V exists because transparency and object count already caused
a real "stuck-feeling orbit" complaint. Beam volumes and shadow maps are the two most expensive
things this feature could add. A shadow map per fixture at 1024² would dominate the frame budget
within a handful of fixtures. SC-010 (30 fps with 12 fixtures) is only reachable with a hard cap.

**Alternatives rejected**:
- *Shadow casting on every fixture*: fails the performance criterion outright.
- *Photometric / IES-based rendering*: needs real fixture data, and Three.js has no first-class IES
  support — it would mean custom shaders for a benefit nobody requested.
- *Volumetric ray-marched beams*: beautiful and far too expensive; the existing shader-based cone
  silhouette on the central rig is the right cost tier and should be the model for spots.

### R5. Measurement — pure functions returning tagged values

**Decision**: `dimensions/measurements.js` exports pure functions that take a space configuration
and return `Measurement` records: `{ id, label, value, unit, source: 'confirmed' | 'derived' |
'estimated', warning? }`. No Three.js import. The panel, the 3D annotations, the floorplan overlay,
and the schedule export all consume the same records.

**Rationale**: This directly satisfies FR-030 (calculation separate from drawing) and FR-014 /
SC-005 (every value labelled). It also makes the measurements the one part of this feature that can
be tested without a browser — `scripts/verify-measurements.mjs` can import the module in Node and
assert values, which is why this module is the natural place to start building a real test habit.

The provenance tagging resolves A4: `floorplanData.js` knows which of its constants came from a
labelled dimension line (`confirmed`) versus a fitted or assumed value (`estimated`), and every
derived measurement inherits the weakest source of its inputs.

**Alternatives rejected**:
- *Compute measurements inside the panel*: the 3D annotations and the SVG overlay would each need
  their own copy, which is how the current duplication arose.
- *Compute from the built Three.js meshes*: makes measurement depend on rendering, prevents
  headless testing, and would report what was drawn rather than what was specified.

### R6. Ring-to-ring distance — report clear gap, not centreline difference

**Decision**: The headline ring spacing figure is the **clear walkable gap**: `r[i+1] - r[i]` minus
the fabric thickness allowance, reported alongside the raw centreline difference.

**Rationale**: The current `updateGapPreview()` shows `RING_RADII[0] × (growthFactor − 1)` — a
centreline difference for one pair only. An architect asking "can a visitor walk between these
rings" needs the clear dimension. Reporting both keeps the geometric figure available without
misleading the person making an access decision. Curtain fabric is modelled with no thickness today,
so the allowance is a documented, editable constant rather than a measured value — and is therefore
tagged `estimated`.

**Alternatives rejected**:
- *Centreline only*: the number an architect would misread as walkable width.
- *Clear gap only*: loses the figure that the growth-factor control actually drives.

### R7. Curtain dimensions — per panel and per ring

**Decision**: For each ring report: radius, diameter, circumference, curtain height, per-panel arc
length (`r × arcRad`) and area (`arcLength × height`), panel count, total fabric length and area per
ring, and each door opening's angular width and chord width (`2r·sin(θ/2)`).

**Rationale**: `ringFabricArcs(i)` already returns exactly the `[startRad, lengthRad]` pairs needed —
it is described in the code as the single source of truth shared by the 3D rings, the maze route,
and the floorplan overlay. Making it pure and exported turns it into the measurement source with no
new geometry work. Height already tapers per ring (`CURTAIN_H − min(i,10) × 0.06`), so per-panel
area must use the ring's own height, not a global one.

Chord width matters because a door's *angular* width is constant while its *physical* width grows
with radius — the existing `gapAngleDeg(r)` computes the inverse relation, so a technician reading
"60°" on the outer ring has no idea how wide the gap actually is.

### R8. Cameras — one safe runner for all scripted modes

**Decision**: All scripted camera behaviour (walkthrough, central orbit, fly-to between saved views)
runs through a single runner in `cameras/cameraModes.js` that owns the animation frame, wraps each
step in `try/catch`, and guarantees the stop-and-restore call on completion, error, or interruption.
Saved views store position, target, and lens.

**Rationale**: Constitution Principle III is non-negotiable and exists because a real bug left the
`walking` flag stuck `true`, permanently blocking orbit controls. Today the pattern is hand-rolled
in each mode and both modes share the same `walking` flag — adding a third scripted behaviour
(fly-to) by copying that pattern is how the bug returns. Making the guarantee structural means new
modes cannot get it wrong.

**Alternatives rejected**:
- *Copy the try/catch pattern into fly-to*: satisfies the letter of the principle and reintroduces
  its failure mode on the next addition.
- *Three.js `OrbitControls`*: would replace the working custom orbit implementation and does not
  solve the scripted-mode safety problem, which is the actual risk.

### R9. Camera lens — vertical field of view, displayed as 35 mm equivalent

**Decision**: Expose the camera's vertical field of view as the control, and display it alongside
its 35 mm-equivalent focal length.

**Rationale**: Lighting and museum staff talk in lens terms; the renderer needs degrees. Showing
both means nobody has to convert. FOV is already changed programmatically today (62° for central
orbit, 45° elsewhere) but is not exposed at all.

### R10. Persistence — localStorage autosave plus a JSON file for sharing

**Decision**: Two mechanisms. `project/autosave.js` writes the working state to `localStorage` on a
debounce and restores it on load (FR-025). `project/stageDocument.js` serialises the same state to a
downloadable, versioned JSON file for sharing (FR-024). The document carries a schema version, and
loading applies documented defaults for missing fields while reporting anything it could not
restore (FR-026).

**Rationale**: The project is static-hosted with no server, so a file is the only sharing mechanism
available. Separating autosave from the shareable document matters: autosave must never surprise a
collaborator by overwriting what they deliberately imported, and the document must be readable and
diffable by a human.

**Alternatives rejected**:
- *A backend with accounts and shared documents*: out of scope per the spec's assumptions, and
  incompatible with GitHub Pages static hosting.
- *URL-encoded state*: elegant for small state, but a full design with fixtures, looks, and views
  will exceed practical URL limits.
- *Real-time collaborative editing (CRDT)*: explicitly out of scope; would dominate the entire
  feature's effort.

### R11. Layer organisation — a registry with per-discipline presets

**Decision**: `layers/layerRegistry.js` maps each layer id to its scene group plus metadata (domain
group, human-readable name, default visibility per discipline).
`layers/disciplinePresets.js` defines the four collaborator sets.

Proposed defaults:

| Layer | Lighting | Architecture | Technical | Museum |
|---|:--:|:--:|:--:|:--:|
| Room shell, floor | on | on | on | on |
| Curtains | on | on | on | on |
| Screen | on | on | on | on |
| Technical / ventilation | off | on | on | off |
| Grid | off | on | off | off |
| Circulation / flow | off | on | off | off |
| Central rig | on | off | on | on |
| Background box | on | on | on | on |
| Ceiling fixtures | on | off | on | off |
| Dimension annotations | off | on | on | off |
| People | on | off | off | on |

**Rationale**: The existing panel already groups layers into Architecture, Circulation, and
Lighting & rig, so the grouping concept is established — this adds the audience dimension on top.
Presets must be overridable (FR-023) because these defaults are a starting guess, not a rule.

### R12. Testing — pure-function checks in Node, browser checks in Playwright

**Decision**: Keep the existing Playwright scripts as the end-to-end regression gate and run them
after every extraction stage. Add `scripts/verify-measurements.mjs`, a plain Node script that
imports the pure geometry and measurement modules and asserts known values. Declare Playwright as a
devDependency so the verification scripts are reproducible.

**Rationale**: Introducing a full test framework is not justified for a single-page tool, but the
measurement modules are the one part where a wrong number is both easy to introduce and invisible on
screen — and they are pure, so testing them costs almost nothing. Playwright is currently imported
by two scripts without being declared, which will break on a fresh clone.

**Known assertions to seed it**: ring 1 diameter is 6.533 m (confirmed); room is 10.12 × 22.34 m;
`computeProjectionStudy()` main sweep is 227° and recommends more than one projector.

### R13. Documentation format — a concern-to-component map plus per-module headers

**Decision**: `docs/components/README.md` holds a table mapping each concern to exactly one owning
module. Each domain gets a page describing its data, its public functions, and its side effects on
the scene. Every module carries a header comment stating its responsibility, inputs, outputs, and
side effects.

**Rationale**: SC-009 requires a developer to find the owning component in under two minutes from
documentation alone. A table indexed by concern — the thing someone actually arrives with — beats
prose or generated API docs. The existing `Index.html` handoff comment block proves the team already
values this kind of note; this gives it a home that scales past one file.

**Alternatives rejected**:
- *JSDoc plus a generated site*: generated reference tells you what a function does once you have
  found it; the hard part here is finding it.
- *A single ARCHITECTURE.md*: becomes the documentation equivalent of `main.js`.

---

## Part C — Open items carried into implementation

These do not block design but must be decided during the stage that touches them.

1. **Fabric thickness allowance** (R6) — needs a real value from the fabric spec, or stays a
   documented estimate. Ask the technicians.
2. **Ceiling height** — currently an estimated wall height. Any fixture mounting-height report
   inherits that uncertainty and must be tagged `estimated` until confirmed.
3. **Whether `visualSettings.js` survives** — folded into `stageModel` as the mood section, kept as
   a compatibility shim during stages 1–4, removed in stage 8 if nothing still imports it.
4. **Undo** — not specified, not planned. Once lighting and space are data records, an undo stack
   becomes cheap; worth revisiting after stage 7 rather than designing for it now.
