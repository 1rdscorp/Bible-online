/**
 * A small subset of HTML in page content (data/study/explore/*.json):
 * paragraphs, lists, emphasis, citations, simple tables, verse links
 * written as <a data-ref="DAN 2:35">2:35</a>, and links to a chapter of the
 * commentary library written as
 * <a data-work="acts-of-the-apostles" data-part="57">AA 589</a>.
 *
 * The text is parsed into an inert document (nothing in it runs or loads)
 * and rebuilt element by element: tags not listed below are dropped (their
 * text kept), and only the listed attributes and values survive. A verse
 * link becomes a link into the reader; a commentary link, a link to that
 * chapter (#/commentary/<work>/<part>). No other address gets through.
 */
import { getBook } from '../../canon.js';
import { parseRef } from '../../research/refs.js';
import { chapterHref, commentaryHref } from '../../router.js';

const TAGS = new Set(['p', 'b', 'i', 'em', 'strong', 'cite', 'sup', 'sub', 'br', 'ul', 'ol', 'li', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span', 'a']);
const CLASSES = new Set(['cols', 'tscroll', 'sw-dot', 'dbar', 'num', 'cite-ref']);
const METALS = new Set(['gold', 'silver', 'bronze', 'iron', 'mix', 'clay', 'stone']);

/** The reader's address for a parsed reference (js/research/refs.js), or null. */
export function refHref(ref) {
  const book = ref && getBook(ref.book);
  if (!book) return null;
  return chapterHref(book, ref.chapter, ref.verse, '', ref.endChapter === ref.chapter ? ref.endVerse : null);
}

/** The reader's address for a reference such as "DAN 2:31-35", or null. */
export const verseHref = (text) => refHref(parseRef(text));

/** The address of a commentary chapter ("acts-of-the-apostles", "57"), or null if either is malformed. */
export const workHref = (work, part) => (/^[a-z0-9-]+$/.test(work ?? '') && /^\d+$/.test(part ?? '') ? commentaryHref(work, part) : null);

function rebuild(source, doc) {
  if (source.nodeType === 3) return doc.createTextNode(source.data);
  if (source.nodeType !== 1) return null;
  const tag = source.localName;
  const children = [...source.childNodes].map((child) => rebuild(child, doc)).filter(Boolean);
  if (!TAGS.has(tag)) {
    const fragment = doc.createDocumentFragment();
    fragment.append(...children);
    return fragment;
  }
  const classes = (source.getAttribute('class') ?? '').split(/\s+/).filter((name) => CLASSES.has(name));
  if (tag === 'a') {
    const href = source.hasAttribute('data-work') ? workHref(source.getAttribute('data-work'), source.getAttribute('data-part')) : verseHref(source.getAttribute('data-ref') ?? '');
    const node = href ? doc.createElement('a') : doc.createElement('span');
    if (href) node.href = href;
    if (classes.length) node.className = classes.join(' ');
    node.append(...children);
    return node;
  }
  const node = doc.createElement(tag);
  if (classes.length) node.className = classes.join(' ');
  const metal = source.getAttribute('data-metal');
  if (metal && METALS.has(metal)) node.dataset.metal = metal;
  // A density bar: its length in proportion to the number.
  const value = Number(source.getAttribute('data-value'));
  if (classes.includes('dbar') && Number.isFinite(value)) node.style.setProperty('--value', String(value));
  node.append(...children);
  return node;
}

/**
 * Rich text as DOM: a DocumentFragment, ready to append.
 * @param {string} html
 */
export function richHtml(html) {
  const doc = globalThis.document;
  const fragment = doc.createDocumentFragment();
  if (!html) return fragment;
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  for (const child of parsed.body.childNodes) {
    const node = rebuild(child, doc);
    if (node) fragment.append(node);
  }
  return fragment;
}

/** Plain text of rich text (for labels and titles). */
export function richPlain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}
