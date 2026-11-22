/**
 * Helpers that turn plain commentary text into the runs of the commentary
 * block format (see tools/lib/thml.mjs): Bible references become links,
 * and OCR'd text gets its spacing and abbreviations tidied.
 */
import { formatRange, parseRefList } from './ref-list.mjs';

// "Eze. 14:19, 20", "2 Kings 20:14-18", "Rev. 1: 11", "Ps, 112: 8", "Matt. 9:1-8, 32-34".
const REFERENCE = /\b((?:[1-3]\s)?[A-Z][a-z]{1,13})[.,]?\s(\d{1,3})\s?:\s?(\d{1,3})((?:\s?[-–]\s?\d{1,3})?(?:,\s?\d{1,3}(?:\s?[-–]\s?\d{1,3})?)*)/g;

/**
 * Text with its Bible references as links: [text, { r: "EZK 14:19-20", x: "Eze. 14:19, 20" }, text…].
 * A list of verses that follow each other links to them as one range.
 */
export function linkRefs(text, lastVerse) {
  const runs = [];
  let last = 0;
  for (const m of String(text).matchAll(REFERENCE)) {
    const [whole, name, chapter, verse, rest] = m;
    const normal = `${name} ${chapter}:${verse}${rest.replace(/\s+/g, '')}`;
    const [piece] = parseRefList(normal, lastVerse);
    if (!piece?.refs.length) continue;
    runs.push(text.slice(last, m.index), { r: mergeRefs(piece.refs, lastVerse), x: whole });
    last = m.index + whole.length;
  }
  runs.push(text.slice(last));
  return runs.filter((run) => run !== '');
}

/** ["EZK 14:19", "EZK 14:20"] → "EZK 14:19-20"; otherwise the first reference. */
export function mergeRefs(refs, lastVerse) {
  const parsed = refs.map((ref) => /^(\S+) (\d+):(\d+)(?:-(\d+))?$/.exec(ref));
  if (parsed.length > 1 && parsed.every(Boolean)) {
    const [book, chapter] = [parsed[0][1], Number(parsed[0][2])];
    let end = Number(parsed[0][4] ?? parsed[0][3]);
    let joined = true;
    for (const m of parsed.slice(1)) {
      if (m[1] !== book || Number(m[2]) !== chapter || Number(m[3]) !== end + 1) {
        joined = false;
        break;
      }
      end = Number(m[4] ?? m[3]);
    }
    if (joined) return formatRange(book, [chapter, Number(parsed[0][3]), chapter, end], lastVerse);
  }
  return refs[0];
}

/**
 * Tidy OCR'd text: quotation marks and punctuation set the way the book had
 * them ("termed“ The Apocalypse,” " → "termed “The Apocalypse,” "), "Lord’ s"
 * → "Lord’s", and the era abbreviations OCR misreads ("B. 0. 606",
 * "a. p. 250", "8. c. 536") written "B. C. 606", "A. D. 250".
 */
export function tidyOcrText(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/(\S)“\s*/g, '$1 “')
    .replace(/^“\s+/, '“')
    .replace(/\s+([”’])(?=[\s,.;:!?—)]|$)/g, '$1')
    .replace(/(\p{L})’\s(s|t|ll|re|ve|d)\b/gu, '$1’$2')
    .replace(/\s+([,;:!?])(?=\s|$)/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/([\w)\]”’])\s+\.(?=\s|$)/g, '$1.')
    .replace(/\b[B8]\.\s?[0OoCcG]\.\s?(?=\d)/g, 'B. C. ')
    .replace(/\b[Aa]\.\s?(?:[DdPpb]|pv|pb)\.\s?(?=\d)/g, 'A. D. ')
    .replace(/“\s?‘(?=\p{L})/gu, '“')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * A side heading at a paragraph's start ("The First Message.— Another scene
 * …", "Church and State— This prophecy …") as { b: "The First Message." }
 * followed by the rest; null if there's none.
 */
