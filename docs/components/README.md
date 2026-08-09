# Component map

**Start here.** This page answers one question: *which module owns the thing I want to change?*

Source of truth: [`specs/005-stage-visualizer-components/contracts/components.md`](../../specs/005-stage-visualizer-components/contracts/components.md).
When the two disagree, the contract wins and this page is stale — fix it.

> **Status: under construction.** Feature 005 is extracting these components out of `src/main.js`.
> Rows marked 🔜 do not exist yet; the concern currently lives in `src/main.js`. Rows marked ✅ are
> real modules you can open today. Update a row the moment its task lands.

---

## Concern → owning component

| If you want to change… | Open this | Status |
|---|---|---|
| Room shape, walls, floor, clipping | `src/space/roomShell.js` | 🔜 |
| Ring radii, door angles, fabric arc maths, trim | `src/space/ringField.js` *(pure)* | 🔜 |
| How curtains are drawn | `src/space/ringBuilder.js` | 🔜 |
| Projection screen, projectors, throw cones | `src/space/screenAssembly.js` | 🔜 |
| Ventilation, niches, booth | `src/space/technicalLayer.js` | 🔜 |
| Confirmed source dimensions from the floorplan | `src/space/floorplanData.js` *(pure)* | ✅ as `src/floorplan.js` |
| What gets measured and how | `src/dimensions/measurements.js` *(pure)* | 🔜 |
| How dimensions look in the 3D view | `src/dimensions/measurementOverlay.js` | 🔜 |
| The dimensions table | `src/ui/dimensionsPanel.js` | 🔜 |
| Adding a fixture type | `src/lighting/fixtureTypes.js` + `src/lighting/fixtureFactory.js` | 🔜 |
| Fixture add/remove/update, shadow budget | `src/lighting/lightingRig.js` | 🔜 |
| Saving and recalling looks | `src/lighting/looks.js` | 🔜 |
| The central beam's pulse behaviour | `src/lighting/centralLight.js` | ✅ |
| Line-drawing render mode, and what it hides or outlines | `src/render/lineView.js` | ✅ |
| Orbit, pan, zoom feel | `src/cameras/cameraController.js` | 🔜 |
| Walkthrough, central orbit, fly-to | `src/cameras/cameraModes.js` | 🔜 |
| Saved views | `src/cameras/views.js` | 🔜 |
| Which layers exist | `src/layers/layerRegistry.js` | 🔜 |
| What each discipline sees by default | `src/layers/disciplinePresets.js` | 🔜 |
| Layer visibility UI | `src/ui/layersPanel.js` | ✅ |
| Heatmap brightness and bias | `src/ui/heatmapControls.js` | ✅ |
| Lighting sliders | `src/ui/lightingControls.js` | ✅ |
| Sliders, colour fields, lists — the reusable widgets | `src/ui/controls/` | ✅ |
| The design file format | `src/project/stageDocument.js` *(pure)* | 🔜 |
| Autosave and restore | `src/project/autosave.js` | 🔜 |
| Routes, passage graph, flow enumeration | `src/analysis/route.js`, `src/analysis/flowRoutes.js` *(pure)* | ✅ as `src/maze/` |
| The 2D floorplan panel | `src/floorplanPanel/panel.js`, `src/floorplanPanel/overlay.js` | 🔜 |
| Which scene objects are clickable | `src/core/pickRegistry.js` | ✅ |
| Cross-component change notifications | `src/core/eventBus.js` | ✅ |
| Shared scene, renderer, composer | `src/core/stageContext.js` | 🔜 deferred → US5 |
| The authoritative design state | `src/core/stageModel.js` | 🔜 deferred → US5 |
| People, spawning, occupancy | `src/people/peopleManager.js` | ✅ |
| App wiring and startup order | `src/main.js` | ✅ |

---

## Rules every component follows

1. **One responsibility, stated in the module header.** If the header needs "and", split it.
2. **Pure modules never import Three.js.** `ringField`, `measurements`, `route`, `flowRoutes`,
   `floorplanData`, `fixtureTypes`, and `stageDocument` must be importable in Node — that is what
   makes them testable without a browser.
3. **View modules never own data.** They read from a domain module and write back through its API.
4. **No component reaches into another's scene objects.** Cross-domain effects go through the event
   bus.
5. **Every interaction plane uses `side: THREE.DoubleSide`** (Constitution IV). After `rotateX()`, a
   single-sided plane's normal can face away from the camera and raycasting silently drops the hit.
   This caused a real bug on the ceiling-light plane.
6. **Every scripted camera animation goes through the mode runner** (Constitution III). A real bug
   once left the `walking` flag stuck `true`, permanently blocking orbit controls.
7. **Every module documents its side effects on the shared scene**, or states that it has none.

---

## Module header convention

Every module under `src/` opens with this block. It exists so a reader can decide whether this is
the file they want **without reading the implementation**.

```js
/**
 * <One sentence: what this module is responsible for. No "and".>
 *
 * Inputs:  <what it reads — parameters, state it subscribes to>
 * Outputs: <what it returns or emits>
 * Effects: <what it changes in the shared scene, DOM, or storage — or "none (pure)">
 *
 * <Optional: constraints, gotchas, or a constitution principle this file enforces.>
 */
```

Worked example:

```js
/**
 * Turns ring fabric arc data into curtain meshes.
 *
 * Inputs:  a RingField (from space/ringField.js) and a Room (from space/roomShell.js)
 * Outputs: { arcs, dispose() }
 * Effects: populates the curtain scene group; registers picks; disposes prior geometry
 *
 * Owns the ONLY plan-angle → CylinderGeometry conversion in the codebase.
 * Plan maths uses +x counter-clockwise; CylinderGeometry measures from +Z clockwise.
 * If curtains render rotated, this conversion is why.
 */
```

---

## Domain pages

Written during feature 005 stage 8 (task T068). Until then this index is the whole documentation.

- `space.md` — room, rings, fabric arcs, screen, technical layer
- `dimensions.md` — what is measured, and confirmed vs estimated provenance
- `lighting.md` — fixture model, types, looks, shadow budget
- `cameras.md` — controller, scripted modes, saved views
- `layers.md` — registry and discipline presets

---

## Size budget

No source file over **400 lines**, exemptions recorded here with a reason.

| File | Lines | Exemption reason |
|---|---|---|
| `src/main.js` | 2267 | Being dismantled by feature 005; target is under 200 by task T070 |
| `src/maze/flowRoutes.js` | 513 | Pure graph enumeration, no natural seam; revisit at task T071 |

Check current state:

```bash
find src -name '*.js' -exec wc -l {} + | sort -rn | head -20
```
