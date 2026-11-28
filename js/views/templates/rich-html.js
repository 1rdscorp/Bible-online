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
 * chapter (#/commentary/<work>/<part>), at its page when the book has the
 * site's printed pages. A citation label, <span class="cite-ref">GC 438</span>,
 * becomes a link to the page cited (js/research/egw.js): here for a book the
 * site has, otherwise in EGW Writings, the White Estate's online library.
 * No other address gets through.
 */
import { getBook } from '../../canon.js';
import { egwHref, egwTitle, findEgwCitations, isEnglishEgw } from '../../research/egw.js';
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

/**
 * A citation label ("GC 438", "Letter 65, 1898") as a link, or as several
 * if it cites more than one page; text that isn't a citation stays text.
 */
function citationLabel(text, doc) {
  const cites = findEgwCitations(text, { labels: true });
  if (!cites.length) {
    const span = doc.createElement('span');
    span.className = 'cite-ref';
    span.textContent = text;
    return span;
  }
  const fragment = doc.createDocumentFragment();
  let at = 0;
  for (const cite of cites) {
    if (cite.index > at) fragment.append(text.slice(at, cite.index));
    const link = doc.createElement('a');
    link.className = 'cite-ref';
    link.href = egwHref(cite);
    link.title = egwTitle(cite);
    if (!link.getAttribute('href').startsWith('#')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.textContent = text.slice(cite.index, cite.index + cite.length);
    fragment.append(link);
    at = cite.index + cite.length;
  }
  if (at < text.length) fragment.append(text.slice(at));
  return fragment;
}

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
  if (tag === 'span' && classes.includes('cite-ref')) return citationLabel(source.textContent, doc);
  if (tag === 'a') {
    let href = source.hasAttribute('data-work') ? workHref(source.getAttribute('data-work'), source.getAttribute('data-part')) : verseHref(source.getAttribute('data-ref') ?? '');
    // A citation of a book the site has ("AA 589"): straight to the page where
    // the site has the book's pages, or (site in Russian) the Russian edition
    // in EGW Writings; not to English EGW Writings, since the chapter is here.
    const cite = href && classes.includes('cite-ref') ? findEgwCitations(source.textContent, { labels: true })[0] : null;
    const better = cite ? egwHref(cite) : null;
    if (better && !isEnglishEgw(better)) href = better;
    const node = href ? doc.createElement('a') : doc.createElement('span');
    if (href) node.href = href;
    if (href && !href.startsWith('#')) {
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      node.title = egwTitle(cite);
    }
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
