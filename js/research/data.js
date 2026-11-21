/**
 * The research data (data/research.json lists it): cross references,
 * Strong's dictionaries, places and study content. Files are fetched on
 * first use, kept in memory, and stored on the device through the same
 * cache as the translations (providers/translation-cache.js), keyed by each
 * data set's content version.
 */
import { getBook } from '../canon.js';
import { translationCache } from '../providers/translation-cache.js';
import { parseRef } from './refs.js';

/**
 * @param {object} [options]  injectable for tests
 * @param {(url: string, version?: string) => Promise<any>} [options.fetchJson]
 * @param {string} [options.manifestUrl]
 */
export function createResearchData({ fetchJson = (url, version) => translationCache.fetchJson(url, version), manifestUrl = 'data/research.json' } = {}) {
  const files = new Map(); // url → Promise<data>
  let manifestPromise = null;

  // research.json itself is small and changes with every data update, so
  // it's fetched without a version (the browser's HTTP cache still applies).
  function manifest() {
    manifestPromise ??= fetchJson(manifestUrl).catch((error) => {
      manifestPromise = null;
      throw error;
    });
    return manifestPromise;
  }

  function load(url, version) {
    if (!files.has(url)) {
      const promise = fetchJson(url, version);
      promise.catch(() => files.delete(url)); // try again next time
      files.set(url, promise);
    }
    return files.get(url);
  }

  return {
    manifest,

    /**
     * Cross references for one verse, best first:
     * [{ ref: "ROM 5:8", target: { book, chapter, verse, endChapter, endVerse }, votes: 995 }].
     */
    async crossReferences(bookId, chapter, verse) {
      const { xref } = await manifest();
      const file = await load(`${xref.url}${getBook(bookId).id}.json`, xref.version);
      return (file.verses?.[`${chapter}:${verse}`] ?? []).flatMap(([ref, votes]) => {
        const target = parseRef(ref);
        return target ? [{ ref, target, votes }] : [];
      });
    },

    /** A Strong's dictionary entry ("H7225", "G3056"), or null. */
    async strongs(number) {
      const { strongs } = await manifest();
      const which = number[0] === 'H' ? strongs.hebrew : number[0] === 'G' ? strongs.greek : null;
      if (!which) return null;
      const file = await load(which.url, which.version);
      return file.entries?.[number] ?? null;
    },

    /** All places: { id: { name, ru, lon, lat, type, score, verses } }. */
    async places() {
      const { geo } = await manifest();
      return (await load(geo.places.url, geo.places.version)).places;
    },

    async basemap() {
      const { geo } = await manifest();
      return load(geo.basemap.url, geo.basemap.version);
    },

    /** A book's introduction, or null if it has none yet. */
    async bookIntro(bookId) {
      const { study } = await manifest();
      if (!study.books.includes(bookId)) return null;
      return load(`${study.url}books/${bookId}.json`, study.version);
    },

    async timeline() {
      const { study } = await manifest();
      return load(`${study.url}timeline.json`, study.version);
    },

    async maps() {
      const { study } = await manifest();
      return (await load(`${study.url}maps.json`, study.version)).maps;
    },
  };
}

export const researchData = createResearchData();
