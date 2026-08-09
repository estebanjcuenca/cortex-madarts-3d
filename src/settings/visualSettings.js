/** Shared visual tuning — heatmap, central light, fabric wash. */

const defaults = {
  heatmap: {
    overall: 0.28,
    /** −1 = brighter toward outer rings, 0 = uniform, +1 = brighter toward center */
    centerBias: 0.45,
  },
  centralLight: {
    intensity: 1,
    beam: 1,
    glow: 1,
    bloom: 1,
  },
  fabric: {
    brightness: 1,
    wash: 0.2,
  },
  scene: {
    ambient: 1,
    fill: 1,
  },
};

let state = structuredClone(defaults);
const listeners = new Set();

function merge(into, patch) {
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])) {
      into[k] = into[k] || {};
      merge(into[k], patch[k]);
    } else {
      into[k] = patch[k];
    }
  }
}

export function getVisualSettings() {
  return state;
}

export function setVisualSettings(patch) {
  merge(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function onVisualSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Per-passage heatmap opacity from ring index (0 = innermost). */
export function heatmapOpacityForRing(ringIndex, ringCount) {
  const { overall, centerBias } = state.heatmap;
  const t = ringIndex / Math.max(1, ringCount - 1);
  const gradient = 1 + centerBias * ((1 - t) - t);
  return overall * Math.max(0.04, gradient);
}

export { defaults as visualSettingsDefaults };
