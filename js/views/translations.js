/**
 * #/translations: what each translation is, its copyright/licence, where the
 * text comes from, and whether it's already stored on this device.
 */
import { getBook } from '../canon.js';
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { chapterHref } from '../router.js';
import { el } from '../ui/dom.js';

/** "English" / "Английский": a language's name in the interface language. */
function languageName(code) {
  try {
    const name = new Intl.DisplayNames([getLanguage()], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(getLanguage()) + name.slice(1);
  } catch {
    return code; // no Intl.DisplayNames, or not a valid language code
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
          t('translations.back', { title: chapterTitle(lastRead.book, lastRead.chapter) }),
        ),
      ),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('translations.title')),
    el('p', { class: 'page-intro' }, t('translations.intro')),
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
    // A translation can name its language itself ("languageName"), for codes
    // browsers may not know (Ancient Greek, "grc").
    el('p', { class: 'translation-meta' }, [info.languageName ?? languageName(info.language), info.year, info.license].filter(Boolean).join(' · ')),
    info.description && el('p', { class: 'translation-description' }, info.description),
    el(
      'dl',
      { class: 'translation-details' },
      el('div', {}, el('dt', {}, t('translations.copyright')), el('dd', {}, info.copyright ?? info.license)),
      info.source && el('div', {}, el('dt', {}, t('translations.source')), el('dd', {}, el('a', { href: info.source.url }, info.source.name))),
      el('div', {}, el('dt', {}, t('translations.device')), el('dd', {}, t(saved ? 'translations.downloaded' : 'translations.notDownloaded'))),
    ),
    el(
      'p',
      { class: 'translation-actions' },
      el(
        'a',
        { class: 'button', href: chapterHref(target.book, target.chapter, null, `t=${info.id}`) },
        t('translations.read', { title: chapterTitle(target.book, target.chapter), abbr: info.abbreviation }),
      ),
    ),
  );
}
