# Contract: People Subsystem API

**Feature**: 001-3d-humanoid-people | **Module**: `src/people/`

Internal JavaScript module contracts (not HTTP). Implementations MUST satisfy these
signatures for interaction parity with current `index.html` behavior.

---

## `modelLoader.js`

```javascript
/**
 * Load humanoid GLB once. Idempotent.
 * @returns {Promise<THREE.Group>} Base scene graph safe to clone
 * @throws if fetch/load fails
 */
export async function loadHumanoidTemplate(): Promise<THREE.Group>

/** @returns {boolean} */
export function isHumanoidReady(): boolean
```

---

## `personFactory.js`

```javascript
/**
 * Create a randomized person group from cached template.
 * @returns {THREE.Group} userData: { kind:'person', info:'Person — click to remove', ageBand, buildVariant, heightM }
 */
export function createPersonMesh(): THREE.Group

/**
 * Position person so feet touch floor at worldPoint.
 * @param {THREE.Group} person
 * @param {THREE.Vector3} worldPoint
 */
export function placePersonOnFloor(person: THREE.Group, worldPoint: THREE.Vector3): void
```

**Randomization contract** (must match legacy `createPersonSprite`):
- Age: P(child)=0.15, P(teen)=0.10, P(adult)=0.75
- Height ranges: child 0.9–1.25 m, teen 1.35–1.6 m, adult 1.55–1.9 m
- Build: 50% broad (wider X/Z), 50% narrow

---

## `peopleManager.js`

```javascript
/**
 * @param {THREE.Vector3} worldPoint
 * @returns {THREE.Group|null} null if outside disc or model not ready
 */
export function addPersonAtPoint(worldPoint: THREE.Vector3): THREE.Group | null

/** @param {THREE.Object3D} personGroup */
export function removePerson(personGroup: THREE.Object3D): void

export function clearAllPeople(): void

/** @param {number} targetN 0–60 */
export function setOccupancy(targetN: number): void

/** @returns {number} */
export function getPeopleCount(): number

/** @returns {readonly THREE.Object3D[]} roots for raycastTargets registration */
export function getPersonRaycastRoots(): readonly THREE.Object3D[]
```

---

## `raycastHandlers.js` (integration contract)

Existing `handleClick` behavior preserved:

| `userData.kind` | Action |
|-----------------|--------|
| `'person'` | `removePerson(hit.object)` — hit.object is group root |
| `'floor'` | `addPersonAtPoint(hit.point)` |
| other | unchanged selection/tooltip flow |

---

## Scene Integration Hooks

These existing integration points MUST remain wired:

| Hook | Location | Requirement |
|------|----------|-------------|
| `updateOccupancyUI()` | After add/remove/clear/set | Updates `#occReadout` |
| `raycastTargets` | Global array | Person group roots appended on add, filtered on remove |
| `gPeople` | THREE.Group | All person roots parented here |
| Occupancy light factor | Render/update loop | `people.length / MAX_PEOPLE_FOR_FULL_LIGHT` unchanged |
| `#clearPeople`, `#setOccupancy` | DOM listeners | Call manager functions |

---

## Asset Contract

| Asset | Path | Format | Max size |
|-------|------|--------|----------|
| Base humanoid | `public/models/humanoid-lowpoly.glb` | GLB 2.0 | 2 MB |

License: CC0 or equivalent free for public redistribution.
