import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPassage } from '../js/study/copy.js';

const kjv = { name: 'King James Version', abbreviation: 'KJV' };
const asv = { name: 'American Standard Version', abbreviation: 'ASV' };

test('one translation: text, then the reference (and the translation name)', () => {
  const columns = [{ ...kjv, verses: [{ number: 16, text: 'For God so loved the world.' }] }];
  assert.equal(formatPassage('John 3:16', columns), 'For God so loved the world.\nJohn 3:16');
  assert.equal(formatPassage('John 3:16', columns, { withName: true }), 'For God so loved the world.\nJohn 3:16 — King James Version');
  const two = [{ ...kjv, verses: [{ number: 16, text: 'A.' }, { number: 17, text: 'B.' }] }];
  assert.equal(formatPassage('John 3:16–17', two), '16 A. 17 B.\nJohn 3:16–17');
});

test('compared translations: a labelled line each', () => {
  const columns = [
    { ...kjv, verses: [{ number: 16, text: 'K.' }] },
    { ...asv, verses: [{ number: 16, text: 'A.' }] },
    { name: 'Empty', abbreviation: 'E', verses: [] },
  ];
  assert.equal(formatPassage('John 3:16', columns), 'John 3:16\nKJV: K.\nASV: A.');
  assert.equal(formatPassage('John 3:16', columns, { withName: true }), 'John 3:16\nKing James Version (KJV): K.\nAmerican Standard Version (ASV): A.');
});
