/**
 * #/translations: what each translation is, its copyright/licence, where the
 * text comes from, and whether it's already stored on this device.
 */
import { chapterTitle, getBook } from '../canon.js';
import { chapterHref } from '../router.js';
import { el } from '../ui/dom.js';

const languageNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;

function languageName(code) {
  try {
    return languageNames?.of(code) ?? code;
  } catch {
    return code; // not a valid language code
  }
}

/**
 * @param {object} options
 * @param {object[]} options.translations  TranslationInfo list
 * @param {string[]} [options.savedIds]    translations already stored on the device
 * @param {{book, chapter}|null} [options.lastRead]
 */
export function renderTranslationsPage({ translations, savedIds = [], lastRead = null }) {
  // Each card links to a chapter in that translation: where the reader left
  // off, or John 1 for a first visit.
  const target = lastRead ?? { book: getBook('JHN'), chapter: 1 };
  return el(
    'section',
    { class: 'page', 'aria-labelledby': 'view-title' },
    lastRead &&
      el(
        'p',
        { class: 'back' },
        el(
          'a',
          { class: 'back-link', href: chapterHref(lastRead.book, lastRead.chapter) },
          el('span', { 'aria-hidden': 'true' }, '←'),
          `Back to ${chapterTitle(lastRead.book, lastRead.chapter)}`,
        ),
      ),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, 'Translations'),
    el(
      'p',
      { class: 'page-intro' },
      'Every translation here is in the public domain. Each one downloads the first time you open it ' +
        '(1.2–1.4 MB) and is then kept on this device, so it opens instantly next time.',
    ),
    el(
      'ul',
      { class: 'translation-list', role: 'list' },
      translations.map((info) => el('li', {}, card(info, savedIds.includes(info.id), target))),
    ),
  );
}

function card(info, saved, target) {
  const headingId = `translation-${info.id}`;
  return el(
    'article',
    { class: 'translation-card', 'aria-labelledby': headingId },
    el('h2', { class: 'translation-name', id: headingId }, info.name, ' ', el('span', { class: 'translation-abbr' }, `(${info.abbreviation})`)),
    el('p', { class: 'translation-meta' }, [languageName(info.language), info.year, info.license].filter(Boolean).join(' · ')),
    info.description && el('p', { class: 'translation-description' }, info.description),
    el(
      'dl',
      { class: 'translation-details' },
      el('div', {}, el('dt', {}, 'Copyright'), el('dd', {}, info.copyright ?? info.license)),
      info.source && el('div', {}, el('dt', {}, 'Text source'), el('dd', {}, el('a', { href: info.source.url }, info.source.name))),
      el('div', {}, el('dt', {}, 'On this device'), el('dd', {}, saved ? 'Downloaded' : 'Not downloaded yet')),
    ),
    el(
      'p',
      { class: 'translation-actions' },
      el(
        'a',
        { class: 'button', href: chapterHref(target.book, target.chapter, null, `t=${info.id}`) },
        `Read ${chapterTitle(target.book, target.chapter)} in ${info.abbreviation}`,
      ),
    ),
  );
}
