/**
 * Topical index (Torrey's New Topical Textbook, data/topics/): lookups with
 * no DOM, so Node tests can import them (tests/topics.test.js).
 */

/**
 * Text for matching: lower case, no accents or punctuation, ё as е, so
 * "Вера", "вера" and "Faith" all match what people type.
 */
export function foldText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    // Accents off Latin letters only: NFD would also take the breve off й.
    .replace(/[\u00c0-\u024f]/g, (c) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Topics whose English or Russian title has words starting with each word
 * typed ("hol spi" → "Holy Spirit, the Comforter" …), best first: the
 * title that is the query, titles that start with it, then the rest, each
 * in list order.
 */
export function searchTopics(topics, query) {
  const words = foldText(query).split(' ').filter(Boolean);
  if (!words.length) return topics;
  const scored = [];
  for (const topic of topics) {
    let best = -1;
    for (const title of [topic.en, topic.ru]) {
      const folded = foldText(title);
      const titleWords = folded.split(' ');
      if (!words.every((word) => titleWords.some((w) => w.startsWith(word)))) continue;
      const query = words.join(' ');
      best = Math.max(best, folded === query ? 3 : folded.startsWith(query) ? 2 : 1);
    }
    if (best > 0) scored.push({ topic, best });
  }
  return scored.sort((a, b) => b.best - a.best).map((entry) => entry.topic);
}

/**
 * The words of a Bible search worth looking up as topics: quotes, "*" and
 * other search syntax removed. Empty for a reference or a long query.
 */
export function topicQuery(text) {
  const words = foldText(String(text ?? '').replace(/[*"«»„“”]/g, ' ')).split(' ').filter(Boolean);
  return words.length > 0 && words.length <= 4 && !/\d/.test(words.join('')) ? words.join(' ') : '';
}

/**
 * Statements whose text has words starting with each word typed, in the
 * interface language's text and in Torrey's English:
 * [{ topic, line }] (indexes into the topic list and the topic's lines),
 * in topic order, at most `limit`.
 * `entries`: data/topics/statements.json's [[topic, line, en, ru], …].
 */
export function searchStatements(entries, query, { limit = 50 } = {}) {
  const words = foldText(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const entry of entries) {
    // Folded once per entry and kept (the list is searched as you type).
    entry.folded ??= ` ${foldText(entry[2])} ${foldText(entry[3] ?? '')}`;
    if (words.every((word) => entry.folded.includes(` ${word}`))) {
      found.push({ topic: entry[0], line: entry[1] });
      if (found.length >= limit) break;
    }
  }
  return found;
}

/** The first letter a title is filed under ("Вера" → "В"). */
export const titleLetter = (title) => foldText(title).charAt(0).toUpperCase();

/**
 * The statements that cite a verse, from the reverse index
 * (data/topics/refs.json): [{ topic, line }] in topic order, each once.
 */
export function topicsForVerse(refs, bookId, chapter, verse) {
  const seen = new Set();
  const found = [];
  for (const [c, v, ec, ev, topic, line] of refs[bookId] ?? []) {
    if (c > chapter) break; // sorted by chapter, then verse
    const after = chapter > c || (chapter === c && verse >= v);
    const before = chapter < ec || (chapter === ec && verse <= ev);
    if (!after || !before) continue;
    const key = `${topic}.${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ topic, line });
  }
  return found.sort((a, b) => a.topic - b.topic || a.line - b.line);
}

/**
 * A topic's lines as statements with their sub-statements:
 * [{ index, l: 1, t, r, see, children: [{ index, l: 2, … }] }].
 */
export function nestLines(lines) {
  const out = [];
  lines.forEach((line, index) => {
    const entry = { ...line, index, children: [] };
    if (line.l === 2 && out.length) out.at(-1).children.push(entry);
    else out.push(entry);
  });
  return out;
}
