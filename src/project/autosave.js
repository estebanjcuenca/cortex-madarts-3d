import { EVENTS, on } from '../core/eventBus.js';
import { onVisualSettingsChange } from '../settings/visualSettings.js';

/**
 * Debounced `localStorage` write and restore of the working state (FR-025).
 *
 * Scope today is the lighting scene — mood settings, user-placed fixtures, and what the
 * screen is showing. The record carries a schema version so it can grow into the full
 * stage document (space, cameras, layers) without invalidating what people have saved.
 *
 * Nothing here throws. A corrupt or unreadable record is discarded with a warning rather
 * than blocking startup, because a broken autosave must never cost someone the scene.
 */

// v2: invalidate stale v1 records so returning visitors pick up the new box defaults
// instead of an old local placement from before the site default moved.
export const AUTOSAVE_KEY = 'cortex.stage.autosave.v2';
export const SCHEMA_VERSION = 2;
const DEBOUNCE_MS = 500;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null; // blocked storage (private mode, embedded contexts)
  }
}

/**
 * Read the saved state.
 * @returns {{state: object, warnings: string[]}|null} null when nothing valid is stored
 */
export function restore() {
  const store = storage();
  if (!store) return null;

  let raw;
  try {
    raw = store.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    console.warn('[autosave] stored state is not valid JSON — discarding it.');
    clear();
    return null;
  }

  const warnings = [];
  if (doc?.schemaVersion !== SCHEMA_VERSION) {
    // Forward compatibility is not promised yet; a mismatch is dropped, not guessed at.
    console.warn(`[autosave] ignoring a record written by schema ${doc?.schemaVersion}.`);
    clear();
    return null;
  }
  if (!Array.isArray(doc.fixtures)) {
    doc.fixtures = [];
    warnings.push('Saved fixtures were unreadable and have been skipped.');
  }
  return { state: doc, warnings };
}

export function clear() {
  try {
    storage()?.removeItem(AUTOSAVE_KEY);
  } catch { /* nothing to do — the record is already unreachable */ }
}

/**
 * Begin autosaving. Subscribes to fixture and mood changes; anything else that should
 * trigger a write (screen media, for one) calls the returned `schedule()`.
 *
 * @param {{collect: () => object}} opts `collect` returns the state to persist.
 * @returns {{schedule: () => void, saveNow: () => void, stop: () => void}}
 */
export function startAutosave({ collect }) {
  let timer = null;
  let stopped = false;

  function saveNow() {
    if (stopped) return;
    const store = storage();
    if (!store) return;
    try {
      store.setItem(AUTOSAVE_KEY, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        ...collect(),
      }));
    } catch (err) {
      // Quota exceeded is the realistic failure. Warn once per write, never interrupt.
      console.warn('[autosave] could not save:', err.message);
    }
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(saveNow, DEBOUNCE_MS);
  }

  // Debounce is fine while editing, but a reload or tab close inside the window must not
  // drop the last placement / light change — flush any pending write immediately.
  function flushOnLeave() {
    if (stopped || timer == null) return;
    clearTimeout(timer);
    timer = null;
    saveNow();
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
  };
  window.addEventListener('pagehide', flushOnLeave);
  document.addEventListener('visibilitychange', onVisibility);

  const unsubscribe = [
    on(EVENTS.FIXTURES_CHANGED, schedule),
    onVisualSettingsChange(schedule),
  ];

  return {
    schedule,
    saveNow,
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      window.removeEventListener('pagehide', flushOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe.forEach((off) => off());
    },
  };
}
