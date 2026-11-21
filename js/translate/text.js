/**
 * Small text helpers for "translate selection" (pure, unit-tested).
 */

/** Selected text as one tidy line. */
export function cleanSelection(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Shorten long text with an ellipsis, at a word boundary where possible. */
export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** [16] → "16"; [16, 17, 18] → "16–18"; [1, 3, 4] → "1, 3–4". */
export function verseRangeLabel(verses) {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const runs = [];
  for (const verse of sorted) {
    const run = runs.at(-1);
    if (run && verse === run[1] + 1) run[1] = verse;
    else runs.push([verse, verse]);
  }
  return runs.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
}

/**
 * Ancient (polytonic) Greek → modern (monotonic) spelling, for machine
 * translators, which know Modern Greek: breathings and the iota subscript
 * go, grave and circumflex accents become the single modern accent, and
 * short words (articles, particles: "καί", "τόν", "φῶς") lose it, as in
 * modern spelling. The ano teleia (·) becomes a semicolon. Words stay the
 * same, so a translator can follow; it reads them much better this way
 * (tests in Yandex Translate: Genesis 1:1, Isaiah 7:14).
 */
export function toMonotonic(text) {
  const accented = String(text ?? '')
    .normalize('NFD')
    .replace(/[̓̔̄̆ͅ]/g, '') // breathings, iota subscript, macron, breve
    .replace(/[̀͂]/g, '́') // grave, circumflex → acute
    .normalize('NFC');
  return accented
    .replace(/[\p{L}\p{M}]+/gu, (word) => {
      const letters = word.normalize('NFD').replace(/\p{M}/gu, '');
      return letters.length <= 3 ? word.normalize('NFD').replace(/́/g, '').normalize('NFC') : word;
    })
    .replace(/[··]/g, ';')
    .replace(/ʼ/g, '’');
}
