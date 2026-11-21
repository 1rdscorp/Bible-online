/**
 * Persistent cache for downloaded translation files, using the browser's
 * Cache Storage.
 *
 * - Each file is stored under its URL plus "?v=<version>", where version is
 *   the content hash in data/translations.json. An updated file therefore
 *   gets a new key, and the outdated copy is deleted when the new one arrives.
 * - A cached file opens with no network request at all: instant on later
 *   visits, and the basis for offline reading in a later stage.
 * - Without Cache Storage (plain-http pages, some private modes) this falls
 *   back to an ordinary fetch, where the browser's HTTP cache still helps.
 *
 * Only text the site may store goes here. Licensed API text (a later stage)
 * should stay in memory; see js/providers/README.md.
 */
const CACHE_NAME = 'bible-online-text-v1';

/**
 * @param {object} [options]  injectable for tests
 * @param {CacheStorage} [options.cacheStorage]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {string} [options.baseUrl]  resolves relative URLs (defaults to the page URL)
 */
export function createTranslationCache({ cacheStorage = globalThis.caches, fetchImpl, baseUrl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => fetch(...args));
  let cachePromise = null;

  function open() {
    if (!cacheStorage) return Promise.resolve(null);
    cachePromise ??= Promise.resolve()
      .then(() => cacheStorage.open(CACHE_NAME))
      .catch(() => null); // e.g. storage blocked: carry on without it
    return cachePromise;
  }

  function keyFor(url, version) {
    const resolved = new URL(url, baseUrl ?? globalThis.location?.href);
    if (version) resolved.searchParams.set('v', version);
    return resolved.href;
  }

  // Delete other versions of the same file.
  async function prune(cache, keepKey) {
    const keep = new URL(keepKey);
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      if (url.pathname === keep.pathname && url.href !== keep.href) await cache.delete(request);
    }
  }

  /** Fetch and parse a JSON file, from the cache when possible. */
  async function fetchJson(url, version) {
    const key = keyFor(url, version);
    // Unversioned files are never stored: there'd be no way to know they're stale.
    const cache = version ? await open() : null;

    if (cache) {
      try {
        const hit = await cache.match(key);
        if (hit) return await hit.json();
      } catch {
        // An unreadable entry is simply downloaded again.
      }
    }

    let response;
    try {
      response = await doFetch(key);
    } catch (cause) {
      throw new Error(`Network error while loading ${url}. Check your connection and try again.`, { cause });
    }
    if (!response.ok) throw new Error(`Couldn't load ${url} (HTTP ${response.status}).`);

    if (cache) {
      // Save a copy in the background; the reader doesn't wait for it.
      cache
        .put(key, response.clone())
        .then(() => prune(cache, key))
        .catch(() => {}); // full storage etc.: still works, just not cached
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new Error(`${url} is not valid JSON.`, { cause });
    }
  }

  /** True if this version of the file is already stored on the device. */
  async function has(url, version) {
    const cache = version ? await open() : null;
    if (!cache) return false;
    try {
      return Boolean(await cache.match(keyFor(url, version)));
    } catch {
      return false;
    }
  }

  return { fetchJson, has, keyFor };
}

export const translationCache = createTranslationCache();
