/**
 * Words on the page: which words a text selection covers (as character spans
 * in each verse's text), and painting word highlights onto verses.
 *
 * Verse text lives in `.vtext` elements (js/views/reader.js), inside a verse
 * ([data-verse]) and a translation ([data-translation]: the single view's
 * text, or one compare column's cell). Offsets count the characters of a
 * `.vtext`'s textContent, so they don't depend on the marks painted inside.
 *
 * In a translation with Strong's numbers (KJV+), a `.vtext` also carries its
 * tags (data-tags="7.9.H7225 …"), and each tagged word is a
 * <span class="w" data-strongs="H7225">. verseNodes() builds both layers.
 */
import { parseWordTags } from '../providers/json-provider.js';
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

/** Text from `from` to `to` as nodes, runs of one colour wrapped in <mark>. */
function colorRuns(text, colors, from, to) {
  const nodes = [];
  let at = from;
  while (at < to) {
    const color = colors[at];
    let next = at + 1;
    while (next < to && colors[next] === color) next += 1;
    const part = text.slice(at, next);
    nodes.push(color ? el('mark', { class: 'word-mark', 'data-color': color }, part) : document.createTextNode(part));
    at = next;
  }
  return nodes;
}

/**
 * `text` as nodes: each range ({ start, end, color }, later ones on top)
 * wrapped in <mark class="word-mark" data-color>, and each Strong's-tagged
 * word ({ start, end, strongs }) in <span class="w" data-strongs>. A mark
 * that runs across several words is split at their edges.
 */
export function verseNodes(text, ranges = [], words = []) {
  const colors = new Array(text.length).fill(null);
  for (const { start, end, color } of ranges) colors.fill(color, Math.max(0, start), Math.min(text.length, end));
  if (words.length === 0) return colorRuns(text, colors, 0, text.length);
  const wordAt = new Int32Array(text.length).fill(-1);
  words.forEach((word, i) => wordAt.fill(i, Math.max(0, word.start), Math.min(text.length, word.end)));
  const nodes = [];
  let at = 0;
  while (at < text.length) {
    const index = wordAt[at];
    let next = at + 1;
    while (next < text.length && wordAt[next] === index) next += 1;
    const inner = colorRuns(text, colors, at, next);
    nodes.push(...(index < 0 ? inner : [el('span', { class: 'w', 'data-strongs': words[index].strongs.join(' ') }, inner)]));
    at = next;
  }
  return nodes;
}

/** `text` with highlight ranges, for previews (no Strong's words). */
export const markedNodes = (text, ranges) => verseNodes(text, ranges);

/** A `.vtext` element's Strong's-tagged words (KJV+), or []. */
export const wordsOf = (node) => parseWordTags(node.dataset.tags, node.textContent.length);

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
    node.replaceChildren(...verseNodes(text, ranges, wordsOf(node)));
    if (ranges.length) node.dataset.marks = key;
    else delete node.dataset.marks;
  }
}
