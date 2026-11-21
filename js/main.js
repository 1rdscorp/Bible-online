/**
 * App entry point. Wires the router to the views, decides which
 * translation(s) to show, handles keyboard navigation, and remembers the last
 * chapter read.
 *
 * Views don't load data or touch storage; this file does that and hands them
 * what they need. New features (search, notes…) can then be added as new
 * routes and views without reworking existing ones.
 */
import { adjacentChapter, getBook, isValidChapter } from './canon.js';
import { bookName, chapterTitle, getLanguage, localizeTranslation, resolveLanguage, setLanguage, t } from './i18n.js';
import { getDefaultTranslationId, getProvider, listTranslations } from './providers/registry.js';
import { translationCache } from './providers/translation-cache.js';
import { bookHref, chapterHref, navigate, replaceHash, startRouter } from './router.js';
import { loadSettings, onSettingsChange, updateSettings } from './settings.js';
import { storage } from './storage.js';
import {
  loadPrefs,
  parseSelection,
  prefsWithSelection,
  savePrefs,
  selectionFromPrefs,
  selectionQuery,
  startComparing,
  stopComparing,
} from './translations.js';
import { initHeader } from './ui/header.js';
import { initLanguageSwitch } from './ui/language-switch.js';
import { initSelectionTranslate } from './ui/selection-translate.js';
import { initSettingsPanel } from './ui/settings-panel.js';
import { initTranslationControl } from './ui/translation-control.js';
import { renderMessage } from './views/message.js';
import { renderBookList, renderChapterGrid } from './views/picker.js';
import { createReaderView } from './views/reader.js';
import { renderTranslationsPage } from './views/translations.js';

const LAST_READ_KEY = 'lastRead';

const main = document.getElementById('main');
const appStatus = document.getElementById('app-status');
let header;
let translationControl;
let selectionTranslate;
let currentRoute = null;

// Incremented on every navigation. Async work (loading a chapter) checks it
// before painting, so a slow response never overwrites a newer page.
let navigationId = 0;

// The chapter on screen: { book, chapter, verse, ids, view }.
let reader = null;

// Set just before a translation change, so the next render can put the reader
// back exactly where they were.
let pendingAnchor = null;
let pendingFocusKey = null;

/* ---------------------------------------------------------------------- */
/* Translations                                                            */
/* ---------------------------------------------------------------------- */

async function translationState() {
  const [all, defaultId] = await Promise.all([listTranslations(), getDefaultTranslationId()]);
  const knownIds = all.map((info) => info.id);
  // Names, descriptions and licences in the interface language.
  const translations = all.map(localizeTranslation);
  return { translations, knownIds, prefs: await loadPrefs(knownIds, defaultId) };
}

/** Load one chapter from each column's provider; one failure doesn't sink the rest. */
function loadColumns(columns, bookId, chapter) {
  return Promise.all(
    columns.map(async (info) => {
      try {
        const provider = await getProvider(info.id);
        return { info, chapter: await provider.getChapter(bookId, chapter), error: null };
      } catch (error) {
        console.error(error);
        return { info, chapter: null, error };
      }
    }),
  );
}

/** Show different translations of the chapter on screen (dropdown, Compare, columns). */
function changeTranslations(ids, focusKey = null) {
  if (currentRoute?.view !== 'reader' || ids.length === 0) return;
  const { book, chapter, verse } = currentRoute;
  const href = chapterHref(book, chapter, verse, selectionQuery(ids));
  if (href === window.location.hash) return;
  pendingAnchor = captureAnchor();
  pendingFocusKey = focusKey;
  // A real navigation, not a replace: Back undoes a translation change.
  navigate(href);
}

async function toggleCompare() {
  if (currentRoute?.view !== 'reader') return;
  const { knownIds, prefs } = await translationState();
  const ids = currentRoute.ids;
  changeTranslations(ids.length > 1 ? stopComparing(ids) : startComparing(ids, prefs, knownIds), 'compare-toggle');
}

/* ---------------------------------------------------------------------- */
/* Keeping the reader's place across a translation change                  */
/* ---------------------------------------------------------------------- */

