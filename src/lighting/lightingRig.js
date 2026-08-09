import { createFixtureObjects } from './fixtureFactory.js';
import {
  DEFAULT_SHADOW_PASS_BUDGET,
  canCastShadow,
  defaultsFor,
  sanitizeParams,
  shadowPassCost,
} from './fixtureTypes.js';
import { EVENTS, emit } from '../core/eventBus.js';

/**
 * The fixture registry and the shadow budget.
 *
 * Owns the lighting group, emits `fixtures:changed`, and drives bloom strength from mood.
 * Fixture records are the truth: every mutation goes through `update()`, which re-derives
 * the Three.js objects in place rather than rebuilding them.
 *
 * Shadow budget (FR-008): counted in render passes, not in fixtures. A point light costs
 * six passes (cube map), a spot costs one. Past the soft budget the rig warns and allows;
 * past the hard ceiling it refuses and says why, rather than silently dropping the request.
 */

/**
 * The hard ceiling sits just above the soft budget: high enough that the warning band is
 * usable, low enough that it still refuses something. At 2× it would allow 24 passes —
 * four times today's scene — and never trigger.
 */
const HARD_CEILING_FACTOR = 1.5;

let seq = 0;
const nextId = (type) => `${type}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Fill in everything a partial fixture record leaves out. */
function normalize(input) {
  const type = input.type;
  const base = defaultsFor(type);
  return {
    id: input.id ?? nextId(type),
    name: input.name ?? type,
    type,
    position: { x: 0, y: 0, z: 0, ...(input.position ?? {}) },
    aim: input.aim ?? null,
    color: input.color ?? base.color,
    intensity: input.intensity ?? base.intensity,
    params: sanitizeParams(type, { ...base.params, ...(input.params ?? {}) }),
    castShadow: !!input.castShadow && canCastShadow(type),
    enabled: input.enabled !== false,
    locked: !!input.locked,
    dynamic: input.dynamic ?? null,
    origin: input.origin ?? 'user',
  };
}

/**
 * @param {{parent: import('three').Object3D, wallHeight?: number,
 *   bloomPass?: {strength: number}, shadowPassBudget?: number,
 *   parentFor?: (fixture: object) => import('three').Object3D}} ctx
 *   `parentFor` lets a fixture live in the layer group it belongs to (the central beam in
 *   the rig group, a wash in the screen group) so layer visibility keeps working unchanged.
 */
export function createLightingRig(ctx) {
  const budget = ctx.shadowPassBudget ?? DEFAULT_SHADOW_PASS_BUDGET;
  const hardCeiling = budget * HARD_CEILING_FACTOR;
  const entries = new Map(); // id -> { fixture, objects }
  const mood = { exposure: 1, bloom: 1, bloomRadius: 0.35, bloomThreshold: 0.25 };

  const build = (fixture) => createFixtureObjects(
    { ...ctx, parent: ctx.parentFor?.(fixture) ?? ctx.parent },
    fixture,
  );

  /** Passes currently spent, optionally recounted as if `candidate` replaced its record. */
  function passesInUse(candidate) {
    let total = 0;
    for (const [id, entry] of entries) {
      const f = candidate && candidate.id === id ? candidate : entry.fixture;
      if (f.castShadow) total += shadowPassCost(f.type);
    }
    if (candidate && !entries.has(candidate.id) && candidate.castShadow) {
      total += shadowPassCost(candidate.type);
    }
    return total;
  }

  /**
   * Decide whether a fixture may cast a shadow. Returns the (possibly downgraded) record
   * plus a reason when the request could not be honoured as asked.
   */
  function applyShadowBudget(fixture) {
    if (!fixture.castShadow) return { fixture, warning: null, reason: null };

    const total = passesInUse(fixture);
    if (total > hardCeiling) {
      return {
        fixture: { ...fixture, castShadow: false },
        warning: null,
        reason:
          `Shadow refused: "${fixture.name}" would need ${shadowPassCost(fixture.type)} shadow ` +
          `pass(es), bringing the scene to ${total} — over the hard ceiling of ${hardCeiling}. ` +
          'Turn off another caster first, or use a spot (1 pass) instead of a point light (6).',
      };
    }
    if (total > budget) {
      return {
        fixture,
        warning:
          `Shadow budget exceeded: ${total} passes in use, budget is ${budget}. ` +
          'Frame rate may drop.',
        reason: null,
      };
    }
    return { fixture, warning: null, reason: null };
  }

  /** The record as the scene should render it — mood applied, record left untouched. */
  function withMood(fixture) {
    const lit = fixture.type === 'ambient' || fixture.type === 'directional'
      || fixture.type === 'wash';
    if (!lit || mood.exposure === 1) return fixture;
    return { ...fixture, intensity: fixture.intensity * mood.exposure };
  }

  function changed(id, reason) {
    emit(EVENTS.FIXTURES_CHANGED, { id, reason });
  }

  return {
    list() {
      return [...entries.values()].map((e) => ({ ...e.fixture }));
    },

    get(id) {
      const entry = entries.get(id);
      return entry ? { ...entry.fixture } : null;
    },

    /** @returns {{ok: boolean, fixture: object|null, warning: string|null, reason: string|null}} */
    add(input) {
      const normalized = normalize(input);
      if (entries.has(normalized.id)) {
        return {
          ok: false, fixture: null, warning: null,
          reason: `A fixture with id "${normalized.id}" already exists.`,
        };
      }
      const { fixture, warning, reason } = applyShadowBudget(normalized);
      const objects = build(withMood(fixture));
      entries.set(fixture.id, { fixture, objects });
      changed(fixture.id, 'added');
      return { ok: true, fixture: { ...fixture }, warning, reason };
    },

    remove(id) {
      const entry = entries.get(id);
      if (!entry) return { ok: false, reason: `No fixture "${id}".` };
      if (entry.fixture.origin === 'installation') {
        return { ok: false, reason: `"${entry.fixture.name}" is an installation fixture and cannot be deleted. Disable it instead.` };
      }
      entry.objects.dispose();
      entries.delete(id);
      changed(id, 'removed');
      return { ok: true, reason: null };
    },

    update(id, patch) {
      const entry = entries.get(id);
      if (!entry) return { ok: false, fixture: null, warning: null, reason: `No fixture "${id}".` };
      if (patch.type && patch.type !== entry.fixture.type) {
        return {
          ok: false, fixture: null, warning: null,
          reason: 'Changing fixture type is not supported — remove the fixture and add a new one.',
        };
      }

      const merged = normalize({ ...entry.fixture, ...patch, id, type: entry.fixture.type });
      const { fixture, warning, reason } = applyShadowBudget(merged);
      entry.fixture = fixture;
      entry.objects.update(withMood(fixture));
      changed(id, 'updated');
      return { ok: true, fixture: { ...fixture }, warning, reason };
    },

    /**
     * Discard a fixture's objects and build them again from its record, optionally patching
     * the record first. For fixtures that live in a group the scene rebuilds wholesale
     * (`gRig.clear()` and friends) — `clear()` only detaches, so the old objects must still
     * be disposed. Prefer `update()` everywhere else: this drops the shadow map.
     */
    rebuild(id, patch = {}) {
      const entry = entries.get(id);
      if (!entry) return { ok: false, reason: `No fixture "${id}".` };
      entry.objects.dispose();
      entry.fixture = normalize({ ...entry.fixture, ...patch, id, type: entry.fixture.type });
      entry.objects = build(withMood(entry.fixture));
      changed(id, 'rebuilt');
      return { ok: true, fixture: { ...entry.fixture }, reason: null };
    },

    /**
     * The live Three.js objects for a fixture. An escape hatch for the picking and
     * selection layers, which still work in terms of meshes; not for editing state.
     */
    objectsFor(id) {
      const entry = entries.get(id);
      return entry ? { light: entry.objects.light, body: entry.objects.body } : null;
    },

    /** Re-derive every fixture's objects from its record. Used after import and look recall. */
    applyAll() {
      for (const entry of entries.values()) {
        entry.objects.update(withMood(entry.fixture));
      }
      changed(null, 'applied-all');
    },

    setMood(partial) {
      Object.assign(mood, partial);
      if (ctx.bloomPass) ctx.bloomPass.strength = mood.bloom;
      this.applyAll();
    },

    getMood() {
      return { ...mood };
    },

    /** Per-frame hook for fixtures that animate themselves (currently the central beam). */
    tick(t, occupancy) {
      for (const entry of entries.values()) {
        entry.objects.tick?.(t, occupancy);
      }
    },

    /** Diagnostics for the lighting panel: how much of the shadow budget is spent. */
    shadowBudget() {
      return { used: passesInUse(null), budget, hardCeiling };
    },

    dispose() {
      for (const entry of entries.values()) entry.objects.dispose();
      entries.clear();
    },
  };
}
