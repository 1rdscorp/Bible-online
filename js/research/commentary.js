/**
 * Commentary lookups over data/commentary/index.json (built by
 * tools/build-commentary.mjs): which chapters of which books discuss a
 * Bible chapter or verse, the sections of a verse-by-verse commentary that
 * cover a verse, and plain-text excerpts. No DOM access, so Node tests can
 * import it.
 *
 * Index: { works: [{ id, title, author, year, kind: "chapters"|"verses",
 *   parts: [{ id, title, section?, book?, chapter?, passages: ["LUK 2:1-20"] }] }] }
 * A part file: { id, title, passages, sections: [{ ref?, quote?, blocks }], notes? }
 */
import { getBook } from '../canon.js';
import { parseRef } from './refs.js';

/**
 * A passage as the index writes it: whole chapters in short form ("GEN 39-41",
 * "LUK 2") or verses as in refs.js ("LUK 2:1-20"). Whole chapters have
 * verse 1 to endVerse Infinity and `whole: true`. Null if unreadable.
 */
export function parsePassage(text) {
  const m = /^([1-3]?[A-Z]{2,3}) (\d+)(?:-(\d+))?$/.exec(String(text ?? ''));
  if (m) {
    if (getBook(m[1])?.id !== m[1]) return null;
    const chapter = Number(m[2]);
    const endChapter = m[3] ? Number(m[3]) : chapter;
    return endChapter >= chapter ? { book: m[1], chapter, verse: 1, endChapter, endVerse: Infinity, whole: true } : null;
  }
  return parseRef(text);
}

/** Does a passage ("GEN 39-41", "LUK 2:1-20") include this chapter, or this verse of it? */
export function refCovers(text, bookId, chapter, verse = null) {
  const ref = typeof text === 'string' ? parsePassage(text) : text;
  if (!ref || ref.book !== bookId || chapter < ref.chapter || chapter > ref.endChapter) return false;
  if (verse === null) return true;
  if (chapter === ref.chapter && verse < ref.verse) return false;
  if (chapter === ref.endChapter && verse > ref.endVerse) return false;
  return true;
}

/**
 * The chapters of each book that discuss a Bible chapter (or one verse of
 * it): [{ work, part }] in the index's order (Ellen White's books in their
 * series order, then any others). A chapter based on a whole Bible book (the
 * Epistle to the Romans) comes after those based on a passage of this
 * chapter, so the closest commentary is listed first.
 */
export function partsFor(index, bookId, chapter, verse = null) {
  const found = [];
  for (const work of index?.works ?? []) {
    for (const part of work.parts) {
      const refs = part.passages.filter((passage) => refCovers(passage, bookId, chapter, verse));
      if (!refs.length) continue;
      // How many chapters the closest passage spans: 1 for "LUK 2:1-20", 16 for all of Romans.
      const span = Math.min(...refs.map((passage) => {
        const ref = parsePassage(passage);
        return ref.endChapter - ref.chapter + 1;
      }));
      found.push({ work, part, span });
    }
  }
  return found
    .map((item, order) => ({ ...item, order }))
    .sort((a, b) => Number(a.span > 3) - Number(b.span > 3) || a.order - b.order)
    .map(({ work, part }) => ({ work, part }));
}

/**
 * A passage in words, with `bookName(book)` and `chapterTitle(book, chapter)`
 * from i18n.js: "Genesis 39–41", "Luke 2", "Luke 2:1–20", "Philemon".
 */
export function passageLabel(text, { bookName, chapterTitle }) {
  const ref = typeof text === 'string' ? parsePassage(text) : text;
  if (!ref) return String(text);
  const book = getBook(ref.book);
  if (ref.whole) {
    if (book.chapters === 1) return bookName(book);
    return ref.endChapter === ref.chapter ? chapterTitle(book, ref.chapter) : `${chapterTitle(book, ref.chapter)}–${ref.endChapter}`;
  }
  const head = `${chapterTitle(book, ref.chapter)}:${ref.verse}`;
  if (ref.endChapter !== ref.chapter) return `${head}–${ref.endChapter}:${ref.endVerse}`;
  return ref.endVerse > ref.verse ? `${head}–${ref.endVerse}` : head;
}

/** In a verse-by-verse part, the sections whose verses include this one. */
export function sectionsFor(partData, bookId, chapter, verse) {
  return (partData?.sections ?? []).filter((section) => section.ref && refCovers(section.ref, bookId, chapter, verse));
}

/** The parts before and after one in its book: { prev, next } (null at the ends). */
export function neighbours(work, partId) {
  const index = work.parts.findIndex((part) => part.id === partId);
  return { prev: index > 0 ? work.parts[index - 1] : null, next: index >= 0 && index < work.parts.length - 1 ? work.parts[index + 1] : null };
}

/** A run's text: strings, links ({ x }), italics ({ i }), bold ({ b }); page marks and note marks have none. */
export function runText(run) {
  if (typeof run === 'string') return run;
  return run.x ?? run.i ?? run.b ?? '';
}

/** Blocks as plain text, cut at a word boundary near `max` characters ("…" if cut). */
export function blocksText(blocks, max = Infinity) {
  const text = blocks
    .filter((block) => block.t !== 'n')
    .map((block) => (block.t === 'q' ? block.lines.map((line) => line.map(runText).join('')).join(' / ') : block.c.map(runText).join('')))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:—-]+$/, '')}…`;
}
