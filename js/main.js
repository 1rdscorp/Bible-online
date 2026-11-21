/**
 * App entry point. Wires the router to the views, handles keyboard
 * navigation, and remembers the last chapter read.
 *
 * Views don't load data or touch storage; this file does that and hands them
 * what they need. New features (search, notes, compare…) can then be added as
 * new routes and views without reworking existing ones.
 */
import { adjacentChapter, chapterTitle, getBook, isValidChapter } from './canon.js';
import { getDefaultTranslationId, getProvider } from './providers/registry.js';
import { bookHref, chapterHref, navigate, startRouter } from './router.js';
import { loadSettings } from './settings.js';
import { storage } from './storage.js';
import { initHeader } from './ui/header.js';
import { initSettingsPanel } from './ui/settings-panel.js';
import { renderMessage } from './views/message.js';
import { renderBookList, renderChapterGrid } from './views/picker.js';
import { createReaderView } from './views/reader.js';

const APP_NAME = 'Bible Online';
const LAST_READ_KEY = 'lastRead';

const main = document.getElementById('main');
let header;
let currentRoute = null;

// Incremented on every navigation. Async work (loading a chapter) checks it
// before painting, so a slow response never overwrites a newer page.
let navigationId = 0;

/* ---------------------------------------------------------------------- */
/* Translation                                                             */
/* Stage 1 always reads the default translation from data/translations.json.
   A later stage can choose it from settings or a ?t= URL parameter here.  */
/* ---------------------------------------------------------------------- */

let providerPromise = null;
function currentProvider() {
  if (!providerPromise) {
    providerPromise = getDefaultTranslationId().then(getProvider);
    providerPromise.catch(() => {
      providerPromise = null; // let "Try again" start over after a failure
    });
  }
  return providerPromise;
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
      return showChapter(route, isCurrent);
    default:
      return showNotFound(route);
  }
}

async function showChapter(route, isCurrent) {
  const { book, chapter, verse } = route;
  const title = chapterTitle(book, chapter);
  const view = createReaderView({ book, chapter });
  mount(view.element, { title, location: { book, chapter } });

  try {
    const provider = await currentProvider();
    const data = await provider.getChapter(book.id, chapter);
    if (!isCurrent()) return;

    header.setTranslation(provider.info);
    document.title = `${title} (${provider.info.abbreviation}) · ${APP_NAME}`;

    if (!data) {
      view.showMissing(provider.info);
      return;
    }
    const target = view.showChapter(data, provider.info, { verse });
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.focus({ preventScroll: true });
      // This jump is a scroll down, which would hide the header. Keep it
      // visible so someone opening a shared link can see where they are.
      header.reveal();
    }
    saveLastRead(book, chapter);
  } catch (error) {
    if (!isCurrent()) return;
    console.error(error);
    view.showError(error, () => handleRoute(route));
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
  // theme radio buttons use arrow keys). Ignore auto-repeat, so holding a key
  // doesn't race through dozens of chapters.
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (currentRoute?.view !== 'reader' || isTypingTarget(event.target)) return;

  const target = adjacentChapter(currentRoute.book, currentRoute.chapter, event.key === 'ArrowRight' ? 1 : -1);
  if (!target) return;
  event.preventDefault();
  navigate(chapterHref(target.book, target.chapter));
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

  // Start downloading the translation now, in the background, so the first
  // chapter opens quickly even if the reader begins on the book list. Errors
  // are shown when a chapter is opened.
  currentProvider()
    .then((provider) => provider.load?.())
    .catch(() => {});

  startRouter(handleRoute);
}

boot();
