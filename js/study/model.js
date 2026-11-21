/**
 * Study data model: highlights, notes and bookmarks, and the verse
 * references they are attached to.
 *
 * Every item points at verses: { book, chapter, start, end }, in the
 * English verse numbering that every translation on the site is converted
 * to (see data/README.md). So a verse highlight, note or bookmark shows on
 * the same verses in any translation, alone or side by side.
 *
 *   { id, type: 'highlight', ref, color,                      created, updated }
 *   { id, type: 'mark',      ref, color, translation, spans,  created, updated }
 *   { id, type: 'note',      ref, text, tags: [],             created, updated }
 *   { id, type: 'bookmark',  ref,                             created, updated }
 *
 * A 'mark' highlights particular words, so it belongs to one translation
 * (the words differ between translations): `spans` lists, per verse, the
 * characters it covers in that translation's verse text, with the words
 * themselves ([{ verse, start, end, text }]) so a mark never lands on the
 * wrong words if the text is ever corrected (see findSpan).
 *
 * `text` is a note in the simple markup of richtext.js. Times are ISO
 * strings. Ids are random, so items made on different devices never
 * collide; with `updated` they're what a future cloud sync needs to merge.
 *
 * Highlights never overlap: each verse has at most one colour. Highlighting
 * verses that already have one replaces it there, splitting the old range
 * (applyHighlight). Notes and bookmarks may overlap freely.
 *
 * Pure functions, no DOM: unit-tested in tests/study-model.test.js.
 */
import { BOOKS, getBook } from '../canon.js';

export const HIGHLIGHT_COLORS = Object.freeze(['yellow', 'green', 'blue', 'pink', 'orange']);
export const ITEM_TYPES = Object.freeze(['highlight', 'mark', 'note', 'bookmark']);

// Limits for imported data: generous for real use, small enough that a bad
// file can't fill the device's storage.
export const MAX_NOTE_LENGTH = 20000;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
const MAX_VERSE = 200; // Psalm 119 has 176
const MAX_SPANS = 200;
const MAX_VERSE_LENGTH = 10000; // characters; the longest verse here is ~6,800 (Greek Daniel 3:23)

/* ---------------------------------------------------------------------- */
/* References                                                              */
/* ---------------------------------------------------------------------- */

/** A verse range in one chapter. `end` defaults to `start`. */
export function makeRef(bookId, chapter, start, end = start) {
  const [first, last] = start <= end ? [start, end] : [end, start];
  return { book: bookId, chapter, start: first, end: last };
}

/** Is this a usable reference? (book exists, chapter in range, verses sensible) */
export function isValidRef(ref) {
  const book = getBook(ref?.book);
  return (
    Boolean(book) &&
    book.id === ref.book &&
    Number.isInteger(ref.chapter) &&
    ref.chapter >= 1 &&
    ref.chapter <= book.chapters &&
    Number.isInteger(ref.start) &&
    Number.isInteger(ref.end) &&
    ref.start >= 1 &&
    ref.end >= ref.start &&
    ref.end <= MAX_VERSE
  );
}

export function sameChapter(a, b) {
  return a.book === b.book && a.chapter === b.chapter;
}

export function sameRef(a, b) {
  return sameChapter(a, b) && a.start === b.start && a.end === b.end;
}

export function overlaps(a, b) {
  return sameChapter(a, b) && a.start <= b.end && b.start <= a.end;
}

export function containsVerse(ref, verse) {
  return verse >= ref.start && verse <= ref.end;
}

/** Sort key: canonical order (Genesis 1:1 first), then the shorter range. */
export function refKey(ref) {
  return (getBook(ref.book)?.index ?? 99) * 1e6 + ref.chapter * 1e3 + ref.start + ref.end / 1e3;
}

export function compareRefs(a, b) {
  return refKey(a) - refKey(b);
}

/** Group sorted verse numbers into consecutive runs: [1,2,3,5] → [[1,3],[5,5]]. */
export function verseRuns(verses) {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const runs = [];
  for (const verse of sorted) {
    const last = runs[runs.length - 1];
    if (last && verse === last[1] + 1) last[1] = verse;
    else runs.push([verse, verse]);
  }
  return runs;
}

/* ---------------------------------------------------------------------- */
/* Items                                                                   */
/* ---------------------------------------------------------------------- */

