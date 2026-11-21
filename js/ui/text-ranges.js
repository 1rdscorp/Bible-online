/**
 * Words on the page: which words a text selection covers (as character spans
 * in each verse's text), and painting word highlights onto verses.
 *
 * Verse text lives in `.vtext` elements (js/views/reader.js), inside a verse
 * ([data-verse]) and a translation ([data-translation]: the single view's
 * text, or one compare column's cell). Offsets count the characters of a
 * `.vtext`'s textContent, so they don't depend on the marks painted inside.
 */
import { findSpan } from '../study/model.js';
import { snapToWords } from '../study/words.js';
import { el } from './dom.js';

/** Does the range cover some of this node's text (not just touch its edge)? */
export function coversText(range, node) {
  if (!range.intersectsNode(node)) return false;
  const inner = document.createRange();
  inner.selectNodeContents(node);
  return range.compareBoundaryPoints(Range.END_TO_START, inner) < 0 && range.compareBoundaryPoints(Range.START_TO_END, inner) > 0;
}

/** The character offset of a boundary point (node, offset) inside `root`. */
function textOffset(root, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

const translationOf = (node) => node.closest('[data-translation]')?.dataset.translation ?? null;
const verseOf = (node) => Number(node.closest('[data-verse]')?.dataset.verse);

/**
 * The words a selection covers inside `textRoot`, snapped to whole words:
 * { translation, spans: [{ verse, start, end, text }] }, or null. Only one
 * translation's words are taken (the first one the selection touches), so
 * a drag across compare columns doesn't mix them.
 */
export function selectionSpans(range, textRoot) {
  const texts = [...textRoot.querySelectorAll('.vtext')].filter((node) => coversText(range, node));
  if (texts.length === 0) return null;
  const translation = translationOf(texts[0]);
  const spans = [];
  for (const node of texts) {
    if (translationOf(node) !== translation) continue;
    const text = node.textContent;
    const start = node.contains(range.startContainer) ? textOffset(node, range.startContainer, range.startOffset) : 0;
    const end = node.contains(range.endContainer) ? textOffset(node, range.endContainer, range.endOffset) : text.length;
    const snapped = snapToWords(text, start, end);
    if (snapped) spans.push({ verse: verseOf(node), start: snapped.start, end: snapped.end, text: text.slice(snapped.start, snapped.end) });
  }
  return translation && spans.length ? { translation, spans } : null;
}

/**
 * `text` as nodes, with each range ({ start, end, color }, later ones on
 * top) wrapped in <mark class="word-mark" data-color>.
 */
export function markedNodes(text, ranges) {
  const colors = new Array(text.length).fill(null);
  for (const { start, end, color } of ranges) colors.fill(color, Math.max(0, start), Math.min(text.length, end));
  const nodes = [];
  let at = 0;
  while (at < text.length) {
    const color = colors[at];
    let next = at + 1;
    while (next < text.length && colors[next] === color) next += 1;
    const part = text.slice(at, next);
    nodes.push(color ? el('mark', { class: 'word-mark', 'data-color': color }, part) : document.createTextNode(part));
    at = next;
  }
  return nodes;
}

/**
 * Paint word highlights (study items of type 'mark') onto the verses in
 * `textRoot`, each in its own translation only. Safe to run again: verses
 * whose marks changed are rebuilt from their plain text.
 */
export function paintWordMarks(textRoot, marks) {
  const sorted = [...marks].sort((a, b) => (a.updated < b.updated ? -1 : a.updated > b.updated ? 1 : 0));
  for (const node of textRoot.querySelectorAll('.vtext')) {
    const translation = translationOf(node);
    const verse = verseOf(node);
    const text = node.textContent;
    const ranges = [];
    for (const mark of sorted) {
      if (mark.translation !== translation) continue;
      for (const span of mark.spans) {
        if (span.verse !== verse) continue;
        const found = findSpan(text, span);
        if (found) ranges.push({ ...found, color: mark.color });
      }
    }
    const key = JSON.stringify(ranges);
    if (key === (node.dataset.marks ?? '[]')) continue; // unchanged
    node.replaceChildren(...markedNodes(text, ranges));
    if (ranges.length) node.dataset.marks = key;
    else delete node.dataset.marks;
  }
}
