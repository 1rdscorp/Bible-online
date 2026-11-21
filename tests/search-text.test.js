import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highlightRanges, normalizeWord, parseQuery, tokenize } from '../js/search/text.js';

test('words: any script, case-insensitive, ё = е, apostrophes and hyphens split', () => {
  assert.deepEqual(tokenize('In the beginning God created'), ['in', 'the', 'beginning', 'god', 'created']);
  assert.deepEqual(tokenize('the LORD’s burnt-offering'), ['the', 'lord', 's', 'burnt', 'offering']);
  assert.deepEqual(tokenize('В начале сотворил Бог небо и землю.'), ['в', 'начале', 'сотворил', 'бог', 'небо', 'и', 'землю']);
  assert.equal(normalizeWord('Её'), 'ее');
  assert.notEqual(normalizeWord('мой'), normalizeWord('мои')); // й is its own letter
  // A decomposed й (и + combining breve) is the same word as a composed one.
  assert.deepEqual(tokenize('мой'), ['мой']);
});

test('Greek: accents, breathings, elision and final sigma are ignored', () => {
  assert.deepEqual(tokenize('ἘΝ ἀρχῇ ἐποίησεν ὁ Θεὸς'), ['εν', 'αρχη', 'εποιησεν', 'ο', 'θεοσ']);
  assert.equal(normalizeWord('λόγος'), normalizeWord('ΛΟΓΟΣ'));
  assert.equal(normalizeWord('λόγος'), normalizeWord('λογος'));
  assert.equal(normalizeWord('Ἀλληλούϊα'), 'αλληλουια');
  assert.equal(normalizeWord('μετʼ'), 'μετ');
  assert.equal(normalizeWord('мой'), 'мой', 'Cyrillic й untouched');
  const text = 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν Θεόν.';
  assert.deepEqual(highlightRanges(text, parseQuery('λογος θεον')).map(([a, b]) => text.slice(a, b)), ['λόγος', 'λόγος', 'Θεόν']);
  assert.deepEqual(highlightRanges(text, parseQuery('"εν αρχη"')).map(([a, b]) => text.slice(a, b)), ['Ἐν ἀρχῇ']);
});

test('query: words, "phrases", prefixes', () => {
  assert.deepEqual(parseQuery('faith hope love'), {
    mode: 'all',
    clauses: [
      { type: 'word', term: 'faith', prefix: false },
      { type: 'word', term: 'hope', prefix: false },
      { type: 'word', term: 'love', prefix: false },
    ],
  });
  assert.deepEqual(parseQuery('"In the beginning" God').clauses, [
    { type: 'phrase', terms: ['in', 'the', 'beginning'] },
    { type: 'word', term: 'god', prefix: false },
  ]);
  // Curly, Russian and German quotes; an unclosed quote runs to the end.
  for (const input of ['“in the beginning”', '«in the beginning»', '„in the beginning“', '"in the beginning']) {
    assert.deepEqual(parseQuery(input).clauses, [{ type: 'phrase', terms: ['in', 'the', 'beginning'] }], input);
  }
  assert.deepEqual(parseQuery('lov*').clauses, [{ type: 'word', term: 'lov', prefix: true }]);
  assert.deepEqual(parseQuery('l*').clauses, [{ type: 'word', term: 'l', prefix: false }], 'one-letter prefixes are too broad');
  assert.deepEqual(parseQuery('burnt-offering').clauses, [{ type: 'phrase', terms: ['burnt', 'offering'] }]);
  assert.deepEqual(parseQuery('love Love LOVE').clauses.length, 1, 'repeats are dropped');
  assert.deepEqual(parseQuery('  ?! ').clauses, []);
});

test('query modes: any word, exact phrase', () => {
  assert.equal(parseQuery('faith hope', 'any').mode, 'any');
  assert.deepEqual(parseQuery('in the beginning', 'phrase'), { mode: 'all', clauses: [{ type: 'phrase', terms: ['in', 'the', 'beginning'] }] });
  assert.deepEqual(parseQuery('"Jesus" wept*', 'phrase').clauses, [{ type: 'phrase', terms: ['jesus', 'wept'] }], 'quotes and * are just text here');
  assert.deepEqual(parseQuery('Jesus', 'phrase').clauses, [{ type: 'word', term: 'jesus', prefix: false }]);
});

test('highlights cover whole words and whole phrases', () => {
  const text = 'In the beginning was the Word, and the Word was with God.';
  const marks = (query) => highlightRanges(text, query).map(([a, b]) => text.slice(a, b));
  assert.deepEqual(marks(parseQuery('word god')), ['Word', 'Word', 'God']);
  assert.deepEqual(marks(parseQuery('"the word"')), ['the Word', 'the Word']);
  assert.deepEqual(marks(parseQuery('"in the beginning" beginning')), ['In the beginning'], 'overlaps merge');
  assert.deepEqual(marks(parseQuery('wa*')), ['was', 'was']);
  assert.deepEqual(marks(parseQuery('no match')), []);
  const russian = 'И сказал Бог: да будет свет. И стал свет.';
  assert.deepEqual(highlightRanges(russian, parseQuery('СВЕТ')).map(([a, b]) => russian.slice(a, b)), ['свет', 'свет']);
});
