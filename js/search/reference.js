/**
 * Bible references typed into the search box: "Jn 3:16", "Romans 8",
 * "Ps 23:1-4", "1 Cor 13:4–7", "Jude 3", and in Russian "Ин 3:16",
 * "Рим 8", "1 Кор 13", "1-е Иоанна 4:8".
 *
 *   parseReference("Ps 23:1-4") → { book: PSA, chapter: 23, verse: 1, verseEnd: 4 }
 *   parseReference("Romans")    → null (a book alone isn't a passage; see bookOnly)
 *   parseReference("love")      → null (search for it instead)
 *
 * Book names: the English names and abbreviations from js/canon.js, the
 * Russian names from js/locales/ru.js plus the usual Russian abbreviations
 * below, and any unambiguous start of a name ("Gen", "Филип").
 *
 * Psalm numbers: a Psalm written with a Russian book name ("Пс 22") is in
 * the Synodal (Greek) numbering, so it is converted to the English (Hebrew)
 * number this site uses: "Пс 22" opens Psalm 23, "Господь — Пастырь мой".
 * See synodalPsalm() for what that can't do.
 *
 * Pure module (no DOM), unit-tested in tests/reference.test.js.
 */
import { BOOKS, findBook } from '../canon.js';
import ru from '../locales/ru.js';

/** Lower-case; keep only letters and digits (any script): "1 Кор." → "1кор". */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

// Common Russian abbreviations (Synodal tradition, plus a few modern names).
// The full names in ru.js are accepted as well, with or without "От" for
// the Gospels.
export const RUSSIAN_ALIASES = Object.freeze({
  GEN: ['быт', 'бытия'],
  EXO: ['исх', 'исхода'],
  LEV: ['лев', 'левита'],
  NUM: ['чис', 'числ'],
  DEU: ['втор'],
  JOS: ['нав', 'иис', 'иисуснавина', 'навин'],
  JDG: ['суд', 'судей'],
  RUT: ['руф', 'руфи'],
  '1SA': ['1цар', '1самуила', '1сам'],
  '2SA': ['2цар', '2самуила', '2сам'],
  '1KI': ['3цар', '1царей'],
  '2KI': ['4цар', '2царей'],
  '1CH': ['1пар', '1лет', '1летопись'],
  '2CH': ['2пар', '2лет', '2летопись'],
  EZR: ['езд', 'ездры'],
  NEH: ['неем', 'неемии'],
  EST: ['есф', 'есфири'],
  JOB: ['иов', 'иова'],
  PSA: ['пс', 'псал', 'псалом', 'псалмы', 'псалтырь'],
  PRO: ['прит', 'притч', 'пр'],
  ECC: ['еккл', 'екк', 'екклезиаст'],
  SNG: ['песн', 'песнь', 'песня', 'песньпесней', 'песнпесн'],
  ISA: ['ис', 'исаии', 'исайя', 'исайи'],
  JER: ['иер', 'иеремии'],
  LAM: ['плач'],
  EZK: ['иез', 'иезекииля'],
  DAN: ['дан', 'даниила'],
  HOS: ['ос', 'осии'],
  JOL: ['иоил', 'иоиля'],
  AMO: ['ам', 'амоса'],
  OBA: ['авд', 'авдия'],
  JON: ['ион', 'ионы'],
  MIC: ['мих', 'михея'],
  NAM: ['наум', 'наума'],
  HAB: ['авв', 'аввакума'],
  ZEP: ['соф', 'софонии'],
  HAG: ['агг', 'аггея'],
  ZEC: ['зах', 'захарии'],
  MAL: ['мал', 'малахии'],
  MAT: ['мф', 'мт', 'матф', 'матфей'],
  MRK: ['мк', 'мар', 'марк'],
  LUK: ['лк', 'лук', 'лука'],
  JHN: ['ин', 'иоан', 'иоанн'],
  ACT: ['деян', 'деяния апостолов', 'деянияапостолов'],
  ROM: ['рим'],
  '1CO': ['1кор'],
  '2CO': ['2кор'],
  GAL: ['гал'],
  EPH: ['еф', 'ефес'],
  PHP: ['флп', 'фил', 'филип'],
  COL: ['кол'],
  '1TH': ['1фес', '1сол'],
  '2TH': ['2фес', '2сол'],
  '1TI': ['1тим'],
  '2TI': ['2тим'],
  TIT: ['тит'],
  PHM: ['флм', 'филим'],
  HEB: ['евр'],
  JAS: ['иак', 'иаков'],
  '1PE': ['1пет'],
  '2PE': ['2пет'],
  '1JN': ['1ин', '1иоан'],
  '2JN': ['2ин', '2иоан'],
  '3JN': ['3ин', '3иоан'],
  JUD: ['иуд', 'иуда'],
  REV: ['откр', 'отк', 'апок', 'апокалипсис'],
});

