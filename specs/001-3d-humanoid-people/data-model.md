# Data Model: 3D Humanoid People

**Feature**: 001-3d-humanoid-people | **Date**: 2026-08-08

## Entities

### Person (runtime scene object)

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `id` | string | Unique instance id (uuid) | Auto-generated on create |
| `group` | THREE.Group | Root object in scene + raycastTargets | Must have `userData.kind='person'` |
| `position` | THREE.Vector3 | World position (floor contact) | Must lie within central disc radius `CIRC_D/2` |
| `ageBand` | enum | `'child' \| 'teen' \| 'adult'` | From random roll matching legacy probabilities |
| `buildVariant` | enum | `'broad' \| 'narrow'` | 50/50 roll |
| `heightM` | number | Target height in meters | Band ranges: child 0.9–1.25, teen 1.35–1.6, adult 1.55–1.9 |
| `scale` | THREE.Vector3 | Applied uniform/non-uniform scale | Y from heightM; X/Z from buildVariant |

**Lifecycle**: Created by `addDotAtPoint` / `addRandomDot` → stored in `people[]` →
removed by `removeDot` / clear handlers → disposed (geometry/material only if not shared).

### PeopleCollection (in-memory state)

| Field | Type | Description |
|-------|------|-------------|
| `people` | Person[] / THREE.Object3D[] | Ordered list of active figures |
| `gPeople` | THREE.Group | Scene graph parent |
| `raycastTargets` | THREE.Object3D[] | Includes each person group root |
| `occupancyCount` | number | Derived: `people.length` |
| `maxForFullLight` | number | Constant `MAX_PEOPLE_FOR_FULL_LIGHT = 20` |

**Operations**:
- `add(worldPoint)` → validate disc → create → push to arrays → `updateOccupancyUI()`
- `remove(mesh)` → filter arrays → dispose if needed → `updateOccupancyUI()`
- `clear()` → remove all from scene → reset arrays
- `setTarget(n)` → clear → add n random valid points

### HumanoidModelCache (singleton loader state)

| Field | Type | Description |
|-------|------|-------------|
| `gltf` | GLTF | Loaded once via GLTFLoader |
| `baseScene` | THREE.Group | Template scene for cloning |
| `ready` | boolean | Load complete flag |
| `error` | Error \| null | Load failure for UI messaging |

## Relationships

```text
PeopleCollection --contains--> Person (0..60)
Person --references--> HumanoidModelCache (clone source)
PeopleCollection --parent--> gPeople (THREE.Group) --child--> scene
Person.group --member-of--> raycastTargets
PeopleCollection.occupancyCount --feeds--> glowLight intensity factor
```

## State Transitions

```text
[Model Loading] --> ready | error
ready + floor click --> Person created --> people++
Person + click --> Person destroyed --> people--
setTarget(N) --> clear --> N × create --> people = N
clear() --> people = 0
```

## Validation Rules

1. Floor add rejected if local distance from `circleCenter` > `CIRC_D/2`.
2. Occupancy target clamped 0–60 (existing `occTarget` handler).
3. Person Y position: ground contact via bounding-box offset, not hardcoded sprite half-height.
4. On model load error: `add` operations no-op with console/user notice; other scene features unaffected.
