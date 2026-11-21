import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJsonProvider } from '../js/providers/json-provider.js';

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
