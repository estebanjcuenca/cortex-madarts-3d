# Quickstart: Validating Stage Visualizer & Designer Components

**Feature**: 005-stage-visualizer-components | **Phase**: 1

How to prove the feature works. Each section maps to a user story and its success criteria, and each
can be run independently once its stage has landed.

## Prerequisites

```bash
cd /Users/esteban/Documents/CORTEX-MA
npm install
npm run dev          # http://localhost:5173
```

Playwright is required by the verification scripts but is currently undeclared. Add it once:

```bash
npm i -D playwright && npx playwright install chromium
```

## Regression gate — run after every stage

The existing browser checks are the safety net for the whole refactor. They must pass unchanged
after each extraction stage (FR-031, SC-011).

```bash
node scripts/verify-maze.mjs      # generates layouts, asserts the walkable route validates
node scripts/verify-screen.mjs    # asserts the projection study and screen geometry
```

**Expected**: both exit `0` with no reported route violations. A failure means the extraction
changed geometry behaviour — fix before continuing, do not proceed to the next stage.

---

## Stage 3 — Dimensions (User Story 2)

### Headless: pure measurement checks

```bash
node scripts/verify-measurements.mjs
```

**Asserts** (seed set from `research.md` R12):
- Room is 10.12 × 22.34 m and reports as `confirmed`
- Ring 1 diameter is 6.533 m and reports as `confirmed`
- Wall height reports as `estimated`
- Ring spacing returns one entry fewer than the ring count
- Clear gap is less than the centreline difference for every pair
- Door chord width grows with radius at a constant angular width
- `computeProjectionStudy()` main sweep is 227° and recommends more than one projector
- Every returned `Measurement` has a `source` field — 100% coverage (SC-005)
- `computeAllMeasurements()` on 20 rings completes in under 100 ms

### In browser

1. Open the dimensions panel. **Expect**: per-ring radius, diameter, circumference, curtain height,
   panel count, fabric length and area; per-pair clear gap; wall clearances; screen study.
2. Confirm each row shows a provenance badge (SC-005).
3. Change `#growth` from its default to `1.35`. **Expect**: every spacing and clearance row updates
   within one second, no manual refresh (SC-004).
4. Increase the ring count with `#addRing` until a ring exceeds the room. **Expect**: that ring is
   flagged with the overflow amount stated in metres — not hidden, not clamped.
5. Change `#gapWidth`. **Expect**: door chord widths change while angular widths change inversely
   with radius.
6. Toggle a row's annotation. **Expect**: the dimension appears as a labelled line in the 3D view.
7. Export the schedule. **Expect**: a readable file containing every currently displayed value.

---

## Stage 4 — Lighting (User Story 1)

1. Click the central beam. **Expect**: the inspector shows colour, intensity, beam params, and the
   occupancy-pulse toggle.
2. Drag the intensity slider. **Expect**: the view updates continuously during the drag, with no
   frame hitch — confirming `fixtureFactory.update()` mutates in place rather than recreating
   lights (FR-003).
3. Change the colour to `#3f5fd6`. **Expect**: the beam, the glow sprite, and the light on people
   all change together.
4. Add a `spot` fixture, position it, and aim it at the outer curtain. **Expect**: it illuminates
   the fabric and appears in the fixture list.
5. Enable `castShadow` on a second fixture. **Expect**: a clear message that the shadow budget is
   reached; the request is refused or requires confirmation (FR-008) — never silently accepted.
6. Save the state as "Opening — cold blue". Change several fixtures. Recall the look. **Expect**:
   every fixture returns to its saved values (SC-002).
7. Delete a user fixture that a saved look references, then recall that look. **Expect**: the rest
   of the look applies and the missing fixture is reported.
8. **Timed check (SC-001)**: from a fresh load, select a light, change colour and intensity, and
   save a named look — under 60 seconds without instructions.

---

## Stage 5 — Cameras (User Story 3)

1. Frame a view and save it as "Visitor entry". Orbit far away. Recall it. **Expect**: identical
   framing (SC-006).
2. Recall a second view. **Expect**: a smooth transition, interruptible by a mouse drag, after which
   manual control works immediately.
3. **Constitution III check**: while a walkthrough is running, force an error in the step function
   (temporarily, via the browser console). **Expect**: the run stops, FOV resets, and orbit control
   is restored — never left blocked (FR-019).
4. Change the FOV slider. **Expect**: perspective changes and both degrees and the 35 mm equivalent
   are displayed.
5. Cycle all four modes (orbit, plan, walk, central). **Expect**: each behaves as it does today.
6. Record a video while switching modes. **Expect**: capture keeps working in every mode
   (Constitution II).

---

## Stage 6 — Layers (User Story 4)

1. Select each discipline preset in turn. **Expect**: visible layers match the table in
   `research.md` R11 (SC-007).
2. With a preset active, toggle one layer. **Expect**: the override holds and the preset is marked
   modified, with a reset available.
3. Read the layer list. **Expect**: grouped by domain with human-readable names, not a flat list.

---

## Stage 7 — Design document (User Story 5)

1. Configure space, fixtures, looks, and views. Export. **Expect**: a single `.cortex.json`, readable
   and indented, matching `contracts/stage-document.md`.
2. Hard-reload with cleared storage, then import the file. **Expect**: the same visual state (SC-008).
3. Hand-edit the file to reference a fixture type that does not exist. Import. **Expect**: everything
   else loads and the problem is reported in the project panel (FR-026).
4. Change `schemaVersion` to `99`. Import. **Expect**: a clear rejection naming the supported
   version — not a half-loaded state.
5. Make a change, reload without importing. **Expect**: the working state is restored automatically
   (FR-025).
6. Import over unsaved work. **Expect**: a confirmation before the current state is replaced.

---

## Stage 8 — Component documentation (User Story 6)

1. Open `docs/components/README.md`. Pick three concerns at random from the spec, for example
   "how door width converts to an angle", "where the shadow budget is enforced", and "where the
   `CylinderGeometry` angle conversion happens". **Expect**: each resolves to exactly one module in
   under two minutes without opening `main.js` (SC-009).
2. Open any component's module header. **Expect**: responsibility, inputs, outputs, and side effects
   stated without reading the implementation (FR-028).
3. Read `main.js`. **Expect**: composition only — no geometry maths, no measurement, no light
   construction, no camera maths (FR-029).
4. Check file sizes:

```bash
find src -name '*.js' -exec wc -l {} + | sort -rn | head -20
```

**Expect**: no file over 400 lines except where an exemption is recorded (SC-012).

---

## Performance check (SC-010)

1. Set occupancy to 20 people.
2. Add 12 user fixtures.
3. Enable the dimensions overlay and the circulation layer.
4. Orbit continuously for 30 seconds with the browser's frame-rate meter open.

**Expect**: at or above 30 fps throughout, and the transparency budget warning appears before the
frame rate degrades rather than after (Constitution V).

---

## Reference

- Component boundaries: [contracts/components.md](./contracts/components.md)
- Panel and DOM contract: [contracts/ui-panels.md](./contracts/ui-panels.md)
- File format: [contracts/stage-document.md](./contracts/stage-document.md)
- Entities: [data-model.md](./data-model.md)
- Decisions and rationale: [research.md](./research.md)
