import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeBackup, mergeItems, normalizeHighlights, readBackup } from '../js/study/backup.js';
import { createItem, makeRef } from '../js/study/model.js';
import { createStudyStore } from '../js/study/store.js';

const at = (h) => `2026-11-21T${String(h).padStart(2, '0')}:00:00.000Z`;
const note = createItem('note', makeRef('ROM', 8, 28), { text: 'Hope', tags: ['promise'] }, at(1));
const yellow = createItem('highlight', makeRef('JHN', 3, 16, 18), { color: 'yellow' }, at(1));

test('a backup round-trips and bad items are skipped and counted', () => {
  const file = makeBackup({ items: [note, yellow], settings: { theme: 'sepia' }, lastRead: { bookId: 'JHN', chapter: 3 } }, at(2));
  const back = readBackup(JSON.stringify(file));
  assert.equal(back.ok, true);
  assert.deepEqual(back.items, [note, yellow]);
  assert.equal(back.skipped, 0);
  assert.deepEqual(back.settings, { theme: 'sepia' });

  file.data.study.items.push({ type: 'note', id: 'bad' }, { ...note }, '<script>', { ...yellow, id: 'x'.repeat(10), color: 'red' });
  const partial = readBackup(JSON.stringify(file));
  assert.equal(partial.items.length, 2);
  assert.equal(partial.skipped, 4, 'invalid, duplicate id, not an object, bad colour');
});

test('files that are not backups are refused', () => {
  assert.deepEqual(readBackup('not json'), { ok: false, error: 'json' });
  assert.deepEqual(readBackup('{"items":[]}'), { ok: false, error: 'format' });
  assert.deepEqual(readBackup(JSON.stringify({ ...makeBackup({}), version: 99 })), { ok: false, error: 'version' });
});

test('merging keeps the newer copy of an item; replacing keeps only the import', () => {
  const edited = { ...note, text: 'Hope (edited)', updated: at(5) };
  const other = createItem('bookmark', makeRef('GEN', 1, 1), {}, at(3));
  const merged = mergeItems([note], [edited, other]);
  assert.deepEqual([merged.added, merged.updated], [1, 1]);
  assert.equal(merged.items.find((i) => i.id === note.id).text, 'Hope (edited)');
  assert.equal(mergeItems([edited], [note]).items.find((i) => i.id === note.id).text, 'Hope (edited)', 'an older copy loses');
  assert.deepEqual(mergeItems([note], [other], 'replace').items, [other]);
});

test('overlapping highlights from two sources: the newest colour wins per verse', () => {
  const green = createItem('highlight', makeRef('JHN', 3, 17), { color: 'green' }, at(4));
  const result = normalizeHighlights([yellow, green]).map((i) => `${i.ref.start}-${i.ref.end}:${i.color}`).sort();
  assert.deepEqual(result, ['16-16:yellow', '17-17:green', '18-18:yellow']);
});

test('the store saves through storage, reports failures, and supports undo', async () => {
  const saved = new Map();
  let full = false;
  const storage = {
    get: async (key, fallback) => saved.get(key) ?? fallback,
    set: async (key, value) => (full ? false : (saved.set(key, JSON.parse(JSON.stringify(value))), true)),
  };
  let hour = 10;
  const store = createStudyStore({ storage, now: () => at(hour++) });
  const changes = [];
  store.subscribe((items, change) => changes.push(change.type));

  await store.highlight(makeRef('JHN', 3, 16, 17), 'yellow');
  const { item } = await store.addNote(makeRef('JHN', 3, 16), { text: 'Love', tags: 'Gospel' });
  assert.deepEqual(item.tags, ['gospel']);
  assert.equal((await store.toggleBookmark(makeRef('JHN', 3, 16))).bookmarked, true);
  assert.equal((await store.toggleBookmark(makeRef('JHN', 3, 16))).bookmarked, false);
  await store.updateNote(item.id, { text: 'Love **always**' });
  assert.equal(store.get(item.id).text, 'Love **always**');
  assert.ok(store.get(item.id).updated > item.updated);
  assert.equal(saved.get('study').items.length, 2);

  // A fresh store reads what was saved.
  const again = createStudyStore({ storage });
  assert.equal((await again.load()).length, 2);

  const removed = await store.remove([item.id]);
  assert.equal(store.inChapter('JHN', 3).length, 1);
  await store.restore(removed);
  assert.equal(store.inChapter('JHN', 3).length, 2);

  full = true;
  assert.equal((await store.highlight(makeRef('JHN', 3, 1), 'blue')).saved, false, 'a failed save is reported');
  assert.deepEqual(changes.slice(0, 4), ['highlight', 'note', 'bookmark', 'bookmark']);
});

test('the store adds word highlights (replacing ones inside them) and removes them for Undo', async () => {
  const saved = new Map();
  const storage = { get: async (key, fallback) => saved.get(key) ?? fallback, set: async (key, value) => (saved.set(key, JSON.parse(JSON.stringify(value))), true) };
  const store = createStudyStore({ storage, now: () => at(9) });
  const ref = makeRef('JHN', 3, 16);
  await store.addMark('kjv', ref, [{ verse: 16, start: 8, end: 16, text: 'so loved' }], 'yellow');
  await store.addMark('asv', ref, [{ verse: 16, start: 8, end: 16, text: 'so loved' }], 'blue');
  await store.addMark('kjv', ref, [{ verse: 16, start: 4, end: 26, text: 'God so loved the world' }], 'green');
  const marks = () => store.all().filter((i) => i.type === 'mark').map((i) => `${i.translation}:${i.color}:${i.spans[0].text}`).sort();
  assert.deepEqual(marks(), ['asv:blue:so loved', 'kjv:green:God so loved the world'], 'the yellow one inside was replaced');
  const removed = await store.removeMarks('kjv', ref, [{ verse: 16, start: 10, end: 12, text: 'lo' }]);
  assert.equal(removed.length, 1);
  assert.deepEqual(marks(), ['asv:blue:so loved']);
  await store.restore(removed);
  assert.equal(marks().length, 2);
  assert.equal(saved.get('study').items.filter((i) => i.type === 'mark').length, 2);
});
