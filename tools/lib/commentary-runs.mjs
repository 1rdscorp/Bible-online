/**
 * Helpers that turn plain commentary text into the runs of the commentary
 * block format (see tools/lib/thml.mjs): Bible references become links.
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
