/**
 * Provider for translations stored as static JSON files in /data. The file
 * format is documented in data/README.md.
 *
 * Lazy: nothing downloads until the translation is first needed. The whole
 * file (about 1.2 MB compressed) then arrives in one request, is kept in
 * memory for the session, and is stored on the device by translation-cache.js,
 * so later visits open it instantly. Every chapter after the first is
 * instant. (Search, in a later stage, needs the whole text anyway.)
 */
import { translationCache } from './translation-cache.js';

/**
 * @param {import('./interface.js').TranslationInfo} info  needs `url`; `version` enables the persistent cache
 * @param {object} [options]
 * @param {(url: string, version?: string) => Promise<any>} [options.fetchJson]  injectable for tests
 * @returns {import('./interface.js').TranslationProvider}
 */
export function createJsonProvider(info, { fetchJson = (url, version) => translationCache.fetchJson(url, version) } = {}) {
  if (typeof info?.url !== 'string' || info.url === '') {
    throw new TypeError(`Translation "${info?.id}" uses the json provider, so it needs a "url".`);
  }

  let booksPromise = null;
  let loaded = false;

  function books() {
    if (!booksPromise) {
      booksPromise = fetchJson(info.url, info.version).then((data) => {
        const byId = indexBooks(data, info);
        loaded = true;
        return byId;
      });
      // Forget a failed download so the next request tries again.
      booksPromise.catch(() => {
        booksPromise = null;
      });
    }
    return booksPromise;
  }

  return {
    info,

    async load() {
      await books();
    },

    isLoaded: () => loaded,

    async getBooks() {
      return [...(await books()).keys()];
    },

    async getChapter(bookId, chapter) {
      const book = (await books()).get(bookId);
      const verses = book?.chapters[chapter - 1];
      if (!Array.isArray(verses)) return null;
      const result = {
        bookId,
        chapter,
        // Verse N is at index N-1. An empty string marks a verse this
        // translation doesn't have; it's skipped, and numbering stays intact.
        verses: verses.flatMap((text, index) =>
          typeof text === 'string' && text !== '' ? [{ number: index + 1, text }] : [],
        ),
      };
      // Strong's numbers (KJV+): "7.9.H7225 17.3.H430" per verse, beside the text.
      const tags = book.tags?.[chapter - 1];
      if (Array.isArray(tags)) {
        for (const verse of result.verses) {
          const words = parseWordTags(tags[verse.number - 1], verse.text.length);
          if (words.length) verse.words = words;
        }
      }
      // A formatted text (BTI): each verse's marks ("0.p 12.7.i") and footnotes,
      // verses translated together ("11–12": `to`), and the section headings.
      const marks = book.marks?.[chapter - 1];
      const notes = book.notes?.[chapter - 1] ?? [];
      const ranges = new Map((book.ranges?.[chapter - 1] ?? []).map(([from, to]) => [from, to]));
      if (Array.isArray(marks)) {
        for (const verse of result.verses) {
          const verseNotes = notes.filter((note) => note[0] === verse.number).map(([, at, label, ref, text, noteMarks]) => ({ at, label, ref, text, marks: noteMarks ?? '' }));
          const verseMarks = marks[verse.number - 1] ?? '';
          if (verseMarks || verseNotes.length) verse.format = { marks: verseMarks, notes: verseNotes };
          if (ranges.has(verse.number)) verse.to = ranges.get(verse.number);
        }
        result.headings = (book.headings?.[chapter - 1] ?? []).map(([verse, text]) => ({ verse, text }));
      }
      const native = book.native?.[chapter];
      if (Array.isArray(native)) result.native = native.map(([c, from, to]) => (from === undefined ? { chapter: c } : { chapter: c, from, to }));
      return result;
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
      byId.set(book.id.toUpperCase(), {
        chapters: book.chapters,
        native: book.native ?? null,
        tags: book.tags ?? null,
        // A formatted text's layout (BTI): see getChapter.
        marks: book.marks ?? null,
        notes: book.notes ?? null,
        headings: book.headings ?? null,
        ranges: book.ranges ?? null,
      });
    }
  }
  return byId;
}

/**
 * "7.9.H7225 17.3.G3056+G5207" → [{ start: 7, end: 16, strongs: ["H7225"] }, …].
 * Tags that don't fit the verse are skipped rather than trusted.
 */
export function parseWordTags(tags, length) {
  if (typeof tags !== 'string' || tags === '') return [];
  const words = [];
  for (const tag of tags.split(' ')) {
    const [start, size, numbers] = tag.split('.');
    const from = Number(start);
    const to = from + Number(size);
    if (!Number.isInteger(from) || !(to > from) || to > length || !numbers) continue;
    words.push({ start: from, end: to, strongs: numbers.split('+') });
  }
  return words;
}

/** The reverse of parseWordTags: [{ start: 7, end: 16, strongs: ["H7225"] }] → "7.9.H7225". */
export function formatWordTags(words) {
  return words.map(({ start, end, strongs }) => `${start}.${end - start}.${strongs.join('+')}`).join(' ');
}
