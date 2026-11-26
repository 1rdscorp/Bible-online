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
 *
 * A formatted text (BTI) carries its layout the same way (data-format="0.p
 * 14.q1 20.7.sc", data-notes='[…]'): poetry lines and Psalm titles become
 * <span class="vline vline-q1">, styled words <em>, <strong> or
 * <span class="sc">, and each footnote a <button class="fn"> that holds no
 * text (its label is drawn by CSS), so offsets stay those of the plain text.
 */
import { t } from '../i18n.js';
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

/** "0.p 14.q1 20.7.sc" → { breaks: [[0, "p"], [14, "q1"]], styles: [[20, 27, "sc"]] }. */
export function parseMarks(marks = '') {
  const breaks = [];
  const styles = [];
  for (const mark of marks.split(' ')) {
    const parts = mark.split('.');
    if (parts.length === 2) breaks.push([Number(parts[0]), parts[1]]);
    else if (parts.length === 3) styles.push([Number(parts[0]), Number(parts[0]) + Number(parts[1]), parts[2]]);
  }
  return { breaks: breaks.sort((a, b) => a[0] - b[0]), styles };
}

const STYLE_TAGS = [
  ['b', () => el('strong', { class: 'fmt-b' })],
  ['i', () => el('em', { class: 'fmt-i' })],
  ['sc', () => el('span', { class: 'sc' })],
];

/**
 * A footnote mark: an inline element acting as a button, with no text of
 * its own (CSS draws the label). Not a <button>: a browser may break the
 * line before one, parting the mark from its word.
 */
export function noteButton(index, label) {
  const name = t('reader.noteMark', { label: label === '*' ? '' : label }).trim();
  return el('sup', { class: 'fn', role: 'button', tabindex: '0', 'aria-expanded': 'false', 'data-note': String(index), 'data-label': label === '*' ? '*' : label, 'aria-label': name, title: name });
}

/**
 * Formatted text (`format`: { marks, notes }) as nodes, with highlight
 * colours: lines, styled words and footnote marks, as described at the top.
 */
function formattedNodes(text, colors, format) {
  const { breaks, styles } = parseMarks(format.marks);
  const notes = (format.notes ?? []).map((note, index) => ({ ...note, index }));
  // Lines: [start, end, kind]. A break at 0 says how the verse begins (a new
  // paragraph or a poetry line); later breaks start new lines within it.
  const starts = breaks.filter(([at]) => at > 0);
  const firstKind = breaks.find(([at]) => at === 0)?.[1] ?? 'flow';
  const lines = [];
  let from = 0;
  let kind = firstKind;
  for (const [at, next] of starts) {
    lines.push([from, at, kind]);
    from = at;
    kind = next;
  }
  lines.push([from, text.length, kind]);

  // Each footnote mark follows the word before it, so it belongs to the line
  // that word is on: the last line starting before its position.
  const lineOf = (at) => {
    for (let i = lines.length - 1; i > 0; i -= 1) if (lines[i][0] < at) return i;
    return 0;
  };
  const lineNodes = lines.map(([start, end, lineKind], lineIndex) => {
    const own = notes.filter((note) => lineOf(note.at) === lineIndex);
    const cuts = new Set([start, end]);
    for (const [a, b] of styles) for (const p of [a, b]) if (p > start && p < end) cuts.add(p);
    for (let p = start + 1; p < end; p += 1) if (colors[p] !== colors[p - 1]) cuts.add(p);
    for (const note of own) if (note.at > start && note.at < end) cuts.add(note.at);
    const points = [...cuts].sort((a, b) => a - b);
    const marksAt = (p) => own.filter((note) => note.at === p).map((note) => noteButton(note.index, note.label));
    const nodes = [...marksAt(start)];
    for (let k = 0; k < points.length - 1; k += 1) {
      const [a, b] = [points[k], points[k + 1]];
      let part = colorRuns(text, colors, a, b);
      for (const [name, make] of STYLE_TAGS) {
        if (styles.some(([s, e, styleName]) => styleName === name && s <= a && e >= b)) {
          const wrapper = make();
          wrapper.append(...part);
          part = [wrapper];
        }
      }
      nodes.push(...part, ...marksAt(b));
    }
    // A mark past the line's end (after its last word, before the space).
    nodes.push(...own.filter((note) => note.at > end).map((note) => noteButton(note.index, note.label)));
    return { kind: lineKind, nodes };
  });
  // One line of plain prose needs no wrapper.
  if (lineNodes.length === 1 && (lineNodes[0].kind === 'flow' || lineNodes[0].kind === 'p')) return lineNodes[0].nodes;
  return lineNodes.map(({ kind: lineKind, nodes }) => el('span', { class: `vline vline-${lineKind}` }, nodes));
}

/** A `.vtext` element's formatting (BTI), or null. */
export function formatOf(node) {
  if (node.dataset.format === undefined) return null;
  let notes = [];
  try {
    notes = JSON.parse(node.dataset.notes ?? '[]');
  } catch {
    // unreadable: no footnotes
  }
  return { marks: node.dataset.format, notes };
}

/**
 * `text` as nodes: each range ({ start, end, color }, later ones on top)
 * wrapped in <mark class="word-mark" data-color>, and each Strong's-tagged
 * word ({ start, end, strongs }) in <span class="w" data-strongs>. A mark
 * that runs across several words is split at their edges. With `format`
 * (a formatted text), lines, styles and footnote marks too.
 */
export function verseNodes(text, ranges = [], words = [], format = null) {
  const colors = new Array(text.length).fill(null);
  for (const { start, end, color } of ranges) colors.fill(color, Math.max(0, start), Math.min(text.length, end));
  if (format) return formattedNodes(text, colors, format);
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
    node.replaceChildren(...verseNodes(text, ranges, wordsOf(node), formatOf(node)));
    if (ranges.length) node.dataset.marks = key;
    else delete node.dataset.marks;
  }
}