/** The first verse visible under the header, and where it sits on screen. */
function captureAnchor() {
  if (window.scrollY < 1) return null; // at the top: nothing to preserve
  const covered = header.coveredHeight();
  for (const node of main.querySelectorAll('[data-verse]')) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > covered + 4) return { verse: node.dataset.verse, offset: rect.top };
  }
  return null;
}

/** Scroll so that verse is back at the same height on screen. */
function restoreAnchor(anchor) {
  if (!anchor) return;
  const node = main.querySelector(`[data-verse="${anchor.verse}"]`);
  if (node) window.scrollBy(0, node.getBoundingClientRect().top - anchor.offset);
}

/** Put focus back on the control the user was using (it was re-rendered). */
function restoreFocus(focusKey, view) {
  if (!focusKey) return;
  const target = document.querySelector(`[data-focus-key="${focusKey}"]`) ?? view.heading;
  target.focus({ preventScroll: true });
}

/** Show a small "Loading…" toast, but only if loading is actually slow. */
function showStatusSoon(message, delay = 300) {
  const timer = setTimeout(() => {
    appStatus.textContent = message;
    appStatus.classList.add('is-visible');
  }, delay);
  return () => {
    clearTimeout(timer);
    appStatus.classList.remove('is-visible');
    appStatus.textContent = '';
  };
}

/**
 * For "translate selection": the same verses in a Russian Bible translation
 * (the first one listed, normally the Synodal), unless one is already a
 * column on screen. Downloads that translation on first use.
 */
async function getRussianVerses(book, chapter, verses, shownIds) {
  const info = (await listTranslations()).find((entry) => entry.language === 'ru' && !shownIds.includes(entry.id));
  if (!info) return null;
  const data = await (await getProvider(info.id)).getChapter(book.id, chapter);
  return { info: localizeTranslation(info), verses: (data?.verses ?? []).filter((v) => verses.includes(v.number)) };
}

/* ---------------------------------------------------------------------- */
/* Last chapter read                                                       */
/* ---------------------------------------------------------------------- */

async function getLastRead() {
  const saved = await storage.get(LAST_READ_KEY, null);
  const book = saved && getBook(saved.bookId);
  return book && isValidChapter(book, saved.chapter) ? { book, chapter: saved.chapter } : null;
}

function saveLastRead(book, chapter) {
  storage.set(LAST_READ_KEY, { bookId: book.id, chapter });
}

/* ---------------------------------------------------------------------- */
/* Routing                                                                 */
/* ---------------------------------------------------------------------- */

/**
 * Show `route`. With `rerender` (the interface language changed), the page is
 * rebuilt in place: no scrolling to the top, and focus stays where it is.
 */
async function handleRoute(route, { rerender = false } = {}) {
  const id = ++navigationId;
  const isCurrent = () => id === navigationId;
  currentRoute = route;
  // "Translate selection" works on the chapter on screen; showReader sets it again.
  selectionTranslate.setContext(null);

  switch (route.view) {
    case 'start': {
      // A visit with no hash: resume where the reader left off.
      const last = await getLastRead();
      if (isCurrent()) navigate(last ? chapterHref(last.book, last.chapter) : '#/', { replace: true });
      return;
    }
    case 'books': {
      const lastRead = await getLastRead();
      if (isCurrent()) mount(renderBookList({ lastRead }), { title: null, preserve: rerender });
      return;
    }
    case 'chapters': {
      const lastRead = await getLastRead();
      if (isCurrent()) mount(renderChapterGrid(route.book, { lastRead }), { title: bookName(route.book), preserve: rerender });
      return;
    }
    case 'reader':
      return showReader(route, isCurrent);
    case 'translations':
      return showTranslationsPage(isCurrent, rerender);
    default:
      return showNotFound(route, rerender);
  }
}

