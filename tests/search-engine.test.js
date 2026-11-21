import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildIndex, keyToPosition, positionKey, runSearch, scopeRange, searchIndex } from '../js/search/engine.js';
import { parseQuery } from '../js/search/text.js';

// A tiny translation: Genesis 1:1–3, John 1:1 and 3:16 (with a gap at 1:2).
const tiny = {
  books: [
    { id: 'JHN', chapters: [['In the beginning was the Word.', '', 'All things were made by him.'], [], [...Array(15).fill(''), 'For God so loved the world.']] },
    { id: 'GEN', chapters: [['In the beginning God created the heaven and the earth.', 'And the earth was without form.', 'And God said, Let there be light.']] },
  ],
};
const index = buildIndex(tiny);
const refs = (ids) => ids.map((id) => `${index.bookOf[id]}:${index.chapterOf[id]}:${index.verseOf[id]}`);
const find = (text, mode, scope = 'all') => refs(searchIndex(index, parseQuery(text, mode), scopeRange(scope)));

test('verses are indexed in canonical order, skipping missing ones', () => {
  assert.equal(index.size, 6);
  assert.deepEqual(refs([0, 1, 2, 3, 4, 5]), ['0:1:1', '0:1:2', '0:1:3', '42:1:1', '42:1:3', '42:3:16']);
  assert.equal(index.texts[3], 'In the beginning was the Word.');
});

test('all words, any word, exact phrase, prefix', () => {
  assert.deepEqual(find('beginning god', 'all'), ['0:1:1']);
  assert.deepEqual(find('beginning god', 'any'), ['0:1:1', '0:1:3', '42:1:1', '42:3:16']);
  assert.deepEqual(find('"in the beginning"', 'all'), ['0:1:1', '42:1:1']);
  assert.deepEqual(find('the beginning in', 'phrase'), [], 'word order matters in a phrase');
  assert.deepEqual(find('the earth', 'phrase'), ['0:1:1', '0:1:2']);
  assert.deepEqual(find('"the earth" form', 'all'), ['0:1:2']);
  assert.deepEqual(find('lo*', 'all'), ['42:3:16']);
  assert.deepEqual(find('lov* lig*', 'any'), ['0:1:3', '42:3:16']);
  assert.deepEqual(find('nothing', 'all'), []);
  assert.deepEqual(find('', 'all'), []);
});

test('book and testament filters', () => {
  assert.deepEqual(scopeRange('all'), null);
  assert.deepEqual(scopeRange('OT'), [0, 38]);
  assert.deepEqual(scopeRange('NT'), [39, 65]);
  assert.deepEqual(scopeRange('JHN'), [42, 42]);
  assert.deepEqual(find('beginning', 'all', 'OT'), ['0:1:1']);
  assert.deepEqual(find('beginning', 'all', 'NT'), ['42:1:1']);
  assert.deepEqual(find('beginning', 'all', 'JHN'), ['42:1:1']);
  assert.deepEqual(find('beginning', 'all', 'ROM'), []);
});

test('several translations combine by verse, with counts per book', () => {
  const other = buildIndex({ books: [{ id: 'GEN', chapters: [['At the first God made the heaven and the earth.']] }] });
  const result = runSearch([{ index }, { index: other }], parseQuery('earth'), 'all');
  assert.deepEqual(result.keys.map((key) => { const p = keyToPosition(key); return `${p.book.id} ${p.chapter}:${p.verse}`; }), ['GEN 1:1', 'GEN 1:2']);
  assert.deepEqual(result.matches.get(positionKey(0, 1, 1)).map((m) => m.source), [0, 1]);
  assert.deepEqual(result.books, [['GEN', 2]]);
  assert.ok(positionKey(0, 150, 176) < positionKey(1, 1, 1), 'keys sort in canonical order');
});

test('real data: KJV and the Synodal translation', () => {
  const kjv = buildIndex(JSON.parse(readFileSync(new URL('../data/kjv.json', import.meta.url))));
  const rst = buildIndex(JSON.parse(readFileSync(new URL('../data/rst.json', import.meta.url))));
  const search = (idx, text, mode = 'all', scope = 'all') => runSearch([{ index: idx }], parseQuery(text, mode), scope);
  const label = (key) => { const p = keyToPosition(key); return `${p.book.id} ${p.chapter}:${p.verse}`; };

  const beginning = search(kjv, '"in the beginning"');
  assert.ok(beginning.keys.map(label).includes('GEN 1:1') && beginning.keys.map(label).includes('JHN 1:1'));
  assert.equal(label(beginning.keys[0]), 'GEN 1:1');
  assert.equal(beginning.books.reduce((sum, [, n]) => sum + n, 0), beginning.keys.length);

  assert.deepEqual(search(kjv, 'jesus wept', 'phrase').keys.map(label), ['JHN 11:35']);
  assert.deepEqual(search(kjv, 'faith hope charity', 'all', 'NT').keys.map(label).includes('1CO 13:13'), true);
  assert.equal(search(kjv, 'faith', 'all', 'OT').keys.length < search(kjv, 'faith').keys.length, true);
  assert.deepEqual(search(rst, 'в начале было слово', 'phrase').keys.map(label), ['JHN 1:1']);
  // ё and е match each other.
  assert.equal(search(rst, 'её').keys.length, search(rst, 'ее').keys.length);
});

test('real data: the Septuagint, searched without accents', () => {
  const lxx = buildIndex(JSON.parse(readFileSync(new URL('../data/lxx.json', import.meta.url))));
  const label = (key) => { const p = keyToPosition(key); return `${p.book.id} ${p.chapter}:${p.verse}`; };
  const found = (text, mode = 'all', scope = 'all') => runSearch([{ index: lxx }], parseQuery(text, mode), scope).keys.map(label);
  assert.deepEqual(found('κυριος ποιμαινει με', 'phrase'), ['PSA 23:1']);
  assert.ok(found('"εν αρχη εποιησεν"').includes('GEN 1:1'));
  assert.deepEqual(found('λογος', 'all', 'NT'), [], 'no New Testament');
});
