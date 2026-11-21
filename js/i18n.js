/**
 * Interface language: English or Russian.
 *
 *   t('books.title')                        → "Books of the Bible" / "Книги Библии"
 *   t('chapters.choose', { n: 21 })         → fills {n}
 *   t('notFound.chapterText', { n, book })  → plural form picked by Intl.PluralRules
 *   chapterTitle(book, 3)                   → "John 3" / "От Иоанна 3"
 *
 * Text lives in js/locales/<lang>.js. Static text in index.html is marked
 * with data-i18n="key" (text) or data-i18n-attr="aria-label:key" (attributes)
 * and filled by applyStatic(). Translation names and descriptions come from
 * data/translations.json ("i18n" per entry), via localizeTranslation().
 *
 * Only the interface changes language. Bible text is in its translation's own
 * language, URLs stay the same (#/john/3), and verse numbers stay English.
 * Adding a language = a new file in js/locales/ plus an entry in LANGUAGES.
 */
import en from './locales/en.js';
import ru from './locales/ru.js';

/** Languages offered by the RUS / ENG switch, in display order. */
export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'ru', label: 'RUS', name: 'Русский' }),
  Object.freeze({ id: 'en', label: 'ENG', name: 'English' }),
]);

const LOCALES = { en, ru };
let current = 'en';
const pluralRules = new Map();

/**
 * The language to use: the saved choice if there is one, otherwise the
 * first supported language in the browser's list, otherwise English.
 */
export function resolveLanguage(saved, preferred = globalThis.navigator?.languages ?? []) {
  if (LOCALES[saved]) return saved;
  for (const tag of preferred) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LOCALES[base]) return base;
  }
  return 'en';
}

export function getLanguage() {
  return current;
}

/** Switch language and update <html lang> and the static text in the page. */
export function setLanguage(id) {
  current = LOCALES[id] ? id : 'en';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    applyStatic(document);
    // index.html hides marked text until now when it already knows the page
    // isn't English, so English never flashes first.
    document.documentElement.classList.remove('i18n-pending');
  }
}

function pluralCategory(n) {
  if (!pluralRules.has(current)) pluralRules.set(current, new Intl.PluralRules(current));
  return pluralRules.get(current).select(Number(n) || 0);
}

/** Interface text for `key`, with {placeholders} filled from `params`. */
export function t(key, params = {}) {
  let entry = LOCALES[current].strings[key] ?? en.strings[key];
  if (entry === undefined) return key;
  if (typeof entry === 'object') entry = entry[pluralCategory(params.n)] ?? entry.other;
  return entry.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/** A book's name in the interface language ("От Иоанна"). */
export function bookName(book) {
  return LOCALES[current].books[book.id] ?? book.name;
}

/** "John 3" / "От Иоанна 3"; a single Psalm is "Psalm 23" / "Псалом 23". */
export function chapterTitle(book, chapter) {
  const label = book.id === 'PSA' ? LOCALES[current].psalm : bookName(book);
  return `${label} ${chapter}`;
}

export function testamentName(id) {
  return t(`testament.${id}`);
}

/**
 * A translation's metadata in the interface language: fields under
 * info.i18n[<lang>] (name, description, licence…) replace the English ones.
 */
export function localizeTranslation(info) {
  const local = info?.i18n?.[current];
  if (!local) return info;
  return Object.freeze({
    ...info,
    ...local,
    numbering: info.numbering || local.numbering ? { ...info.numbering, ...local.numbering } : undefined,
  });
}

/** Fill the page's static text (data-i18n / data-i18n-attr) in the current language. */
export function applyStatic(root) {
  for (const node of root.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of node.dataset.i18nAttr.split(';')) {
      const [attribute, key] = pair.split(':').map((part) => part.trim());
      if (attribute && key) node.setAttribute(attribute, t(key));
    }
  }
}
