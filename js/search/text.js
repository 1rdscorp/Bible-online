/**
 * Search text handling, shared by the search worker (indexing, matching) and
 * the search page (highlighting), so both agree on what a "word" is.
 *
 * Words are runs of letters, digits and combining marks in any script, so
 * English and Russian work the same way. Apostrophes and hyphens split words:
 * "LORD's" is "lord" + "s", "burnt-offering" is "burnt" + "offering". A query
 * word containing them is searched as a phrase, so "burnt-offering" finds
 * both "burnt offering" and "burnt-offering".
 *
 * Matching ignores case, and treats ё as е (Russian texts are inconsistent
 * about the dots). In Greek words it also ignores accents, breathings and
 * the elision mark, and treats final ς as σ, so "λογος" finds λόγος and
 * "κατ" finds κατʼ. Other accents are kept on purpose: in Russian, й is a
 * different letter from и.
 *
 * No DOM, so it runs in Node tests and in a Web Worker.
 */

const WORD = /[\p{L}\p{N}\p{M}]+/gu;

// Shortest prefix accepted with "*": a one-letter prefix matches too much
// of the Bible to be useful.
export const MIN_PREFIX_LENGTH = 2;

const GREEK = /[\u0370-\u03ff\u1f00-\u1fff]/;

/** "LORD" → "lord", "Ёлка" → "елка", "Λόγος" → "λογοσ" */
export function normalizeWord(word) {
  const lower = word.normalize('NFC').toLowerCase().replace(/ё/g, 'е');
  if (!GREEK.test(lower)) return lower;
  // Greek: drop the diacritics (decomposed, they are combining marks) and the
  // elision mark ʼ, and write every sigma the same way.
  return lower.normalize('NFD').replace(/[\p{M}\u02bc\u1fbd\u1fbf]/gu, '').replace(/ς/g, 'σ').normalize('NFC');
}

/** The normalized words of `text`, in order (repeats kept). */
export function tokenize(text) {
  const terms = [];
  for (const match of String(text ?? '').matchAll(WORD)) terms.push(normalizeWord(match[0]));
  return terms;
}

/** Like tokenize(), with each word's position in `text`: [{ term, start, end }]. */
export function tokenSpans(text) {
  const spans = [];
  for (const match of String(text ?? '').matchAll(WORD)) {
    spans.push({ term: normalizeWord(match[0]), start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

// Quoted phrases, in straight, curly, German and Russian quotes. An opening
// quote that is never closed quotes the rest of the query.
const QUOTED = /"([^"]*)"?|“([^”]*)”?|„([^“”]*)[“”]?|«([^»]*)»?/g;

export const MATCH_MODES = Object.freeze(['all', 'any', 'phrase']);

/**
 * Parse what was typed into the search box.
 *
 *   mode "all"    every word/phrase must be in the verse (default)
 *   mode "any"    at least one of them
 *   mode "phrase" the whole query as one exact phrase, quotes or not
 *
 *   "in the beginning" → one phrase clause (in any mode)
 *   lov*               → words starting with "lov" (love, loved, lovely…)
 *
 * Returns { mode: 'all'|'any', clauses } where each clause is
 *   { type: 'word', term, prefix }  or  { type: 'phrase', terms }.
 * No clauses means there's nothing to search for.
 */
export function parseQuery(input, mode = 'all') {
  const text = String(input ?? '');
  if (mode === 'phrase') {
    const terms = tokenize(text);
    return { mode: 'all', clauses: terms.length ? [phraseOrWord(terms)] : [] };
  }

  const clauses = [];
  const seen = new Set();
  const add = (clause) => {
    const key = clause.type === 'word' ? `w:${clause.term}:${clause.prefix}` : `p:${clause.terms.join(' ')}`;
    if (!seen.has(key)) {
      seen.add(key);
      clauses.push(clause);
    }
  };

  const unquoted = text.replace(QUOTED, (...groups) => {
    const inner = groups.slice(1, 5).find((g) => g !== undefined) ?? '';
    const terms = tokenize(inner);
    if (terms.length) add(phraseOrWord(terms));
    return ' ';
  });

  for (const piece of unquoted.split(/\s+/)) {
    const terms = tokenize(piece);
    if (terms.length === 0) continue;
    if (terms.length > 1) {
      add({ type: 'phrase', terms });
      continue;
    }
    // A trailing * makes a prefix search ("lov*"), if the prefix is long enough.
    const prefix = /[\p{L}\p{N}\p{M}]\*+$/u.test(piece) && terms[0].length >= MIN_PREFIX_LENGTH;
    add({ type: 'word', term: terms[0], prefix });
  }

  return { mode: mode === 'any' ? 'any' : 'all', clauses };
}

// A one-word "phrase" is just a word.
function phraseOrWord(terms) {
  return terms.length === 1 ? { type: 'word', term: terms[0], prefix: false } : { type: 'phrase', terms };
}

/** Does a word clause match this (normalized) term? */
export function termMatches(clause, term) {
  return clause.prefix ? term.startsWith(clause.term) : term === clause.term;
}

/** Index of the first place `phrase` occurs in `terms` from `from` on, or -1. */
export function findPhrase(terms, phrase, from = 0) {
  outer: for (let i = from; i + phrase.length <= terms.length; i += 1) {
    for (let j = 0; j < phrase.length; j += 1) {
      if (terms[i + j] !== phrase[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Where to put the highlights in a matching verse: [[start, end], …] in
 * character offsets, sorted, not overlapping. A phrase is one range from its
 * first word to its last.
 */
export function highlightRanges(text, query) {
  const spans = tokenSpans(text);
  const terms = spans.map((span) => span.term);
  const ranges = [];
  for (const clause of query?.clauses ?? []) {
    if (clause.type === 'word') {
      for (const span of spans) if (termMatches(clause, span.term)) ranges.push([span.start, span.end]);
    } else {
      for (let at = findPhrase(terms, clause.terms); at !== -1; at = findPhrase(terms, clause.terms, at + 1)) {
        ranges.push([spans[at].start, spans[at + clause.terms.length - 1].end]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}
