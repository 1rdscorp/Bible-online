import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { buildBooks, relabelVerses, splitVerses } from '../tools/lib/translation-file.mjs';
import { validateTranslation } from '../tools/validate-translation.mjs';
import { readZipEntry } from '../tools/lib/zip.mjs';
import { createVersificationMapper, expandMappings, nativeChapterSpans, remapVerses } from '../tools/lib/versification.mjs';

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
    {
      bookId: 'PSA',
      chapter: 51,
      verse: 1,
      text: 'Начальнику хора. Псалом Давида, когда приходил к нему пророк Нафан… Помилуй меня, Боже…',
      sources: [
        { chapter: 50, verse: 1 },
        { chapter: 50, verse: 2 },
        { chapter: 50, verse: 3 },
      ],
    },
    { bookId: 'PSA', chapter: 51, verse: 2, text: 'Многократно омой меня…', sources: [{ chapter: 50, verse: 4 }] },
  ]);
});

test('remapVerses skips empty source verses', () => {
  const verses = [
    { bookId: 'JHN', chapter: 3, verse: 16, text: 'Ибо так возлюбил Бог мир…' },
    { bookId: 'JHN', chapter: 3, verse: 17, text: '' },
  ];
  assert.deepEqual(
    [...remapVerses(verses, map)].map((v) => v.verse),
    [16],
  );
});

test('nativeChapterSpans records chapters whose own numbering differs', () => {
  // Verse counts in the source numbering: Psalm 1 has 1 verse here, 9 has 39, 22 has 6.
  const max = { PSA: Array.from({ length: 151 }, (_, i) => ({ 1: '1', 9: '39', 22: '6' })[i + 1] ?? '10') };
  const remapped = [
    { bookId: 'PSA', chapter: 1, sources: [{ chapter: 1, verse: 1 }] }, // same: not recorded
    ...Array.from({ length: 6 }, (_, i) => ({ bookId: 'PSA', chapter: 23, sources: [{ chapter: 22, verse: i + 1 }] })),
    { bookId: 'PSA', chapter: 10, sources: [{ chapter: 9, verse: 22 }] },
    { bookId: 'PSA', chapter: 10, sources: [{ chapter: 9, verse: 39 }] },
  ];
  assert.deepEqual(nativeChapterSpans(remapped, max), { PSA: { 23: [[22]], 10: [[9, 22, 39]] } });
});

test('splitVerses moves the rest of a run-together verse into the next one', () => {
  const verses = [
    { bookId: 'PSA', chapter: 114, verse: 8, text: 'Ты избавил душу мою от смерти. Буду ходить пред лицем Господним.' },
    { bookId: 'PSA', chapter: 114, verse: 9, text: '' },
    { bookId: 'PSA', chapter: 115, verse: 1, text: 'Я веровал…' },
  ];
  assert.deepEqual(
    [...splitVerses(verses, { 'PSA 114:8': 'Буду ходить' })].map((v) => `${v.chapter}:${v.verse} ${v.text}`),
    ['114:8 Ты избавил душу мою от смерти.', '114:9 Буду ходить пред лицем Господним.', '115:1 Я веровал…'],
  );
  assert.throws(() => [...splitVerses(verses, { 'PSA 114:8': 'нет такой фразы' })], /Split phrase not found/);
});

test('corrections win over the mapping file verse by verse, even as different ranges', () => {
  const from = { mappedVerses: { 'EXO 36:9': 'EXO 39:2', 'EXO 36:10': 'EXO 39:3' } };
  const map = createVersificationMapper({ from, to: { mappedVerses: {} }, corrections: { 'EXO 36:9-10': 'EXO 36:9-10' } });
  assert.deepEqual(map('EXO', 36, 9), { bookId: 'EXO', chapter: 36, verse: 9 });
  assert.deepEqual(map('EXO', 36, 10), { bookId: 'EXO', chapter: 36, verse: 10 });
  // A correction can also move verses to another book (Greek Daniel → Daniel).
  const join = createVersificationMapper({ from: { mappedVerses: {} }, to: { mappedVerses: {} }, corrections: { 'DAG 3:24-26': 'DAN 3:23' } });
  assert.deepEqual(join('DAG', 3, 25), { bookId: 'DAN', chapter: 3, verse: 23 });
});

test('relabelVerses moves lettered verses (Brenton’s Proverbs 24:22f–t → 30:1–14)', () => {
  const verse = (v, label, text) => ({ bookId: 'PRO', chapter: 24, verse: v, label, text });
  const input = [verse(22, '22', 'a'), verse(22, '22a', 'plus'), verse(22, '22f', 'one'), verse(22, '22g', 'two'), verse(23, '23', 'next')];
  const out = [...relabelVerses(input, { 'PRO 24:22f-g': 'PRO 30:1-2' })];
  assert.deepEqual(out.map((v) => `${v.chapter}:${v.verse} ${v.text}`), ['24:22 a', '24:22 plus', '30:1 one', '30:2 two', '24:23 next']);
  assert.throws(() => [...relabelVerses(input, { 'PRO 24:22f-g': 'PRO 30:1-3' })], /expected 3 verses/);
});

test('buildBooks leaves out chapters past a book’s last (Psalm 151)', () => {
  const { books, droppedChapters } = buildBooks([
    { bookId: 'PSA', chapter: 150, verse: 1, text: 'Praise' },
    { bookId: 'PSA', chapter: 151, verse: 1, text: 'Extra' },
  ]);
  assert.equal(books[0].chapters.length, 150);
  assert.deepEqual(droppedChapters, ['PSA 151']);
});

test('a one-Testament translation declares it, and isn’t warned about the other', () => {
  const ot = { formatVersion: 1, id: 'x', name: 'X', abbreviation: 'X', language: 'grc', testaments: ['OT'], books: [{ id: 'GEN', chapters: Array.from({ length: 50 }, () => ['a']) }] };
  const { errors, warnings } = validateTranslation(ot);
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /Missing 38 book/, 'the other 38 Old Testament books, but no New Testament');
  assert.match(validateTranslation({ ...ot, testaments: ['XT'] }).errors.join(), /"testaments"/);
});

test('readZipEntry reads stored and deflated entries', () => {
  // Build a tiny zip by hand: one deflated file, "a.txt".
  const content = Buffer.from('Ἐν ἀρχῇ ἦν ὁ λόγος'.repeat(20));
  const data = deflateRawSync(content);
  const name = Buffer.from('a.txt');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const directoryOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(directoryOffset, 16);
  const zip = Buffer.concat([local, name, data, central, name, end]);
  assert.equal(readZipEntry(zip, 'a.txt').toString('utf8'), content.toString('utf8'));
  assert.throws(() => readZipEntry(zip, 'b.txt'), /not in the zip \(it has: a\.txt\)/);
});
