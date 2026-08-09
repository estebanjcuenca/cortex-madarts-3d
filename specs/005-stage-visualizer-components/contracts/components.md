# Contract: Component Boundaries

**Feature**: 005-stage-visualizer-components | **Phase**: 1

This is the authoritative answer to "which module owns this?" (FR-027, SC-009). It is the source
for `docs/components/README.md`.

## Rules that apply to every component

1. **One responsibility, stated in the module header.** If the header needs "and", split it.
2. **Pure modules never import Three.js.** `ringField`, `measurements`, `route`, `flowRoutes`,
   `floorplanData`, `fixtureTypes`, and `stageDocument` are pure. They must be importable in Node.
3. **View modules never own data.** They read from a domain module and write back through its API.
4. **No component reaches into another's scene objects.** Cross-domain effects go through the event
   bus.
5. **Every interaction plane uses `side: THREE.DoubleSide`** (Constitution IV), enforced by
   `pickRegistry`.
6. **Every scripted camera animation goes through the mode runner** (Constitution III).
7. **Every module documents its side effects on the shared scene**, or states that it has none.

---

## Concern → owning component

| If you want to change… | Open this |
|---|---|
| Room shape, walls, floor, clipping | `space/roomShell.js` |
| Ring radii, door angles, fabric arc maths, trim | `space/ringField.js` (pure) |
| How curtains are drawn | `space/ringBuilder.js` |
| Projection screen, projectors, throw cones | `space/screenAssembly.js` |
| Ventilation, niches, booth | `space/technicalLayer.js` |
| Confirmed source dimensions from the floorplan | `space/floorplanData.js` (pure) |
| What gets measured and how | `dimensions/measurements.js` (pure) |
| How dimensions look in the 3D view | `dimensions/measurementOverlay.js` |
| The dimensions table | `ui/dimensionsPanel.js` |
| Adding a fixture type | `lighting/fixtureTypes.js` + `lighting/fixtureFactory.js` |
| Fixture add/remove/update, shadow budget | `lighting/lightingRig.js` |
| Saving and recalling looks | `lighting/looks.js` |
| The central beam's pulse behaviour | `lighting/centralLight.js` |
| Orbit, pan, zoom feel | `cameras/cameraController.js` |
| Walkthrough, central orbit, fly-to | `cameras/cameraModes.js` |
| Saved views | `cameras/views.js` |
| Which layers exist | `layers/layerRegistry.js` |
| What each discipline sees by default | `layers/disciplinePresets.js` |
| The design file format | `project/stageDocument.js` (pure) |
| Autosave and restore | `project/autosave.js` |
| Routes, passage graph, flow enumeration | `analysis/route.js`, `analysis/flowRoutes.js` (pure) |
| The 2D floorplan panel | `floorplanPanel/panel.js`, `floorplanPanel/overlay.js` |
| Which scene objects are clickable | `core/pickRegistry.js` |
| App wiring and startup order | `main.js` |

---

## core/

### `stageContext.js`
**Responsibility**: Create and hold the rendering singletons and scene groups. Created once at
startup and passed to every component that needs the scene.

**Exports**: `createStageContext({ mount })` → `{ scene, camera, renderer, composer, bloomPass,
labelRenderer, groups, render() }`

**Inputs**: the DOM mount element.
**Outputs**: the context object.
**Side effects**: appends canvases to the DOM; installs the resize handler.

`render()` is the single frame entry point — the successor to today's `renderFrame()`. Image
capture, video capture, and every camera mode call it. Nothing may call `composer.render()`
directly (Constitution II).

### `stageModel.js`
**Responsibility**: Hold the authoritative design state (`SpaceConfig`, `MoodSettings`, `LayerState`,
analysis mode) and emit change events. The only writable source of truth.

**Exports**: `getSpace()`, `updateSpace(patch)`, `getMood()`, `updateMood(patch)`, `getLayerState()`,
`updateLayerState(patch)`, `subscribe(event, fn)`

**Side effects**: emits on the event bus. Never touches Three.js.

### `eventBus.js`
**Responsibility**: Named publish/subscribe. Replaces the implicit `buildRings()` cascade.

