/**
 * Canon: the 66 books of the Protestant canon, in order, with everything the
 * UI needs *before* any translation has downloaded (names, URL slugs, chapter
 * counts). This is what lets the book and chapter pickers render instantly.
 *
 * Book ids are USFM codes (GEN, EXO … REV). Most Bible data sets and APIs use
 * them (API.Bible, for example), so a future API provider can pass them
 * through unchanged. Translation files in /data use the same ids.
 *
 * Chapter counts follow the standard English (KJV) versification, which all
 * six planned public-domain translations share.
 *
 * This module has no DOM access, so Node tests and tools can import it too.
 */

export const TESTAMENTS = Object.freeze([
  Object.freeze({ id: 'OT', name: 'Old Testament' }),
  Object.freeze({ id: 'NT', name: 'New Testament' }),
]);

// [USFM id, display name, chapter count, extra aliases accepted in URLs]
// The id, name and URL slug are always accepted too, so aliases only list
// common abbreviations. tests/canon.test.js checks that no alias is ambiguous.
const BOOK_TABLE = [
  ['GEN', 'Genesis', 50, ['ge', 'gn']],
  ['EXO', 'Exodus', 40, ['exod', 'ex']],
  ['LEV', 'Leviticus', 27, ['le', 'lv']],
  ['NUM', 'Numbers', 36, ['nu', 'nm']],
  ['DEU', 'Deuteronomy', 34, ['deut', 'de', 'dt']],
  ['JOS', 'Joshua', 24, ['josh', 'jsh']],
  ['JDG', 'Judges', 21, ['judg', 'jg', 'jdgs']],
  ['RUT', 'Ruth', 4, ['ru', 'rth']],
  ['1SA', '1 Samuel', 31, ['1sam', '1sm']],
  ['2SA', '2 Samuel', 24, ['2sam', '2sm']],
  ['1KI', '1 Kings', 22, ['1kgs', '1kg']],
  ['2KI', '2 Kings', 25, ['2kgs', '2kg']],
  ['1CH', '1 Chronicles', 29, ['1chr', '1chron']],
  ['2CH', '2 Chronicles', 36, ['2chr', '2chron']],
  ['EZR', 'Ezra', 10, []],
  ['NEH', 'Nehemiah', 13, ['ne']],
  ['EST', 'Esther', 10, ['esth', 'es']],
  ['JOB', 'Job', 42, ['jb']],
  ['PSA', 'Psalms', 150, ['psalm', 'ps', 'pss', 'psm']],
  ['PRO', 'Proverbs', 31, ['prov', 'pr', 'prv']],
  ['ECC', 'Ecclesiastes', 12, ['eccl', 'eccles', 'ec', 'qoh']],
  ['SNG', 'Song of Solomon', 8, ['song', 'sos', 'songofsongs', 'canticles']],
  ['ISA', 'Isaiah', 66, ['is']],
  ['JER', 'Jeremiah', 52, ['je', 'jr']],
  ['LAM', 'Lamentations', 5, ['la']],
  ['EZK', 'Ezekiel', 48, ['ezek', 'eze']],
  ['DAN', 'Daniel', 12, ['da', 'dn']],
  ['HOS', 'Hosea', 14, ['ho']],
  ['JOL', 'Joel', 3, ['jl']],
  ['AMO', 'Amos', 9, ['am']],
  ['OBA', 'Obadiah', 1, ['obad', 'ob']],
  ['JON', 'Jonah', 4, ['jnh']],
  ['MIC', 'Micah', 7, ['mc']],
  ['NAM', 'Nahum', 3, ['nah', 'na']],
  ['HAB', 'Habakkuk', 3, ['hb']],
  ['ZEP', 'Zephaniah', 3, ['zeph', 'zp']],
  ['HAG', 'Haggai', 2, ['hg']],
  ['ZEC', 'Zechariah', 14, ['zech', 'zc']],
  ['MAL', 'Malachi', 4, ['ml']],
  ['MAT', 'Matthew', 28, ['matt', 'mt']],
  ['MRK', 'Mark', 16, ['mk', 'mr']],
  ['LUK', 'Luke', 24, ['lk']],
  ['JHN', 'John', 21, ['jn', 'joh']],
  ['ACT', 'Acts', 28, ['ac']],
  ['ROM', 'Romans', 16, ['ro', 'rm']],
  ['1CO', '1 Corinthians', 16, ['1cor']],
  ['2CO', '2 Corinthians', 13, ['2cor']],
  ['GAL', 'Galatians', 6, ['ga']],
  ['EPH', 'Ephesians', 6, ['ephes']],
  ['PHP', 'Philippians', 4, ['phil']],
  ['COL', 'Colossians', 4, []],
  ['1TH', '1 Thessalonians', 5, ['1thess', '1thes']],
  ['2TH', '2 Thessalonians', 3, ['2thess', '2thes']],
  ['1TI', '1 Timothy', 6, ['1tim', '1tm']],
  ['2TI', '2 Timothy', 4, ['2tim', '2tm']],
  ['TIT', 'Titus', 3, []],
  ['PHM', 'Philemon', 1, ['phlm', 'philem']],
  ['HEB', 'Hebrews', 13, []],
  ['JAS', 'James', 5, ['jm', 'jam']],
  ['1PE', '1 Peter', 5, ['1pet', '1pt']],
  ['2PE', '2 Peter', 3, ['2pet', '2pt']],
  ['1JN', '1 John', 5, ['1jo', '1joh']],
  ['2JN', '2 John', 1, ['2jo', '2joh']],
  ['3JN', '3 John', 1, ['3jo', '3joh']],
  ['JUD', 'Jude', 1, ['jd']],
  ['REV', 'Revelation', 22, ['re', 'rv', 'revelations', 'revelationofjohn', 'apocalypse']],
];

