import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { copyText } from '../js/translate/clipboard.js';
import { canTranslateOnDevice, TIMEOUTS, translatableLanguage, translateOnDevice, yandexTranslateUrl } from '../js/translate/machine.js';
import { cleanSelection, toMonotonic, truncate, verseRangeLabel } from '../js/translate/text.js';

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

test('Yandex Translate link carries the text and languages', () => {
  const url = new URL(yandexTranslateUrl('For God so loved the world', 'en', 'ru'));
  assert.equal(url.origin, 'https://translate.yandex.com');
  assert.equal(url.searchParams.get('source_lang'), 'en');
  assert.equal(url.searchParams.get('target_lang'), 'ru');
  assert.equal(url.searchParams.get('text'), 'For God so loved the world');
  assert.match(url.search, /text=For%20God%20so/, 'spaces as %20');
  assert.equal(new URL(yandexTranslateUrl('x', 'en', 'ru', { interfaceLanguage: 'ru' })).origin, 'https://translate.yandex.ru');
  assert.equal(new URL(yandexTranslateUrl('x'.repeat(5000), 'en', 'ru')).searchParams.get('text').length, 2000);
  assert.equal(new URL(yandexTranslateUrl('a & b #c', 'en', 'ru')).searchParams.get('text'), 'a & b #c', 'special characters survive');
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

test('Septuagint Greek is spelled the modern way for machine translators', () => {
  assert.equal(toMonotonic('ἘΝ ἀρχῇ ἐποίησεν ὁ Θεὸς τὸν οὐρανὸν καὶ τὴν γῆν.'), 'ΕΝ αρχή εποίησεν ο Θεός τον ουρανόν και την γην.');
  assert.equal(toMonotonic('Καὶ εἶπεν ὁ Θεός, γενηθήτω φῶς· καὶ ἐγένετο φῶς.'), 'Και είπεν ο Θεός, γενηθήτω φως; και εγένετο φως.');
  assert.equal(toMonotonic('ἰδοὺ ἡ παρθένος ἐν γαστρὶ λήψεται'), 'ιδού η παρθένος εν γαστρί λήψεται');
  assert.equal(toMonotonic('Ἀλληλούϊα'), 'Αλληλούϊα', 'the diaeresis stays (modern Greek uses it)');
  assert.equal(toMonotonic('μετʼ αὐτοῦ'), 'μετ’ αυτού');
  assert.equal(toMonotonic('For God'), 'For God', 'other scripts untouched');
});

test('English and the Septuagint’s Greek can be translated; other languages can’t', () => {
  assert.equal(translatableLanguage('en'), 'en');
  assert.equal(translatableLanguage('en-GB'), 'en');
  assert.equal(translatableLanguage('grc'), 'grc');
  assert.equal(translatableLanguage('ru'), null, 'already Russian');
  assert.equal(translatableLanguage(undefined), null);
});
