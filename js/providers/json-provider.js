/**
 * Provider for translations stored as static JSON files in /data. The file
 * format is documented in data/README.md.
 *
 * The whole file is downloaded once, on first use, and kept in memory, so
 * every chapter after that is instant. (Search, in a later stage, needs the
 * whole text anyway.)
 */
import { fetchJson as defaultFetchJson } from './fetch-json.js';

/**
 * @param {object} info  translation entry from data/translations.json (needs `url`)
 * @param {object} [options]
 * @param {(url: string) => Promise<any>} [options.fetchJson]  injectable for tests
 */
export function createJsonProvider(info, { fetchJson = defaultFetchJson } = {}) {
  let booksPromise = null;

  function books() {
    if (!booksPromise) {
      booksPromise = fetchJson(info.url).then((data) => indexBooks(data, info));
      // Forget a failed download so the next request tries again.
      booksPromise.catch(() => {
        booksPromise = null;
      });
    }
    return booksPromise;
  }

  return {
    info,

    /** Download the translation in advance (optional; getChapter does it too). */
    async load() {
      await books();
    },

    /**
     * @returns {Promise<{bookId: string, chapter: number, verses: {number: number, text: string}[]} | null>}
     *   null if this translation doesn't contain the book or chapter.
     */
    async getChapter(bookId, chapter) {
      const verses = (await books()).get(bookId)?.[chapter - 1];
      if (!Array.isArray(verses)) return null;
      return {
        bookId,
        chapter,
        // Verse N is at index N-1. An empty string marks a verse this
        // translation doesn't have; it is skipped, and numbering stays intact.
        verses: verses.flatMap((text, index) =>
          typeof text === 'string' && text !== '' ? [{ number: index + 1, text }] : [],
        ),
      };
    },
  };
}

function indexBooks(data, info) {
  if (!data || !Array.isArray(data.books)) {
    throw new Error(`${info.url} is not a translation file: it has no "books" list.`);
  }
  const byId = new Map();
  for (const book of data.books) {
    if (book && typeof book.id === 'string' && Array.isArray(book.chapters)) {
      byId.set(book.id.toUpperCase(), book.chapters);
    }
  }
  return byId;
}
