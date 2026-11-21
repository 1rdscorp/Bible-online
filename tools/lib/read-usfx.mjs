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
 * Psalm titles (<d>) sit before verse 1. They're prefixed to verse 1, as the
 * other sources in this project already do ("A Psalm by David. Yahweh is my
 * shepherd…"). One-word headings such as Psalm 119's "ALEPH" are dropped.
 */

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

/** @param {string} xml */
export function* readUsfx(xml) {
  const token = /<(\/?)([A-Za-z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let bookId = null;
  let chapter = null;
  let verse = null;
  let text = '';
  let skipDepth = 0;
  let inTitle = false;
  let pendingTitle = '';

  // Yield the verse collected so far, if any.
  function* flush() {
    if (bookId && chapter && verse) yield { bookId, chapter, verse, text };
    verse = null;
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
      verse = Number.parseInt(attribute(attrs, 'id'), 10);
      const title = pendingTitle.replace(/\s+/g, ' ').trim();
      if (title && !/^[A-Z]+$/.test(title)) text = `${title} `;
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
