/**
 * Line up several translations of one chapter for parallel view.
 *
 * Verses are matched by number: row 16 holds verse 16 from every column. All
 * six public-domain translations use the same English versification, so
 * numbers line up. Where a translation lacks a verse (the ASV leaves
 * Matthew 17:21 empty; WEB puts Romans 16:25–27 at the end of chapter 14), its
 * cell is null and the reader shows a dash.
 *
 * @param {(import('../providers/interface.js').Chapter|null)[]} chapters
 *   one per column; null = that column has no text (book missing or load failed)
 * @returns {{ number: number, cells: (string|null)[], words: (object[]|null)[] }[]}
 *   one row per verse number found in any column, in ascending order;
 *   `words` holds each cell's Strong's-tagged words (KJV+), or null
 */
export function alignVerses(chapters) {
  const numbers = new Set();
  const columns = chapters.map((chapter) => {
    const byNumber = new Map();
    for (const verse of chapter?.verses ?? []) {
      byNumber.set(verse.number, verse);
      numbers.add(verse.number);
    }
    return byNumber;
  });
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number) => ({
      number,
      cells: columns.map((byNumber) => byNumber.get(number)?.text ?? null),
      words: columns.map((byNumber) => byNumber.get(number)?.words ?? null),
    }));
}
