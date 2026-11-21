import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyHighlight,
  createItem,
  filterItems,
  highlightsByVerse,
  isValidRef,
  makeRef,
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
