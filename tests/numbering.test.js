import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativePsalmLabel } from '../js/views/numbering.js';

const SYNODAL = { name: 'Synodal numbering', psalm: 'Псалом', psalms: 'Псалмы' };

test('a whole Psalm with a different number', () => {
  assert.equal(nativePsalmLabel([{ chapter: 22 }], SYNODAL), 'Псалом 22');
});

test('part of a Psalm shows the verse range', () => {
  assert.equal(nativePsalmLabel([{ chapter: 9, from: 22, to: 39 }], SYNODAL), 'Псалом 9:22–39');
  assert.equal(nativePsalmLabel([{ chapter: 9, from: 1, to: 1 }], SYNODAL), 'Псалом 9:1');
});

test('several Psalms', () => {
  assert.equal(nativePsalmLabel([{ chapter: 114 }, { chapter: 115 }], SYNODAL), 'Псалмы 114–115');
  assert.equal(nativePsalmLabel([{ chapter: 146 }, { chapter: 147, from: 1, to: 9 }], SYNODAL), 'Псалмы 146; 147:1–9');
});

test('nothing to show', () => {
  assert.equal(nativePsalmLabel(undefined, SYNODAL), null);
  assert.equal(nativePsalmLabel([], SYNODAL), null);
});

test('falls back to English words when a translation gives none', () => {
  assert.equal(nativePsalmLabel([{ chapter: 22 }]), 'Psalm 22');
});
