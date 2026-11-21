import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { BOOKS, getBook } from '../js/canon.js';
import { bookName, chapterTitle, getLanguage, LANGUAGES, localizeTranslation, resolveLanguage, setLanguage, t } from '../js/i18n.js';
import en from '../js/locales/en.js';
import ru from '../js/locales/ru.js';

afterEach(() => setLanguage('en'));

const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const forms = (entry) => (typeof entry === 'object' ? Object.values(entry) : [entry]);

test('English and Russian have exactly the same keys', () => {
  assert.deepEqual(Object.keys(ru.strings).sort(), Object.keys(en.strings).sort());
});

test('every Russian string uses the same placeholders as the English one', () => {
  for (const [key, english] of Object.entries(en.strings)) {
    const expected = placeholders(forms(english)[0]);
    for (const form of [...forms(english), ...forms(ru.strings[key])]) {
      assert.deepEqual(placeholders(form), expected, `${key}: "${form}"`);
    }
  }
});

test('Russian plural entries cover one/few/many/other', () => {
  for (const [key, entry] of Object.entries(ru.strings)) {
    if (typeof entry === 'object') assert.deepEqual(Object.keys(entry).sort(), ['few', 'many', 'one', 'other'], key);
  }
});

test('all 66 books have Russian names', () => {
  assert.deepEqual(Object.keys(ru.books).sort(), BOOKS.map((b) => b.id).sort());
  assert.ok(Object.values(ru.books).every((name) => /^[0-9 А-Яа-яЁё]+$/.test(name)));
});

test('t() fills placeholders and picks Russian plural forms', () => {
  assert.equal(t('chapters.choose', { n: 21 }), 'Choose a chapter (21)');
  assert.equal(t('notFound.chapterText', { book: 'Jude', n: 1 }), 'Jude has 1 chapter.');
  assert.equal(t('notFound.chapterText', { book: 'John', n: 21 }), 'John has 21 chapters.');
  setLanguage('ru');
  assert.equal(getLanguage(), 'ru');
  assert.equal(t('books.title'), 'Книги Библии');
  const chapters = (n) => t('notFound.chapterText', { book: 'X', n });
  assert.equal(chapters(1), 'В книге «X» 1 глава.');
  assert.equal(chapters(21), 'В книге «X» 21 глава.');
  assert.equal(chapters(3), 'В книге «X» 3 главы.');
  assert.equal(chapters(5), 'В книге «X» 5 глав.');
  assert.equal(chapters(11), 'В книге «X» 11 глав.');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('book names and chapter titles follow the interface language', () => {
  assert.equal(chapterTitle(getBook('JHN'), 3), 'John 3');
  assert.equal(chapterTitle(getBook('PSA'), 23), 'Psalm 23');
  setLanguage('ru');
  assert.equal(chapterTitle(getBook('JHN'), 3), 'От Иоанна 3');
  assert.equal(chapterTitle(getBook('PSA'), 23), 'Псалом 23');
  assert.equal(bookName(getBook('PSA')), 'Псалтирь');
  assert.equal(bookName(getBook('1SA')), '1 Царств');
  assert.equal(bookName(getBook('1KI')), '3 Царств', 'Synodal tradition: Kings are 3–4 Kingdoms');
});

test('the language comes from the saved choice, else the browser, else English', () => {
  assert.equal(resolveLanguage('ru', ['en-US']), 'ru');
  assert.equal(resolveLanguage(null, ['ru-RU', 'en']), 'ru');
  assert.equal(resolveLanguage(null, ['uk-UA', 'ru']), 'ru', 'first supported language in the list');
  assert.equal(resolveLanguage(null, ['de-DE']), 'en');
  assert.equal(resolveLanguage('xx', []), 'en');
  assert.deepEqual(
    LANGUAGES.map((l) => l.label),
    ['RUS', 'ENG'],
  );
});

test('translation metadata is localized from its i18n block', () => {
  const info = {
    id: 'rst',
    name: 'Russian Synodal Translation',
    license: 'Public domain',
    numbering: { name: 'Synodal numbering', psalm: 'Псалом', psalms: 'Псалмы' },
    i18n: { ru: { name: 'Синодальный перевод', license: 'Общественное достояние', numbering: { name: 'Синодальная нумерация' } } },
  };
  assert.equal(localizeTranslation(info), info, 'English: unchanged');
  setLanguage('ru');
  const local = localizeTranslation(info);
  assert.equal(local.name, 'Синодальный перевод');
  assert.equal(local.license, 'Общественное достояние');
  assert.deepEqual(local.numbering, { name: 'Синодальная нумерация', psalm: 'Псалом', psalms: 'Псалмы' });
  assert.equal(localizeTranslation({ id: 'x', name: 'X' }).name, 'X', 'no i18n block: unchanged');
});
