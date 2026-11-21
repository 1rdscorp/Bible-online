/**
 * Full-text search engine: an inverted index per translation, and searches
 * across one or several of them.
 *
 * The index maps each word to the sorted list of verses containing it
 * ("postings"). A search then never scans the Bible text:
 *   - all words  → intersect the words' lists (smallest first)
 *   - any word   → merge them
 *   - "phrase"   → intersect its words' lists, then check the few verses left
 *                  for the words in order
 *   - lov*       → merge the lists of every word starting with "lov" (found
 *                  by binary search in the sorted word list)
 *
 * Verses are numbered 0…n-1 in canonical order (Genesis 1:1 first), so a
 * book or testament filter is a contiguous range of verse numbers.
 *
 * Pure functions with no DOM: js/search/worker.js runs them off the main
 * thread, and tests/search-engine.test.js runs them in Node.
 */
import { BOOKS, getBook } from '../canon.js';
import { findPhrase, tokenize } from './text.js';

/**
 * Index a translation file (the data/*.json format: books[] with
 * chapters[c][v] = text, "" for a missing verse).
 */
export function buildIndex(data) {
  const byId = new Map();
  for (const book of data?.books ?? []) {
    if (book && typeof book.id === 'string' && Array.isArray(book.chapters)) byId.set(book.id.toUpperCase(), book);
  }

  const texts = [];
  const bookOf = [];
  const chapterOf = [];
  const verseOf = [];
  const lists = new Map(); // term → verse numbers (plain arrays while building)
  // KJV+: each verse's Strong's tags ("7.9.H7225 …"), and number → verses.
  const tags = [];
  const strongsLists = new Map();
  // bookStart[i] = first verse of canon book i; bookStart[66] = verse count.
  const bookStart = new Uint32Array(BOOKS.length + 1);

  for (const book of BOOKS) {
    bookStart[book.index] = texts.length;
    const entry = byId.get(book.id);
    if (!entry) continue; // a translation may lack some books
    entry.chapters.forEach((verses, c) => {
      if (!Array.isArray(verses)) return;
      verses.forEach((text, v) => {
        if (typeof text !== 'string' || text === '') return;
        const id = texts.length;
        texts.push(text);
        bookOf.push(book.index);
        chapterOf.push(c + 1);
        verseOf.push(v + 1);
        // Each verse is listed once per word, however often the word repeats.
        for (const term of new Set(tokenize(text))) {
          let list = lists.get(term);
          if (!list) lists.set(term, (list = []));
          list.push(id);
        }
        const verseTags = entry.tags?.[c]?.[v];
        if (typeof verseTags === 'string' && verseTags !== '') {
          tags[id] = verseTags;
          for (const number of new Set(verseTags.split(' ').flatMap((tag) => tag.split('.')[2]?.split('+') ?? []))) {
            let list = strongsLists.get(number);
            if (!list) strongsLists.set(number, (list = []));
            list.push(id);
          }
        }
      });
    });
  }
  bookStart[BOOKS.length] = texts.length;

  // Typed arrays: far smaller than arrays of numbers for ~800,000 entries.
  const postings = new Map();
  for (const [term, list] of lists) postings.set(term, Uint32Array.from(list));
  const strongs = new Map();
  for (const [number, list] of strongsLists) strongs.set(number, Uint32Array.from(list));

  return {
    texts,
    bookOf: Uint8Array.from(bookOf),
    chapterOf: Uint16Array.from(chapterOf),
    verseOf: Uint16Array.from(verseOf),
    postings,
    terms: [...postings.keys()].sort(), // for prefix lookups
    bookStart,
    size: texts.length,
    // Present only for a translation with Strong's numbers (KJV+).
    tags,
    strongs,
  };
}

/**
 * The canon books a scope covers, as [first, last] book indexes:
 * "all" → null (no limit), "OT", "NT", or a book id ("ROM").
 */
export function scopeRange(scope) {
  if (scope === 'OT' || scope === 'NT') {
    const books = BOOKS.filter((book) => book.testament === scope);
    return [books[0].index, books[books.length - 1].index];
  }
  const book = scope && scope !== 'all' ? getBook(scope) : null;
  return book ? [book.index, book.index] : null;
}

