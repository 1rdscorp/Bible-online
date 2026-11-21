import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { copyText } from '../js/translate/clipboard.js';
import { canTranslateOnDevice, TIMEOUTS, translateComUrl, translateOnDevice } from '../js/translate/machine.js';
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

test('Translate.com link goes to its page for the language pair', () => {
  assert.equal(translateComUrl('en', 'ru'), 'https://www.translate.com/english-russian');
  assert.equal(translateComUrl('ru', 'en'), 'https://www.translate.com/russian-english');
  assert.equal(translateComUrl('en', 'xx'), 'https://www.translate.com/', 'unknown pairs: the home page');
  assert.equal(translateComUrl('en', 'en'), 'https://www.translate.com/');
});

test('copying uses the Clipboard API, then the old copy command', async () => {
  let written = null;
  assert.equal(await copyText('Jesus wept.', { clipboard: { writeText: async (text) => (written = text) }, doc: null }), true);
  assert.equal(written, 'Jesus wept.');

  // No Clipboard API (plain http): a hidden text box and execCommand('copy').
  const calls = [];
  const box = { style: {}, setAttribute() {}, select: () => calls.push('select'), remove: () => calls.push('remove') };
  const doc = {
    activeElement: { focus: () => calls.push('refocus') },
    body: { append: () => calls.push('append') },
    createElement: () => box,
    execCommand: (command) => calls.push(command) && true,
  };
  const blocked = { writeText: async () => { throw new Error('denied'); } };
  assert.equal(await copyText('Jesus wept.', { clipboard: blocked, doc }), true);
  assert.equal(box.value, 'Jesus wept.');
  assert.deepEqual(calls, ['append', 'select', 'copy', 'remove', 'refocus']);

  assert.equal(await copyText('x', { clipboard: undefined, doc: null }), false, 'nothing available');
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
