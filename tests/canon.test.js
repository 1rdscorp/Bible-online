import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjacentChapter, BOOKS, booksInTestament, chapterTitle, findBook, getBook, isValidChapter } from '../js/canon.js';

test('the canon has 66 books, 39 + 27, and 1,189 chapters', () => {
  assert.equal(BOOKS.length, 66);
  assert.equal(booksInTestament('OT').length, 39);
  assert.equal(booksInTestament('NT').length, 27);
  assert.equal(BOOKS.reduce((sum, book) => sum + book.chapters, 0), 1189);
});

test('ids and slugs are unique', () => {
  assert.equal(new Set(BOOKS.map((b) => b.id)).size, 66);
  assert.equal(new Set(BOOKS.map((b) => b.slug)).size, 66);
});

test('every id, name, slug and alias finds its own book (no ambiguous aliases)', () => {
  for (const book of BOOKS) {
    for (const key of [book.id, book.name, book.slug, ...book.aliases]) {
      assert.equal(findBook(key)?.id, book.id, `"${key}" should find ${book.id}`);
    }
  }
});

test('findBook accepts loose input', () => {
  assert.equal(findBook('JOHN')?.id, 'JHN');
  assert.equal(findBook('1 John')?.id, '1JN');
  assert.equal(findBook('1-john')?.id, '1JN');
  assert.equal(findBook('song-of-solomon')?.id, 'SNG');
  assert.equal(findBook('Psalm')?.id, 'PSA');
  assert.equal(findBook('II Samuel')?.id, '2SA');
  assert.equal(findBook('iii john')?.id, '3JN');
  assert.equal(findBook('Revelation of John')?.id, 'REV');
  // Roman-numeral fallback must not hijack real names
  assert.equal(findBook('isaiah')?.id, 'ISA');
  assert.equal(findBook('is')?.id, 'ISA');
  assert.equal(findBook('nope'), null);
  assert.equal(findBook(''), null);
});

test('getBook looks up by USFM id only', () => {
  assert.equal(getBook('jhn')?.name, 'John');
  assert.equal(getBook('john'), null);
});

test('chapter titles use "Psalm" for a single psalm', () => {
  assert.equal(chapterTitle(getBook('PSA'), 23), 'Psalm 23');
  assert.equal(chapterTitle(getBook('JHN'), 3), 'John 3');
});

test('isValidChapter checks the range', () => {
  const john = getBook('JHN');
  assert.ok(isValidChapter(john, 1));
  assert.ok(isValidChapter(john, 21));
  assert.ok(!isValidChapter(john, 22));
  assert.ok(!isValidChapter(john, 0));
  assert.ok(!isValidChapter(john, 2.5));
});

test('adjacentChapter crosses book boundaries and stops at the ends', () => {
  const at = (id, chapter, delta) => {
    const result = adjacentChapter(getBook(id), chapter, delta);
    return result && `${result.book.id} ${result.chapter}`;
  };
  assert.equal(at('JHN', 3, 1), 'JHN 4');
  assert.equal(at('JHN', 3, -1), 'JHN 2');
  assert.equal(at('JHN', 21, 1), 'ACT 1');
  assert.equal(at('ACT', 1, -1), 'JHN 21');
  assert.equal(at('MAL', 4, 1), 'MAT 1');
  assert.equal(at('MAT', 1, -1), 'MAL 4');
  assert.equal(at('GEN', 1, -1), null);
  assert.equal(at('REV', 22, 1), null);
});
