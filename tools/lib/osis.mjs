/**
 * OSIS book abbreviations (as used by OpenBible.info's data: "Gen.1.1",
 * "1Kgs.20.1") → the USFM ids this site uses ("GEN", "1KI").
 */
export const OSIS_TO_USFM = Object.freeze({
  Gen: 'GEN', Exod: 'EXO', Lev: 'LEV', Num: 'NUM', Deut: 'DEU', Josh: 'JOS', Judg: 'JDG', Ruth: 'RUT',
  '1Sam': '1SA', '2Sam': '2SA', '1Kgs': '1KI', '2Kgs': '2KI', '1Chr': '1CH', '2Chr': '2CH', Ezra: 'EZR',
  Neh: 'NEH', Esth: 'EST', Job: 'JOB', Ps: 'PSA', Prov: 'PRO', Eccl: 'ECC', Song: 'SNG', Isa: 'ISA',
  Jer: 'JER', Lam: 'LAM', Ezek: 'EZK', Dan: 'DAN', Hos: 'HOS', Joel: 'JOL', Amos: 'AMO', Obad: 'OBA',
  Jonah: 'JON', Mic: 'MIC', Nah: 'NAM', Hab: 'HAB', Zeph: 'ZEP', Hag: 'HAG', Zech: 'ZEC', Mal: 'MAL',
  Matt: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT', Rom: 'ROM', '1Cor': '1CO', '2Cor': '2CO',
  Gal: 'GAL', Eph: 'EPH', Phil: 'PHP', Col: 'COL', '1Thess': '1TH', '2Thess': '2TH', '1Tim': '1TI',
  '2Tim': '2TI', Titus: 'TIT', Phlm: 'PHM', Heb: 'HEB', Jas: 'JAS', '1Pet': '1PE', '2Pet': '2PE',
  '1John': '1JN', '2John': '2JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
});

/** "Gen.1.1" → { book: "GEN", chapter: 1, verse: 1 }, or null. */
export function parseOsisVerse(text) {
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(String(text ?? '').trim());
  const book = m && OSIS_TO_USFM[m[1]];
  return book ? { book, chapter: Number(m[2]), verse: Number(m[3]) } : null;
}

const BOOK_ORDER = Object.values(OSIS_TO_USFM);

const verseRef = ({ book, chapter, verse }) => `${book} ${chapter}:${verse}`;

/** "GEN 11:32" + { chapter: 12, verse: 1 } → "GEN 11:32-12:1" (same chapter: "-5"; not after the start: no range). */
function rangeRef(start, end) {
  const head = verseRef(start);
  if (end.chapter === start.chapter) return end.verse > start.verse ? `${head}-${end.verse}` : head;
  return end.chapter > start.chapter ? `${head}-${end.chapter}:${end.verse}` : head;
}

/**
 * An OSIS reference as site references: "Ps.8.3" → ["PSA 8:3"],
 * "Col.1.16-Col.1.17" → ["COL 1:16-17"], "Gen.11.32-Gen.12.1" →
 * ["GEN 11:32-12:1"]. Empty if unreadable.
 *
 * With `lastVerse(book, chapter)` (how many verses a chapter has; 0 if none):
 * a range's end is clipped to the last verse that exists, and a range into
 * the next book ("2Chr.36.22-Ezra.1.3") becomes one reference in each book
 * (["2CH 36:22-23", "EZR 1:1-3"]). Without it, such a range is unreadable.
 */
export function osisToRefs(text, lastVerse) {
  const [from, to, extra] = String(text ?? '').split('-');
  const start = parseOsisVerse(from);
  if (!start || extra !== undefined) return [];
  if (!to) return [verseRef(start)];
  const end = parseOsisVerse(to);
  if (!end) return [];
  // The last verse that exists at or before `point` in its chapter.
  const clip = (point) => (lastVerse ? { ...point, verse: Math.min(point.verse, lastVerse(point.book, point.chapter)) } : point);
  if (end.book === start.book) return [rangeRef(start, clip(end))];
  if (!lastVerse || BOOK_ORDER.indexOf(end.book) !== BOOK_ORDER.indexOf(start.book) + 1) return [];
  // Across a book boundary: to the end of the first book, then from the start of the next.
  let lastChapter = start.chapter;
  while (lastVerse(start.book, lastChapter + 1) > 0) lastChapter += 1;
  const tail = rangeRef(start, { chapter: lastChapter, verse: lastVerse(start.book, lastChapter) });
  const head = rangeRef({ book: end.book, chapter: 1, verse: 1 }, clip(end));
  return [tail, head];
}
