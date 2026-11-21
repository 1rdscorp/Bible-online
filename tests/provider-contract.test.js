/**
 * The provider contract (js/providers/interface.js), run against every kind
 * of provider: the static JSON provider, and the per-chapter base that an API
 * provider (e.g. API.Bible) would be built on, here with a fake API behind it.
 * A new provider type should be added to this list.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createChapterProvider } from '../js/providers/chapter-provider.js';
import { assertProvider, checkTranslationInfo } from '../js/providers/interface.js';
import { createJsonProvider } from '../js/providers/json-provider.js';

const SAMPLE = {
  JHN: [
    ['In the beginning was the Word…', 'The same was in the beginning with God.'],
    ['', 'And both Jesus was called…', 'And when they wanted wine…'],
  ],
};

function infoFor(id, provider) {
  return { id, abbreviation: id.toUpperCase(), name: `Test ${id}`, language: 'en', provider, license: 'Public domain', url: `data/${id}.json` };
}

/** A pretend remote API: one request per chapter, with its own copyright line. */
function fakeApi() {
  const calls = [];
  return {
    calls,
    async fetchChapter(bookId, chapter) {
      calls.push(`${bookId}.${chapter}`);
      const verses = SAMPLE[bookId]?.[chapter - 1];
      if (!verses) return null;
      return { verses: verses.map((text, i) => ({ number: i + 1, text })), copyright: 'Text © Test Publisher' };
    },
  };
}

const PROVIDERS = [
  {
    name: 'json provider',
    make: () =>
      createJsonProvider(infoFor('json-test', 'json'), {
        fetchJson: async () => ({ books: Object.entries(SAMPLE).map(([id, chapters]) => ({ id, chapters })) }),
      }),
  },
  {
    name: 'chapter provider (API style)',
    make: () => createChapterProvider({ info: infoFor('api-test', 'api'), fetchChapter: fakeApi().fetchChapter }),
  },
];

for (const { name, make } of PROVIDERS) {
  describe(`contract: ${name}`, () => {
    test('implements the interface', () => {
      const provider = make();
      assert.doesNotThrow(() => assertProvider(provider));
      assert.deepEqual(checkTranslationInfo(provider.info), []);
    });

    test('getChapter returns verses in order, skipping missing ones', async () => {
      const chapter = await make().getChapter('JHN', 2);
      assert.equal(chapter.bookId, 'JHN');
      assert.equal(chapter.chapter, 2);
      assert.deepEqual(
        chapter.verses.map((v) => v.number),
        [2, 3],
      );
      assert.ok(chapter.verses.every((v) => typeof v.text === 'string' && v.text.length > 0));
    });

    test('a book or chapter it lacks resolves to null', async () => {
      const provider = make();
      assert.equal(await provider.getChapter('GEN', 1), null);
      assert.equal(await provider.getChapter('JHN', 99), null);
    });
  });
}

describe('chapter provider extras', () => {
  test('passes the source’s copyright notice through with the chapter', async () => {
    const provider = createChapterProvider({ info: infoFor('a', 'api'), fetchChapter: fakeApi().fetchChapter });
    assert.equal((await provider.getChapter('JHN', 1)).copyright, 'Text © Test Publisher');
  });

  test('caches chapters and shares simultaneous requests', async () => {
    const api = fakeApi();
    const provider = createChapterProvider({ info: infoFor('a', 'api'), fetchChapter: api.fetchChapter });
    await Promise.all([provider.getChapter('JHN', 1), provider.getChapter('JHN', 1)]);
    await provider.getChapter('JHN', 1);
    assert.deepEqual(api.calls, ['JHN.1']);
  });

  test('evicts the least recently used chapter beyond cacheSize', async () => {
    const api = fakeApi();
    const provider = createChapterProvider({ info: infoFor('a', 'api'), fetchChapter: api.fetchChapter, cacheSize: 1 });
    await provider.getChapter('JHN', 1);
    await provider.getChapter('JHN', 2); // evicts JHN.1
    await provider.getChapter('JHN', 1);
    assert.deepEqual(api.calls, ['JHN.1', 'JHN.2', 'JHN.1']);
  });

  test('does not cache failures', async () => {
    let attempts = 0;
    const provider = createChapterProvider({
      info: infoFor('a', 'api'),
      fetchChapter: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('HTTP 503');
        return { verses: [{ number: 1, text: 'ok' }] };
      },
    });
    await assert.rejects(provider.getChapter('JHN', 1), /503/);
    assert.equal((await provider.getChapter('JHN', 1)).verses[0].text, 'ok');
  });

  test('drops malformed verses from a quirky response', async () => {
    const provider = createChapterProvider({
      info: infoFor('a', 'api'),
      fetchChapter: async () => ({ verses: [{ number: 2, text: 'b' }, { number: 'x', text: 'bad' }, { number: 1, text: 'a' }, { number: 3, text: '' }] }),
    });
    assert.deepEqual((await provider.getChapter('JHN', 1)).verses, [
      { number: 1, text: 'a' },
      { number: 2, text: 'b' },
    ]);
  });
});

describe('interface checks', () => {
  test('assertProvider rejects incomplete providers', () => {
    assert.throws(() => assertProvider(null), /must be an object/);
    assert.throws(() => assertProvider({ info: { id: 'x' } }), /getChapter/);
    assert.throws(() => assertProvider({ info: { id: 'x' }, getChapter() {}, load: 'yes' }), /load must be a function/);
  });

  test('checkTranslationInfo explains what is wrong', () => {
    assert.deepEqual(checkTranslationInfo(infoFor('ok', 'json')), []);
    const problems = checkTranslationInfo({ id: 'Bad Id', name: 'X' });
    assert.ok(problems.some((p) => p.includes('"id"')));
    assert.ok(problems.some((p) => p.includes('"license"')));
  });
});
