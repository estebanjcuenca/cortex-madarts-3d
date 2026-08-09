/**
 * Named publish/subscribe channel shared by every stage component.
 *
 * Inputs:  event names from EVENTS, plus an arbitrary payload
 * Outputs: none (listeners receive the payload)
 * Effects: none on the scene — this module never imports Three.js
 *
 * Exists to replace the implicit rebuild cascade in main.js, where calling buildRings()
 * silently also rebuilt the screen, the circulation, and the floorplan overlay. Components
 * now announce what changed and interested parties decide for themselves whether to react.
 */

/**
 * The known event names. Payloads carry *what* changed so subscribers can skip work they
 * do not need — that selectivity is what keeps live measurement updates inside their
 * one-second budget once the dimensions panel exists.
 */
export const EVENTS = {
  /** Space configuration changed. Payload: { what: 'rings'|'center'|'room'|'screen'|'doors' } */
  SPACE_CHANGED: 'space:changed',
  /** Ring meshes were rebuilt. Payload: { count } */
  RINGS_REBUILT: 'rings:rebuilt',
  /** A fixture was added, removed, or edited. Payload: { id, reason } */
  FIXTURES_CHANGED: 'fixtures:changed',
  /** A saved look was applied. Payload: { id, applied, missing } */
  LOOK_RECALLED: 'look:recalled',
  /** Camera position, target, or lens changed. Payload: { mode } */
  CAMERA_CHANGED: 'camera:changed',
  /** Layer visibility changed. Payload: { id, visible } */
  LAYERS_CHANGED: 'layers:changed',
  /** Selection changed. Payload: { kind, id } or null when cleared */
  SELECTION_CHANGED: 'selection:changed',
  /** A stage document finished loading. Payload: { warnings } */
  DOCUMENT_LOADED: 'document:loaded',
};

const KNOWN = new Set(Object.values(EVENTS));
const listeners = new Map();

function warnIfUnknown(event, origin) {
  if (KNOWN.has(event)) return;
  console.warn(
    `[eventBus] ${origin}("${event}") uses an event name that is not in EVENTS. ` +
      'Typos here fail silently — the listener simply never fires. ' +
      'Add the name to EVENTS in src/core/eventBus.js if it is intentional.',
  );
}

/**
 * Subscribe to an event.
 * @returns {() => void} unsubscribe function — call it to stop listening.
 */
export function on(event, fn) {
  warnIfUnknown(event, 'on');
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => {
    const set = listeners.get(event);
    if (set) set.delete(fn);
  };
}

/** Subscribe to the next occurrence only, then unsubscribe automatically. */
export function once(event, fn) {
  const off = on(event, (payload) => {
    off();
    fn(payload);
  });
  return off;
}

/**
 * Publish an event to every current subscriber.
 *
 * A throwing listener is logged and skipped rather than allowed to abort the rest —
 * one broken panel must not stop the scene from rebuilding.
 */
export function emit(event, payload) {
  warnIfUnknown(event, 'emit');
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  // Copy first: a listener may unsubscribe itself (or others) during dispatch.
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[eventBus] listener for "${event}" threw:`, err);
    }
  }
}

/** Remove every listener for an event, or all listeners when no event is given. Test/teardown use. */
export function clear(event) {
  if (event === undefined) listeners.clear();
  else listeners.delete(event);
}

/** Current listener count. Diagnostics only — a steadily growing count means a leak. */
export function listenerCount(event) {
  if (event === undefined) {
    let n = 0;
    for (const set of listeners.values()) n += set.size;
    return n;
  }
  return listeners.get(event)?.size ?? 0;
}
