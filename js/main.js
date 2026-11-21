/**
 * App entry point. Wires the router to the views, decides which
 * translation(s) to show, handles keyboard navigation, and remembers the last
 * chapter read.
 *
 * Views don't load data or touch storage; this file does that and hands them
 * what they need. New features (search, notes…) can then be added as new
 * routes and views without reworking existing ones.
 */
import { adjacentChapter, chapterTitle, getBook, isValidChapter } from './canon.js';
import { getDefaultTranslationId, getProvider, listTranslations } from './providers/registry.js';
import { translationCache } from './providers/translation-cache.js';
import { bookHref, chapterHref, navigate, replaceHash, startRouter } from './router.js';
import { loadSettings } from './settings.js';
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
import { initSettingsPanel } from './ui/settings-panel.js';
import { initTranslationControl } from './ui/translation-control.js';
import { renderMessage } from './views/message.js';
import { renderBookList, renderChapterGrid } from './views/picker.js';
import { createReaderView } from './views/reader.js';
import { renderTranslationsPage } from './views/translations.js';

const APP_NAME = 'Bible Online';
const LAST_READ_KEY = 'lastRead';

const main = document.getElementById('main');
const appStatus = document.getElementById('app-status');
let header;
let translationControl;
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
  const [translations, defaultId] = await Promise.all([listTranslations(), getDefaultTranslationId()]);
  const knownIds = translations.map((t) => t.id);
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

async function handleRoute(route) {
  const id = ++navigationId;
  const isCurrent = () => id === navigationId;
  currentRoute = route;

  switch (route.view) {
    case 'start': {
      // A visit with no hash: resume where the reader left off.
      const last = await getLastRead();
      if (isCurrent()) navigate(last ? chapterHref(last.book, last.chapter) : '#/', { replace: true });
      return;
    }
    case 'books': {
      const lastRead = await getLastRead();
      if (isCurrent()) mount(renderBookList({ lastRead }), { title: null });
      return;
    }
    case 'chapters': {
      const lastRead = await getLastRead();
      if (isCurrent()) mount(renderChapterGrid(route.book, { lastRead }), { title: route.book.name });
      return;
    }
    case 'reader':
      return showReader(route, isCurrent);
    case 'translations':
      return showTranslationsPage(isCurrent);
    default:
      return showNotFound(route);
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
    document.title = `${title} (${columns.map((c) => c.abbreviation).join(', ')}) · ${APP_NAME}`;
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
    const stopStatus = showStatusSoon(`Loading ${columns.map((c) => c.name).join(', ')}…`);
    const results = await loadColumns(columns, book.id, chapter);
    stopStatus();
    if (!isCurrent()) return;

    const view = createView();
    view.show(results, { verse });
    main.replaceChildren(view.element);
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

async function showTranslationsPage(isCurrent) {
  try {
    const [translations, lastRead] = await Promise.all([listTranslations(), getLastRead()]);
    const saved = await Promise.all(translations.map((t) => translationCache.has(t.url, t.version)));
    if (!isCurrent()) return;
    const savedIds = translations.filter((_, i) => saved[i]).map((t) => t.id);
    mount(renderTranslationsPage({ translations, savedIds, lastRead }), { title: 'Translations' });
  } catch (error) {
    if (isCurrent()) showLoadFailure(error);
  }
}

function showNotFound(route) {
  if (route.reason === 'chapter') {
    const { book } = route;
    mount(
      renderMessage({
        title: 'Chapter not found',
        text: `${book.name} has ${book.chapters} chapter${book.chapters === 1 ? '' : 's'}.`,
        links: [{ href: bookHref(book), label: `Choose a chapter in ${book.name}` }],
      }),
      { title: 'Not found' },
    );
    return;
  }
  mount(
    renderMessage({
      title: 'Book not found',
      text: `There’s no book called “${route.query}”.`,
      links: [{ href: '#/', label: 'Browse all books' }],
    }),
    { title: 'Not found' },
  );
}

/** The list of translations itself couldn't be loaded (e.g. offline on a first visit). */
function showLoadFailure(error) {
  console.error(error);
  mount(
    renderMessage({
      title: 'Couldn’t load the translations',
      text: error?.message ?? String(error),
      actions: [{ label: 'Try again', onClick: () => handleRoute(currentRoute) }],
      links: [{ href: '#/', label: 'Browse all books' }],
    }),
    { title: 'Error' },
  );
}

/**
 * Swap in a new page. Scroll to the top, then move focus to its heading so
 * screen-reader users hear where they've arrived (as on a full page load).
 */
function mount(node, { title, location = null }) {
  main.replaceChildren(node);
  document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  header.setLocation(location);
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
  await loadSettings();

  const settingsPanel = initSettingsPanel({
    button: document.getElementById('settings-button'),
    panel: document.getElementById('settings-panel'),
  });
  header = initHeader(document.getElementById('app-header'), { isPinned: settingsPanel.isOpen });
  translationControl = initTranslationControl(document.getElementById('translation-control'), {
    onSelect: (id) => changeTranslations([id], 'header-translation'),
    onToggleCompare: toggleCompare,
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
