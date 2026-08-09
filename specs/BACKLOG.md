# Backlog — deferred ideas worth keeping

**Last reviewed**: 2026-08-09

This is the parking lot. Nothing here is scheduled. Every item was deliberately deferred at some
point and is recorded with **where it came from** and **what would make it worth doing**, so no
decision has to be reconstructed from memory later.

Items are removed from this file only when they land in a feature spec, or when they are explicitly
killed with a reason.

---

## B1 — WebGPU migration

**Origin**: Constitution v1.1.0 Future Direction, Stage 2 · deferred in
[002 US3](./002-light-realism-maze-fix/spec.md), decided in
[002 research.md R1](./002-light-realism-maze-fix/research.md)

**Status**: Deferred, with documented re-evaluation triggers.

The decision was to stay on `WebGLRenderer`. The reasons still hold: Safari 26.4 regressed WebGPU
canvases to black on macOS and iPadOS, and Three.js r172 still labels `WebGPURenderer` experimental
while recommending `WebGLRenderer` for pure WebGL2 work.

**Re-evaluate when any of these becomes true:**
- Safari ships a fix for the 26.4 WebGPU regression and it reaches the demo audience
- Three.js drops the "experimental" label for `WebGPURenderer`
- Scene complexity exceeds what WebGL can sustain at the target frame rate
- A feature genuinely requires TSL node materials or compute shaders

**One trigger needs rewording.** R1's fifth point and the re-evaluation list both gate on
re-validating **GIF capture**, which no longer exists — recording moved to `MediaRecorder`. The
equivalent modern check is that `captureVideoFrame()` and `renderer.domElement` capture still work
under the new swap-chain semantics. Fix this when the WebGPU spec is written, not before.

---

## B2 — PBR materials from reference photography

**Origin**: Constitution v1.1.0 Future Direction, Stage 1 · noted as "highest impact per effort" in
the `Index.html` handoff notes · listed out of scope in
[001 plan.md](./001-3d-humanoid-people/plan.md)

**Status**: Not started. Verified absent — there is no `TextureLoader`, `RGBELoader`, `envMap`, or
`PMREMGenerator` anywhere in `src/`.

Stage 1 called for three things: PBR textures, real shadows and bloom, and GLTF geometry. **Two of
the three shipped** — shadows and bloom in feature 002, GLTF people in feature 001. Curtain fabric,
floor, and wall materials are still flat `MeshStandardMaterial` with a hardcoded colour and opacity.

This is the largest remaining visual-fidelity gain available without changing renderer, and 002's
research explicitly confirms PBR maps are **not** blocked by WebGL. Worth its own small feature once
the component structure from 005 lands, because material definitions currently live inline in
`buildRings()`.

**Related**: HDRI environment lighting was named in the same Stage 1 list and is also absent.

---

## B3 — Cloth simulation on curtain rings

**Origin**: Constitution v1.1.0 Future Direction · handoff notes

**Status**: Deferred, and explicitly *not* solved by WebGPU alone.

The constitution flags this as a separate decision that could force Unreal or Unity rather than a
browser engine. Nothing in the current or planned work depends on it. Revisit only if static fabric
becomes the thing people criticise in reviews.

---

## B4 — Bind the walkthrough to the selected flow route

**Origin**: [004 spec.md](./004-visual-controls-components/spec.md) "Next steps"

**Status**: Not carried into feature 005. **This is the only 004 item with no home.**

Today the walkthrough camera always follows the default maze route from `computeMazeRoute()`, while
the flow slider selects among all enumerated passage-graph routes independently. Selecting route 7
and then walking still walks route 0.

**Why it's cheap after 005**: task T052 ports the walkthrough to `walkMode(route)` — a mode
definition that already takes a route as its argument. Wiring the flow slider's current selection
into that argument is close to a one-line change at that point. Deliberately left out of 005 to
avoid inflating scope; pick it up right after Phase 5 lands.

---

## B5 — DMX patch and real fixture profiles