**Events**: `space:changed`, `rings:rebuilt`, `fixtures:changed`, `look:recalled`,
`camera:changed`, `layers:changed`, `selection:changed`, `document:loaded`

**Exports**: `emit(event, payload)`, `on(event, fn)` → unsubscribe

Payloads carry *what* changed so subscribers can skip irrelevant work — the mechanism that keeps
SC-004's one-second budget reachable.

### `pickRegistry.js` — ✅ built
**Responsibility**: Own the raycast target lifecycle. Replaces the `raycastTargets` and
`ceilingRaycastTargets` arrays that every builder mutated.

**Exports**: `createPickRegistry()` → `{ register, registerAll, unregister, unregisterGroup, pick,
list, setList, stats }`, plus the `CHANNEL` constant.

*Implemented as a factory rather than bare module functions* — it holds scene-specific state, so a
singleton would prevent a second scene or a headless test. The event bus stayed a singleton because
any module may emit into it.

**Channels**: `CHANNEL.MAIN` and `CHANNEL.CEILING` are raycast independently, never merged. The
ceiling plane must stay separate: the camera usually sits above wall height, so a full-room ceiling
plane in the main channel would intercept nearly every click before it reached the floor or rings.

**`group`** defaults to `object.userData.kind`, which is what the builders already set — so
`unregisterGroup('ring')` is a drop-in for the old
`raycastTargets.filter(m => m.userData.kind !== 'ring')` idiom.

**`pick()`** returns `{ object, root, group, point, distance, meta }`, where `root` walks up to the
nearest ancestor carrying a `userData.kind`. That is how a click on one mesh of a loaded humanoid
resolves to the person group.

**`setList()`** exists only so `peopleManager`'s existing `getRaycastTargets` / `setRaycastTargets`
contract keeps working untouched. Prefer `register` / `unregister` in new code.

**Enforces**: registering a `PlaneGeometry` whose material is not `THREE.DoubleSide` logs a warning
naming Constitution IV.

### `units.js`
**Responsibility**: Formatting and provenance. `formatMetres(v)`, `formatDegrees(v)`,
`formatArea(v)`, `weakestSource(...sources)`.

---

## space/

### `floorplanData.js` *(pure — from `src/floorplan.js`)*
**Responsibility**: Confirmed dimensions derived from the architect's SVG, plus their provenance.

**Exports**: `ROOM_M`, `CENTER_M`, `SCREEN`, `PLAN_RINGS`, `DOOR_M`, `TECHNICAL`,
`FLOORPLAN_SVG`, `computeProjectionStudy(screen)`, and **new** `PROVENANCE`.

**Change from today**: adds the `PROVENANCE` map so `measurements.js` can tag every derived value
(FR-014). The scale derivation (29.928 units/m from the labelled Ø4.800 and 4.695 lines) and the
ring-1 confirmation (Ø6.533) stay documented in this file.

### `roomShell.js`
**Responsibility**: Room shell geometry and the in-room predicates.

**Exports**: `buildRoomShell(ctx, room)`, `halfWidthAtZ(room, z)`, `isInsideRoomXZ(room, x, z)`,
`clampPointToRoom(room, p)`, `computeClipPlanes(room)`

The predicates are pure and are used by `ringField` for trimming and by `flowRoutes` for usable
doors; only `buildRoomShell` touches the scene.

### `ringField.js` *(pure)*
**Responsibility**: All ring and fabric mathematics. The single source of truth for ring geometry —
consumed by the 3D builder, the maze route, the floorplan overlay, and measurements.

**Exports**: `generateRadii(count, r0, growth)`, `gapAngleDeg(gapWidthM, radius)`,
`autoTrimWindows(room, center, radius)`, `ringFabricArcs(ringField, index)` →
`FabricPanel[]`, `usableDoors(ringField, room, index)`

**Side effects**: none. Angles in the plan convention only.

This is the highest-value extraction in the feature: it is currently trapped inside `main.js` yet is
described there as the shared source of truth for three separate consumers.

### `ringBuilder.js`
**Responsibility**: Turn `ringFabricArcs()` output into curtain meshes.

