/**
 * Read a USFX file (the XML format eBible.org publishes, e.g. eng-web.usfx.xml)
 * as a stream of verses. No XML library needed: USFX is regular enough for a
 * small tokenizer.
 *
 * What's kept: the text of each verse, from <v id="n"/> to <ve/>, including
 * text inside character styles such as <wj> (words of Jesus) and <add>.
 * What's dropped: footnotes <f>, cross-references <x>, book headers, and
 * anything outside a verse, except Psalm titles (see below).
 *
 * Each verse also carries its `label` as the source writes it: usually the
 * number ("16"), but the Septuagint has lettered verses ("22a", "22b"…).
 * Their number is the verse they belong to, so by default they join it;
 * build-data's "relabel" option can move them elsewhere.
 *
 * Psalm titles (<d>) sit before verse 1. They're prefixed to verse 1, as the
 * other sources in this project already do ("A Psalm by David. Yahweh is my
 * shepherd…"). One-word headings such as Psalm 119's "ALEPH" are dropped.
 *
 * With { wordTags: true }, words tagged with Strong's numbers
 * (<w s="H7225">beginning</w>) are kept as invisible markers in the text:
 * WORD_TAG.open + "H7225" + WORD_TAG.mark + "beginning" + WORD_TAG.close.
 * Markers survive whitespace clean-up and text fixes, and
 * translation-file.mjs's extractWordTags() turns them into offsets once the
 * text is final.
 */

// Private-use characters, which never occur in Bible text.
export const WORD_TAG = Object.freeze({ open: '\uE000', mark: '\uE001', close: '\uE002' });

/** "H0216" → "H216" (the dictionaries' keys); "G3056 G5207" → "G3056+G5207". */
export function normalizeStrongs(value) {
  return String(value ?? '')
    .split(/[\s,;]+/)
    .map((part) => /^([HG])0*(\d+)([a-z]?)$/i.exec(part))
    .filter(Boolean)
    .map(([, letter, number]) => `${letter.toUpperCase()}${number}`)
    .join('+');
}

// Elements whose whole content is skipped.
const SKIPPED = new Set(['f', 'fe', 'x', 'rem', 'vp', 'toc', 'h', 'id', 'ide', 'ms', 'mr', 'r', 's', 'cl', 'ca', 'cp', 'va']);
// Block elements: their boundaries separate words (poetry lines, paragraphs).
const BLOCKS = new Set(['p', 'q', 'd', 'b', 'qs', 'li', 'tr', 'tc', 'th']);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function attribute(attrs, name) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

/**
 * @param {string} xml
 * @param {{ wordTags?: boolean }} [options]
 */
export function* readUsfx(xml, { wordTags = false } = {}) {
  const token = /<(\/?)([A-Za-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let bookId = null;
  let chapter = null;
  let verse = null;
  let label = null;
  let text = '';
  let skipDepth = 0;
  let inTitle = false;
  let pendingTitle = '';
  // Open <w> elements: true for each one that wrote a marker.
  const openWords = [];

  // Yield the verse collected so far, if any.
  function* flush() {
    if (bookId && chapter && verse) yield { bookId, chapter, verse, label, text };
    verse = null;
    label = null;
    text = '';
  }

  for (const match of xml.matchAll(token)) {
    const [, closing, rawName, attrs, selfClosing, chars] = match;

    if (chars !== undefined) {
      if (skipDepth > 0) continue;
      const decoded = decodeEntities(chars);
      if (verse !== null) text += decoded;
      else if (inTitle) pendingTitle += decoded;
      continue;
    }

    const name = rawName.toLowerCase();
    if (SKIPPED.has(name)) {
      if (!selfClosing) skipDepth += closing ? -1 : 1;
      continue;
    }
    if (skipDepth > 0) continue;

    if (name === 'w' && wordTags && !selfClosing) {
      const strongs = closing ? null : normalizeStrongs(attribute(attrs, 's'));
      const marker = closing ? (openWords.pop() ? WORD_TAG.close : '') : strongs ? `${WORD_TAG.open}${strongs}${WORD_TAG.mark}` : '';
      if (!closing) openWords.push(Boolean(strongs));
      if (verse !== null) text += marker;
      else if (inTitle) pendingTitle += marker;
      continue;
    }

    if (name === 'book' && !closing) {
      yield* flush();
      bookId = attribute(attrs, 'id');
      chapter = null;
      pendingTitle = '';
    } else if (name === 'book' && closing) {
      yield* flush();
      bookId = null;
    } else if (name === 'c') {
      yield* flush();
      chapter = Number.parseInt(attribute(attrs, 'id'), 10);
      pendingTitle = '';
    } else if (name === 'v') {
      yield* flush();
      // "15-16" style ranges only occur in the Apocrypha, which is skipped.
      label = attribute(attrs, 'id');
      verse = Number.parseInt(label, 10);
      const title = pendingTitle.replace(/\s+/g, ' ').trim();
      if (title && !/^[A-Z]+$/.test(title.replace(/\uE000[^\uE001]*\uE001|\uE002/g, ''))) text = `${title} `;
      pendingTitle = '';
    } else if (name === 've') {
      yield* flush();
    } else if (name === 'd' && verse === null) {
      inTitle = !closing;
      if (inTitle) pendingTitle = '';
    } else if (BLOCKS.has(name)) {
      if (verse !== null) text += ' ';
    }
  }
  yield* flush();
}
