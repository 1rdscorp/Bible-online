import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { canTranslateOnDevice, googleTranslateUrl, TIMEOUTS, translateOnDevice } from '../js/translate/machine.js';
import { cleanSelection, truncate, verseRangeLabel } from '../js/translate/text.js';

afterEach(() => {
  delete globalThis.Translator;
});

test('selected text is tidied to one line', () => {
  assert.equal(cleanSelection('  For God\n so loved\tthe world, '), 'For God so loved the world,');
  assert.equal(cleanSelection(null), '');
});

test('long quotes are shortened at a word boundary', () => {
  assert.equal(truncate('short', 10), 'short');
  assert.equal(truncate('For God so loved the world, that he gave', 20), 'For God so loved…');
});

test('verse ranges read naturally', () => {
  assert.equal(verseRangeLabel([16]), '16');
  assert.equal(verseRangeLabel([16, 17, 18]), '16–18');
  assert.equal(verseRangeLabel([4, 1, 3, 3]), '1, 3–4');
});

test('Google Translate link carries the text and languages', () => {
  const url = new URL(googleTranslateUrl('For God so loved the world', 'en', 'ru'));
  assert.equal(url.origin, 'https://translate.google.com');
  assert.equal(url.searchParams.get('sl'), 'en');
  assert.equal(url.searchParams.get('tl'), 'ru');
  assert.equal(url.searchParams.get('text'), 'For God so loved the world');
  assert.equal(new URL(googleTranslateUrl('x'.repeat(5000), 'en', 'ru')).searchParams.get('text').length, 2000);
});

test('on-device translation is used only where the browser offers it', async () => {
  assert.equal(await canTranslateOnDevice('en', 'ru'), false, 'no Translator API');

  globalThis.Translator = { availability: async () => 'unavailable' };
  assert.equal(await canTranslateOnDevice('en', 'ru'), false);

  let progress = null;
  globalThis.Translator = {
    availability: async () => 'downloadable',
    create: async ({ sourceLanguage, targetLanguage, monitor }) => {
      const events = new EventTarget();
      monitor(events);
      const event = new Event('downloadprogress');
      event.loaded = 0.5;
      events.dispatchEvent(event);
      return { translate: async (text) => `[${sourceLanguage}→${targetLanguage}] ${text}` };
    },
  };
  assert.equal(await canTranslateOnDevice('en', 'ru'), true);
  assert.equal(await translateOnDevice('Jesus wept.', { from: 'en', to: 'ru', onProgress: (f) => (progress = f) }), '[en→ru] Jesus wept.');
  assert.equal(progress, 0.5);
});

test('a stalled browser translator times out instead of hanging', async () => {
  const saved = { ...TIMEOUTS };
  Object.assign(TIMEOUTS, { availability: 30, stalledDownload: 30, translate: 30 });
  try {
    const never = () => new Promise(() => {});
    globalThis.Translator = { availability: never, create: never };
    assert.equal(await canTranslateOnDevice('en', 'ru'), false, 'availability never answers');

    globalThis.Translator = { availability: async () => 'downloadable', create: never };
    await assert.rejects(translateOnDevice('x', { from: 'en', to: 'de' }), /timed out \(download\)/);

    globalThis.Translator = { availability: async () => 'available', create: async () => ({ translate: never }) };
    await assert.rejects(translateOnDevice('x', { from: 'en', to: 'fr' }), /timed out \(translate\)/);
  } finally {
    Object.assign(TIMEOUTS, saved);
  }
});
