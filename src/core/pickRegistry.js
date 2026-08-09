/**
 * Owns which scene objects are clickable, and resolves a screen click to one of them.
 *
 * Inputs:  meshes registered by the scene builders, plus pointer coordinates
 * Outputs: the nearest hit as { object, root, group, point, distance, meta }
 * Effects: holds references to registered objects; removes them on unregister
 *
 * Replaces the raycastTargets / ceilingRaycastTargets arrays that every builder in main.js
 * mutated directly. Enforces Constitution IV: an interaction plane registered with a
 * single-sided material is a silent bug, so it warns at registration time.
 */
import * as THREE from 'three';

/** Objects live in named channels tested independently, never merged into one raycast. */
export const CHANNEL = {
  /** Everything normally clickable: floor, rings, screen, rig, box, technical, people. */
  MAIN: 'main',
  /**
   * Ceiling placement only. Deliberately separate: the camera usually sits above the wall
   * height, so a full-room ceiling plane in the main channel would intercept nearly every
   * click before it reached the floor, rings, or people below.
   */
  CEILING: 'ceiling',
};

export function createPickRegistry() {
  const channels = new Map([
    [CHANNEL.MAIN, []],
    [CHANNEL.CEILING, []],
  ]);
  const meta = new WeakMap();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function bucket(channel) {
    if (!channels.has(channel)) channels.set(channel, []);
    return channels.get(channel);
  }

  /**
   * Constitution IV. After rotateX() a plane's front-face normal can point away from the
   * normal viewing angle, and raycasting silently drops back-face hits on single-sided
   * materials. This caused a real bug on the ceiling-light plane, where clicks never
   * registered regardless of the placement-mode logic being correct.
   */
  function warnIfSingleSidedPlane(object) {
    const geo = object.geometry;
    if (!geo || geo.type !== 'PlaneGeometry') return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    if (!mats.some((m) => m && m.side !== THREE.DoubleSide)) return;
    console.warn(
      '[pickRegistry] Registered a PlaneGeometry whose material is not THREE.DoubleSide. ' +
        'Raycasting drops back-face hits on single-sided materials, so this plane may never ' +
        'be clickable. See Constitution IV — Raycasting Correctness.',
      object,
    );
  }

  /**
   * Make an object clickable.
   *
   * @param {THREE.Object3D} object
   * @param {{ group?: string, channel?: string, info?: string }} [options]
   *        `group` defaults to `object.userData.kind`, which is what the scene builders
   *        already set and what unregisterGroup() keys off.
   */
  function register(object, options = {}) {
    if (!object) return;
    const channel = options.channel ?? CHANNEL.MAIN;
    const group = options.group ?? object.userData?.kind ?? 'unknown';
    warnIfSingleSidedPlane(object);
    meta.set(object, { group, channel, info: options.info ?? object.userData?.info });
    const list = bucket(channel);
    if (!list.includes(object)) list.push(object);
  }

  /** Register several objects sharing the same options. */
  function registerAll(objects, options) {
    for (const o of objects) register(o, options);
  }

  /** Stop tracking one object. */
  function unregister(object, channel = CHANNEL.MAIN) {
    const list = bucket(channel);
    const i = list.indexOf(object);
    if (i >= 0) list.splice(i, 1);
    meta.delete(object);
  }

  /**
   * Drop every object in a group. This is the call a builder makes before rebuilding —
   * it replaces the `raycastTargets.filter(m => m.userData.kind !== 'ring')` idiom.
   */
  function unregisterGroup(group, channel = CHANNEL.MAIN) {
    const list = bucket(channel);
    const kept = list.filter((o) => (meta.get(o)?.group ?? o.userData?.kind) !== group);
    channels.set(channel, kept);
  }

  /**
   * Every hit in a channel, nearest first.
   *
   * `root` walks up to the nearest ancestor carrying a `userData.kind`, which is how a
   * click on one mesh of a loaded humanoid resolves to the person group.
   *
   * The raycast is recursive because a registered object is not always the thing that
   * carries geometry: a person is a Group wrapping a SkinnedMesh, and a non-recursive
   * test never hits it. Anything a builder adds to a registered object but does not want
   * clickable has to say so with a no-op `raycast` — src/render/lineView.js does this for
   * the edge overlays it parents onto scene meshes.
   */
  function pickAll(clientX, clientY, camera, options = {}) {
    const channel = options.channel ?? CHANNEL.MAIN;
    const width = options.width ?? window.innerWidth;
    const height = options.height ?? window.innerHeight;
    ndc.x = (clientX / width) * 2 - 1;
    ndc.y = -(clientY / height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    return raycaster.intersectObjects(bucket(channel), true).map((hit) => {
      let root = hit.object;
      while (root.parent && !root.userData?.kind) root = root.parent;
      return {
        object: hit.object,
        root,
        group: meta.get(hit.object)?.group ?? root.userData?.kind,
        point: hit.point,
        distance: hit.distance,
        meta: meta.get(hit.object) ?? null,
      };
    });
  }

  /** Nearest hit in a channel, or null. */
  function pick(clientX, clientY, camera, options = {}) {
    return pickAll(clientX, clientY, camera, options)[0] ?? null;
  }

  /** Current objects in a channel. Read-only view for diagnostics and compatibility shims. */
  function list(channel = CHANNEL.MAIN) {
    return bucket(channel);
  }

  /**
   * Replace a channel's contents wholesale.
   * Exists so peopleManager's existing getRaycastTargets/setRaycastTargets contract keeps
   * working unchanged; prefer register/unregister in new code.
   */
  function setList(channel, objects) {
    channels.set(channel, [...objects]);
    for (const o of objects) {
      if (!meta.has(o)) meta.set(o, { group: o.userData?.kind ?? 'unknown', channel });
    }
  }

  /** Object count per channel. Diagnostics — a steadily growing count means a leak. */
  function stats() {
    const out = {};
    for (const [name, objects] of channels) out[name] = objects.length;
    return out;
  }

  return {
    register, registerAll, unregister, unregisterGroup, pick, pickAll, list, setList, stats,
  };
}
