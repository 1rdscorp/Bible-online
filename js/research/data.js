/**
 * The research data (data/research.json lists it): cross references,
 * Strong's dictionaries, places, study content and commentary. Files are fetched on
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

    /** The coarser basemap from Spain to the Indus, for maps of empires. */
    async basemapWide() {
      const { geo } = await manifest();
      return load(geo.basemapWide.url, geo.basemapWide.version);
    },

    /** The interactive "explore" pages: [{ id, file, title, summary, books, chapters }]. */
    async explore() {
      const { study } = await manifest();
      return (await load(`${study.url}explore.json`, study.version)).pages;
    },

    /** One explore page's content, or null if there's no such page. */
    async explorePage(id) {
      const { study } = await manifest();
      const page = (await this.explore()).find((entry) => entry.id === id);
      return page ? load(`${study.url}${page.file}`, study.version) : null;
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

    /** The commentary books and their chapters (js/research/commentary.js reads it). */
    async commentary() {
      const { commentary } = await manifest();
      if (!commentary) return { works: [] };
      return load(`${commentary.url}index.json`, commentary.version);
    },

    /**
     * One chapter of a commentary book, or null if there's no such chapter.
     * `lang` "ru": its Russian translation (null if it has none).
     */
    async commentaryPart(workId, partId, lang = 'en') {
      const { commentary } = await manifest();
      const index = await this.commentary();
      const work = index.works.find((entry) => entry.id === workId);
      const part = work?.parts.find((entry) => entry.id === partId);
      if (!part || (lang === 'ru' && !part.ru)) return null;
      return load(`${commentary.url}${lang === 'ru' ? 'ru/' : ''}${workId}/${partId}.json`, commentary.version);
    },

    /** The topical index (data/topics/index.json): { source, topics: [{ id, en, ru, refs }] }. */
    async topicsIndex() {
      const { topics } = await manifest();
      return load(`${topics.url}index.json`, topics.version);
    },

    /** One topic: { id, en, ru, lines: [{ l, t, r, see }] }. */
    async topic(id) {
      const { topics } = await manifest();
      return load(`${topics.url}${id}.json`, topics.version);
    },

    /** Which statements cite each passage: { GEN: [[chapter, verse, endChapter, endVerse, topic, line]] }. */
    async topicRefs() {
      const { topics } = await manifest();
      return load(`${topics.url}refs.json`, topics.version);
    },

    /** The reading plans (data/plans.json): { wordsPerMinute, plans: [{ id, name, description, days, minutes }] }. */
    async plans() {
      const { plans } = await manifest();
      return load(plans.url, plans.version);
    },

    /** The audio Bibles: [{ id, translation, title, url, version, readers, reader, page, credit }]. */
    async audioSources() {
      const { audio } = await manifest();
      return audio?.sources ?? [];
    },

    /** One audio Bible's recorded chapters: { base, pageBase, tracks } (see js/audio/sources.js). */
    async audioTracks(source) {
      return load(source.url, source.version);
    },
  };
}

export const researchData = createResearchData();