**Exports**: `buildRings(ctx, ringField, room)` → `{ arcs, dispose() }`

**Side effects**: populates the curtain group; registers picks; disposes previous geometry.

**Owns the angle conversion**: plan angles (+x CCW) → `CylinderGeometry` (+Z CW). This conversion
exists in exactly one place and is documented there.

### `screenAssembly.js`
**Responsibility**: Projection screen faces, gold edges, projector bodies, and throw cones.

**Exports**: `buildScreen(ctx, screenConfig)` → `{ study, dispose() }`, where `study` is
`computeProjectionStudy()` output for the inspector.

### `technicalLayer.js`
**Responsibility**: Wall niches, ducts, booth, entrance posts.

**Exports**: `buildTechnical(ctx, technical, room)` → `{ dispose() }`

---

## dimensions/

### `measurements.js` *(pure)*
**Responsibility**: Compute every reported dimension. No Three.js, no DOM.

**Exports**:
```
computeAllMeasurements(space) -> Measurement[]
computeRingMeasurements(space, ringIndex) -> Measurement[]
computeSpacingMeasurements(space) -> Measurement[]   // clear gaps between adjacent rings
computeCurtainMeasurements(space, ringIndex) -> Measurement[]
computeClearances(space) -> Measurement[]            // ring-to-wall, with overflow warnings
```

**Inputs**: a `SpaceConfig`. **Outputs**: `Measurement[]`. **Side effects**: none.

**Guarantees**:
- Every returned measurement carries a `source` tag (FR-014).
- Overflow is reported as a `warning` with the amount, never clamped (edge case).
- A ring with no usable openings reports that fact rather than a misleading width.
- `computeAllMeasurements` completes in under 100 ms for 20 rings.

**Testable in Node** — this is the seam `scripts/verify-measurements.mjs` targets.

### `measurementOverlay.js`
**Responsibility**: Draw selected measurements as dimension lines and labels in the 3D view, using
each `Measurement.anchors`.

**Exports**: `createMeasurementOverlay(ctx)` → `{ show(ids), hide(ids), setAll(measurements),
dispose() }`

**Side effects**: owns the `dimensions` layer group and CSS2D labels.

### `schedule.js` *(pure)*
**Responsibility**: Format `Measurement[]` into an exportable schedule (FR-013).

**Exports**: `toScheduleText(measurements)`, `toScheduleCsv(measurements)`

---

## lighting/

### `fixtureTypes.js` *(pure)*
**Responsibility**: The type catalogue — which properties each type exposes, defaults, and limits.

**Exports**: `FIXTURE_TYPES`, `defaultsFor(type)`, `paramSchema(type)`, `canCastShadow(type)`

Adding a new fixture type means editing this file and `fixtureFactory.js` — nothing else.

### `fixtureFactory.js`
**Responsibility**: Build and update Three.js objects for a `Fixture` record.

**Exports**: `createFixtureObjects(ctx, fixture)` → `{ objects, update(fixture), dispose() }`

**Guarantee**: `update()` mutates existing objects in place. It must not recreate lights — that
would drop shadow maps and cause a visible hitch on every slider drag (FR-003).

**Budget**: a fixture contributes at most one light, one body mesh, and one merged beam mesh
(Constitution V).

### `lightingRig.js`
**Responsibility**: The fixture registry and the shadow budget.

**Exports**: `createLightingRig(ctx)` → `{ list(), get(id), add(fixture), remove(id),
update(id, patch), rebuild(id, patch), objectsFor(id), applyAll(), setMood(mood), tick(t,
occupancy), shadowBudget(), dispose() }`

`ctx.parentFor(fixture)` selects the layer group a fixture is parented into, so layer visibility
keeps working. `rebuild()` exists for fixtures living in a group the scene clears wholesale
(`gRig.clear()` and friends) — everywhere else `update()` mutates in place. `objectsFor()` is an
escape hatch for the picking layer, which still works in terms of meshes.

**Side effects**: owns the lighting groups; emits `fixtures:changed`; drives `bloomPass.strength`
from mood.

