import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyHighlight,
  createItem,
  filterItems,
  findSpan,
  highlightsByVerse,
  isValidRef,
  makeRef,
  markQuote,
  marksCoveredBy,
  marksOverlapping,
  normalizeTags,
  sanitizeItem,
  tagCounts,
  verseRuns,
} from '../js/study/model.js';

const T = '2026-11-21T10:00:00.000Z';
const hl = (start, end, color, id = `${color}-${start}-${end}`) => ({ id, type: 'highlight', ref: makeRef('JHN', 3, start, end), color, created: T, updated: T });
const apply = (items, start, end, color) => {
  const { remove, add } = applyHighlight(items, makeRef('JHN', 3, start, end), color, T);
  return [...items.filter((i) => !remove.includes(i.id)), ...add].map((i) => `${i.ref.start}-${i.ref.end}:${i.color}`).sort();
};

test('references: order, validity, runs', () => {
  assert.deepEqual(makeRef('JHN', 3, 18, 16), { book: 'JHN', chapter: 3, start: 16, end: 18 });
  assert.ok(isValidRef(makeRef('PSA', 119, 176)));
  assert.ok(!isValidRef(makeRef('JHN', 22, 1)), 'John has 21 chapters');
  assert.ok(!isValidRef({ book: 'jhn', chapter: 3, start: 1, end: 1 }), 'ids are upper-case');
  assert.ok(!isValidRef(makeRef('JHN', 3, 0)));
  assert.deepEqual(verseRuns([5, 1, 2, 3, 3]), [[1, 3], [5, 5]]);
});

test('highlighting: one colour per verse, ranges cut or split around a new one', () => {
  assert.deepEqual(apply([], 16, 18, 'yellow'), ['16-18:yellow']);
  assert.deepEqual(apply([hl(10, 20, 'yellow')], 14, 15, 'green'), ['10-13:yellow', '14-15:green', '16-20:yellow'], 'split in two');
  assert.deepEqual(apply([hl(10, 20, 'yellow')], 5, 12, 'green'), ['13-20:yellow', '5-12:green'], 'cut at the start');
  assert.deepEqual(apply([hl(10, 12, 'yellow')], 10, 12, 'blue'), ['10-12:blue'], 'recoloured');
  assert.deepEqual(apply([hl(10, 12, 'yellow')], 13, 14, 'yellow'), ['10-14:yellow'], 'adjacent same colour merges');
  assert.deepEqual(apply([hl(10, 12, 'yellow')], 13, 14, 'pink'), ['10-12:yellow', '13-14:pink'], 'adjacent other colour stays');
  assert.deepEqual(apply([hl(10, 20, 'yellow')], 15, 15, null), ['10-14:yellow', '16-20:yellow'], 'clearing one verse');
  assert.deepEqual(apply([hl(1, 3, 'yellow'), hl(5, 6, 'green')], 1, 10, null), [], 'clearing a range');
  // Other chapters are untouched.
  const other = { ...hl(1, 5, 'yellow', 'other'), ref: makeRef('JHN', 4, 1, 5) };
  assert.deepEqual(applyHighlight([other], makeRef('JHN', 3, 1, 5), null, T), { remove: [], add: [] });
  assert.deepEqual([...highlightsByVerse([hl(1, 2, 'blue'), other], 'JHN', 3)], [[1, 'blue'], [2, 'blue']]);
});

test('tags are tidied', () => {
  assert.deepEqual(normalizeTags('Prayer, hope ,prayer, #Faith,, '), ['prayer', 'hope', 'faith']);
  assert.deepEqual(normalizeTags(['  Two   words ']), ['two words']);
});

test('stored or imported items are checked', () => {
  const note = createItem('note', makeRef('ROM', 8, 28), { text: '**All** things', tags: 'Promise' }, T);
  assert.deepEqual(sanitizeItem(note), note);
  assert.deepEqual(sanitizeItem({ ...note, extra: '<script>' }), note, 'unknown fields dropped');
  assert.equal(sanitizeItem({ ...note, type: 'html' }), null);
  assert.equal(sanitizeItem({ ...note, id: '<img onerror=x>' }), null);
  assert.equal(sanitizeItem({ ...note, ref: makeRef('XYZ', 1, 1) }), null);
  assert.equal(sanitizeItem({ ...note, text: 'x'.repeat(20001) }), null);
  assert.equal(sanitizeItem({ ...note, created: 'yesterday' }), null);
  assert.equal(sanitizeItem(hl(1, 1, 'purple')), null, 'unknown colour');
  assert.equal(sanitizeItem({ ...hl(1, 2, 'blue'), ref: { book: 'JHN', chapter: 3, start: 2, end: 1 } }).ref.start, 1, 'reversed range fixed');
});

