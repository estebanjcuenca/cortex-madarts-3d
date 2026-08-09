# Data Model: Screen Regrouping, Real Dimensions & Projection Study

## Entities

### FloorplanSource

Constants exported from `src/floorplan.js`.

| Field | Type | Notes |
|-------|------|-------|
| unitsPerMeter | number | 29.928 (from dim-line mean) |
| url | string | `/floorplan2.svg` |
| center | {x,y} | Ring-field center in svg units |
| screenCenter | {x,y} | Screen fit center in svg units |
| roomMidX, roomTopY | number | Inner-wall anchors for svg↔world |
| panelViewBox | string | Crop for X-panel |

### Room

| Field | Type | Value |
|-------|------|-------|
| width, depth | m | 10.12 × 22.34 |
| wallThickness | m | 0.20 |
| entrance | {x, z, width} | Far-wall opening, width 2.52 |

### Screen

Not a curtain ring. Own layer and selection kind `'screen'`.

| Field | Type | Notes |
|-------|------|-------|
| center | {x,z} m | From fitted screen center |
| outerDiameter | m | 4.800 |
| faceDiameter | m | 4.695 (projection study uses this) |
| height | m | Default 2.4, editable |
| arcs | [{startDeg, sweepDeg}] | ≈ two arcs: 227° and 73° (drawing gaps) |
| visible | bool | Layer toggle |

Derived (not stored, computed for UI/study):

- arcLength_i = (faceDiameter/2) · sweepRad_i  
- area = Σ arcLength_i · height (or main-only for projector study — see ProjectionStudy)  
- chord, sagitta of main arc  
- recommendedProjectorCount  

### CurtainRing

Unchanged shape vs current model; **excludes** screen circle.

| Field | Type | Notes |
|-------|------|-------|
| r | m | Radius; ring 1 confirmed 3.267 |
| doors | number[] | Entrance angles deg |
| trim | {start,end} \| 'auto' | Existing |
| visible | bool | Per-ring |

### ProjectionStudy

Computed view-model for selection panel / study section.

| Field | Type | Notes |
|-------|------|-------|
| faceRadius | m | 2.3475 |
| mainSweepDeg | number | ≈227 |
| mainArcLength | m | ≈9.30 |
| mainArea | m² | arcLength · height |
| chord, sagitta | m | Main arc |
| maxSingleCoverageDeg | number | ≈127 (optics assumption) |
| blendOverlapDeg | number | ≈9 |
| recommendedCount | 1 \| 2 \| 3 | Default **2** for main arc |
| verdict | string | Human-readable one-vs-two statement |

### TechnicalElement

| Field | Type | Values |
|-------|------|--------|
| kind | enum | `niche` \| `duct` \| `booth` \| `corridor` \| `wall` |
| position | {x,z} or AABB | Metres |
| size | object | kind-specific (width/depth/diameter) |
| visible | bool | Driven by technical layer |

### LayerSet (delta)

Existing layers plus:

| Layer id | Controls |
|----------|----------|
| `screen` | Screen arcs + projectors + blend marker + spill (existing id, new contents) |
| `technical` | NEW — niches, ducts, booth, corridor helpers |

Curtain layer must **not** include screen meshes.

## Validation Rules

1. Screen arcs must not appear in `RING_RADII` / maze collision fabric.  
2. Room defaults (door, center, box) must lie inside new room bounds.  
3. `recommendedCount ≥ ceil(mainSweepDeg / (maxSingleCoverageDeg · (1 − blendFraction)))` with documented constants.  
4. Technical elements use metres from the same scale as Room/Screen.

## State Transitions

- Toggle `technical` → show/hide technical meshes + floorplan technical group.  
- Toggle `screen` → show/hide screen arcs, projectors, blend, screen spill.  
- Edit screen height (if exposed) → recompute ProjectionStudy numbers; rebuild screen mesh height.
