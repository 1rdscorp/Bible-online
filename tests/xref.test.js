import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookFile, parseCrossReferences } from '../tools/build-xref.mjs';
import { OSIS_TO_USFM, osisToRefs, parseOsisVerse } from '../tools/lib/osis.mjs';
import { BOOKS } from '../js/canon.js';
import { formatRef, parseRef, refChapters } from '../js/research/refs.js';

// A few chapter lengths (KJV), enough for the examples below.
const LENGTHS = { 'GEN 11': 32, 'GEN 12': 20, 'COL 1': 29, '2CH 36': 23, 'EZR 1': 11, '2JN 1': 13, '3JN 1': 14, 'PSA 8': 9 };
const lastVerse = (book, chapter) => LENGTHS[`${book} ${chapter}`] ?? 0;

test('every OSIS book maps to a different book of the canon', () => {
  const ids = Object.values(OSIS_TO_USFM);
  assert.equal(ids.length, 66);
  assert.deepEqual([...ids].sort(), BOOKS.map((b) => b.id).sort());
});

test('parseOsisVerse reads OpenBible.info verse ids', () => {
  assert.deepEqual(parseOsisVerse('Gen.1.1'), { book: 'GEN', chapter: 1, verse: 1 });
  assert.deepEqual(parseOsisVerse('1John.4.9'), { book: '1JN', chapter: 4, verse: 9 });
  assert.deepEqual(parseOsisVerse('Song.2.1'), { book: 'SNG', chapter: 2, verse: 1 });
  assert.equal(parseOsisVerse('Tob.1.1'), null); // not in the 66-book canon
  assert.equal(parseOsisVerse('Gen.1'), null);
});

test('osisToRefs converts single verses and ranges', () => {
  assert.deepEqual(osisToRefs('Ps.8.3'), ['PSA 8:3']);
  assert.deepEqual(osisToRefs('Col.1.16-Col.1.17'), ['COL 1:16-17']);
  assert.deepEqual(osisToRefs('Gen.11.32-Gen.12.1'), ['GEN 11:32-12:1']);
  assert.deepEqual(osisToRefs('Gen.1.3-Gen.1.3'), ['GEN 1:3']);
  assert.deepEqual(osisToRefs('nonsense'), []);
});

test('osisToRefs clips ranges to verses that exist and splits ranges across books', () => {
  assert.deepEqual(osisToRefs('3John.1.1-3John.1.15', lastVerse), ['3JN 1:1-14']);
  assert.deepEqual(osisToRefs('2Chr.36.22-Ezra.1.3', lastVerse), ['2CH 36:22-23', 'EZR 1:1-3']);
  assert.deepEqual(osisToRefs('2John.1.1-3John.1.15', lastVerse), ['2JN 1:1-13', '3JN 1:1-14']);
  assert.deepEqual(osisToRefs('2Chr.36.22-Ezra.1.3'), [], 'needs chapter lengths');
  assert.deepEqual(osisToRefs('Gen.50.1-Lev.1.1', lastVerse), [], 'only into the next book');
});

test('parseCrossReferences keeps voted references, best first, and drops the rest', () => {
  const text = [
    'From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY',
    'Gen.11.32\tCol.1.16-Col.1.17\t5',
    'Gen.11.32\tPs.8.3\t12',
    'Gen.11.32\tPs.8.3\t7', // duplicate: keeps the higher count
    'Gen.11.32\tGen.12.1\t0', // no votes
    'Gen.11.32\tGen.11.32\t9', // itself
    'Gen.11.40\tPs.8.3\t3', // Genesis 11 has 32 verses
    'Gen.12.1\t2Chr.36.22-Ezra.1.3\t4',
    'Gen.12.1\tTob.1.1\t4',
    '',
  ].join('\n');
  const { byVerse, stats } = parseCrossReferences(text, { minVotes: 1, lastVerse });
  assert.deepEqual(stats, { rows: 8, kept: 4, lowVotes: 1, unreadable: 1, missingVerse: 1, selfReference: 1, duplicate: 1 });
  assert.deepEqual([...byVerse.get('GEN 11:32')], [['COL 1:16-17', 5], ['PSA 8:3', 12]]);
  const file = JSON.parse(bookFile('GEN', byVerse));
  assert.deepEqual(file, {
    formatVersion: 1,
    book: 'GEN',
    verses: {
      '11:32': [['PSA 8:3', 12], ['COL 1:16-17', 5]],
      '12:1': [['2CH 36:22-23', 4], ['EZR 1:1-3', 4]],
    },
  });
  assert.deepEqual(Object.keys(file.verses), ['11:32', '12:1'], 'verses in Bible order');
});

test('parseRef reads the references in the data files', () => {
  assert.deepEqual(parseRef('ROM 5:8'), { book: 'ROM', chapter: 5, verse: 8, endChapter: 5, endVerse: 8 });
  assert.deepEqual(parseRef('1JN 4:9-10'), { book: '1JN', chapter: 4, verse: 9, endChapter: 4, endVerse: 10 });
  assert.deepEqual(parseRef('GEN 11:32-12:1'), { book: 'GEN', chapter: 11, verse: 32, endChapter: 12, endVerse: 1 });
  assert.equal(parseRef('XYZ 1:1'), null);
  assert.equal(parseRef('ROM 5:8-3'), null);
  assert.equal(parseRef('rom 5:8'), null);
});

test('formatRef and refChapters', () => {
  const title = (book, chapter) => `${book.name} ${chapter}`;
  assert.equal(formatRef(parseRef('ROM 5:8'), title), 'Romans 5:8');
  assert.equal(formatRef(parseRef('1JN 4:9-10'), title), '1 John 4:9–10');
  assert.equal(formatRef(parseRef('GEN 11:32-12:1'), title), 'Genesis 11:32–12:1');
  assert.deepEqual(refChapters(parseRef('GEN 11:32-12:1')), [
    { chapter: 11, from: 32, to: Infinity },
    { chapter: 12, from: 1, to: 1 },
  ]);
});
