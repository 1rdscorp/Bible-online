/**
 * Words in a selection (pure, unit-tested in tests/study-words.test.js).
 *
 *   snapToWords("For God so loved", 9, 13) → { start: 8, end: 16 }  ("so loved")
 *   searchQueryFor("so loved the world,")  → "\"so loved the world\""
 *
 * A word is letters, digits and combining marks (any script), with
 * apostrophes inside it ("LORD’s", Greek "μετʼ").
 */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;
const INNER = /['’ʼ]/u; // part of a word only between letters

function isWordChar(text, i) {
  const char = text[i];
  if (char === undefined) return false;
  if (WORD_CHAR.test(char)) return true;
  return INNER.test(char) && WORD_CHAR.test(text[i - 1] ?? '') && WORD_CHAR.test(text[i + 1] ?? '');
}

/**
 * Grow a selection [start, end) to whole words, and drop spaces and
 * punctuation at its ends. Returns null if no word is selected.
 */
export function snapToWords(text, start, end) {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  // Drop leading/trailing non-word characters first, so a selection that
  // starts in the space before a word doesn't grow into the previous one.
  while (from < to && !isWordChar(text, from)) from += 1;
  while (to > from && !isWordChar(text, to - 1)) to -= 1;
  if (from >= to) return null;
  while (from > 0 && isWordChar(text, from - 1)) from -= 1;
  while (to < text.length && isWordChar(text, to)) to += 1;
  return { start: from, end: to };
}

const QUOTES = /["“”„«»‘’‚]/g;
const MAX_QUERY = 100;

/** A search for selected text: one word as it is, several as an exact phrase. */
export function searchQueryFor(text) {
  let clean = String(text ?? '')
    .replace(QUOTES, (q) => (q === '’' ? '’' : ' '))
    .replace(/\s+/g, ' ')
    .trim();
  const span = snapToWords(clean, 0, clean.length);
  if (!span) return '';
  clean = clean.slice(span.start, span.end);
  if (clean.length > MAX_QUERY) {
    const cut = clean.slice(0, MAX_QUERY);
    clean = cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).trim();
  }
  return /\s/.test(clean) ? `"${clean}"` : clean;
}
