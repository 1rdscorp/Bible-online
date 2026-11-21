import assert from 'node:assert/strict';
import { test } from 'node:test';
import { concordance, spansFor } from '../js/research/concordance.js';
import { createResearchData } from '../js/research/data.js';
import { isStrongsNumber, linkStrongs, scriptRuns, strongsLanguage } from '../js/research/strongs.js';
import { buildIndex } from '../js/search/engine.js';

const kjvs = {
  books: [
    {
      id: 'GEN',
      chapters: [['In the beginning God created', 'And God said']],
      tags: [['7.9.H7225 17.3.H430 21.7.H1254', '4.3.H430 8.4.H559']],
    },
    {
      id: 'JHN',
      chapters: [['In the beginning was the Word', 'The Word became flesh', 'Love and love; I have loved']],
      tags: [['7.9.G746 25.4.G3056', '0.8.G3056', '0.4.G25 9.4.G25 15.13.G25']],
    },
  ],
};

test('spansFor finds a number’s words in a verse’s tags, including words with two numbers', () => {
  assert.deepEqual(spansFor('7.9.H7225 17.3.H430', 'H430'), [[17, 20]]);
  assert.deepEqual(spansFor('0.4.G1+G2 5.2.G2', 'G2'), [[0, 4], [5, 7]]);
  assert.deepEqual(spansFor('', 'G2'), []);
});

test('the search index keeps Strong’s numbers, and concordance lists their verses', () => {
  const index = buildIndex(kjvs);
  const god = concordance(index, 'H430');
  assert.equal(god.verses, 2);
  assert.equal(god.occurrences, 2);
  assert.deepEqual(god.books, [['GEN', 2]]);
  assert.deepEqual(god.hits[1], { bookId: 'GEN', chapter: 1, verse: 2, text: 'And God said', spans: [[4, 7]] });

  const word = concordance(index, 'G3056');
  assert.deepEqual(word.renderings, [['Word', 2]], '"the Word" counts as "Word"');
  assert.equal(concordance(index, 'G3056', { offset: 1, limit: 5 }).hits[0].verse, 2, 'paged');

  const love = concordance(index, 'G25');
  assert.deepEqual(love.renderings, [['love', 2], ['I have loved', 1]], 'usual capitalisation kept');
  assert.deepEqual(concordance(index, 'H9999'), { verses: 0, occurrences: 0, books: [], renderings: [], hits: [] });
});

test('a translation without tags has no Strong’s numbers', () => {
  const index = buildIndex({ books: [{ id: 'GEN', chapters: [['In the beginning']] }] });
  assert.equal(concordance(index, 'H7225').verses, 0);
});

test('Strong’s helpers', () => {
  assert.equal(strongsLanguage('H7225'), 'hbo');
  assert.equal(strongsLanguage('G25'), 'grc');
  assert.equal(strongsLanguage('X1'), null);
  assert.ok(isStrongsNumber('H7225'));
  assert.ok(!isStrongsNumber('H0'));
  assert.deepEqual(linkStrongs('from H7218 (x) and G25'), ['from ', { number: 'H7218' }, ' (x) and ', { number: 'G25' }]);
  assert.deepEqual(scriptRuns('of G1537 (ἐκ τελέω) and (רֹאשׁ)'), ['of G1537 (', { script: 'grc', text: 'ἐκ τελέω' }, ') and (', { script: 'he', text: 'רֹאשׁ' }, ')']);
});

test('research data: cross references and dictionary entries, each file fetched once', async () => {
  const fetched = [];
  const files = {
    'data/research.json': {
      xref: { url: 'data/xref/', version: 'x1' },
      strongs: { hebrew: { url: 'data/strongs/hebrew.json', version: 'h1' }, greek: { url: 'data/strongs/greek.json', version: 'g1' } },
      study: { url: 'data/study/', version: 's1', books: ['GEN'] },
    },
    'data/xref/JHN.json': { verses: { '3:16': [['ROM 5:8', 995], ['nonsense', 3]] } },
    'data/strongs/greek.json': { entries: { G25: { lemma: 'ἀγαπάω' } } },
    'data/study/books/GEN.json': { book: 'GEN' },
  };
  const data = createResearchData({
    fetchJson: async (url, version) => {
      fetched.push(`${url}@${version ?? ''}`);
      return files[url];
    },
  });
  const refs = await data.crossReferences('JHN', 3, 16);
  assert.deepEqual(refs, [{ ref: 'ROM 5:8', target: { book: 'ROM', chapter: 5, verse: 8, endChapter: 5, endVerse: 8 }, votes: 995 }]);
  assert.deepEqual(await data.crossReferences('JHN', 3, 17), []);
  assert.equal((await data.strongs('G25')).lemma, 'ἀγαπάω');
  assert.equal(await data.strongs('G99999'), null);
  assert.deepEqual(await data.bookIntro('GEN'), { book: 'GEN' });
  assert.equal(await data.bookIntro('EXO'), null, 'no introduction yet: no request');
  assert.deepEqual(fetched, ['data/research.json@', 'data/xref/JHN.json@x1', 'data/strongs/greek.json@g1', 'data/study/books/GEN.json@s1']);
});
