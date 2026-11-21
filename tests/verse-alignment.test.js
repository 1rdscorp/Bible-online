import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignVerses } from '../js/views/verse-alignment.js';

const chapter = (...numbers) => ({ bookId: 'MAT', chapter: 17, verses: numbers.map((n) => ({ number: n, text: `v${n}` })) });

test('verses line up by number', () => {
  assert.deepEqual(alignVerses([chapter(1, 2), chapter(1, 2)]), [
    { number: 1, cells: ['v1', 'v1'] },
    { number: 2, cells: ['v2', 'v2'] },
  ]);
});

test('a verse missing from one translation leaves a gap, not a shift', () => {
  // e.g. the ASV leaves Matthew 17:21 out
  assert.deepEqual(alignVerses([chapter(20, 21, 22), chapter(20, 22)]), [
    { number: 20, cells: ['v20', 'v20'] },
    { number: 21, cells: ['v21', null] },
    { number: 22, cells: ['v22', 'v22'] },
  ]);
});

test('rows cover every verse in any column, in order', () => {
  const rows = alignVerses([chapter(1, 2), chapter(1, 2, 3)]);
  assert.deepEqual(
    rows.map((r) => r.number),
    [1, 2, 3],
  );
  assert.deepEqual(rows[2].cells, [null, 'v3']);
});

test('a column with no chapter (missing book or failed load) is all gaps', () => {
  assert.deepEqual(alignVerses([chapter(1), null]), [{ number: 1, cells: ['v1', null] }]);
  assert.deepEqual(alignVerses([null, null]), []);
});
