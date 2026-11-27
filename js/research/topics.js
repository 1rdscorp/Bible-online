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
 * typed ("hol spi" → "Holy Spirit, the Comforter" …), best first: a title
 * that starts with the query, then the rest in list order.
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
      best = Math.max(best, folded.startsWith(words.join(' ')) ? 2 : 1);
    }
    if (best > 0) scored.push({ topic, best });
  }
  return scored.sort((a, b) => b.best - a.best).map((entry) => entry.topic);
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
