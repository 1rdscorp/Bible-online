import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVersificationMapper, expandMappings, remapVerses } from '../tools/lib/versification.mjs';

// Small stand-ins for the Copenhagen Alliance files, modelled on real entries.
const RSO = {
  mappedVerses: {
    'PSA 22:0-6': 'PSA 23:0-6', // Synodal Psalm 22 = original Psalm 23
    'PSA 50:0-21': 'PSA 51:0-21',
    'PSA 86:0-1': 'PSA 87:1', // two Russian verses → one
    'ISA 3:19': 'ISA 3:20', // a wrong entry (corrected below)
  },
};
const ENG = {
  mappedVerses: {
    'PSA 51:0': 'PSA 51:2', // English title = original 51:1–2, listed as 51:2 only
    'PSA 51:1-19': 'PSA 51:3-21',
    'PSA 3:0-8': 'PSA 3:1-9',
  },
};
const map = createVersificationMapper({ from: RSO, to: ENG, corrections: { 'ISA 3:19': 'ISA 3:19' } });
const ref = (r) => `${r.bookId} ${r.chapter}:${r.verse}`;

test('ranges expand verse by verse; uneven ranges pair the shorter side’s last verse with the rest', () => {
  assert.deepEqual(expandMappings({ 'PSA 22:1-3': 'PSA 23:1-3' }), [
    ['PSA 22:1', 'PSA 23:1'],
    ['PSA 22:2', 'PSA 23:2'],
    ['PSA 22:3', 'PSA 23:3'],
  ]);
  assert.deepEqual(expandMappings({ 'PSA 86:0-1': 'PSA 87:1' }), [
    ['PSA 86:0', 'PSA 87:1'],
    ['PSA 86:1', 'PSA 87:1'],
  ]);
  assert.deepEqual(expandMappings({ 'ESG 1:1': 'ESG 1:1a' }), [], 'partial-verse refs (Apocrypha) are ignored');
});

test('Russian Psalm 22 becomes English Psalm 23', () => {
  assert.equal(ref(map('PSA', 22, 1)), 'PSA 23:1');
  assert.equal(ref(map('PSA', 22, 6)), 'PSA 23:6');
});

test('a two-verse Hebrew title maps to the English title (verse 0)', () => {
  assert.equal(ref(map('PSA', 50, 1)), 'PSA 51:0');
  assert.equal(ref(map('PSA', 50, 2)), 'PSA 51:0');
  assert.equal(ref(map('PSA', 50, 3)), 'PSA 51:1');
});

test('unmapped verses keep their numbers; corrections replace bad entries', () => {
  assert.equal(ref(map('JHN', 3, 16)), 'JHN 3:16');
  assert.equal(ref(map('ISA', 3, 19)), 'ISA 3:19');
});

test('remapVerses joins verses that meet, and puts titles at the start of verse 1', () => {
  const verses = [
    { bookId: 'PSA', chapter: 50, verse: 1, text: 'Начальнику хора. Псалом Давида,' },
    { bookId: 'PSA', chapter: 50, verse: 2, text: 'когда приходил к нему пророк Нафан…' },
    { bookId: 'PSA', chapter: 50, verse: 3, text: 'Помилуй меня, Боже…' },
    { bookId: 'PSA', chapter: 50, verse: 4, text: 'Многократно омой меня…' },
  ];
  assert.deepEqual([...remapVerses(verses, map)], [
    { bookId: 'PSA', chapter: 51, verse: 1, text: 'Начальнику хора. Псалом Давида, когда приходил к нему пророк Нафан… Помилуй меня, Боже…' },
    { bookId: 'PSA', chapter: 51, verse: 2, text: 'Многократно омой меня…' },
  ]);
});
