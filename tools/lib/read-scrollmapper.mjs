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

/**
 * A few files keep markup from their source modules:
 *   <note>…</note>     a footnote: dropped (footnotes aren't shown, as for WEB)
 *   <title>…</title>   at the very end of a verse, the heading of the next one
 *                      (Russian Synodal Psalm 143:15 ends with the title of
 *                      Psalm 144): moved to the start of the next verse
 *   any other tag      removed, keeping its text
 */
function splitMarkup(text) {
  let carried = '';
  let clean = String(text ?? '').replace(/<note\b[^>]*>[\s\S]*?<\/note>/g, '');
  clean = clean.replace(/<title\b[^>]*>([\s\S]*?)<\/title>\s*$/, (_, title) => {
    carried = title;
    return '';
  });
  return { text: clean.replace(/<[^>]+>/g, ''), carried };
}

/** Apply splitMarkup to a verse stream, carrying trailing titles forward. */
function* withoutMarkup(verses) {
  let pending = '';
  for (const verse of verses) {
    const { text, carried } = splitMarkup(verse.text);
    yield { ...verse, text: pending ? `${pending} ${text}` : text };
    pending = carried;
  }
}

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
    // Books outside the 66-book canon (the deuterocanon in some editions,
    // e.g. "Prayer of Manasses") are skipped and named, so a misspelt
    // canonical name can't slip through unnoticed.
    const book = findBook(source.name);
    if (!book) {
      console.warn(`  skipping "${source.name}" (not one of the 66 canonical books)`);
      continue;
    }
    for (const chapter of source.chapters) {
      for (const verse of chapter.verses) {
        yield { bookId: book.id, chapter: chapter.chapter, verse: verse.verse, text: verse.text };
      }
    }
  }
}

export function readScrollmapper(json) {
  if (Array.isArray(json?.resultset?.row)) return withoutMarkup(legacyVerses(json));
  if (Array.isArray(json?.books) && Array.isArray(json.books[0]?.chapters?.[0]?.verses)) return withoutMarkup(currentVerses(json));
  throw new Error('Unrecognised input: expected a scrollmapper/bible_databases JSON file.');
}
