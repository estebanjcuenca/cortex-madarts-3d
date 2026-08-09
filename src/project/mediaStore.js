/**
 * Persistent store for the default screen media file.
 *
 * IndexedDB rather than `localStorage` because this holds a Blob: `localStorage` is
 * strings only, so a file would have to be base64-encoded (inflating it by a third) into
 * a quota of about 5 MB — too small for a photograph, let alone a clip.
 *
 * Every function resolves rather than throwing, and resolves to null when storage is
 * unavailable (private browsing, blocked storage). Losing a saved default is a nuisance,
 * never a reason to stop the scene from loading.
 */

const DB_NAME = 'cortex.stage';
const DB_VERSION = 1;
const STORE = 'screenMedia';
const KEY = 'default';

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function withStore(mode, run) {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch {
        db.close();
        resolve(null);
        return;
      }
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req ? req.result : true); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    });
  }).catch(() => null);
}

/**
 * @param {File|Blob} file
 * @param {{name?: string, type?: string}} meta
 * @returns {Promise<boolean>} false when it could not be stored
 */
export function saveDefaultMedia(file, meta = {}) {
  const record = {
    blob: file,
    name: meta.name ?? file.name ?? 'media',
    type: meta.type ?? file.type ?? '',
    savedAt: new Date().toISOString(),
  };
  return withStore('readwrite', (store) => store.put(record, KEY)).then((r) => r !== null);
}

/** @returns {Promise<{blob: Blob, name: string, type: string}|null>} */
export function loadDefaultMedia() {
  return withStore('readonly', (store) => store.get(KEY)).then((rec) => rec ?? null);
}

export function clearDefaultMedia() {
  return withStore('readwrite', (store) => store.delete(KEY)).then((r) => r !== null);
}
