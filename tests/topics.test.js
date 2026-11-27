/** Topic lookups (js/research/topics.js): search, letters, verse → topics, nesting. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldText, nestLines, searchStatements, searchTopics, titleLetter, topicQuery, topicsForVerse } from '../js/research/topics.js';

const topics = [
  { id: 'faith', en: 'Faith', ru: 'Вера' },
  { id: 'faithfulness-of-god', en: 'Faithfulness of God', ru: 'Верность Бога' },
  { id: 'holy-spirit-the-comforter', en: 'Holy Spirit, the Comforter', ru: 'Святой Дух — Утешитель' },
  { id: 'love-of-god', en: 'Love of God', ru: 'Любовь Божия' },
  { id: 'earth', en: 'Earth', ru: 'Земля' },
];

test('folding: case, ё, accents and punctuation', () => {
  assert.equal(foldText('Святой Дух — Утешитель'), 'святой дух утешитель');
  assert.equal(foldText('Ещё'), 'еще');
  assert.equal(foldText('Café, the'), 'cafe the');
  assert.equal(titleLetter('Ёлка'), 'Е');
});

test('search: word starts in either language, titles that start with the query first', () => {
  assert.deepEqual(searchTopics(topics, 'faith').map((t) => t.id), ['faith', 'faithfulness-of-god']);
  // The exact title first, whatever the list order.
  assert.deepEqual(searchTopics([...topics].reverse(), 'вера').map((t) => t.id), ['faith']);
  assert.deepEqual(searchTopics([topics[1], topics[0]], 'faith').map((t) => t.id), ['faith', 'faithfulness-of-god']);
  assert.deepEqual(searchTopics(topics, 'god').map((t) => t.id), ['faithfulness-of-god', 'love-of-god']);
  assert.deepEqual(searchTopics(topics, 'вер').map((t) => t.id), ['faith', 'faithfulness-of-god']);
  assert.deepEqual(searchTopics(topics, 'hol spi').map((t) => t.id), ['holy-spirit-the-comforter']);
  assert.deepEqual(searchTopics(topics, 'утеш').map((t) => t.id), ['holy-spirit-the-comforter']);
  assert.deepEqual(searchTopics(topics, 'zzz'), []);
  assert.equal(searchTopics(topics, '  ').length, topics.length);
});

test('the topics that cite a verse, ranges and whole chapters included', () => {
  const refs = {
    JHN: [
      [3, 1, 3, 36, 2, 0], // the whole chapter
      [3, 16, 3, 16, 0, 4],
      [3, 16, 3, 16, 0, 4], // the same statement twice: listed once
      [3, 14, 3, 17, 1, 2],
      [4, 1, 4, 2, 3, 1],
    ],
  };
  assert.deepEqual(topicsForVerse(refs, 'JHN', 3, 16), [{ topic: 0, line: 4 }, { topic: 1, line: 2 }, { topic: 2, line: 0 }]);
  assert.deepEqual(topicsForVerse(refs, 'JHN', 3, 2), [{ topic: 2, line: 0 }]);
  assert.deepEqual(topicsForVerse(refs, 'JHN', 5, 1), []);
  assert.deepEqual(topicsForVerse(refs, 'GEN', 1, 1), []);
});

test('statements nest their sub-statements', () => {
  const nested = nestLines([
    { l: 1, t: 'Commanded', r: ['MRK 11:22'] },
    { l: 1, t: 'The objects of, are', r: [] },
    { l: 2, t: 'God', r: ['JHN 14:1'] },
    { l: 2, t: 'Christ', r: ['JHN 6:29'] },
  ]);
  assert.deepEqual(nested.map((line) => [line.t, line.index, line.children.map((c) => [c.t, c.index])]), [
    ['Commanded', 0, []],
    ['The objects of, are', 1, [['God', 2], ['Christ', 3]]],
  ]);
});

test('what of a Bible search to look up as topics', () => {
  assert.equal(topicQuery('prayer'), 'prayer');
  assert.equal(topicQuery('"holy spirit"'), 'holy spirit');
  assert.equal(topicQuery('бог* любовь'), 'бог любовь');
  assert.equal(topicQuery('Jn 3:16'), '');
  assert.equal(topicQuery('one two three four five'), '');
  assert.equal(topicQuery('  '), '');
});

test('statements: word starts in English or Russian, in topic order, up to a limit', () => {
  const entries = [
    [0, 0, 'Is the gift of God', 'Дар Божий'],
    [0, 1, 'Produces joy', 'Производит радость'],
    [3, 2, 'The gift of the Holy Spirit', 'Дар Святого Духа'],
  ];
  assert.deepEqual(searchStatements(entries, 'gift'), [{ topic: 0, line: 0 }, { topic: 3, line: 2 }]);
  assert.deepEqual(searchStatements(entries, 'дар свят'), [{ topic: 3, line: 2 }]);
  assert.deepEqual(searchStatements(entries, 'радост'), [{ topic: 0, line: 1 }]);
  assert.deepEqual(searchStatements(entries, 'ift'), [], 'word starts only');
  assert.equal(searchStatements(entries, 'дар', { limit: 1 }).length, 1);
});
