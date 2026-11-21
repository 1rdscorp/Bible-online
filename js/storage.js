/**
 * Storage: the ONLY module that touches persistence.
 *
 * Callers use an async key/value API (get/set/remove) with JSON-serialisable
 * values. It is backed by localStorage today. Because the API is already
 * async, the backend can become IndexedDB (for large data such as notes) or a
 * cloud-sync service later without changing any caller.
 *
 * If localStorage is unavailable (blocked cookies, some private modes), data
 * is kept in memory for the session. The app still works; it just won't
 * remember anything.
 */

// Every key is prefixed. On GitHub Pages all of a user's project sites share
// one origin (username.github.io), and so share one localStorage.
// index.html reads "bible-online:settings" directly to apply the theme before
// first paint. If you change the prefix, update that script too.
export const STORAGE_PREFIX = 'bible-online:';

function createLocalStorageBackend() {
  try {
    const store = window.localStorage;
    const probe = `${STORAGE_PREFIX}__probe__`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function createMemoryBackend() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
}

let backend = null;
let persistent = false;

// The backend is chosen lazily (on first use), so importing this module has no
// side effects. That keeps it importable from Node tests.
function getBackend() {
  if (!backend) {
    const local = typeof window === 'undefined' ? null : createLocalStorageBackend();
    persistent = Boolean(local);
    backend = local ?? createMemoryBackend();
  }
  return backend;
}

export const storage = {
  /** Resolve the stored value for `key`, or `fallback` if absent or unreadable. */
  async get(key, fallback = null) {
    try {
      const raw = getBackend().getItem(STORAGE_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  /**
   * Store a JSON-serialisable value. Resolves true if it was saved; failures
   * (e.g. storage full) are logged and resolve false, so callers holding
   * the reader's own work (notes) can say so.
   */
  async set(key, value) {
    try {
      getBackend().setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`storage: could not save "${key}"`, error);
      return false;
    }
  },

  async remove(key) {
    try {
      getBackend().removeItem(STORAGE_PREFIX + key);
    } catch (error) {
      console.warn(`storage: could not remove "${key}"`, error);
    }
  },

  /**
   * Call `listener(value)` when another tab of the site changes `key` (the
   * browser's "storage" event; this tab's own writes don't fire it).
   * Returns a function that stops listening.
   */
  onExternalChange(key, listener) {
    if (typeof window === 'undefined') return () => {};
    const handler = (event) => {
      if (event.key !== STORAGE_PREFIX + key) return;
      try {
        listener(event.newValue === null ? null : JSON.parse(event.newValue));
      } catch {
        // An unreadable value: ignore it, like get() does.
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  },

  /** True when data survives a reload (false = in-memory fallback). */
  get isPersistent() {
    getBackend();
    return persistent;
  },
};
