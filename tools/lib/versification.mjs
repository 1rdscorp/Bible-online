/**
 * Convert verse numbers between versification schemes.
 *
 * Bibles don't all number verses alike. The Russian Synodal follows the Greek
 * (Septuagint) numbering of the Psalms, so the "Lord is my shepherd" psalm is
 * Psalm 22 there and Psalm 23 in English Bibles; titles count as verses; and a
 * few other chapters are divided differently. The site uses one reference
 * system everywhere (English, as in the KJV): URLs, parallel rows, and later
 * notes and cross-references. So a translation numbered differently is
 * converted to English numbering when its data file is built.
 *
 * The conversion uses the Copenhagen Alliance versification mappings
 * (https://github.com/Copenhagen-Alliance/versification-specification,
 * CC BY-SA 4.0). Each scheme's file maps its references to a common
 * "original" (Hebrew/Greek) numbering, so going from scheme A to English is
 * A → original → English. Verse 0 means an unnumbered Psalm title.
 */

const REF = /^(\w+) (\d+):(\d+)(?:-(\d+))?$/;

function parseRange(text) {
  const m = REF.exec(text);
  // Partial-verse references ("ESG 1:1a") only occur in the Apocrypha.
  return m ? { book: m[1], chapter: Number(m[2]), from: Number(m[3]), to: Number(m[4] ?? m[3]) } : null;
}

const key = (book, chapter, verse) => `${book} ${chapter}:${verse}`;

/**
 * Expand { "PSA 89:2-6": "PSA 90:1-6" } into single-verse pairs. Most ranges
 * have equal length. Where they don't, the shorter side's last verse pairs
 * with every remaining verse of the longer side: two source verses joined
 * into one target, or one source verse spread over two (its text then goes to
 * the first, see below).
 */
export function expandMappings(mappings) {
  const pairs = [];
  for (const [fromText, toText] of Object.entries(mappings)) {
    const from = parseRange(fromText);
    const to = parseRange(toText);
    if (!from || !to) continue;
    const fromSpan = from.to - from.from;
    const toSpan = to.to - to.from;
    for (let i = 0; i <= Math.max(fromSpan, toSpan); i += 1) {
      pairs.push([
        key(from.book, from.chapter, from.from + Math.min(i, fromSpan)),
        key(to.book, to.chapter, to.from + Math.min(i, toSpan)),
      ]);
    }
  }
  return pairs;
}

/** Map from pairs, keeping the first target for each source. */
function firstWins(pairs) {
  const map = new Map();
  for (const [from, to] of pairs) if (!map.has(from)) map.set(from, to);
  return map;
}

/**
 * @param {object} options
 * @param {{ mappedVerses: object }} options.from  mapping file of the source scheme (e.g. rso.json)
 * @param {{ mappedVerses: object }} options.to    mapping file of the target scheme (eng.json)
 * @param {object} [options.corrections]           extra "source → original" entries that replace the
 *                                                 source file's own (fixes for errors found in it)
 * @returns {(bookId: string, chapter: number, verse: number) => { bookId: string, chapter: number, verse: number }}
 */
export function createVersificationMapper({ from, to, corrections = {} }) {
  const toOriginal = firstWins(expandMappings({ ...from.mappedVerses, ...corrections }));
  // The target file maps target → original, so invert it.
  const inverted = expandMappings(to.mappedVerses).map(([target, original]) => [original, target]);

  // Some Psalm titles take two verses in the original numbering (Psalm 51:1–2
  // in Hebrew), but the English file lists only the last one ("PSA 51:0" →
  // "PSA 51:2"). Original verses before it are part of the same title, so
  // they map to verse 0 too, rather than falling through to verse 1.
  for (const [original, target] of [...inverted]) {
    const t = REF.exec(target);
    const o = REF.exec(original);
    if (!t || !o || t[3] !== '0') continue;
    for (let verse = 1; verse < Number(o[3]); verse += 1) inverted.push([key(o[1], o[2], verse), target]);
  }
  const originalToTarget = firstWins(inverted);

  return (bookId, chapter, verse) => {
    const source = key(bookId, chapter, verse);
    const original = toOriginal.get(source) ?? source;
    const target = originalToTarget.get(original) ?? original;
    const m = REF.exec(target);
    return { bookId: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
  };
}

/**
 * Re-number a stream of verses ({ bookId, chapter, verse, text }) with
 * `mapper`. Verses that land on the same target are joined in their original
 * order. A title that lands on verse 0 is placed at the start of verse 1, the
 * convention used across this project's data. A verse whose target leaves
 * gaps (one source verse covering two target verses) leaves the later ones
 * empty; the reader shows those as a dash.
 */
export function* remapVerses(verses, mapper) {
  const byTarget = new Map(); // "BOOK chapter" → Map(verse → texts[])
  const order = [];
  for (const { bookId, chapter, verse, text } of verses) {
    const target = mapper(bookId, chapter, verse);
    const chapterKey = `${target.bookId} ${target.chapter}`;
    if (!byTarget.has(chapterKey)) {
      byTarget.set(chapterKey, { bookId: target.bookId, chapter: target.chapter, verses: new Map() });
      order.push(chapterKey);
    }
    const targetVerses = byTarget.get(chapterKey).verses;
    if (!targetVerses.has(target.verse)) targetVerses.set(target.verse, []);
    targetVerses.get(target.verse).push(text);
  }

  for (const chapterKey of order) {
    const { bookId, chapter, verses: targetVerses } = byTarget.get(chapterKey);
    const title = targetVerses.get(0) ?? [];
    targetVerses.delete(0);
    if (title.length && !targetVerses.has(1)) targetVerses.set(1, []);
    for (const verse of [...targetVerses.keys()].sort((a, b) => a - b)) {
      const parts = verse === 1 ? [...title, ...targetVerses.get(verse)] : targetVerses.get(verse);
      yield { bookId, chapter, verse, text: parts.join(' ') };
    }
  }
}
