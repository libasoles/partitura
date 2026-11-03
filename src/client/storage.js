// Local persistence. Scores live in IndexedDB (large, structured, no 5 MB cap); settings live in localStorage
// (see settings.js). The editor reads synchronously, so the stored scores are loaded once before it starts and
// kept in memory; saves write through to IndexedDB, debounced and flushed when the page is hidden.
const DB_NAME = 'partitura';
const STORE = 'workspace';
const TABS_RECORD = 'tabs';
const LEGACY_TABS_KEY = 'scoreEditor.tabs.v1'; // where the scores lived before IndexedDB
const SAVE_DELAY = 300;

let db = null;
let pending = null; // latest value waiting to be written
let timer = 0;

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

function put(value) {
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(value, TABS_RECORD);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function readLegacy() {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_TABS_KEY));
  } catch (e) {
    return null;
  }
}

function flush() {
  clearTimeout(timer);
  timer = 0;
  if (pending === null) return;
  const value = pending;
  pending = null;
  if (db) {
    put(value).catch(() => {
      // Without storage the score keeps working, it is just not remembered.
    });
  } else {
    try {
      localStorage.setItem(LEGACY_TABS_KEY, JSON.stringify(value));
    } catch (e) {
      // Same: nothing to fall back on.
    }
  }
}

// Resolves with the stored { active, scores } (unsanitized), or null when there is nothing saved yet.
export async function initStorage() {
  let stored = null;
  try {
    db = await open();
    stored = await request(db.transaction(STORE).objectStore(STORE).get(TABS_RECORD));
    if (!stored) {
      const legacy = readLegacy();
      if (legacy) {
        await put(legacy);
        stored = legacy;
        try { localStorage.removeItem(LEGACY_TABS_KEY); } catch (e) { /* nothing to clean */ }
      }
    }
  } catch (e) {
    db = null; // IndexedDB unavailable (private mode, blocked): keep using localStorage
    stored = readLegacy();
  }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.ScoreStore = {
    stored,
    save(value) {
      pending = value;
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY);
    },
  };
}