const OT_BOOK_COUNT = 39;

/** Lower-case, strip accents, spaces, hyphens and dots: "1 John" → "1john". */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export const BOOKS = Object.freeze(
  BOOK_TABLE.map(([id, name, chapters, aliases], index) =>
    Object.freeze({
      id,
      name,
      chapters,
      index,
      testament: index < OT_BOOK_COUNT ? 'OT' : 'NT',
      // URL segment: "Song of Solomon" → "song-of-solomon"
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      // Used in chapter headings: "Psalm 23", not "Psalms 23"
      chapterLabel: id === 'PSA' ? 'Psalm' : name,
      aliases: Object.freeze([...aliases]),
    }),
  ),
);

const booksById = new Map(BOOKS.map((book) => [book.id, book]));

const booksByKey = new Map();
for (const book of BOOKS) {
  for (const key of [book.id, book.name, book.slug, ...book.aliases]) {
    booksByKey.set(normalize(key), book);
  }
}

/** Look up a book by its USFM id ("JHN"). Returns null if unknown. */
export function getBook(id) {
  return booksById.get(String(id ?? '').toUpperCase()) ?? null;
}

/**
 * Find a book from loose user/URL input: "john", "JHN", "jn", "1-john",
 * "Song of Solomon", "II Samuel". Returns null if nothing matches.
 */
export function findBook(query) {
  const key = normalize(query);
  if (!key) return null;
  // Fallback for Roman numerals ("ii samuel" → "2samuel"). This runs only
  // after an exact match fails, so "isaiah" and "is" still mean Isaiah.
  const arabic = key.replace(/^(iii|ii|i)(?=[a-z])/, (numeral) => String(numeral.length));
  return booksByKey.get(key) ?? booksByKey.get(arabic) ?? null;
}

export function booksInTestament(testamentId) {
  return BOOKS.filter((book) => book.testament === testamentId);
}

/** "John 3", "Psalm 23" */
export function chapterTitle(book, chapter) {
  return `${book.chapterLabel} ${chapter}`;
}

export function isValidChapter(book, chapter) {
  return Boolean(book) && Number.isInteger(chapter) && chapter >= 1 && chapter <= book.chapters;
}

/**
 * The chapter one step before (delta -1) or after (delta +1) this one. It
 * crosses into the neighbouring book at the edges (John 21 → Acts 1,
 * Matthew 1 → Malachi 4). Returns null before Genesis 1 and after
 * Revelation 22.
 */
export function adjacentChapter(book, chapter, delta) {
  if (delta > 0) {
    if (chapter < book.chapters) return { book, chapter: chapter + 1 };
    const next = BOOKS[book.index + 1];
    return next ? { book: next, chapter: 1 } : null;
  }
  if (delta < 0) {
    if (chapter > 1) return { book, chapter: chapter - 1 };
    const previous = BOOKS[book.index - 1];
    return previous ? { book: previous, chapter: previous.chapters } : null;
  }
  return { book, chapter };
}
