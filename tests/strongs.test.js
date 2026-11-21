import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertEntry, dictionaryFile, readDictionarySource } from '../tools/build-strongs.mjs';
import { normalizeStrongs, readUsfx } from '../tools/lib/read-usfx.mjs';
import { buildBooks, extractWordTags } from '../tools/lib/translation-file.mjs';
import { validateTranslation } from '../tools/validate-translation.mjs';

test('normalizeStrongs drops zero padding and joins several numbers', () => {
  assert.equal(normalizeStrongs('H0216'), 'H216');
  assert.equal(normalizeStrongs('G3056 G5207'), 'G3056+G5207');
  assert.equal(normalizeStrongs('h07225'), 'H7225');
  assert.equal(normalizeStrongs('lemma'), '');
});

test('readUsfx keeps Strong’s numbers as markers only when asked', () => {
  const xml =
    '<book id="GEN"><c id="1"/><p><v id="1"/>¶ In the\n<w s="H7225">beginning</w>\n<w s="H0430">God</w>, and\n<w>untagged</w> <w s="H776">earth</w>.<ve/></p></book>';
  assert.equal([...readUsfx(xml)][0].text, '¶ In the\nbeginning\nGod, and\nuntagged earth.');
  const [verse] = readUsfx(xml, { wordTags: true });
  assert.equal(verse.text, '¶ In the\n\uE000H7225\uE001beginning\uE002\n\uE000H430\uE001God\uE002, and\nuntagged \uE000H776\uE001earth\uE002.');
});

test('extractWordTags turns markers into start.length.number', () => {
  const marked = 'In the \uE000H7225\uE001beginning\uE002 \uE000H430\uE001God,\uE002 and \uE000G2889\uE001the world \uE002 done';
  assert.deepEqual(extractWordTags(marked), {
    text: 'In the beginning God, and the world done',
    tags: '7.9.H7225 17.3.H430 26.9.G2889',
  });
  assert.deepEqual(extractWordTags('no tags'), { text: 'no tags', tags: '' });
});

test('buildBooks with wordTags writes "tags" beside "chapters", and the validator checks them', () => {
  const verses = [
    { bookId: 'GEN', chapter: 1, verse: 1, text: '¶ In the \uE000H7225\uE001beginning\uE002' },
    { bookId: 'GEN', chapter: 1, verse: 2, text: 'And \uE000H776\uE001the earth\uE002 was' },
  ];
  const { books } = buildBooks(verses, { fixes: ['drop-pilcrows'], wordTags: true });
  assert.deepEqual(books[0].chapters, [['In the beginning', 'And the earth was']]);
  assert.deepEqual(books[0].tags, [['7.9.H7225', '4.9.H776']]);
  const file = { formatVersion: 1, id: 'x', abbreviation: 'X', name: 'X', language: 'en', license: 'PD', books };
  assert.deepEqual(validateTranslation(file).errors, []);
  books[0].tags[0][1] = '4.99.H776';
  assert.match(validateTranslation(file).errors.join(), /unreadable "tags" at 1:2/);
});

test('Strong’s entries: tidy fields, links without zero padding, Greek symbols as words', () => {
  const source = readDictionarySource('/* c */\nvar d = {"H2":{"lemma":"אַב","xlit":"ʼab","pron":"ab","derivation":"(Aramaic) corresponding to H0001","strongs_def":"{father}","kjv_def":"father."},\n"H1":{"lemma":"אָב","xlit":"ʼâb","pron":"awb","strongs_def":"father","kjv_def":"chief"}};\nmodule.exports = d;');
  const { text, count } = dictionaryFile('hbo', source);
  assert.equal(count, 2);
  const file = JSON.parse(text);
  assert.deepEqual(Object.keys(file.entries), ['H1', 'H2']);
  assert.deepEqual(file.entries.H2, { lemma: 'אַב', xlit: 'ʼab', pron: 'ab', def: 'father', kjv: 'father.', deriv: '(Aramaic) corresponding to H1' });
  assert.deepEqual(convertEntry({ lemma: 'Α', translit: 'A', strongs_def: ' first', kjv_def: '--Alpha, X truly, + reckon' }, 'grc'), {
    lemma: 'Α',
    xlit: 'A',
    def: 'first',
    kjv: 'Alpha, [idiom] truly, [phrase] reckon',
  });
});