test('My Study filters and sorting', () => {
  const items = [
    { ...createItem('note', makeRef('ROM', 8, 28), { text: 'All things **work** together', tags: ['promise'] }, T), updated: '2026-11-21T12:00:00.000Z' },
    hl(16, 16, 'yellow'),
    createItem('bookmark', makeRef('GEN', 1, 1), {}, T),
    { ...createItem('note', makeRef('JHN', 3, 16), { text: 'Ёлка', tags: ['love', 'promise'] }, T) },
  ];
  const refs = (list) => list.map((i) => `${i.type}:${i.ref.book}`);
  assert.deepEqual(refs(filterItems(items)), ['bookmark:GEN', 'highlight:JHN', 'note:JHN', 'note:ROM'], 'Bible order');
  assert.deepEqual(refs(filterItems(items, { sort: 'recent' }))[0], 'note:ROM');
  assert.deepEqual(refs(filterItems(items, { type: 'note' })), ['note:JHN', 'note:ROM']);
  assert.deepEqual(refs(filterItems(items, { color: 'yellow' })), ['highlight:JHN']);
  assert.deepEqual(refs(filterItems(items, { book: 'ROM' })), ['note:ROM']);
  assert.deepEqual(refs(filterItems(items, { tag: 'love' })), ['note:JHN']);
  assert.deepEqual(refs(filterItems(items, { text: 'work TOGETHER' })), ['note:ROM']);
  assert.deepEqual(refs(filterItems(items, { text: 'елка' })), ['note:JHN'], 'ё = е');
  assert.deepEqual(tagCounts(items), [['love', 1], ['promise', 2]]);
});

const mark = (spans, color = 'yellow', translation = 'kjv') =>
  createItem('mark', makeRef('JHN', 3, Math.min(...spans.map((x) => x.verse)), Math.max(...spans.map((x) => x.verse))), { translation, color, spans }, T);

test('word highlights: checked on import, quoted, found again if the text moved', () => {
  const loved = mark([{ verse: 16, start: 8, end: 26, text: 'so loved the world' }]);
  assert.deepEqual(sanitizeItem(loved), loved);
  assert.equal(markQuote(mark([{ verse: 16, start: 0, end: 3, text: 'For' }, { verse: 17, start: 0, end: 3, text: 'For' }])), 'For For');
  assert.equal(sanitizeItem({ ...loved, translation: 'KJV <x>' }), null, 'translation id');
  assert.equal(sanitizeItem({ ...loved, spans: [] }), null);
  assert.equal(sanitizeItem({ ...loved, spans: [{ verse: 16, start: 8, end: 26, text: 'short' }] }), null, 'text must match the span');
  assert.equal(sanitizeItem({ ...loved, spans: [{ verse: 20, start: 0, end: 3, text: 'For' }] }), null, 'verse outside the ref');
  assert.equal(sanitizeItem({ ...loved, color: 'red' }), null);

  const text = 'For God so loved the world, that he gave';
  assert.deepEqual(findSpan(text, loved.spans[0]), { start: 8, end: 26 });
  assert.deepEqual(findSpan(`Indeed, ${text}`, loved.spans[0]), { start: 16, end: 34 }, 'moved: found again');
  assert.equal(findSpan('Something else entirely', loved.spans[0]), null);
});

test('word highlights: overlap and replacement are per translation', () => {
  const a = mark([{ verse: 16, start: 8, end: 16, text: 'so loved' }]);
  const b = mark([{ verse: 16, start: 21, end: 26, text: 'world' }], 'green');
  const other = mark([{ verse: 16, start: 8, end: 16, text: 'so loved' }], 'blue', 'asv');
  const selection = [{ verse: 16, start: 0, end: 20, text: 'For God so loved the' }];
  assert.deepEqual(marksOverlapping([a, b, other], 'kjv', makeRef('JHN', 3, 16), selection).map((m) => m.id), [a.id]);
  assert.deepEqual(marksCoveredBy([a, b, other], 'kjv', makeRef('JHN', 3, 16), selection).map((m) => m.id), [a.id]);
  assert.deepEqual(marksCoveredBy([b], 'kjv', makeRef('JHN', 3, 16), [{ verse: 16, start: 22, end: 30, text: 'orld, th' }]), [], 'partly covered: kept');
});

test('My Study counts word highlights as highlights, by colour and words', () => {
  const words = mark([{ verse: 16, start: 8, end: 26, text: 'so loved the world' }], 'pink');
  const items = [words, hl(1, 1, 'pink'), createItem('note', makeRef('JHN', 3, 2), { text: 'x' }, T)];
  assert.deepEqual(filterItems(items, { type: 'highlight' }).map((i) => i.type), ['highlight', 'mark']);
  assert.deepEqual(filterItems(items, { color: 'pink' }).map((i) => i.type), ['highlight', 'mark']);
  assert.deepEqual(filterItems(items, { text: 'loved' }).map((i) => i.type), ['mark']);
});
