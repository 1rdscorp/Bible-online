/**
 * Shared code for building translation files (format: data/README.md).
 * Used by the converter CLIs and tools/build-data.mjs.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BOOKS } from '../../js/canon.js';
import { FORMAT_VERSION, printReport, validateTranslation } from '../validate-translation.mjs';

/**
 * Named, opt-in text clean-ups, chosen per source in tools/data-sources.json.
 * They change typography or fix mechanical conversion damage, never wording.
 */
export const TEXT_FIXES = {
  // Old ASCII conventions → typographic: `quote' or 'quote' → ‘quote’,
  // it's → it’s, word--word → word—word, "thyself ?" → "thyself?".
  // A straight quote at the start of a word opens (‘). Every other one is
  // an apostrophe or a closing quote (’).
  typography: [
    [/`/g, '‘'],
    [/(^|[\s(\[“—])'(?=[A-Za-z])/g, '$1‘'],
    [/'/g, '’'],
    [/\s*--\s*/g, '—'],
    [/ +([,.;:?!])/g, '$1'],
  ],
  // ASV source writes an unclosed "[Selah".
  selah: [[/\[Selah(?!\])/g, 'Selah']],
  // Darby source lost the space before "God"/"Godhead" ("ofGod").
  'darby-god': [[/([a-z])(God)/g, '$1 $2']],
  // Russian conventions: a spaced hyphen used as a dash → spaced em dash
  // ("Господь - Пастырь" → "Господь — Пастырь"); straight double quotes →
  // «guillemets». As above, a quote at the start of a word opens. Many quotes
  // run across verses, so quotes are judged by position, not by pairing.
  'russian-typography': [
    [/(^|\s)-(?=\s|$)/g, '$1—'],
    // One opening quote was typed as a second colon (Isaiah 44:26:
    // "Иерусалиму::ты будешь населен"); the other copy checked has ': "'.
    [/::(?=\p{L})/gu, ': «'],
    // A quote right before punctuation closes, even after a stray space
    // (Jeremiah 2:20: «"не буду служить идолам ", а…»).
    [/\s*"(?=[,.;:!?)\]])/g, '»'],
    // A quote with space on both sides opens, with a stray space after it
    // (Joshua 4:7 in the Synodal source: «скажете им: " в память…»).
    [/(^|\s)"\s+/g, '$1«'],
    [/(^|[\s(\[—:])"(?=\S)/g, '$1«'],
    [/"/g, '»'],
  ],
  // Some sources start a chapter (often a Psalm title) in lower case.
  // A rule can also be a function of (text, { bookId, chapter, verse }).
  'capitalize-chapter-start': [
    (text, { verse }) => (verse === 1 ? text.replace(/^([[(«]?)(\p{Ll})/u, (_, open, letter) => open + letter.toUpperCase()) : text),
  ],
};

export function checkFixNames(names) {
  const unknown = names.filter((name) => !TEXT_FIXES[name]);
  if (unknown.length) throw new Error(`Unknown fix(es): ${unknown.join(', ')}. Known: ${Object.keys(TEXT_FIXES).join(', ')}.`);
}

function applyFixes(text, names, counts, ref) {
  let result = text;
  for (const name of names) {
    for (const rule of TEXT_FIXES[name]) {
      if (typeof rule === 'function') {
        const fixed = rule(result, ref);
        if (fixed !== result) counts[name] = (counts[name] ?? 0) + 1;
        result = fixed;
        continue;
      }
      const [pattern, replacement] = rule;
      const matches = result.match(pattern);
      if (matches) {
        counts[name] = (counts[name] ?? 0) + matches.length;
        result = result.replace(pattern, replacement);
      }
    }
  }
  return result;
}

// Collapse whitespace. A bare "[]" (3 John 1:15 in the legacy KJV) marks a
// verse that doesn't exist, so bracket-only text counts as empty.
export function cleanText(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return /^[[\]\s]*$/.test(clean) ? '' : clean;
}

/**
 * Turn a stream of { bookId, chapter, verse, text } into the `books` array:
 * canon order, verse N at index N-1, gaps filled with "", trailing empty
 * verses dropped. Books outside the 66-book canon are ignored.
 *
 * @returns {{ books: object[], fixCounts: Record<string, number> }}
 */
export function buildBooks(verses, { fixes = [] } = {}) {
  checkFixNames(fixes);
  const canonIds = new Set(BOOKS.map((book) => book.id));
  const fixCounts = {};
  const byBook = new Map();

  for (const { bookId, chapter, verse, text } of verses) {
    if (!canonIds.has(bookId)) continue;
    if (!Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1) {
      throw new Error(`Bad reference ${bookId} ${chapter}:${verse}.`);
    }
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    const chapters = byBook.get(bookId);
    chapters[chapter - 1] ??= [];
    chapters[chapter - 1][verse - 1] = applyFixes(cleanText(text), fixes, fixCounts, { bookId, chapter, verse });
  }

  const books = BOOKS.filter((book) => byBook.has(book.id)).map((book) => ({
    id: book.id,
    name: book.name,
    chapters: Array.from(byBook.get(book.id), (chapter) => {
      const list = Array.from(chapter ?? [], (text) => text ?? '');
      while (list.length > 0 && list[list.length - 1] === '') list.pop();
      return list;
    }),
  }));
  return { books, fixCounts };
}

/**
 * Source correction: split a verse that a source merged with the next one.
 * `splits` maps a reference in the source's numbering to the phrase that
 * starts the next verse, e.g. { "PSA 114:8": "Буду ходить" } (the Synodal
 * source runs Psalm 114:8 and 9 together and leaves 9 empty).
 */
export function* splitVerses(verses, splits = {}) {
  let carry = null; // the text moved to the next verse
  for (const verse of verses) {
    if (carry && !(verse.bookId === carry.bookId && verse.chapter === carry.chapter && verse.verse === carry.verse)) {
      yield carry;
      carry = null;
    }
    let { text } = verse;
    if (carry) {
      text = `${carry.text} ${text ?? ''}`.trim();
      carry = null;
    }
    const phrase = splits[`${verse.bookId} ${verse.chapter}:${verse.verse}`];
    const at = phrase ? text.indexOf(phrase) : -1;
    if (phrase && at <= 0) throw new Error(`Split phrase not found in ${verse.bookId} ${verse.chapter}:${verse.verse}: "${phrase}"`);
    if (at > 0) {
      carry = { bookId: verse.bookId, chapter: verse.chapter, verse: verse.verse + 1, text: text.slice(at) };
      text = text.slice(0, at).trim();
    }
    yield { ...verse, text };
  }
  if (carry) yield carry;
}

/**
 * JSON with the metadata first and one chapter per line, so git diffs stay
 * readable. A book's optional `native` spans go on their own line.
 */
export function serialize({ books, ...meta }) {
  const head = JSON.stringify({ formatVersion: FORMAT_VERSION, ...meta }).slice(0, -1);
  const bookLines = books.map(
    (book) =>
      `{"id":${JSON.stringify(book.id)},"name":${JSON.stringify(book.name)},"chapters":[\n` +
      book.chapters.map((chapter) => JSON.stringify(chapter)).join(',\n') +
      '\n]' +
      (book.native ? `,\n"native":${JSON.stringify(book.native)}` : '') +
      '}',
  );
  return `${head},"books":[\n${bookLines.join(',\n')}\n]}\n`;
}

/**
 * Content version: the first 12 hex digits of the file's SHA-256. The site
 * keys its persistent cache on it, so editing a file automatically refreshes
 * every reader's cached copy. tests/data.test.js checks it's up to date.
 */
export function contentVersion(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/**
 * Validate and write a translation file.
 * @returns {Promise<{ ok: boolean, version: string, bytes: number }>}
 */
export async function writeTranslationFile(path, translation, { log = console.log } = {}) {
  const text = serialize(translation);
  const ok = printReport(path, validateTranslation(JSON.parse(text)), log);
  if (!ok) return { ok, version: null, bytes: 0 };
  await writeFile(path, text);
  return { ok, version: contentVersion(text), bytes: Buffer.byteLength(text) };
}
