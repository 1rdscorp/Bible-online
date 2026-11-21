import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BOOKS, findBook } from '../js/canon.js';
import { bookOnly, lookupBook, parseReference, RUSSIAN_ALIASES, synodalPsalm } from '../js/search/reference.js';

const ref = (input) => {
  const r = parseReference(input);
  return r && `${r.book.id} ${r.chapter}${r.verse ? `:${r.verse}` : ''}${r.verseEnd ? `-${r.verseEnd}` : ''}`;
};

test('English references', () => {
  assert.equal(ref('Jn 3:16'), 'JHN 3:16');
  assert.equal(ref('Romans 8'), 'ROM 8');
  assert.equal(ref('Ps 23:1-4'), 'PSA 23:1-4');
  assert.equal(ref('  1 Cor 13:4–7 '), '1CO 13:4-7');
  assert.equal(ref('II Samuel 7'), '2SA 7');
  assert.equal(ref('1st John 4:8'), '1JN 4:8');
  assert.equal(ref('Song of Solomon 2:1'), 'SNG 2:1');
  assert.equal(ref('Gen 1.1'), 'GEN 1:1');
  assert.equal(ref('Rom 8:28'), 'ROM 8:28', 'an unambiguous start of a name');
  assert.equal(ref('John 25'), 'JHN 25', 'a missing chapter is left for the reader to explain');
});

test('single-chapter books: the number is a verse', () => {
  assert.equal(ref('Jude 3'), 'JUD 1:3');
  assert.equal(ref('Jude 3-5'), 'JUD 1:3-5');
  assert.equal(ref('Jude 1'), 'JUD 1');
  assert.equal(ref('Philemon 1:6'), 'PHM 1:6');
});

test('Russian references', () => {
  assert.equal(ref('Ин 3:16'), 'JHN 3:16');
  assert.equal(ref('Ин. 3, 16'), 'JHN 3:16');
  assert.equal(ref('От Иоанна 3:16'), 'JHN 3:16');
  assert.equal(ref('Рим 8'), 'ROM 8');
  assert.equal(ref('1 Кор 13:4-7'), '1CO 13:4-7');
  assert.equal(ref('1-е Иоанна 4:8'), '1JN 4:8');
  assert.equal(ref('3 Царств 19:12'), '1KI 19:12', 'Synodal 3 Kingdoms = 1 Kings');
  assert.equal(ref('Быт 1:1'), 'GEN 1:1');
  assert.equal(ref('Откр 22:21'), 'REV 22:21');
  assert.equal(ref('Флп 4:13'), 'PHP 4:13');
  assert.equal(ref('Деяния 2:4'), 'ACT 2:4');
});

test('not references: plain words, a book alone, bad numbers', () => {
  for (const input of ['love', 'in the beginning', 'love 3', 'Romans', 'John 3 16', 'Rom 0', 'Jo 3', '', '3:16']) {
    assert.equal(parseReference(input), null, input);
  }
  assert.equal(ref('Matt 5:9-3'), 'MAT 5:9', 'a backwards range keeps its first verse');
  assert.equal(ref('Gen 1-3'), 'GEN 1', 'a chapter range opens its first chapter');
});

test('a book named on its own suggests opening it', () => {
  assert.equal(bookOnly('Romans')?.id, 'ROM');
  assert.equal(bookOnly('Римлянам')?.id, 'ROM');
  assert.equal(bookOnly('от иоанна')?.id, 'JHN');
  assert.equal(bookOnly('love'), null);
  assert.equal(bookOnly('Rom'), null, 'abbreviations are too likely to be search words');
});

test('Russian abbreviations are unambiguous and agree with the English ones', () => {
  const seen = new Map();
  for (const [id, aliases] of Object.entries(RUSSIAN_ALIASES)) {
    assert.ok(BOOKS.some((book) => book.id === id), id);
    for (const alias of aliases) {
      const key = alias.replace(/\s/g, '');
      assert.ok(!seen.has(key) || seen.get(key) === id, `"${alias}" means both ${seen.get(key)} and ${id}`);
      seen.set(key, id);
      assert.equal(lookupBook(alias)?.id, id, alias);
    }
  }
  // Every English name still resolves as it does in URLs.
  for (const book of BOOKS) assert.equal(lookupBook(book.name), findBook(book.name), book.name);
});

test('Psalms typed with a Russian name use Synodal numbers', () => {
  assert.equal(ref('Пс 22'), 'PSA 23');
  assert.equal(ref('Псалом 22:1'), 'PSA 23:1');
  assert.equal(ref('Ps 22'), 'PSA 22', 'English names keep English numbers');
  assert.equal(ref('Пс 9:22'), 'PSA 10:1');
  assert.equal(ref('Пс 115'), 'PSA 116:10');
  assert.equal(ref('Пс 150'), 'PSA 150');
});

test('the Synodal Psalm table matches the numbering in data/rst.json', () => {
  const rst = JSON.parse(readFileSync(new URL('../data/rst.json', import.meta.url)));
  const psalms = rst.books.find((book) => book.id === 'PSA');
  for (let english = 1; english <= 150; english += 1) {
    const spans = psalms.native?.[english] ?? [[english]];
    for (const [native, from] of spans) {
      const mapped = synodalPsalm(native, from ?? null);
      assert.equal(mapped.chapter, english, `Synodal ${native}${from ? `:${from}` : ''} → Psalm ${english}`);
      if (from !== undefined && english !== native + 1 && english !== native) assert.equal(mapped.verse, 1);
    }
  }
});
