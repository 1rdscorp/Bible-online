/**
 * Strong's concordance: every verse where a Hebrew or Greek word (a Strong's
 * number) stands behind the English, from a search index built over KJV+
 * (js/search/engine.js buildIndex keeps each verse's tags). Pure functions:
 * the search worker runs them, and Node tests can too.
 */
import { BOOKS } from '../canon.js';

/** The [start, end] spans in one verse's tags ("7.9.H7225 …") tagged with `number`. */
export function spansFor(tags, number) {
  const spans = [];
  for (const tag of (tags ?? '').split(' ')) {
    const [start, length, numbers] = tag.split('.');
    if (numbers && numbers.split('+').includes(number)) spans.push([Number(start), Number(start) + Number(length)]);
  }
  return spans;
}

/**
 * Look up a Strong's number ("H7225").
 * @returns {{ verses: number, occurrences: number, books: [string, number][],
 *   renderings: [string, number][], hits: { bookId, chapter, verse, text, spans }[] }}
 *   `verses`: how many verses use it; `occurrences`: how many words;
 *   `books`: verses per book, in canon order; `renderings`: the English words
 *   it's translated by, most frequent first; `hits`: verses offset…offset+limit.
 */
export function concordance(index, number, { offset = 0, limit = 50 } = {}) {
  const list = index.strongs?.get(number) ?? new Uint32Array(0);
  const perBook = new Map();
  const renderings = new Map(); // lower case → { count, forms: Map(as written → count) }
  let occurrences = 0;
  for (const id of list) {
    const bookId = BOOKS[index.bookOf[id]].id;
    perBook.set(bookId, (perBook.get(bookId) ?? 0) + 1);
    const text = index.texts[id];
    for (const [start, end] of spansFor(index.tags[id], number)) {
      occurrences += 1;
      // "the world" (an article tagged with its noun) counts as "world".
      const written = text.slice(start, end).replace(/^(?:the|a|an) (?=\S)/i, '');
      const key = written.toLowerCase();
      let rendering = renderings.get(key);
      if (!rendering) renderings.set(key, (rendering = { count: 0, forms: new Map() }));
      rendering.count += 1;
      rendering.forms.set(written, (rendering.forms.get(written) ?? 0) + 1);
    }
  }
  const hits = [...list.subarray(offset, offset + limit)].map((id) => ({
    bookId: BOOKS[index.bookOf[id]].id,
    chapter: index.chapterOf[id],
    verse: index.verseOf[id],
    text: index.texts[id],
    spans: spansFor(index.tags[id], number),
  }));
  return {
    verses: list.length,
    occurrences,
    books: [...perBook],
    // Each rendering as it's usually written: "love", not "Love" from a
    // sentence start, but "I have loved".
    renderings: [...renderings.values()]
      .map(({ count, forms }) => [[...forms].sort((a, b) => b[1] - a[1] || (a[0] > b[0] ? -1 : 1))[0][0], count])
      .sort((a, b) => b[1] - a[1] || (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1)),
    hits,
  };
}
