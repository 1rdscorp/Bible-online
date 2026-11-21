/**
 * Read a scrollmapper/bible_databases JSON file as a stream of verses.
 *
 * Both of its layouts are understood:
 *   - "2024" (legacy) branch, json/t_kjv.json:
 *       {"resultset":{"row":[{"field":[1001001, 1, 1, 1, "In the beginning…"]}]}}
 *       (field = [verse id, book number 1–66, chapter, verse, text])
 *   - current branch, formats/json/KJV.json:
 *       {"translation":"…","books":[{"name":"Genesis","chapters":[{"chapter":1,
 *        "verses":[{"verse":1,"text":"…"}]}]}]}
 */
import { BOOKS, findBook } from '../../js/canon.js';

function* legacyVerses(json) {
  for (const row of json.resultset.row) {
    const [, bookNumber, chapter, verse, text] = row.field;
    const book = BOOKS[bookNumber - 1];
    if (!book) throw new Error(`Unknown book number ${bookNumber} (expected 1–66).`);
    yield { bookId: book.id, chapter, verse, text };
  }
}

function* currentVerses(json) {
  for (const source of json.books) {
    // Names like "I Samuel" or "Revelation of John" resolve through canon.js.
    const book = findBook(source.name);
    if (!book) throw new Error(`Can't match the book name "${source.name}". Add an alias in js/canon.js.`);
    for (const chapter of source.chapters) {
      for (const verse of chapter.verses) {
        yield { bookId: book.id, chapter: chapter.chapter, verse: verse.verse, text: verse.text };
      }
    }
  }
}

export function readScrollmapper(json) {
  if (Array.isArray(json?.resultset?.row)) return legacyVerses(json);
  if (Array.isArray(json?.books) && Array.isArray(json.books[0]?.chapters?.[0]?.verses)) return currentVerses(json);
  throw new Error('Unrecognised input: expected a scrollmapper/bible_databases JSON file.');
}