**Enforces FR-008**: counts the shadow budget in render passes (see data-model §3.1), warns past
the soft budget, and refuses past the hard ceiling — returning a reason rather than silently
ignoring the request.

### `looks.js` *(pure apart from calling the rig)*
**Responsibility**: Capture, store, recall, and crossfade named lighting looks.

**Exports**: `captureLook(rig, mood, name)` → `Look`, `recallLook(rig, look, { fadeMs })` →
`{ applied, missing }`, `listLooks()`, `deleteLook(id)`

**Guarantee**: `recallLook` never throws on a missing fixture — it reports it in `missing`.

### `centralLight.js` *(exists)*
**Change**: keeps its beam shader, glow sprite, and pulse maths, but is driven through the fixture
API as the `centralBeam` type. Its `setMultipliers` becomes `update(fixture)`. Its hardcoded red
becomes the fixture's `color`.

---

## cameras/

### `cameraController.js`
**Responsibility**: Manual orbit, pan, and zoom, and the camera's current state.

**Exports**: `createCameraController(ctx, { target, radius, theta, phi })` → `{ getState(),
setState(s), enable(), disable(), dispose() }`

**Side effects**: pointer and wheel listeners; emits `camera:changed`.

`disable()` is what scripted modes call, and it must be idempotent.

### `cameraModes.js`
**Responsibility**: All scripted camera behaviour, behind **one safe runner**.

**Exports**: `createModeRunner(ctx, controller)` → `{ run(modeDefinition), stop(), isRunning() }`,
plus `walkMode(route)`, `centralOrbitMode(center)`, `flyToMode(view)`

**Constitution III guarantee**: `run()` wraps every per-frame step in `try/catch` and calls
`stop()` — restoring manual control and resetting FOV — on completion, error, or interruption. A
mode definition supplies only `{ setup, step, teardown }`; it cannot bypass the guarantee.

### `views.js`
**Responsibility**: Saved camera views.

**Exports**: `saveView(name, controller)` → `CameraView`, `recallView(view, runner, { animate })`,
`listViews()`, `deleteView(id)`, `markStale(views, room)`

---

## layers/

### `layerRegistry.js`
**Responsibility**: Map layer ids to scene groups plus metadata.

**Exports**: `registerLayer({ id, label, domain, group })`, `setVisible(id, visible)`,
`getVisibility()`, `listByDomain()`

### `disciplinePresets.js` *(pure)*
**Exports**: `DISCIPLINE_PRESETS`, `applyPreset(id)` → visibility map

---

## project/

### `stageDocument.js` *(pure)*
**Responsibility**: Serialise and deserialise a `StageDocument`, including version handling.

**Exports**: `serialize(state)` → `StageDocument`, `deserialize(doc)` →
`{ state, warnings[] }`, `SCHEMA_VERSION`

**Guarantee**: `deserialize` never throws on recoverable problems — it returns `warnings`. It throws
only on an unrecognised `schemaVersion` (FR-026).

### `autosave.js`
**Responsibility**: Debounced `localStorage` write and restore of the working state (FR-025).

**Exports**: `startAutosave({ collect })` → `{ schedule, saveNow, stop }`, `restore()` →
`{ state, warnings } | null`, `clear()`

`collect()` returns the state to persist, so this module never has to know which components
exist. It subscribes to `fixtures:changed` and visual-settings changes itself; anything else
that should trigger a write calls `schedule()`.

### `mediaStore.js`
**Responsibility**: Persist the default screen media **file** in IndexedDB.

**Exports**: `saveDefaultMedia(file)`, `loadDefaultMedia()`, `clearDefaultMedia()`

Separate from `autosave.js` because this holds a Blob: `localStorage` is strings only, so a file
would need base64 encoding into a ~5 MB quota. Every call resolves rather than throwing, and
resolves to null when storage is unavailable — a lost default must never block startup.

---

## main.js — the composition root

After this feature `main.js` may only: create the stage context, construct each component in
dependency order, wire panels to components, restore autosave, and start the render loop.

It must not contain geometry maths, measurement, light construction, camera maths, or DOM handlers
for domain controls. Target: under 200 lines.
