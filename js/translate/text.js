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