// Exact names and abbreviations → book; and every full name, for the
// "unambiguous start of a name" fallback.
const exact = new Map();
const fullNames = []; // [normalized name, book]
for (const book of BOOKS) {
  const russian = ru.books[book.id];
  const names = [book.name, book.slug, russian, russian.replace(/^От\s+/, '')];
  for (const name of names) fullNames.push([normalize(name), book]);
  for (const key of [...names, ...(RUSSIAN_ALIASES[book.id] ?? [])]) exact.set(normalize(key), book);
}

/**
 * The book a name refers to, or null. Shortest unambiguous starts work too
 * ("Rom", "Филип"); ambiguous ones ("Jud": Judges or Jude?) don't.
 */
export function lookupBook(text) {
  const key = normalize(text);
  if (!key) return null;
  const found = exact.get(key) ?? findBook(text);
  if (found) return found;
  if (key.replace(/^\d/, '').length < 2) return null;
  const candidates = new Set(fullNames.filter(([name]) => name.startsWith(key)).map(([, book]) => book));
  return candidates.size === 1 ? [...candidates][0] : null;
}

/** True if a name is written in Cyrillic (so Psalms use Synodal numbers). */
function isCyrillic(text) {
  return /\p{Script=Cyrillic}/u.test(text);
}

/**
 * A Synodal Psalm number → the English one, e.g. 22 → 23.
 *
 * The Synodal Psalter follows the Greek numbering: Psalms 9–10 are one
 * psalm there (9), as are 114–115 (113), while 116 and 147 are each split in
 * two. A verse number decides the split psalms (Пс 9:22 is Psalm 10:1).
 * Verse numbers are otherwise kept as typed. In psalms with a title, the
 * Synodal text counts the title as verse 1, so a verse there can be one or
 * two out (Пс 50:3 is Psalm 51:1, but opens at 51:3).
 */
export function synodalPsalm(chapter, verse = null) {
  const shift = (offset) => (verse === null ? null : verse + offset);
  if (chapter <= 8 || chapter >= 148) return { chapter, verse };
  if (chapter === 9) return verse !== null && verse >= 22 ? { chapter: 10, verse: shift(-21) } : { chapter: 9, verse };
  if (chapter <= 112) return { chapter: chapter + 1, verse };
  if (chapter === 113) return verse !== null && verse >= 9 ? { chapter: 115, verse: shift(-8) } : { chapter: 114, verse };
  if (chapter === 114) return { chapter: 116, verse };
  if (chapter === 115) return { chapter: 116, verse: verse === null ? 10 : shift(9) };
  if (chapter <= 145) return { chapter: chapter + 1, verse };
  if (chapter === 146) return { chapter: 147, verse };
  return { chapter: 147, verse: verse === null ? 12 : shift(11) }; // 147
}

// [ordinal] book  chapter  [:verse]  [-end]
// The book part may contain spaces and dots ("Song of Solomon", "Ин."), and
// may start with a number ("1 John") or a Roman numeral ("II Samuel").
const REFERENCE = /^\s*((?:[1-4]|i{1,3}\s)?\s*\p{L}[\p{L}.\s']*?)\.?\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3}))?(?:\s*[-–—]\s*(\d{1,3}))?\s*$/iu;
// Ordinals written out: "1-е Коринфянам", "2-я …", "1st John" → "1 …".
const ORDINAL = /^\s*([1-4])\s*(?:-\s*)?(?:[оО]?[еЕ]|[аА]?[яЯ]|st|nd|rd)(?=[\s.])/u;

/**
 * Parse a passage reference. Returns { book, chapter, verse, verseEnd }
 * (verse/verseEnd null when not given), or null if `input` isn't one.
 * The chapter isn't checked against the book (the reader explains a
 * missing chapter); a verse range that runs backwards is dropped.
 */
export function parseReference(input) {
  const text = String(input ?? '').replace(ORDINAL, '$1 ');
  const match = REFERENCE.exec(text);
  if (!match) return null;
  const [, bookPart, first, second, third] = match;
  const book = lookupBook(bookPart);
  if (!book) return null;

  let chapter = Number(first);
  let verse = second === undefined ? null : Number(second);
  let verseEnd = third === undefined ? null : Number(third);

  if (book.chapters === 1 && verse === null) {
    // "Jude 3", "Jude 3-5": the number is a verse of the only chapter.
    if (chapter > 1 || verseEnd !== null) verse = chapter;
    chapter = 1;
  } else if (verse === null) {
    verseEnd = null; // "Gen 1-3": a chapter range opens its first chapter
  }

  if (book.id === 'PSA' && isCyrillic(bookPart)) {
    const start = synodalPsalm(chapter, verse);
    const end = verseEnd === null ? null : synodalPsalm(chapter, verseEnd);
    chapter = start.chapter;
    verse = start.verse;
    verseEnd = end && end.chapter === start.chapter ? end.verse : null;
  }

  if (chapter < 1 || verse === 0) return null;
  if (verseEnd !== null && (verse === null || verseEnd <= verse)) verseEnd = null;
  return { book, chapter, verse, verseEnd };
}

/** A book named on its own ("Romans", "Римлянам"), for an "Open Romans" link. */
export function bookOnly(input) {
  const key = normalize(input);
  if (!key) return null;
  return fullNames.find(([name]) => name === key)?.[1] ?? null;
}
