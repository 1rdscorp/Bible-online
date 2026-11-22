/**
 * Bible references as old books print them, turned into the references the
 * site's data uses ("PSA 33:6", "GEN 1:1-2:25"):
 *
 *   "Ps. 33:6, 9; 104:5."        → PSA 33:6, PSA 33:9, PSA 104:5
 *   "See Ex. 3; 4:1-26."         → EXO 3:1-22, EXO 4:1-26
 *   "See 2 Sam. 2-4; 5:1-5."     → 2SA 2:1-4:22, 2SA 5:1-5
 *   "Joshua 10:40-43; chapter 11" → JOS 10:40-43, JOS 11:1-23
 *   "Genesis 1 and 2"            → GEN 1:1-31, GEN 2:1-25
 *
 * A reference with no book continues the last one named ("104:5" after
 * "Ps. 33:6"). Before any "chapter:verse", a bare number is a chapter;
 * after one, it's a verse of that chapter. Words that aren't references
 * ("See", "margin", "Rev. Ver.") are skipped.
 *
 * Used by the build scripts only (tools/build-commentary.mjs).
 */
import { getBook } from '../../js/canon.js';
import { lookupBook } from '../../js/search/reference.js';

// Abbreviations in older books that the site's own lookup doesn't know.
const OLD_NAMES = { cant: 'SNG', canticles: 'SNG', eccles: 'ECC', apoc: 'REV' };

const bookNamed = (name) => getBook(OLD_NAMES[name.toLowerCase().replace(/[^a-z]/g, '')] ?? '') ?? lookupBook(name);

/**
 * `lastVerse(book, chapter)`: how many verses a chapter has (0 if none), to
 * turn whole chapters into verse ranges and drop verses that don't exist.
 *
 * Returns the pieces between semicolons, each with its text and references:
 * [{ text: "Ps. 33:6, 9", refs: ["PSA 33:6", "PSA 33:9"] }, …]. A piece
 * whose book can't be read has no refs.
 */
export function parseRefList(input, lastVerse, context = {}) {
  let book = context.book ?? null;
  let chapter = context.chapter ?? null;
  const pieces = [];
  for (const raw of String(input ?? '').split(';')) {
    const text = raw.trim().replace(/\.$/, '');
    if (!text) continue;
    const refs = [];
    // A book name, then numbers: "2 Sam. 2-4", "Song of Solomon 2:1", "See Gen. 4:16".
    const body = text.replace(/^(?:see|and|compare|comp\.|cf\.)\s+/i, '').replace(/^chapters?\s+(?=\d)/i, '');
    const named = /^((?:[1-3]\s*)?[A-Za-z][A-Za-z.' ]*?)\.?\s*(\d.*)$/.exec(body);
    let numbers = body;
    if (named) {
      const found = bookNamed(named[1].trim());
      if (!found) {
        pieces.push({ text, refs });
        continue;
      }
      if (found.id !== book) chapter = null;
      book = found.id;
      numbers = named[2];
    } else if (!/^\d/.test(body)) {
      pieces.push({ text, refs });
      continue;
    }
    if (!book) {
      pieces.push({ text, refs });
      continue;
    }
    let sawVerse = false;
    const singleChapter = lastVerse(book, 2) === 0;
    // "1:1-3, 9, 2:4 and 5" → items split on commas and "and"; trailing words dropped.
    for (const item of numbers.split(/,|\band\b/)) {
      const m = /^\s*(\d+)(?::(\d+))?(?:\s*[-–—]\s*(\d+)(?::(\d+))?)?/.exec(item);
      if (!m) continue;
      const [a, b, c, d] = m.slice(1).map((n) => (n === undefined ? null : Number(n)));
      let range = null;
      if (b !== null) {
        // C:V, C:V-V, C:V-C:V
        chapter = a;
        sawVerse = true;
        range = d !== null ? [a, b, c, d] : [a, b, a, c ?? b];
      } else if (singleChapter) {
        chapter = 1;
        range = [1, a, 1, c ?? a];
      } else if (sawVerse && chapter !== null) {
        range = [chapter, a, chapter, c ?? a]; // a verse (or verses) of the last chapter
      } else {
        // whole chapters: C or C-C
        const end = c ?? a;
        range = [a, 1, end, lastVerse(book, end)];
        chapter = end;
      }
      const ref = formatRange(book, range, lastVerse);
      if (ref) refs.push(ref);
    }
    pieces.push({ text, refs });
  }
  return pieces;
}

/** All the references in a list, flattened. */
export function refsIn(input, lastVerse) {
  return parseRefList(input, lastVerse).flatMap((piece) => piece.refs);
}

/** [chapter, verse, endChapter, endVerse] → "GEN 1:1-2:25", clipped to verses that exist; null if none do. */
export function formatRange(book, [chapter, verse, endChapter, endVerse], lastVerse) {
  if (!(lastVerse(book, chapter) >= verse) || verse < 1) return null;
  let toChapter = endChapter;
  let toVerse = endVerse;
  if (toChapter < chapter || (toChapter === chapter && toVerse < verse)) {
    toChapter = chapter;
    toVerse = verse;
  }
  while (toChapter > chapter && lastVerse(book, toChapter) === 0) {
    toChapter -= 1;
    toVerse = lastVerse(book, toChapter);
  }
  toVerse = Math.min(toVerse, lastVerse(book, toChapter));
  const head = `${book} ${chapter}:${verse}`;
  if (toChapter !== chapter) return `${head}-${toChapter}:${toVerse}`;
  return toVerse > verse ? `${head}-${toVerse}` : head;
}

/** A whole chapter (or chapters) as a reference: ("GEN", 1, 2) → "GEN 1:1-2:25". */
export function chapterRange(book, chapter, endChapter, lastVerse) {
  return formatRange(book, [chapter, 1, endChapter ?? chapter, lastVerse(book, endChapter ?? chapter)], lastVerse);
}