/** A random id (crypto where available, so ids from two devices never clash). */
export function newId() {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** "Prayer, hope , prayer" → ["prayer", "hope"]: trimmed, lower-case, unique. */
export function normalizeTags(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,;\n]+/);
  const tags = [];
  for (const raw of list) {
    const tag = String(raw).trim().replace(/^#+/, '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length === MAX_TAGS) break;
  }
  return tags;
}

export function createItem(type, ref, fields = {}, now = new Date().toISOString()) {
  const base = { id: newId(), type, ref: { ...ref }, created: now, updated: now };
  if (type === 'highlight') return { ...base, color: fields.color };
  if (type === 'note') return { ...base, text: String(fields.text ?? ''), tags: normalizeTags(fields.tags) };
  if (type === 'mark') return { ...base, color: fields.color, translation: fields.translation, spans: fields.spans.map((span) => ({ ...span })) };
  return base;
}

/** The words a mark covers, as one string ("so loved the world"). */
export function markQuote(item) {
  return (item.spans ?? []).map((span) => span.text).join(' ');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Check an item from storage or an imported file. Returns a clean copy
 * (unknown fields dropped), or null if it can't be used.
 */
export function sanitizeItem(item) {
  if (!item || typeof item !== 'object' || !ITEM_TYPES.includes(item.type)) return null;
  if (typeof item.id !== 'string' || !/^[\w-]{6,80}$/.test(item.id)) return null;
  const ref = item.ref && makeRef(item.ref.book, item.ref.chapter, item.ref.start, item.ref.end);
  if (!ref || !isValidRef(ref)) return null;
  const created = ISO_DATE.test(item.created) ? item.created : null;
  const updated = ISO_DATE.test(item.updated) ? item.updated : created;
  if (!created) return null;
  const clean = { id: item.id, type: item.type, ref, created, updated };
  if (item.type === 'highlight') {
    if (!HIGHLIGHT_COLORS.includes(item.color)) return null;
    clean.color = item.color;
  } else if (item.type === 'note') {
    if (typeof item.text !== 'string' || item.text.length > MAX_NOTE_LENGTH) return null;
    clean.text = item.text;
    clean.tags = normalizeTags(Array.isArray(item.tags) ? item.tags : []);
  } else if (item.type === 'mark') {
    if (!HIGHLIGHT_COLORS.includes(item.color)) return null;
    if (typeof item.translation !== 'string' || !/^[a-z0-9-]{1,30}$/.test(item.translation)) return null;
    if (!Array.isArray(item.spans) || item.spans.length === 0 || item.spans.length > MAX_SPANS) return null;
    const spans = [];
    for (const span of item.spans) {
      const ok =
        span &&
        Number.isInteger(span.verse) &&
        span.verse >= ref.start &&
        span.verse <= ref.end &&
        Number.isInteger(span.start) &&
        Number.isInteger(span.end) &&
        span.start >= 0 &&
        span.end > span.start &&
        span.end <= MAX_VERSE_LENGTH &&
        typeof span.text === 'string' &&
        span.text.length === span.end - span.start;
      if (!ok) return null;
      spans.push({ verse: span.verse, start: span.start, end: span.end, text: span.text });
    }
    clean.color = item.color;
    clean.translation = item.translation;
    clean.spans = spans;
  }
  return clean;
}

/* ---------------------------------------------------------------------- */
/* Word highlights ('mark')                                                */
/* ---------------------------------------------------------------------- */

/**
 * Where a span's words are in `verseText`: at the recorded place if they're
 * still there, otherwise the nearest place they occur (if the text was
 * corrected since), otherwise null (the mark isn't shown on that verse).
 */
export function findSpan(verseText, span) {
  if (verseText.slice(span.start, span.end) === span.text) return { start: span.start, end: span.end };
  let best = -1;
  for (let at = verseText.indexOf(span.text); at !== -1; at = verseText.indexOf(span.text, at + 1)) {
    if (best === -1 || Math.abs(at - span.start) < Math.abs(best - span.start)) best = at;
  }
  return best === -1 ? null : { start: best, end: best + span.text.length };
}

const spanOverlaps = (a, b) => a.verse === b.verse && a.start < b.end && b.start < a.end;
const spanWithin = (inner, outer) => inner.verse === outer.verse && inner.start >= outer.start && inner.end <= outer.end;

/** Marks in `translation` that share any characters with `spans`. */
export function marksOverlapping(items, translation, ref, spans) {
  return items.filter(
    (item) => item.type === 'mark' && item.translation === translation && sameChapter(item.ref, ref) && item.spans.some((s) => spans.some((t) => spanOverlaps(s, t))),
  );
}

/** Marks in `translation` lying wholly inside `spans` (a new mark there replaces them). */
export function marksCoveredBy(items, translation, ref, spans) {
  return items.filter(
    (item) => item.type === 'mark' && item.translation === translation && sameChapter(item.ref, ref) && item.spans.every((s) => spans.some((t) => spanWithin(s, t))),
  );
}

/* ---------------------------------------------------------------------- */
/* Highlights: one colour per verse                                        */
/* ---------------------------------------------------------------------- */

/**
 * Highlight `ref` in `color` (or remove highlighting there, with color null).
 * Returns the changes to make: { remove: [ids], add: [items] }. Existing
 * highlights overlapping `ref` are cut back (or split in two) around it;
 * a neighbouring highlight of the same colour is merged with the new one.
 */
export function applyHighlight(highlights, ref, color, now = new Date().toISOString()) {
  const remove = [];
  const add = [];
  let start = ref.start;
  let end = ref.end;
  for (const item of highlights) {
    if (item.type !== 'highlight' || !sameChapter(item.ref, ref)) continue;
    const touches = item.ref.start <= ref.end + 1 && ref.start <= item.ref.end + 1;
    if (!touches) continue;
    if (color && item.color === color) {
      // Same colour next to or over the new range: absorb it.
      remove.push(item.id);
      start = Math.min(start, item.ref.start);
      end = Math.max(end, item.ref.end);
      continue;
    }
    if (!overlaps(item.ref, ref)) continue; // only adjacent, other colour: keep
    remove.push(item.id);
    // Keep the parts outside the new range.
    if (item.ref.start < ref.start) add.push({ ...item, id: newId(), ref: makeRef(ref.book, ref.chapter, item.ref.start, ref.start - 1), updated: now });
    if (item.ref.end > ref.end) add.push({ ...item, id: newId(), ref: makeRef(ref.book, ref.chapter, ref.end + 1, item.ref.end), updated: now });
  }
  if (color) add.push(createItem('highlight', makeRef(ref.book, ref.chapter, start, end), { color }, now));
  return { remove, add };
}

/** The colour of each highlighted verse in a chapter: Map<verse, color>. */
export function highlightsByVerse(items, bookId, chapter) {
  const colors = new Map();
  for (const item of items) {
    if (item.type !== 'highlight' || item.ref.book !== bookId || item.ref.chapter !== chapter) continue;
    for (let verse = item.ref.start; verse <= item.ref.end; verse += 1) colors.set(verse, item.color);
  }
  return colors;
}

/* ---------------------------------------------------------------------- */
/* Filtering (My Study page)                                               */
/* ---------------------------------------------------------------------- */

/**
 * Filter and sort items for the My Study page.
 * filters: { type, color, book, tag, text, sort: 'bible'|'recent' }
 * `noteText(item)` gives a note's plain text for the text filter.
 */
export function filterItems(items, filters = {}, noteText = (item) => item.text ?? '') {
  const words = String(filters.text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/\s+/)
    .filter(Boolean);
  const result = items.filter((item) => {
    // "Highlights" covers whole verses and words alike.
    const kind = item.type === 'mark' ? 'highlight' : item.type;
    if (filters.type && kind !== filters.type) return false;
    if (filters.color && !(kind === 'highlight' && item.color === filters.color)) return false;
    if (filters.book && item.ref.book !== filters.book) return false;
    if (filters.tag && !(item.tags ?? []).includes(filters.tag)) return false;
    if (words.length) {
      const own = item.type === 'note' ? noteText(item) : item.type === 'mark' ? markQuote(item) : '';
      const haystack = `${own} ${(item.tags ?? []).join(' ')}`.toLowerCase().replace(/ё/g, 'е');
      if (!words.every((word) => haystack.includes(word))) return false;
    }
    return true;
  });
  if (filters.sort === 'recent') result.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  else result.sort((a, b) => compareRefs(a.ref, b.ref) || ITEM_TYPES.indexOf(a.type) - ITEM_TYPES.indexOf(b.type));
  return result;
}

/** Every tag in use, sorted, with how many items carry it. */
export function tagCounts(items) {
  const counts = new Map();
  for (const item of items) for (const tag of item.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Books that have items, in canonical order. */
export function booksWithItems(items) {
  const ids = new Set(items.map((item) => item.ref.book));
  return BOOKS.filter((book) => ids.has(book.id));
}
