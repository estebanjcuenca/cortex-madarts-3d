# Contract: UI Panels & DOM

**Feature**: 005-stage-visualizer-components | **Phase**: 1

Panels are views. They read from domain components and write back through the documented API. No
panel imports Three.js or touches a scene object.

## Panel init signature

Every panel follows the shape already established by `layersPanel.js`, `heatmapControls.js`, and
`lightingControls.js`:

```
initXPanel({ root, ...domainApis, onChange? }) -> { destroy() }
```

- `root` is an empty mount `<div>` in `Index.html`. The panel owns everything inside it.
- The panel subscribes to the relevant event-bus events and re-renders itself.
- The panel never queries DOM outside its own `root`.

## Mount points in `Index.html`

| Mount id | Panel | Status |
|---|---|---|
| `#layersPanelRoot` | `ui/layersPanel.js` | exists — gains discipline presets |
| `#heatmapControlsRoot` | `ui/heatmapControls.js` | exists |
| `#lightingControlsRoot` | `ui/lightingControls.js` | exists — becomes fixture list + looks |
| `#inspectorRoot` | `ui/inspector.js` | **new** |
| `#dimensionsPanelRoot` | `ui/dimensionsPanel.js` | **new** |
| `#camerasPanelRoot` | `ui/camerasPanel.js` | **new** |
| `#circulationControlsRoot` | `ui/circulationControls.js` | **new** — extracted from the HTML string currently injected through `layersPanel` |
| `#projectPanelRoot` | `ui/projectPanel.js` | **new** — import/export |

**Migration note**: the circulation controls (`#circPath`, `#circHeat`, `#circFlow`,
`#flowRouteSlider`, `#flowPrev`, `#flowNext`, `#ceilingModeBtn`) are currently passed to
`initLayersPanel` as a raw HTML string from `main.js`. They move into their own panel with their own
mount. The element ids are preserved so the Playwright verification scripts keep working.

## Preserved DOM contract

These ids are referenced by `scripts/verify-maze.mjs` and `scripts/verify-screen.mjs` and **must not
be renamed** without updating those scripts in the same change:

`#genMaze`, `#ringControls`, `#addRing`, `#removeRing`, `#growth`, `#gapWidth`, `#extendFar`,
`#offX`, `#offZ`, `#doorX`, `#doorZ`, `#autoOrient`, `#openPerRing`, `#openSpacing`, `#ringCount`,
`#dims`, `#selpanel`, `#selTitle`, `#floorplanPanel`, `#fpDims`, `#btnOrbit`, `#btnPlan`,
`#btnWalk`, `#btnCentral`, `#btnSave`, `#btnVideo`, and the dynamic `#ringrow-{i}` rows.

## Shared control primitives — `ui/controls/`

Extracted because the same markup is currently hand-written in three panels.

| Primitive | Signature |
|---|---|
| `slider` | `slider({ id, label, min, max, step, value, unit, onInput })` |
| `colorField` | `colorField({ id, label, value, onInput })` |
| `numberField` | `numberField({ id, label, value, step, unit, onInput })` |
| `vectorField` | `vectorField({ id, label, value: {x,y,z}, onInput })` |
| `toggle` | `toggle({ id, label, checked, onChange })` |
| `namedList` | `namedList({ items, onSelect, onRename, onDelete, onAdd })` |

`namedList` is used by looks, views, and the fixture list — three of the new panels are mostly this
one primitive.

## Panel behaviour

### `ui/inspector.js`
Renders properties for the current selection. Subscribes to `selection:changed`.

| Selection | Shows |
|---|---|
| Fixture | name, type, colour, intensity, position, aim, type params, shadow toggle, enabled, delete (user fixtures only) |
| Ring | index, radius, height, door count and angles, trim mode, plus its measurements |
| Screen | `computeProjectionStudy()` results — preserves today's behaviour |
| Nothing | a hint about what is selectable |

Edits call the owning component's `update()` and apply live while dragging (FR-003).

### `ui/lightingControls.js` (extended)
Becomes: a fixture list (`namedList`), an "add fixture" type picker, a looks list with save/recall/
delete, and the global mood sliders. Existing slider ids (`#ltIntensity`, `#ltBeam`, `#ltGlow`,
`#ltBloom`, `#fbBrightness`, `#fbWash`, `#scAmbient`, `#scFill`) are preserved and remapped onto the
corresponding fixtures and `MoodSettings`.

### `ui/dimensionsPanel.js`
A table grouped by measurement group. Each row shows label, value with unit, and a provenance badge
(confirmed / derived / estimated). Warning rows are visually distinct. A per-row toggle shows that
dimension as a 3D annotation. Subscribes to `space:changed` and re-renders within one second
(SC-004). Has an export button (FR-013).

### `ui/camerasPanel.js`
Mode buttons (orbit / plan / walk / central), a saved-views `namedList` with save and recall, an FOV
slider showing both degrees and 35 mm equivalent, and a "step through views" control. Stale views
are badged.

### `ui/layersPanel.js` (extended)
Gains a discipline selector above the existing groups. Selecting a discipline applies its preset;
any manual toggle afterwards marks the preset modified and shows a reset affordance.

### `ui/projectPanel.js`
Export design, import design (with an unsaved-work warning), and a report area listing anything that
could not be restored on import (FR-026).

## Accessibility and interaction baseline

- Every control has a `<label>` bound to its input.
- Sliders show their current numeric value with units.
- Colour fields accept typed hex as well as the picker.
- Destructive actions (delete fixture, delete look, import over unsaved work) confirm first.
- Keyboard: `X` toggles the floorplan panel and arrow keys cycle flow routes — both preserved.
