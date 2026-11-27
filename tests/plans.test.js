/**
 * Reading plans: the schedule logic (js/plans/model.js), the store
 * (js/plans/store.js) and plan progress in backup files.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addDays,
  dayChapters,
  dayForChapter,
  daysBetween,
  isDayDone,
  localDate,
  mergeRecords,
  newRecord,
  nextChapter,
  nextDay,
  parsePassage,
  passageChapters,
  sanitizeRecord,
  setRead,
  summarize,
} from '../js/plans/model.js';
import { createPlanStore } from '../js/plans/store.js';
import { makeBackup, readBackup } from '../js/study/backup.js';

// A small plan: day 1 Genesis 1–2, day 2 Genesis 3 and Matthew 1, day 3 Genesis 4.
const plan = { id: 'test', days: [['GEN 1-2'], ['GEN 3', 'MAT 1'], ['GEN 4']] };
const T = '2026-11-27T10:00:00.000Z';
const start = newRecord('test', '2026-11-27', T);
const tick = (record, day, keys) => setRead(record, day, keys, true, T);

describe('passages and dates', () => {
  test('passages', () => {
    assert.deepEqual(parsePassage('GEN 1-3'), { book: 'GEN', from: 1, to: 3 });
    assert.deepEqual(parsePassage('MAT 5'), { book: 'MAT', from: 5, to: 5 });
    assert.equal(parsePassage('XYZ 1'), null);
    assert.equal(parsePassage('GEN 3-1'), null);
    assert.deepEqual(passageChapters('EXO 1-2'), ['EXO.1', 'EXO.2']);
    assert.deepEqual(dayChapters(plan, 1), ['GEN.3', 'MAT.1']);
  });

  test('local dates, across months and leap days', () => {
    assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(daysBetween('2026-11-27', '2026-12-01'), 4);
    assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2026-11-27', -1), '2026-11-26');
  });
});

describe('progress', () => {
  test('a day is done when all its chapters are ticked', () => {
    let record = tick(start, 0, ['GEN.1']);
    assert.equal(isDayDone(plan, record, 0), false);
    record = tick(record, 0, ['GEN.2']);
    assert.equal(isDayDone(plan, record, 0), true);
    assert.equal(nextDay(plan, record), 1);
    // Unticking takes it back, and an empty day leaves no trace.
    record = setRead(record, 0, ['GEN.1', 'GEN.2'], false, T);
    assert.deepEqual(record.read, {});
  });

  test('on schedule, behind and ahead', () => {
    assert.deepEqual(summarize(plan, start, '2026-11-27'), { total: 3, done: 0, percent: 0, next: 0, scheduled: 0, behind: 0, ahead: 0, finished: false });
    // Two days later with nothing read: two days behind.
    assert.equal(summarize(plan, start, '2026-11-29').behind, 2);
    // Days 1 and 2 read on the first day: one day ahead.
    const record = tick(tick(start, 0, ['GEN.1', 'GEN.2']), 1, ['GEN.3', 'MAT.1']);
    const s = summarize(plan, record, '2026-11-27');
    assert.equal(s.ahead, 1);
    assert.equal(s.percent, 66);
    // Long after the end, "today" stays on the last day.
    assert.equal(summarize(plan, start, '2027-05-01').scheduled, 2);
    // A start date in the future: nothing is due yet.
    assert.equal(summarize(plan, newRecord('test', '2026-12-10', T), '2026-11-27').behind, 0);
    const all = tick(tick(record, 2, ['GEN.4']), 0, []);
    assert.equal(summarize(plan, all, '2026-11-27').finished, true);
  });

  test('which day a chapter in the reader belongs to', () => {
    assert.equal(dayForChapter(plan, start, 'GEN.1', '2026-11-27'), 0);
    // A chapter further on than today and the next unread day: not due.
    assert.equal(dayForChapter(plan, start, 'GEN.4', '2026-11-27'), null);
    // ...but it is once the calendar gets there.
    assert.equal(dayForChapter(plan, start, 'GEN.4', '2026-11-29'), 2);
    // Read already: the bar still shows, ticked.
    assert.equal(dayForChapter(plan, tick(start, 0, ['GEN.1']), 'GEN.1', '2026-11-27'), 0);
    assert.equal(dayForChapter(plan, start, 'EXO.1', '2026-11-27'), null);
  });

  test('the next chapter to read', () => {
    assert.deepEqual(nextChapter(plan, start, 0, 'GEN.1'), { day: 0, key: 'GEN.2' });
    assert.deepEqual(nextChapter(plan, tick(start, 0, ['GEN.1']), 0, 'GEN.2'), { day: 1, key: 'GEN.3' });
    assert.deepEqual(nextChapter(plan, start, 1, 'MAT.1'), { day: 1, key: 'GEN.3' });
    const done = tick(tick(tick(start, 0, ['GEN.1', 'GEN.2']), 1, ['GEN.3', 'MAT.1']), 2, ['GEN.4']);
    assert.equal(nextChapter(plan, done, 2, 'GEN.4'), null);
  });
});

describe('records from storage and backups', () => {
  test('bad records and entries are dropped', () => {
    assert.equal(sanitizeRecord(null), null);
    assert.equal(sanitizeRecord({ plan: 'Bad Id!', started: '2026-11-27' }), null);
    assert.equal(sanitizeRecord({ plan: 'test', started: '27.11.2026' }), null);
    const clean = sanitizeRecord({ plan: 'test', started: '2026-11-27', read: { 0: ['GEN.1', 'GEN.1', '<b>'], x: ['GEN.2'], 9: ['GEN.3'] }, updated: T }, 3);
    assert.deepEqual(clean, { plan: 'test', started: '2026-11-27', read: { 0: ['GEN.1'] }, updated: T });
  });

  test('merging keeps the more recently changed record per plan', () => {
    const old = { ...start, updated: '2026-11-01T00:00:00.000Z' };
    const other = newRecord('nt-90', '2026-10-01', T);
    assert.deepEqual(mergeRecords([old], [start, other]).map((r) => r.updated), [T, T]);
    assert.deepEqual(mergeRecords([start], [old]), [start]);
    assert.deepEqual(mergeRecords([start], [other], 'replace'), [other]);
  });

  test('backups carry plan progress; older backups have none', () => {
    const record = tick(start, 0, ['GEN.1']);
    const file = makeBackup({ plans: [record] }, T);
    const back = readBackup(JSON.stringify(file));
    assert.deepEqual(back.plans, [record]);
    const older = makeBackup({}, T);
    delete older.data.plans;
    assert.deepEqual(readBackup(JSON.stringify(older)).plans, []);
  });
});

test('the store saves progress, undoes a stop and follows other tabs', async () => {
  const saved = new Map();
  let external = null;
  const storage = {
    get: async (key, fallback) => saved.get(key) ?? fallback,
    set: async (key, value) => (saved.set(key, JSON.parse(JSON.stringify(value))), true),
    onExternalChange: (key, listener) => (external ??= listener),
  };
  let minute = 10;
  const store = createPlanStore({ storage, now: () => `2026-11-27T08:${minute++}:00.000Z` });
  const changes = [];
  store.subscribe((records, change) => changes.push(change.type));

  await store.start('test', '2026-11-27');
  await store.setRead('test', 0, ['GEN.1', 'GEN.2'], true);
  assert.deepEqual(store.get('test').read, { 0: ['GEN.1', 'GEN.2'] });
  assert.equal(saved.get('plans').records.length, 1);
  assert.equal(await store.setRead('missing', 0, ['GEN.1'], true), false);

  const again = createPlanStore({ storage });
  await again.load();
  assert.deepEqual(again.get('test').read, { 0: ['GEN.1', 'GEN.2'] });

  const removed = await store.stop('test');
  assert.equal(store.get('test'), null);
  await store.restore(removed);
  assert.deepEqual(store.get('test').read, { 0: ['GEN.1', 'GEN.2'] });

  // Starting over clears the progress.
  await store.start('test', '2026-12-01');
  assert.deepEqual(store.get('test').read, {});

  external({ version: 1, records: [newRecord('nt-90', '2026-11-20', T)] });
  assert.deepEqual(store.all().map((r) => r.plan), ['nt-90']);
  assert.deepEqual(changes, ['start', 'read', 'stop', 'restore', 'start', undefined]);

  await store.importRecords([newRecord('gospels-30', '2026-11-25', T)]);
  assert.deepEqual(store.all().map((r) => r.plan).sort(), ['gospels-30', 'nt-90']);
});
