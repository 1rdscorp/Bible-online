/**
 * Main-thread side of the search worker (js/search/worker.js).
 *
 *   const client = createSearchClient();
 *   const page = await client.search({ translations, text, match, scope, offset, limit }, { onProgress });
 *
 * search() resolves with the worker's 'results' message, or with null when
 * a newer search replaced it before it finished. The worker starts on first
 * use and is kept for the session, so its indexes are reused.
 */

/** What the worker needs to know about a translation; URLs made absolute. */
function forWorker(info) {
  return { id: info.id, abbreviation: info.abbreviation, url: new URL(info.url, document.baseURI).href, version: info.version ?? null };
}

/**
 * Only translations whose whole text is available as a file can be indexed.
 * (An API source would search through its own API instead; see
 * js/providers/README.md.)
 */
export function isSearchable(info) {
  return info?.provider === 'json' && typeof info.url === 'string';
}

export function createSearchClient({ workerUrl = new URL('./worker.js', import.meta.url) } = {}) {
  let worker = null;
  let nextId = 1;
  const pending = new Map(); // requestId → { resolve, reject, onProgress }

  function fail(error) {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null; // the next search starts a fresh worker
  }

  function start() {
    if (worker) return worker;
    if (typeof Worker === 'undefined') throw new Error('This browser can’t run background scripts (Web Workers).');
    worker = new Worker(workerUrl, { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      const request = pending.get(data?.requestId);
      if (!request) return;
      if (data.type === 'progress') {
        request.onProgress?.(data);
        return;
      }
      pending.delete(data.requestId);
      if (data.type === 'error') request.reject(new Error(data.message));
      else request.resolve(data.type === 'results' || data.type === 'concordance' ? data : null);
    });
    // A worker that fails to load (or crashes) reports here.
    worker.addEventListener('error', (event) => {
      event.preventDefault();
      fail(new Error(event.message || 'The search couldn’t start.'));
    });
    return worker;
  }

  return {
    search({ translations, text, match = 'all', scope = 'all', offset = 0, limit = 100 }, { onProgress } = {}) {
      return new Promise((resolve, reject) => {
        const requestId = nextId++;
        pending.set(requestId, { resolve, reject, onProgress });
        try {
          start().postMessage({ type: 'search', requestId, translations: translations.map(forWorker), text, match, scope, offset, limit });
        } catch (error) {
          pending.delete(requestId);
          reject(error);
        }
      });
    },

    /**
     * Every verse of a Strong's-tagged translation (KJV+) that uses a
     * Strong's number: resolves with js/research/concordance.js's result.
     */
    concordance({ translation, number, offset = 0, limit = 50 }, { onProgress } = {}) {
      return new Promise((resolve, reject) => {
        const requestId = nextId++;
        pending.set(requestId, { resolve, reject, onProgress });
        try {
          start().postMessage({ type: 'concordance', requestId, translation: forWorker(translation), number, offset, limit });
        } catch (error) {
          pending.delete(requestId);
          reject(error);
        }
      });
    },

    /** Start downloading and indexing in the background, before the first search. */
    prepare(translations) {
      try {
        start().postMessage({ type: 'prepare', translations: translations.map(forWorker) });
      } catch {
        // search() reports the problem when it's actually needed.
      }
    },
  };
}