/** Index of the first element ≥ value in a sorted array (searching from `lo`). */
function lowerBound(list, value, lo = 0) {
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The part of a sorted posting list inside [from, to), without copying. */
function clip(list, from, to) {
  return list.subarray(lowerBound(list, from), lowerBound(list, to));
}

function intersect(lists) {
  if (lists.length === 0) return [];
  const sorted = [...lists].sort((a, b) => a.length - b.length);
  let result = Array.from(sorted[0]);
  for (const list of sorted.slice(1)) {
    if (result.length === 0) break;
    // Walk the shorter result, binary-searching the longer list from where
    // the last match was found.
    const next = [];
    let at = 0;
    for (const id of result) {
      at = lowerBound(list, id, at);
      if (at < list.length && list[at] === id) next.push(id);
    }
    result = next;
  }
  return result;
}

/** Sorted union of verse lists, using a bitmap over the verse range. */
function union(lists, from, to) {
  const nonEmpty = lists.filter((list) => list.length);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return Array.from(nonEmpty[0]);
  const seen = new Uint8Array(to - from);
  for (const list of nonEmpty) for (const id of list) seen[id - from] = 1;
  const result = [];
  for (let i = 0; i < seen.length; i += 1) if (seen[i]) result.push(from + i);
  return result;
}

/** All the terms in the index that start with `prefix`. */
function termsWithPrefix(index, prefix) {
  const found = [];
  for (let i = lowerBound(index.terms, prefix); i < index.terms.length && index.terms[i].startsWith(prefix); i += 1) {
    found.push(index.terms[i]);
  }
  return found;
}

const EMPTY = new Uint32Array(0);

/** Verses (sorted ids within [from, to)) matching one clause. */
function clauseVerses(index, clause, from, to) {
  const listFor = (term) => clip(index.postings.get(term) ?? EMPTY, from, to);
  if (clause.type === 'word') {
    if (!clause.prefix) return listFor(clause.term);
    return union(termsWithPrefix(index, clause.term).map(listFor), from, to);
  }
  // Phrase: verses with every word, then the words in order.
  const candidates = intersect([...new Set(clause.terms)].map(listFor));
  return candidates.filter((id) => findPhrase(tokenize(index.texts[id]), clause.terms) !== -1);
}

/**
 * Search one translation's index. `query` comes from parseQuery() in
 * text.js; `range` from scopeRange(). Returns sorted verse ids.
 */
export function searchIndex(index, query, range = null) {
  if (!query?.clauses?.length) return [];
  const from = range ? index.bookStart[range[0]] : 0;
  const to = range ? index.bookStart[range[1] + 1] : index.size;
  if (from >= to) return [];

  if (query.mode === 'any') {
    return union(query.clauses.map((clause) => clauseVerses(index, clause, from, to)), from, to);
  }
  // All: work out the cheap single-word lists first, then check phrases
  // only within what's left.
  const words = query.clauses.filter((clause) => clause.type === 'word');
  const phrases = query.clauses.filter((clause) => clause.type === 'phrase');
  let result = words.length ? intersect(words.map((clause) => clauseVerses(index, clause, from, to))) : null;
  for (const phrase of phrases) {
    if (result && result.length === 0) break;
    const verses = clauseVerses(index, phrase, from, to);
    result = result ? intersect([result, verses]) : Array.from(verses);
  }
  return result ?? [];
}

/**
 * A sortable number for a verse position, the same in every translation:
 * book × 1,000,000 + chapter × 1,000 + verse. (No chapter has 1,000 verses.)
 */
export function positionKey(bookIndex, chapter, verse) {
  return bookIndex * 1_000_000 + chapter * 1000 + verse;
}

export function keyToPosition(key) {
  const bookIndex = Math.floor(key / 1_000_000);
  return { book: BOOKS[bookIndex], chapter: Math.floor(key / 1000) % 1000, verse: key % 1000 };
}

/**
 * Search several translations at once and combine the results by verse.
 *
 * @param {{ id: string, index: object }[]} sources  in display order
 * @returns {{ keys: number[], matches: Map<number, {source: number, id: number}[]>, books: [string, number][] }}
 *   keys: matching verse positions in canonical order; matches: which
 *   translations matched each one; books: [bookId, verse count] per book.
 */
export function runSearch(sources, query, scope = 'all') {
  const range = scopeRange(scope);
  const matches = new Map();
  sources.forEach(({ index }, source) => {
    for (const id of searchIndex(index, query, range)) {
      const key = positionKey(index.bookOf[id], index.chapterOf[id], index.verseOf[id]);
      let list = matches.get(key);
      if (!list) matches.set(key, (list = []));
      list.push({ source, id });
    }
  });
  const keys = [...matches.keys()].sort((a, b) => a - b);

  const counts = new Map();
  for (const key of keys) {
    const bookIndex = Math.floor(key / 1_000_000);
    counts.set(bookIndex, (counts.get(bookIndex) ?? 0) + 1);
  }
  const books = [...counts].map(([bookIndex, count]) => [BOOKS[bookIndex].id, count]);
  return { keys, matches, books };
}
