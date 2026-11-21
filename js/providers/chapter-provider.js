/**
 * Base for providers that fetch one chapter at a time, as web APIs do
 * (API.Bible and similar). Supply `fetchChapter`; this adds what every such
 * source needs:
 *
 *  - an in-memory cache of recently read chapters (least-recently-used
 *    eviction), so going back a chapter or re-rendering parallel columns
 *    doesn't call the API again;
 *  - de-duplication: simultaneous requests for one chapter share one fetch;
 *  - retry: a failed request isn't cached.
 *
 * It's memory-only on purpose: licensed text usually may not be stored on
 * the device. See js/providers/README.md for an API.Bible sketch built on this.
 *
 * @param {object} options
 * @param {import('./interface.js').TranslationInfo} options.info
 * @param {(bookId: string, chapter: number) => Promise<{verses: {number: number, text: string}[], copyright?: string} | null>} options.fetchChapter
 *   Resolve null if the source doesn't have the chapter.
 * @param {() => Promise<string[]>} [options.getBooks]
 * @param {number} [options.cacheSize]  chapters kept in memory
 * @returns {import('./interface.js').TranslationProvider}
 */
export function createChapterProvider({ info, fetchChapter, getBooks, cacheSize = 60 }) {
  if (typeof fetchChapter !== 'function') throw new TypeError('createChapterProvider needs a fetchChapter function');

  // Map keeps insertion order: the first key is the least recently used.
  const cache = new Map();

  function getChapter(bookId, chapter) {
    const key = `${bookId}.${chapter}`;
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key); // move to most-recently-used
      cache.set(key, hit);
      return hit;
    }
    const request = Promise.resolve()
      .then(() => fetchChapter(bookId, chapter))
      .then((result) => normalizeChapter(bookId, chapter, result));
    cache.set(key, request);
    request.catch(() => {
      if (cache.get(key) === request) cache.delete(key);
    });
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    return request;
  }

  const provider = { info, getChapter };
  if (getBooks) provider.getBooks = getBooks;
  return provider;
}

// Defensive: keep only well-formed verses, in order, so a quirky API response
// can't break the reader.
function normalizeChapter(bookId, chapter, result) {
  if (!result) return null;
  const verses = (Array.isArray(result.verses) ? result.verses : [])
    .filter((v) => Number.isInteger(v?.number) && v.number > 0 && typeof v.text === 'string' && v.text !== '')
    .sort((a, b) => a.number - b.number);
  const normalized = { bookId, chapter, verses };
  if (result.copyright) normalized.copyright = String(result.copyright);
  return normalized;
}
