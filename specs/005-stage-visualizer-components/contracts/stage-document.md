# Contract: Stage Document File Format

**Feature**: 005-stage-visualizer-components | **Phase**: 1

The shareable design file. This is the collaboration interface between the lighting designer, the
architect, the technicians, and the museum — so it is written to be **human-readable and
diffable**, not just machine-loadable.

- **File extension**: `.cortex.json`
- **Encoding**: UTF-8 JSON, 2-space indent, keys in the order documented below
- **Units**: metres and degrees; angles in the plan convention (0° = +x, 90° = +z, CCW)
- **Colours**: lowercase hex strings, `"#rrggbb"`

## Example

```json
{
  "schemaVersion": 1,
  "meta": {
    "name": "Opening night — option B",
    "createdAt": "2026-08-09T10:12:00.000Z",
    "modifiedAt": "2026-08-09T11:40:00.000Z",
    "note": "Cooler wash on outer rings, warmer centre."
  },
  "space": {
    "room": { "width": 10.12, "depth": 22.34, "wallHeight": 3.2 },
    "ringField": {
      "center": { "x": 0.08, "z": 6.69 },
      "growthFactor": 1.24,
      "gapWidthM": 1.1,
      "clipToRoom": true,
      "rings": [
        { "index": 0, "radius": 3.2665, "height": 2.6, "visible": true,
          "doors": [63, 126, 187, 246, 303, 2],
          "trim": { "mode": "auto" }, "source": "confirmed" }
      ]
    },
    "screen": { "center": { "x": 0.15, "z": 6.49 }, "outerDiameter": 4.8,
                "faceDiameter": 4.695, "height": 2.4,
                "arcs": [ { "startDeg": 157.6, "sweepDeg": 227.0 },
                          { "startDeg": 51.3,  "sweepDeg": 72.7 } ] },
    "entrance": { "x": 3.8, "z": 22.34, "width": 2.52 }
  },
  "fixtures": [
    { "id": "central", "name": "Central beam", "type": "centralBeam",
      "position": { "x": 0.08, "y": 1.6, "z": 6.69 }, "aim": null,
      "color": "#ff3b30", "intensity": 1.6,
      "params": { "beamScale": 1, "glowScale": 1, "pulseAmount": 1, "height": 3.0 },
      "castShadow": true, "enabled": true, "locked": true,
      "dynamic": { "kind": "occupancyPulse", "amount": 1 },
      "origin": "installation" },
    { "id": "ceiling-1", "name": "Ceiling fixture 1", "type": "point",
      "position": { "x": 2.1, "y": 3.0, "z": 8.4 }, "aim": null,
      "color": "#ffe9a8", "intensity": 1.4,
      "params": { "distance": 8, "decay": 2 },
      "castShadow": false, "enabled": true, "locked": false,
      "dynamic": null, "origin": "user" }
  ],
  "looks": [
    { "id": "look-1", "name": "Opening — cold blue", "createdAt": "2026-08-09T10:30:00.000Z",
      "mood": { "exposure": 0.9, "bloom": 1.2, "bloomRadius": 0.35, "bloomThreshold": 0.25,
                "fabricBrightness": 1.0, "fabricWash": 0.2 },
      "fixtures": [
        { "fixtureId": "central", "color": "#3f5fd6", "intensity": 1.1,
          "enabled": true, "aim": null, "params": { "beamScale": 0.8 }, "castShadow": true }
      ] }
  ],
  "views": [
    { "id": "view-1", "name": "Visitor entry", "mode": "walk",
      "position": { "x": 3.8, "y": 1.65, "z": 21.0 },
      "target": { "x": 0.08, "y": 1.4, "z": 6.69 }, "fovDeg": 45 }
  ],
  "mood": { "exposure": 1.0, "bloom": 1.0, "bloomRadius": 0.35, "bloomThreshold": 0.25,
            "fabricBrightness": 1.0, "fabricWash": 0.2 },
  "layers": {
    "activePreset": "lighting",
    "modified": false,
    "visibility": { "room": true, "curtain": true, "technical": false, "dimensions": false }
  },
  "analysis": { "circulationMode": "flow", "flowRouteIndex": 0 }
}
```

## Field rules

| Field | Required | On absence |
|---|:--:|---|
| `schemaVersion` | yes | reject the file |
| `meta` | no | synthesise from the filename and the current time |
| `space` | yes | reject the file |
| `space.room` | yes | reject the file |
| `space.ringField.rings` | yes | reject the file |
| `space.screen` | no | use `floorplanData.SCREEN` defaults, warn |
| `fixtures` | no | use the default installation inventory, warn |
| `looks`, `views` | no | empty list |
| `mood` | no | `MoodSettings` defaults |
| `layers` | no | the `museum` discipline preset |
| `analysis` | no | `{ circulationMode: "flow", flowRouteIndex: 0 }` |

Unknown extra keys are preserved on round-trip where practical and never cause a failure — a newer
tool version writing a field this version does not know must not destroy a collaborator's file.

## Validation and warnings

`deserialize(doc)` returns `{ state, warnings }`. It **throws only** when `schemaVersion` is missing
or unrecognised. Everything else degrades and warns:

| Situation | Behaviour |
|---|---|
| Unknown `schemaVersion` | Throw with the file's version and the supported range |
| A fixture uses an unknown `type` | Skip that fixture, warn with its id and name |
| A look references a missing `fixtureId` | Apply the rest of the look, warn with the missing ids |
| A view falls outside the room | Load it, mark `stale: true`, warn |
| `rings` out of radius order | Reject the file — the space model's invariant cannot be repaired safely |
| A ring exceeds the room | Load it; the overflow surfaces as a measurement warning, not a load error |
| `params` missing a type-required key | Fill from `defaultsFor(type)`, warn |
| Colour not a valid hex string | Fill from the type default, warn |

Warnings are surfaced in the project panel (FR-026). A silent partial load is never acceptable.

## Autosave

`localStorage` key: `cortex.stage.autosave.v1`

Holds the same structure minus `meta`, written on a 500 ms debounce after any change. On startup,
`restore()` is applied before the first frame. Autosave is cleared when the user explicitly starts a
new design, and it never overwrites an imported document until the user makes a change.

## Versioning policy

- Adding an optional field: same `schemaVersion`.
- Adding a required field or changing the meaning of an existing one: increment `schemaVersion` and
  add an upgrade step in `deserialize`.
- Upgrades are one-way. Exporting always writes the current `SCHEMA_VERSION`.