**Origin**: Confirmed out of scope for [005](./005-stage-visualizer-components/spec.md) (Assumptions:
"visual approximation, not photometric simulation")

**Status**: Deferred by explicit decision, but **designed for**.

The layers panel has said "Sensor + DMX light" since before any lighting model existed. If the
technicians later need the visualizer to match what they actually rig, this becomes real work:
manufacturer photometric data, a universe/address/channel model, and a patch export.

**Groundwork already in place**: `data-model.md` §3 reserves `dmx: { universe, address, profile }`
on the `Fixture` record specifically so this can be added without restructuring. Adding it means
extending `fixtureTypes.js` and the inspector — not redesigning the lighting system.

---

## B6 — Multi-user real-time collaboration

**Origin**: Confirmed out of scope for 005 (Assumptions: "local-first, not multi-user")

**Status**: Deferred by explicit decision.

Collaboration currently happens by exporting a `.cortex.json` and sharing it. Real-time co-editing
would need a server, identity, and conflict resolution — incompatible with static GitHub Pages
hosting (Constitution: "static files only, no server-side logic") and larger than the entire 005
feature.

**Cheaper middle ground if file-passing proves painful**: a read-only shared link that loads a
published document from a URL, with editing still local. No server logic, no merge problem.

---

## B7 — CAD round-trip (DXF / IFC)

**Origin**: Considered and rejected during 005 scoping

**Status**: Deferred by explicit decision — measurements are indicative, for design review, not
fabrication.

If the architects ever need the ring layout to flow back into their drawing set, this matters. Note
the current model's honest limit: geometry is fitted from a cropped floorplan image at
29.928 units/m, and Constitution VII requires that estimated values are never silently "corrected".
A CAD export would need confirmed source dimensions first, not just a file format.

---

## B8 — Undo / redo

**Origin**: [005 research.md](./005-stage-visualizer-components/research.md) Part C, item 4

**Status**: Not specified, not planned, deliberately not designed for.

Once space and lighting are plain data records (which is exactly what 005 delivers), an undo stack
becomes cheap — snapshot the state on each change. Revisit after Phase 7 rather than building
speculative infrastructure now.

---

## B9 — Persist visual settings to localStorage

**Origin**: [004 spec.md](./004-visual-controls-components/spec.md) "Next steps"

**Status**: **Superseded — scheduled.** Delivered by 005 task T065 (`src/project/autosave.js`),
which persists the whole design rather than just the visual sliders.

Kept here only to record that the 004 idea was absorbed rather than dropped. Remove on T065
completion.

---

## B10 — Line-drawing mode: real panel seams and vector export

**Origin**: Line-drawing render mode (`src/render/lineView.js`), built from the "Intimate Immersive
Version" technical drawing.

**Status**: Shipped as a screen mode; two follow-ups deferred.

The mode draws curtain seams at a fixed **0.42 m spacing along the arc**, which matches the look of
the reference drawing but is not the real panel layout — the fabric's actual seam positions are not
in the model. If the technicians confirm panel widths, the constant becomes a per-ring property and
the drawing becomes shop-accurate rather than indicative. Constitution VII applies: the current
spacing is a stylistic approximation and must not be reported as a measurement.

Second follow-up: the mode renders to the canvas, so "Save image" produces a PNG. An SVG export of
the same edge set would make it a drawing the architects can drop straight into a document, the way
the 2D floorplan panel already exports. The edge geometry is already computed; it needs projecting
through the camera and serialising.

---

## Open questions carried from 005 research (Part C)

Not backlog items — these must be answered *during* implementation, not deferred past it.

| Question | Blocks | Who answers |
|---|---|---|
| Fabric thickness allowance for clear-gap calculations | 005 T040 | Technicians |
| Confirmed ceiling height (currently estimated) | 005 T077, any mounting-height report | Architects |

Until answered, both stay tagged `estimated` in `src/space/floorplanData.js` and every measurement
derived from them inherits that tag.
