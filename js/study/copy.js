/**
 * Copy formats for selected verses (pure, unit-tested).
 *
 * Plain text with the reference:
 *
 *   For God so loved the world, …
 *   John 3:16
 *
 * With the translation's name:
 *
 *   For God so loved the world, …
 *   John 3:16 — King James Version
 *
 * Several verses are numbered ("16 For God… 17 For God sent…"). When
 * translations are compared, each one gets a line, labelled with its
 * abbreviation (or with its name, in the second format):
 *
 *   John 3:16
 *   KJV: For God so loved the world, …
 *   ASV: For God so loved the world, …
 */

/** Verse texts as one paragraph, numbered when there's more than one. */
function joinVerses(verses) {
  if (verses.length === 1) return verses[0].text;
  return verses.map((verse) => `${verse.number} ${verse.text}`).join(' ');
}

/**
 * @param {string} reference  "John 3:16–17", in the interface language
 * @param {{ name: string, abbreviation: string, verses: {number, text}[] }[]} columns  one per translation shown
 * @param {{ withName?: boolean }} [options]
 */
export function formatPassage(reference, columns, { withName = false } = {}) {
  const shown = columns.filter((column) => column.verses.length > 0);
  if (shown.length === 0) return reference;
  if (shown.length === 1) {
    const [column] = shown;
    return `${joinVerses(column.verses)}\n${reference}${withName ? ` — ${column.name}` : ''}`;
  }
  const lines = shown.map((column) => `${withName ? `${column.name} (${column.abbreviation})` : column.abbreviation}: ${joinVerses(column.verses)}`);
  return [reference, ...lines].join('\n');
}
