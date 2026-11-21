#!/usr/bin/env node
/**
 * Convert a scrollmapper/bible_databases JSON file into this site's
 * translation format (see data/README.md).
 *
 *   node tools/convert-scrollmapper.mjs <input.json> <output.json> \
 *     --id kjv --name "King James Version" [--abbr KJV] [--lang en] \
 *     [--license "Public domain"] [--source <url>]
 *
 * Both of scrollmapper's JSON layouts are understood:
 *   - "2024" (legacy) branch, json/t_kjv.json:
 *       {"resultset":{"row":[{"field":[1001001, 1, 1, 1, "In the beginning…"]}]}}
 *       (field = [verse id, book number 1–66, chapter, verse, text])
 *   - current branch, formats/json/KJV.json:
 *       {"translation":"…","books":[{"name":"Genesis","chapters":[{"chapter":1,
 *        "verses":[{"verse":1,"text":"…"}]}]}]}
 *
 * The output is validated before it's written. It puts one chapter per line,
 * so a git diff of a corrected verse stays readable.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { BOOKS, findBook } from '../js/canon.js';
import { FORMAT_VERSION, printReport, validateTranslation } from './validate-translation.mjs';

const USAGE = `Usage: node tools/convert-scrollmapper.mjs <input.json> <output.json> --id <id> --name <name>
       [--abbr <abbreviation>] [--lang <language>] [--dir ltr|rtl] [--license <text>] [--source <url>]`;

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

function readVerses(json) {
  if (Array.isArray(json?.resultset?.row)) return legacyVerses(json);
  if (Array.isArray(json?.books) && Array.isArray(json.books[0]?.chapters?.[0]?.verses)) return currentVerses(json);
  throw new Error('Unrecognised input: expected a scrollmapper/bible_databases JSON file.');
}

// Collapse whitespace. Some sources use a bare "[]" for a verse that doesn't
// exist (3 John 1:15 in the legacy KJV), so treat bracket-only text as empty.
function cleanText(text) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  return /^[[\]\s]*$/.test(clean) ? '' : clean;
}

function buildBooks(verses) {
  const byBook = new Map();
  for (const { bookId, chapter, verse, text } of verses) {
    if (!Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(verse) || verse < 1) {
      throw new Error(`Bad reference ${bookId} ${chapter}:${verse}.`);
    }
    if (!byBook.has(bookId)) byBook.set(bookId, []);
    const chapters = byBook.get(bookId);
    chapters[chapter - 1] ??= [];
    chapters[chapter - 1][verse - 1] = cleanText(text);
  }

  // Canon order; fill gaps with "" so verse N stays at index N-1; drop
  // trailing empty verses.
  return BOOKS.filter((book) => byBook.has(book.id)).map((book) => ({
    id: book.id,
    name: book.name,
    chapters: Array.from(byBook.get(book.id), (chapter) => {
      const list = Array.from(chapter ?? [], (text) => text ?? '');
      while (list.length > 0 && list[list.length - 1] === '') list.pop();
      return list;
    }),
  }));
}

/** JSON with metadata first and one chapter per line. */
function serialize({ books, ...meta }) {
  const head = JSON.stringify(meta).slice(0, -1); // reopen the object
  const bookLines = books.map(
    (book) =>
      `{"id":${JSON.stringify(book.id)},"name":${JSON.stringify(book.name)},"chapters":[\n` +
      book.chapters.map((chapter) => JSON.stringify(chapter)).join(',\n') +
      '\n]}',
  );
  return `${head},"books":[\n${bookLines.join(',\n')}\n]}\n`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      name: { type: 'string' },
      abbr: { type: 'string' },
      lang: { type: 'string', default: 'en' },
      dir: { type: 'string', default: 'ltr' },
      license: { type: 'string', default: 'Public domain' },
      source: { type: 'string', default: 'https://github.com/scrollmapper/bible_databases' },
    },
  });
  const [input, output] = positionals;
  if (!input || !output || !values.id || !values.name) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const id = values.id.toLowerCase();
  const translation = {
    formatVersion: FORMAT_VERSION,
    id,
    abbreviation: values.abbr ?? id.toUpperCase(),
    name: values.name,
    language: values.lang,
    direction: values.dir,
    license: values.license,
    source: values.source,
    books: buildBooks(readVerses(JSON.parse(await readFile(input, 'utf8')))),
  };

  const text = serialize(translation);
  const report = validateTranslation(JSON.parse(text)); // check what will actually be written
  if (!printReport(output, report)) {
    process.exitCode = 1;
    return;
  }
  await writeFile(output, text);
  console.log(`\nWrote ${output} (${(Buffer.byteLength(text) / 1e6).toFixed(1)} MB).`);
  console.log('To offer it on the site, add this entry to data/translations.json:\n');
  console.log(
    JSON.stringify(
      {
        id,
        abbreviation: translation.abbreviation,
        name: translation.name,
        language: translation.language,
        direction: translation.direction,
        license: translation.license,
        provider: 'json',
        url: `data/${id}.json`,
      },
      null,
      2,
    ),
  );
}

await main();