async function showReader(route, isCurrent) {
  const { book, chapter, verse } = route;
  const title = chapterTitle(book, chapter);

  let state;
  try {
    state = await translationState();
  } catch (error) {
    if (isCurrent()) showLoadFailure(error);
    return;
  }
  if (!isCurrent()) return;
  const { translations, knownIds, prefs } = state;

  // ?t= in the URL wins; otherwise the translations last used. The URL is
  // then rewritten to name them, so the address bar is always an exact link
  // to what's on screen.
  let ids = parseSelection(route.params.t, knownIds);
  if (ids.length === 0) ids = selectionFromPrefs(prefs);
  const query = selectionQuery(ids);
  const href = chapterHref(book, chapter, verse, query);
  if (window.location.hash !== href) replaceHash(href);
  currentRoute = { ...route, params: { ...route.params, t: ids.join(',') }, ids };
  savePrefs(prefsWithSelection(prefs, ids));

  const columns = ids.map((id) => translations.find((t) => t.id === id));
  translationControl.update({ translations, ids });
  const createView = () =>
    createReaderView({
      book,
      chapter,
      columns,
      translations,
      query,
      onColumnsChange: changeTranslations,
      onRetry: () => handleRoute(currentRoute),
    });

  const finish = (view, results) => {
    reader = { book, chapter, verse, ids, view };
    selectionTranslate.setContext({ book, chapter, shownIds: ids });
    document.title = `${title} (${columns.map((c) => c.abbreviation).join(', ')}) · ${t('app.name')}`;
    if (results.some((r) => r.chapter)) saveLastRead(book, chapter);
  };

  const sameChapter =
    reader && reader.book === book && reader.chapter === chapter && reader.verse === verse && main.contains(reader.view.element);

  if (sameChapter) {
    // Changing translations on the page being read. Keep the current text on
    // screen (dimmed) until the new text is ready, then swap it in without
    // moving the reader's place or their keyboard focus.
    const anchor = pendingAnchor ?? captureAnchor();
    const focusKey = pendingFocusKey ?? document.activeElement?.dataset?.focusKey ?? null;
    pendingAnchor = pendingFocusKey = null;
    reader.view.setBusy(true);
    const stopStatus = showStatusSoon(t('status.loading', { names: columns.map((c) => c.name).join(', ') }));
    const results = await loadColumns(columns, book.id, chapter);
    stopStatus();
    if (!isCurrent()) return;

    const view = createView();
    view.show(results, { verse });
    main.replaceChildren(view.element);
    header.setLocation({ book, chapter }); // its text follows the interface language
    restoreAnchor(anchor);
    restoreFocus(focusKey, view);
    header.reveal();
    finish(view, results);
    return;
  }

  pendingAnchor = pendingFocusKey = null;
  const view = createView();
  mount(view.element, { title, location: { book, chapter } });
  const results = await loadColumns(columns, book.id, chapter);
  if (!isCurrent()) return;

  const target = view.show(results, { verse });
  if (target) {
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
    // This jump is a scroll down, which would hide the header. Keep it
    // visible so someone opening a shared link can see where they are.
    header.reveal();
  }
  finish(view, results);
}

async function showTranslationsPage(isCurrent, rerender = false) {
  try {
    const [all, lastRead] = await Promise.all([listTranslations(), getLastRead()]);
    const translations = all.map(localizeTranslation);
    const saved = await Promise.all(translations.map((info) => translationCache.has(info.url, info.version)));
    if (!isCurrent()) return;
    const savedIds = translations.filter((_, i) => saved[i]).map((info) => info.id);
    mount(renderTranslationsPage({ translations, savedIds, lastRead }), { title: t('title.translations'), preserve: rerender });
  } catch (error) {
    if (isCurrent()) showLoadFailure(error);
  }
}

function showNotFound(route, rerender = false) {
  if (route.reason === 'chapter') {
    const name = bookName(route.book);
    mount(
      renderMessage({
        title: t('notFound.chapterTitle'),
        text: t('notFound.chapterText', { book: name, n: route.book.chapters }),
        links: [{ href: bookHref(route.book), label: t('notFound.chooseIn', { book: name }) }],
      }),
      { title: t('title.notFound'), preserve: rerender },
    );
    return;
  }
  mount(
    renderMessage({
      title: t('notFound.bookTitle'),
      text: t('notFound.bookText', { query: route.query }),
      links: [{ href: '#/', label: t('notFound.browse') }],
    }),
    { title: t('title.notFound'), preserve: rerender },
  );
}

