/**
 * The fixture type catalogue: which properties each light type exposes, what its
 * defaults are, and what it costs to make it cast a shadow.
 *
 * Pure module — no Three.js, importable in Node (contract: components.md rule 2).
 * Adding a fixture type means editing this file and `fixtureFactory.js`, nothing else.
 */

/**
 * Shadow cost is counted in *render passes*, not in lights. A point light renders the
 * scene six times into a cube map; a spot light renders it once into a 2D map. Budgeting
 * by fixture count would refuse a second spot while permitting the six-pass point light
 * that is already in the scene.
 */
export const SHADOW_PASS_COST = {
  cube: 6,
  perspective: 1,
  none: 0,
};

/**
 * Provisional ceiling: twice what the scene renders today (the central beam alone is 6).
 * `lightingRig` warns past it rather than refusing outright. Replace with a measured
 * value once T029 profiles the frame cost on the target hardware.
 */
export const DEFAULT_SHADOW_PASS_BUDGET = 12;

const num = (key, label, def, min, max, step, unit = '') => ({
  key, label, type: 'number', default: def, min, max, step, unit,
});

export const FIXTURE_TYPES = {
  ambient: {
    id: 'ambient',
    label: 'Ambient',
    omnidirectional: true,
    aimable: false,
    shadowPassCost: SHADOW_PASS_COST.none,
    defaults: { color: '#8899aa', intensity: 0.55, params: {} },
    params: [],
  },

  directional: {
    id: 'directional',
    label: 'Directional',
    omnidirectional: false,
    aimable: true,
    shadowPassCost: SHADOW_PASS_COST.none,
    defaults: { color: '#ffffff', intensity: 0.5, params: {} },
    params: [],
  },

  point: {
    id: 'point',
    label: 'Point',
    omnidirectional: true,
    aimable: false,
    shadowPassCost: SHADOW_PASS_COST.cube,
    defaults: { color: '#ffe9a8', intensity: 1.4, params: { distance: 8, decay: 2 } },
    params: [
      num('distance', 'Reach', 8, 0, 40, 0.1, 'm'),
      num('decay', 'Falloff', 2, 0, 4, 0.1),
    ],
  },

  spot: {
    id: 'spot',
    label: 'Spot',
    omnidirectional: false,
    aimable: true,
    shadowPassCost: SHADOW_PASS_COST.perspective,
    defaults: {
      color: '#ffe9a8',
      intensity: 3,
      params: { distance: 12, decay: 2, angleDeg: 28, penumbra: 0.35 },
    },
    params: [
      num('distance', 'Throw', 12, 0, 40, 0.1, 'm'),
      num('decay', 'Falloff', 2, 0, 4, 0.1),
      num('angleDeg', 'Cone angle', 28, 1, 89, 1, '°'),
      num('penumbra', 'Edge softness', 0.35, 0, 1, 0.01),
    ],
  },

  centralBeam: {
    id: 'centralBeam',
    label: 'Central beam',
    omnidirectional: true,
    aimable: false,
    shadowPassCost: SHADOW_PASS_COST.cube,
    // `intensity` here is a multiplier over the rig's pulse formula, not an absolute
    // value — the pulse is preserved verbatim in centralLight.js.
    defaults: {
      color: '#ff3b30',
      intensity: 1,
      params: { beamScale: 1, glowScale: 1, pulseAmount: 1, height: 2.8 },
    },
    params: [
      num('beamScale', 'Beam width', 1, 0, 3, 0.01, '×'),
      num('glowScale', 'Base glow', 1, 0, 3, 0.01, '×'),
      num('pulseAmount', 'Pulse', 1, 0, 3, 0.01, '×'),
      num('height', 'Height', 2.8, 0.5, 6, 0.05, 'm'),
    ],
  },

  wash: {
    id: 'wash',
    label: 'Wash',
    omnidirectional: true,
    aimable: false,
    shadowPassCost: SHADOW_PASS_COST.none,
    defaults: { color: '#3f5fd6', intensity: 2.2, params: { distance: 6, decay: 2 } },
    params: [
      num('distance', 'Reach', 6, 0, 40, 0.1, 'm'),
      num('decay', 'Falloff', 2, 0, 4, 0.1),
    ],
  },

  /** Throw cone geometry only — contributes no illumination to the scene. */
  projector: {
    id: 'projector',
    label: 'Projector',
    omnidirectional: false,
    aimable: true,
    shadowPassCost: SHADOW_PASS_COST.none,
    emitsLight: false,
    defaults: {
      color: '#9fd8ff',
      intensity: 1,
      params: { throwAngleDeg: 32, targetArcDeg: 60 },
    },
    params: [
      num('throwAngleDeg', 'Throw angle', 32, 1, 89, 1, '°'),
      num('targetArcDeg', 'Target arc', 60, 1, 180, 1, '°'),
    ],
  },
};

export const FIXTURE_TYPE_IDS = Object.keys(FIXTURE_TYPES);

function typeOrThrow(type) {
  const entry = FIXTURE_TYPES[type];
  if (!entry) {
    throw new Error(`Unknown fixture type "${type}". Known types: ${FIXTURE_TYPE_IDS.join(', ')}`);
  }
  return entry;
}

/** Fresh defaults for a type. Callers own the result and may mutate it. */
export function defaultsFor(type) {
  const { defaults } = typeOrThrow(type);
  return {
    color: defaults.color,
    intensity: defaults.intensity,
    params: { ...defaults.params },
  };
}

/** The editable parameters for a type, in display order. */
export function paramSchema(type) {
  return typeOrThrow(type).params.map((p) => ({ ...p }));
}

export function canCastShadow(type) {
  return typeOrThrow(type).shadowPassCost > 0;
}

/** How many shadow render passes this type costs when `castShadow` is on. */
export function shadowPassCost(type) {
  return typeOrThrow(type).shadowPassCost;
}

export function emitsLight(type) {
  return typeOrThrow(type).emitsLight !== false;
}

export function isAimable(type) {
  return typeOrThrow(type).aimable === true;
}

/**
 * Clamp a params object to the schema, dropping keys the type does not define.
 * Used on import and on look recall, where params may come from an older document.
 */
export function sanitizeParams(type, params = {}) {
  const out = {};
  for (const p of typeOrThrow(type).params) {
    const raw = params[p.key];
    const value = Number.isFinite(raw) ? raw : p.default;
    out[p.key] = Math.min(p.max, Math.max(p.min, value));
  }
  return out;
}
