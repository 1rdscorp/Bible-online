/**
 * Shared code for building translation files (format: data/README.md).
 * Used by the converter CLIs and tools/build-data.mjs.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { BOOKS } from '../../js/canon.js';
import { FORMAT_VERSION, printReport, validateTranslation } from '../validate-translation.mjs';
import { WORD_TAG } from './read-usfx.mjs';

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
  // Editorial square brackets the reader has no key to (Brenton's
  // Septuagint brackets a few words). The words stay; a bracket pair split
  // across verses by renumbering would otherwise dangle.
  'drop-brackets': [[/\s*\[\s*/g, ' '], [/\s*\]\s*/g, ' '], [/ {2,}/g, ' '], [/^ | $/g, ''], [/ ([,.;:·])/g, '$1']],
  // Paragraph marks (¶) printed in the text (eBible.org's KJV); the other
  // translations here don't show them.
  'drop-pilcrows': [[/¶\s*/g, '']],
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
/**
 * Take the word markers read-usfx.mjs leaves in a verse (Strong's numbers)
 * out of its text, and say where each tagged word is:
 * { text: "In the beginning…", tags: "7.9.H7225 17.3.H430 …" }, each tag
 * start.length.number (offsets in UTF-16 code units, as in JavaScript), the
 * number "H7225", or "G3056+G5207" for a word tagged with two. Whitespace and
 * punctuation at a tag's edges are left outside it.
 */
export function extractWordTags(marked) {
  let text = '';
  const tags = [];
  const open = [];
  for (let i = 0; i < marked.length; i += 1) {
    const char = marked[i];
    if (char === WORD_TAG.open) {
      const mark = marked.indexOf(WORD_TAG.mark, i);
      open.push({ strongs: marked.slice(i + 1, mark), start: text.length });
      i = mark;
    } else if (char === WORD_TAG.close) {
      const tag = open.pop();
      if (!tag) continue;
      let start = tag.start;
      let end = text.length;
      while (start < end && /[\s\p{P}]/u.test(text[start])) start += 1;
      while (end > start && /[\s\p{P}]/u.test(text[end - 1])) end -= 1;
      if (end > start) tags.push([start, end - start, tag.strongs]);
    } else if (char !== ' ' || (text !== '' && !text.endsWith(' '))) {
      // Markers can hide a double space from cleanText ("word \uE002 and").
      text += char;
    }
  }
  if (text.endsWith(' ')) text = text.slice(0, -1); // no tag ends in whitespace
  tags.sort((a, b) => a[0] - b[0]);
  return { text, tags: tags.map(([start, length, strongs]) => `${start}.${length}.${strongs}`).join(' ') };
}

export function cleanText(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return /^[[\]\s]*$/.test(clean) ? '' : clean;
}

/**
 * Turn a stream of { bookId, chapter, verse, text } into the `books` array:
 * canon order, verse N at index N-1, gaps filled with "", trailing empty
 * verses dropped. Books outside the 66-book canon are ignored, and so are
 * chapters past a book's last (the Septuagint's Psalm 151); `droppedChapters`
 * lists those.
 *
 * @returns {{ books: object[], fixCounts: Record<string, number>, droppedChapters: string[] }}
 */
export function buildBooks(verses, { fixes = [], wordTags = false } = {}) {
  checkFixNames(fixes);
  const canon = new Map(BOOKS.map((book) => [book.id, book]));
  const fixCounts = {};
  const byBook = new Map();
  const dropped = new Set();

  for (const { bookId, chapter, verse, text } of verses) {
    if (!canon.has(bookId)) continue;
    if (chapter > canon.get(bookId).chapters) {
      dropped.add(`${bookId} ${chapter}`);
      continue;
    }
    if (!Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1) {
      throw new Error(`Bad reference ${bookId} ${chapter}:${verse}.`);
    }
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    const chapters = byBook.get(bookId);
    chapters[chapter - 1] ??= [];
    chapters[chapter - 1][verse - 1] = applyFixes(cleanText(text), fixes, fixCounts, { bookId, chapter, verse });
  }

  const books = BOOKS.filter((book) => byBook.has(book.id)).map((book) => {
    const chapters = Array.from(byBook.get(book.id), (chapter) => {
      const list = Array.from(chapter ?? [], (text) => text ?? '');
      while (list.length > 0 && list[list.length - 1] === '') list.pop();
      return list;
    });
    if (!wordTags) return { id: book.id, name: book.name, chapters };
    // Strong's numbers: "tags" mirrors "chapters", one string per verse.
    const tags = chapters.map((list) => list.map(() => ''));
    chapters.forEach((list, c) =>
      list.forEach((marked, v) => {
        const extracted = extractWordTags(marked);
        list[v] = extracted.text;
        tags[c][v] = extracted.tags;
      }),
    );
    return { id: book.id, name: book.name, chapters, tags };
  });
  return { books, fixCounts, droppedChapters: [...dropped] };
}