/** The list of translations itself couldn't be loaded (e.g. offline on a first visit). */
function showLoadFailure(error) {
  console.error(error);
  mount(
    renderMessage({
      title: t('error.translations'),
      text: error?.message ?? String(error),
      actions: [{ label: t('action.retry'), onClick: () => handleRoute(currentRoute) }],
      links: [{ href: '#/', label: t('notFound.browse') }],
    }),
    { title: t('title.error') },
  );
}

/**
 * Swap in a new page. Scroll to the top, then move focus to its heading so
 * screen-reader users hear where they've arrived (as on a full page load).
 * `preserve` (a language change) keeps the scroll position and focus instead.
 */
function mount(node, { title, location = null, preserve = false }) {
  const scrollY = window.scrollY;
  main.replaceChildren(node);
  document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  header.setLocation(location);
  if (preserve) {
    window.scrollTo(0, scrollY);
    return;
  }
  header.reveal();
  window.scrollTo(0, 0);
  node.querySelector('h1')?.focus({ preventScroll: true });
}

/* ---------------------------------------------------------------------- */
/* Keyboard: ← / → change chapter                                          */
/* ---------------------------------------------------------------------- */

function isTypingTarget(target) {
  return target instanceof Element && (target.isContentEditable || Boolean(target.closest('input, textarea, select')));
}

function onKeydown(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  // Leave browser shortcuts alone (Alt+← is "Back") and form controls (the
  // translation dropdowns and theme buttons use arrow keys). Ignore
  // auto-repeat, so holding a key doesn't race through dozens of chapters.
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (currentRoute?.view !== 'reader' || !currentRoute.ids || isTypingTarget(event.target)) return;

  const target = adjacentChapter(currentRoute.book, currentRoute.chapter, event.key === 'ArrowRight' ? 1 : -1);
  if (!target) return;
  event.preventDefault();
  navigate(chapterHref(target.book, target.chapter, null, selectionQuery(currentRoute.ids)));
}

/* ---------------------------------------------------------------------- */
/* Start-up                                                                */
/* ---------------------------------------------------------------------- */

async function boot() {
  const settings = await loadSettings();
  setLanguage(resolveLanguage(settings.language));

  const settingsPanel = initSettingsPanel({
    button: document.getElementById('settings-button'),
    panel: document.getElementById('settings-panel'),
  });
  header = initHeader(document.getElementById('app-header'), { isPinned: settingsPanel.isOpen });
  selectionTranslate = initSelectionTranslate({ root: main, getRussianVerses });
  translationControl = initTranslationControl(document.getElementById('translation-control'), {
    onSelect: (id) => changeTranslations([id], 'header-translation'),
    onToggleCompare: toggleCompare,
  });

  // RUS | ENG: save the choice; the settings listener below applies it.
  const languageSwitch = initLanguageSwitch(document.getElementById('lang-switch'), {
    onChange: (id) => updateSettings({ language: id }),
  });
  languageSwitch.update(getLanguage());
  onSettingsChange((next) => {
    const language = resolveLanguage(next.language);
    if (language === getLanguage()) return;
    setLanguage(language);
    languageSwitch.update(language);
    if (currentRoute) handleRoute(currentRoute, { rerender: true });
  });

  // The skip link targets "#main", which would clash with hash routing, so
  // it moves focus in script instead of changing the URL.
  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    (main.querySelector('h1') ?? main).focus();
  });

  // Each chapter is a fresh page. Stop the browser from restoring a scroll
  // position that belonged to different content.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  document.addEventListener('keydown', onKeydown);

  // Start downloading the translations the reader used last, in the
  // background, so the first chapter opens quickly even when they begin on the
  // book list. Others load only when chosen. Errors surface when a chapter
  // is opened.
  translationState()
    .then(({ prefs }) => Promise.all(selectionFromPrefs(prefs).map((id) => getProvider(id).then((p) => p.load?.()))))
    .catch(() => {});

  startRouter(handleRoute);
}

boot();
