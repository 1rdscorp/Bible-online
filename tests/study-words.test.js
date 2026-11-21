import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchQueryFor, snapToWords } from '../js/study/words.js';

const text = 'For God so loved the world, that he gave his only begotten Son';
const snap = (start, end, t = text) => {
  const r = snapToWords(t, start, end);
  return r && t.slice(r.start, r.end);
};

test('a selection grows to whole words and drops edge spaces and punctuation', () => {
  assert.equal(snap(9, 13), 'so loved', 'part of "so" and of "loved"');
  assert.equal(snap(11, 13), 'loved');
  assert.equal(snap(21, 27), 'world', 'trailing comma dropped');
  assert.equal(snap(7, 10), 'so', 'a leading space doesn’t pull in "God"');
  assert.equal(snap(26, 28), null, 'only ", " selected');
  assert.equal(snap(0, text.length), text);
  assert.equal(snap(13, 9), 'so loved', 'backwards selection');
  assert.equal(snap(2, 3, 'the LORD’s house'), 'the', 'inside "the"');
  assert.equal(snap(5, 7, 'the LORD’s house'), 'LORD’s', 'apostrophe inside a word');
  assert.equal(snap(1, 3, 'ὁ μετʼ αὐτοῦ'), 'μετʼ', 'Greek elision mark stays with its word');
  assert.equal(snap(3, 6, 'Ибо так возлюбил'), 'так', 'Cyrillic');
});

test('a selection becomes a search: a word, or an exact phrase', () => {
  assert.equal(searchQueryFor('loved'), 'loved');
  assert.equal(searchQueryFor(' world, '), 'world');
  assert.equal(searchQueryFor('so loved\nthe world.'), '"so loved the world"');
  assert.equal(searchQueryFor('“Let there be light”'), '"Let there be light"', 'quotes inside are dropped');
  assert.equal(searchQueryFor('LORD’s'), 'LORD’s');
  assert.equal(searchQueryFor(' , . '), '');
  const long = 'word '.repeat(40);
  assert.ok(searchQueryFor(long).length <= 102 && !/ "$/.test(searchQueryFor(long)), 'long selections cut at a word');
});
