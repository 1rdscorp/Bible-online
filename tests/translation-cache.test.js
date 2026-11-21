import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTranslationCache } from '../js/providers/translation-cache.js';

const BASE = 'https://example.test/bible/';

/** Minimal in-memory stand-in for the browser's CacheStorage. */
function fakeCacheStorage() {
  const entries = new Map();
  const cache = {
    async match(key) {
      const body = entries.get(typeof key === 'string' ? key : key.url);
      return body === undefined ? undefined : new Response(body);
    },
    async put(key, response) {
      entries.set(key, await response.text());
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
    async delete(request) {
      return entries.delete(request.url);
    },
  };
  return { entries, storage: { open: async () => cache } };
}

function fakeFetch(body = { books: [] }) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { calls, impl };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0)); // background cache writes

test('first load downloads and stores; the next one comes from the cache', async () => {
  const { entries, storage } = fakeCacheStorage();
  const net = fakeFetch({ id: 'kjv' });
  const cache = createTranslationCache({ cacheStorage: storage, fetchImpl: net.impl, baseUrl: BASE });

  assert.deepEqual(await cache.fetchJson('data/kjv.json', 'abc'), { id: 'kjv' });
  await settle();
  assert.deepEqual(net.calls, ['https://example.test/bible/data/kjv.json?v=abc']);
  assert.ok(entries.has('https://example.test/bible/data/kjv.json?v=abc'));
  assert.equal(await cache.has('data/kjv.json', 'abc'), true);

  assert.deepEqual(await cache.fetchJson('data/kjv.json', 'abc'), { id: 'kjv' });
  assert.equal(net.calls.length, 1, 'no second download');
});

test('a new version is downloaded and the old copy deleted', async () => {
  const { entries, storage } = fakeCacheStorage();
  const net = fakeFetch();
  const cache = createTranslationCache({ cacheStorage: storage, fetchImpl: net.impl, baseUrl: BASE });

  await cache.fetchJson('data/kjv.json', 'v1');
  await settle();
  await cache.fetchJson('data/asv.json', 'v1');
  await settle();
  await cache.fetchJson('data/kjv.json', 'v2');
  await settle();
  assert.deepEqual([...entries.keys()].sort(), [
    'https://example.test/bible/data/asv.json?v=v1',
    'https://example.test/bible/data/kjv.json?v=v2',
  ]);
});

test('files without a version are never stored', async () => {
  const { entries, storage } = fakeCacheStorage();
  const net = fakeFetch();
  const cache = createTranslationCache({ cacheStorage: storage, fetchImpl: net.impl, baseUrl: BASE });
  await cache.fetchJson('data/x.json');
  await settle();
  assert.equal(entries.size, 0);
  assert.equal(await cache.has('data/x.json'), false);
});

test('works without Cache Storage (falls back to plain fetch)', async () => {
  const net = fakeFetch({ ok: true });
  const cache = createTranslationCache({ cacheStorage: undefined, fetchImpl: net.impl, baseUrl: BASE });
  assert.deepEqual(await cache.fetchJson('data/kjv.json', 'abc'), { ok: true });
  assert.equal(await cache.has('data/kjv.json', 'abc'), false);
});

test('errors name the file', async () => {
  const notFound = createTranslationCache({
    cacheStorage: undefined,
    fetchImpl: async () => new Response('nope', { status: 404 }),
    baseUrl: BASE,
  });
  await assert.rejects(notFound.fetchJson('data/kjv.json', 'a'), /data\/kjv\.json \(HTTP 404\)/);

  const offline = createTranslationCache({
    cacheStorage: undefined,
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
    baseUrl: BASE,
  });
  await assert.rejects(offline.fetchJson('data/kjv.json', 'a'), /Network error while loading data\/kjv\.json/);
});
