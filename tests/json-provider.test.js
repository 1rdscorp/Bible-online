import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJsonProvider, parseWordTags } from '../js/providers/json-provider.js';

const info = { id: 'test', name: 'Test Translation', url: 'data/test.json' };
const sample = {
  formatVersion: 1,
  id: 'test',
  books: [{ id: 'JHN', name: 'John', chapters: [['one', '', 'three']] }],
};

test('getChapter returns numbered verses and skips missing ones', async () => {
  const provider = createJsonProvider(info, { fetchJson: async () => sample });
  const chapter = await provider.getChapter('JHN', 1);
  assert.deepEqual(chapter, {
    bookId: 'JHN',
    chapter: 1,
    verses: [
      { number: 1, text: 'one' },
      { number: 3, text: 'three' },
    ],
  });
});

test('a chapter’s own numbering (native) is passed through when the file has it', async () => {
  const data = { books: [{ id: 'PSA', chapters: [['a'], ['b']], native: { 2: [[1, 5, 9]] } }] };
  const provider = createJsonProvider(info, { fetchJson: async () => data });
  assert.deepEqual((await provider.getChapter('PSA', 2)).native, [{ chapter: 1, from: 5, to: 9 }]);
  assert.equal((await provider.getChapter('PSA', 1)).native, undefined);
});

test('Strong’s tags become each verse’s words (KJV+)', async () => {
  const data = { books: [{ id: 'GEN', chapters: [['In the beginning God', 'no tags', 'x']], tags: [['7.9.H7225 17.3.H430', '', '0.1.G1+G2']] }] };
  const provider = createJsonProvider(info, { fetchJson: async () => data });
  const { verses } = await provider.getChapter('GEN', 1);
  assert.deepEqual(verses[0].words, [
    { start: 7, end: 16, strongs: ['H7225'] },
    { start: 17, end: 20, strongs: ['H430'] },
  ]);
  assert.equal(verses[1].words, undefined);
  assert.deepEqual(verses[2].words, [{ start: 0, end: 1, strongs: ['G1', 'G2'] }]);
  assert.deepEqual(parseWordTags('0.50.H1 2.0.H2 bad 1.2.H3', 10), [{ start: 1, end: 3, strongs: ['H3'] }], 'tags that don’t fit are skipped');
});

test('unknown books or chapters resolve to null', async () => {
  const provider = createJsonProvider(info, { fetchJson: async () => sample });
  assert.equal(await provider.getChapter('GEN', 1), null);
  assert.equal(await provider.getChapter('JHN', 2), null);
});

test('the file is downloaded once and shared by concurrent requests', async () => {
  let calls = 0;
  const provider = createJsonProvider(info, {
    fetchJson: async () => {
      calls += 1;
      return sample;
    },
  });
  await Promise.all([provider.load(), provider.getChapter('JHN', 1), provider.getChapter('JHN', 1)]);
  assert.equal(calls, 1);
});

test('a failed download is retried on the next request', async () => {
  let calls = 0;
  const provider = createJsonProvider(info, {
    fetchJson: async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return sample;
    },
  });
  await assert.rejects(provider.getChapter('JHN', 1), /offline/);
  assert.equal((await provider.getChapter('JHN', 1)).verses.length, 2);
});

test('a file without a books list is rejected with a clear message', async () => {
  const provider = createJsonProvider(info, { fetchJson: async () => ({ hello: 'world' }) });
  await assert.rejects(provider.getChapter('JHN', 1), /no "books" list/);
});