export function sideHeading(text) {
  const word = "[A-Z0-9][\\p{L}’'0-9,-]*";
  const small = '(?:of|and|the|in|on|to|a|an|for|by|with|from)';
  const m = new RegExp(`^(${word}(?:\\s(?:${word}|${small})){0,7}[.?!]?)\\s?—\\s?(?=[A-Z“"(])`, 'u').exec(text);
  if (!m || m[1].length > 70) return null;
  // One word alone is a heading only if it ends with a full stop ("Note.—").
  if (!/\s/.test(m[1]) && !/[.?!]$/.test(m[1])) return null;
  return [{ b: m[1] }, ' ', text.slice(m[0].length)];
}

const SUFFIXES = /^(?:ing|ings|ed|tion|tions|sion|ment|ments|ly|ness|ity|ous|ive|ance|ence|able|ible|ful|ize|ized|ism|ist|ists|ical|ally)$/;
const SHORT_WORDS = new Set(['a', 'i', 'o', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'oh', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'ye', 'lo', 'am', 'ox']);

/**
 * Mend what the scans couldn't: a word broken over a line or page that
 * stayed broken ("dis- -comfort", "glar-ing", "dis disruption", "appear
 * ing"), "i. e." read as "2. e.", and short runs of noise from engravings
 * ("deny Ve H 77 Oy ob ack se Verse"). `isWord(lower-case word)` decides.
 */
export function mendOcr(text, isWord) {
  const lower = (word) => word.toLowerCase();
  let out = String(text).replace(/\b[2-47]\.\s?e\.,/g, 'i. e.,');
  // "X- Y", "X- -Y", "X-- Y": a line-end hyphen that wasn't mended.
  out = out.replace(/(\p{L}{2,})(?:-\s+-?|--\s*)(\p{Ll}+)/gu, (all, a, b) => {
    if (!isWord(lower(a)) && lower(b).startsWith(lower(a))) return b; // "dis-- disciples"
    if (isWord(lower(a + b)) || !isWord(lower(a)) || !isWord(lower(b))) return a + b;
    return `${a}-${b}`;
  });
  // "glar-ing": a suffix hyphenated onto a fragment.
  out = out.replace(/(\p{L}{2,})-(\p{Ll}+)\b/gu, (all, a, b) => (SUFFIXES.test(b) && !isWord(lower(a)) ? a + b : all));
  // "dis disruption": the first half of a broken word left in front of the mended word.
  out = out.replace(/\b(\p{Ll}{2,6}) (\1\p{Ll}{2,})\b/gu, (all, a, b) => (isWord(a) ? all : b));
  // "appear ing": a suffix left apart.
  out = out.replace(/\b(\p{L}{3,}) (ing|ed|tion|ment|ly)\b/gu, (all, a, b) => (isWord(lower(a + b)) && !isWord(b) ? a + b : all));
  // Runs of three or more noise tokens: short non-words, stray capitals, digits mixed with letters.
  const tokens = out.split(' ');
  const noise = (token) => {
    const core = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!core) return /[|\]\\{}<>=]/.test(token);
    if (/[|\]\\{}<>=]/.test(token)) return true;
    if (/\d/.test(core) && /\p{L}/u.test(core)) return true;
    if (/^\d+$/.test(core)) return false;
    return core.length <= 3 && !SHORT_WORDS.has(lower(core)) && !isWord(lower(core));
  };
  // (Numbers inside a run don't end it: "Ve H 77 Oy ob ack se".)
  const number = (token) => /^\d+[.,;:]?$/.test(token);
  const kept = [];
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    let count = 0;
    while (j < tokens.length && (noise(tokens[j]) || (count > 0 && number(tokens[j])))) {
      if (noise(tokens[j])) count += 1;
      j += 1;
    }
    while (j > i && number(tokens[j - 1])) j -= 1; // a number after the run is text
    if (count >= 3) i = j;
    else {
      kept.push(tokens[i]);
      i += 1;
    }
  }
  return kept.join(' ');
}