/**
 * Source correction: give lettered verses ("22f", "22g"…) new numbers, in
 * the source's own numbering, before versification. Brenton's Septuagint,
 * for one, numbers Proverbs 30:1–14 as 24:22f–t:
 *
 *   { "PRO 24:22f-t": "PRO 30:1-14" }
 *
 * The lettered verses from the first letter to the last, in the order the
 * source gives them, take the target verses one by one.
 */
export function* relabelVerses(verses, rules = {}) {
  const parsed = Object.entries(rules).map(([from, to]) => {
    const source = /^(\w+) (\d+):(\d+)([a-z])-([a-z])$/.exec(from);
    const target = /^(\w+) (\d+):(\d+)-(\d+)$/.exec(to);
    if (!source || !target) throw new Error(`relabel: can't read "${from}": "${to}".`);
    return {
      bookId: source[1], chapter: Number(source[2]), verse: Number(source[3]), first: source[4], last: source[5],
      target: { bookId: target[1], chapter: Number(target[2]), from: Number(target[3]), to: Number(target[4]) },
      next: 0, active: false, done: false,
    };
  });
  for (const verse of verses) {
    const rule = parsed.find((r) => !r.done && r.bookId === verse.bookId && r.chapter === verse.chapter && r.verse === verse.verse);
    const letter = /^\d+([a-z])$/.exec(verse.label ?? '')?.[1];
    if (rule && letter) {
      if (letter === rule.first) rule.active = true;
      if (rule.active) {
        const number = rule.target.from + rule.next;
        if (number > rule.target.to) throw new Error(`relabel: more lettered verses than ${rule.target.bookId} ${rule.target.chapter}:${rule.target.from}-${rule.target.to} has room for.`);
        rule.next += 1;
        if (letter === rule.last) rule.done = true;
        yield { ...verse, bookId: rule.target.bookId, chapter: rule.target.chapter, verse: number, label: String(number) };
        continue;
      }
    }
    yield verse;
  }
  for (const rule of parsed) {
    const expected = rule.target.to - rule.target.from + 1;
    if (rule.next !== expected) throw new Error(`relabel: expected ${expected} verses ${rule.bookId} ${rule.chapter}:${rule.verse}${rule.first}-${rule.last}, found ${rule.next}.`);
  }
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
export const OPTIONAL_CHAPTER_FIELDS = ['tags', 'marks', 'notes', 'headings', 'ranges'];

export function serialize({ books, ...meta }) {
  const head = JSON.stringify({ formatVersion: FORMAT_VERSION, ...meta }).slice(0, -1);
  const bookLines = books.map(
    (book) =>
      `{"id":${JSON.stringify(book.id)},"name":${JSON.stringify(book.name)},"chapters":[\n` +
      book.chapters.map((chapter) => JSON.stringify(chapter)).join(',\n') +
      '\n]' +
      // Optional fields shaped like "chapters" (one chapter per line): Strong's
      // tags, and a formatted text's marks, notes, headings and verse ranges.
      OPTIONAL_CHAPTER_FIELDS.filter((field) => book[field])
        .map((field) => `,\n${JSON.stringify(field)}:[\n${book[field].map((chapter) => JSON.stringify(chapter)).join(',\n')}\n]`)
        .join('') +
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
