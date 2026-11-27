/**
 * App entry point. Wires the router to the views, decides which
 * translation(s) to show, handles keyboard navigation, and remembers the last
 * chapter read.
 *
 * Views don't load data or touch storage; this file does that and hands them
 * what they need. New features (search, notes…) can then be added as new
 * routes and views without reworking existing ones.
 */
import { adjacentChapter, findBook, getBook, isValidChapter } from './canon.js';
import { bookName, chapterTitle, getLanguage, localizeTranslation, resolveLanguage, setLanguage, t } from './i18n.js';
import { getDefaultTranslationId, getProvider, listTranslations } from './providers/registry.js';
import { translationCache } from './providers/translation-cache.js';
import { bookHref, chapterHref, introHref, mapHref, navigate, pageHref, PAGES, replaceHash, resolveRoute, startRouter, topicHref } from './router.js';
import { createSearchClient, isSearchable } from './search/client.js';
import { ALL_TRANSLATIONS, readSearchParams, searchHref } from './search/params.js';
import { partsFor } from './research/commentary.js';
import { researchData } from './research/data.js';
import { bookOnly, parseReference } from './search/reference.js';
import { parseQuery } from './search/text.js';
import { studyStore } from './study/store.js';
import { chapterKey, dayForChapter, isDayDone, localDate, nextChapter } from './plans/model.js';
import { planStore } from './plans/store.js';
import { getSettings, loadSettings, onSettingsChange, updateSettings } from './settings.js';
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
import { el, icon, ICONS } from './ui/dom.js';
import { initLanguageSwitch } from './ui/language-switch.js';
import { initNotesPanel } from './ui/notes-panel.js';
import { initResearchPanel } from './ui/research-panel.js';
import { initAudioPlayer } from './ui/audio-player.js';
import { initFootnotes } from './ui/footnotes.js';
import { initSelectionTranslate } from './ui/selection-translate.js';
import { initSettingsPanel } from './ui/settings-panel.js';
import { paintStudyMarks } from './ui/study-marks.js';
import { createToaster } from './ui/toast.js';
import { errorText, initOffline } from './offline.js';
import { initTranslationControl } from './ui/translation-control.js';
import { initVerseActions } from './ui/verse-actions.js';
import { renderMessage } from './views/message.js';
import { renderBookList, renderChapterGrid } from './views/picker.js';
import { createReaderView } from './views/reader.js';
import { bookSuggestionLink, createSearchView, summaryText } from './views/search.js';
import { showStudyPage } from './views/study.js';
import { renderBookIntro } from './views/book-intro.js';
import { renderMapPage, renderMapsIndex } from './views/maps.js';
import { renderTimelinePage } from './views/timeline.js';
import { exploreCard, exploreHref, renderExploreIndex, VIEWS as EXPLORE_VIEWS } from './views/explore.js';
import { chapterCommentaryLinks, renderCommentaryLibrary, renderCommentaryPart, renderCommentaryWork, workTitle } from './views/commentary.js';
import { enableJumpLinks } from './views/templates/study-page.js';
import { renderTranslationsPage } from './views/translations.js';
import { planName, renderPlanBar, renderPlanPage, renderPlansList, todaysReadings } from './views/plans.js';
import { renderTopicPage, renderTopicSuggestions, renderTopicsIndex, topicTitle } from './views/topics.js';
import { topicQuery } from './research/topics.js';
import { parseRef, refChapters } from './research/refs.js';

const LAST_READ_KEY = 'lastRead';
const STRONGS_ID = 'kjvs'; // KJV+, opened by "Open in KJV+" in the Research panel
const TIPS_KEY = 'tipsSeen'; // one-time hints the reader has dismissed: { strongs: true }

const main = document.getElementById('main');
const appStatus = document.getElementById('app-status');
let header;
let translationControl;
let selectionTranslate;
let toaster;
let notesPanel;
let researchPanel;
let audioPlayer;
let verseActions;
let currentRoute = null;

// Incremented on every navigation. Async work (loading a chapter) checks it
// before painting, so a slow response never overwrites a newer page.
let navigationId = 0;

// The chapter on screen: { book, chapter, verse, verseEnd, ids, view, paint }.
let reader = null;

// Search: the worker client (started on first use), the page on screen, and
// where the reader was on earlier result pages, so Back returns to the same
// spot: hash → { y, loaded, focusHref }.
const SEARCH_PAGE_SIZE = 100;
let searchClient = null;
let search = null; // { view, hash, params, query, translations }
const searchPlaces = new Map();
let searchClickedHref = null;

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
  const { book, chapter, verse, verseEnd } = currentRoute;
  const href = chapterHref(book, chapter, verse, selectionQuery(ids), verseEnd);
  if (href === window.location.hash) return;
  pendingAnchor = captureAnchor();
  pendingFocusKey = focusKey;
  // A real navigation, not a replace: Back undoes a translation change.
  navigate(href);
}

/**
 * The home page's dropdown: read `id` alone from now on (Compare off), so
 * every book opens in it.
 */
async function selectTranslation(id) {
  if (currentRoute?.view === 'reader') {
    changeTranslations([id], 'header-translation');
    return;
  }
  const { prefs } = await translationState();
  await savePrefs(prefsWithSelection(prefs, [id]));
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

/**
 * Under the chapter text: "Notes (2)" (opens the Notes panel) and "My Study".
 * Quiet UI text, so it doesn't compete with the scripture.
 */
function updateChapterStudyLinks(view, book, chapter) {
  let links = view.element.querySelector('.chapter-study');
  if (!links) {
    links = el('p', { class: 'chapter-study' });
    view.actionsSlot.before(links);
  }
  const count = studyStore.inChapter(book.id, chapter).filter((item) => item.type === 'note').length;
  links.replaceChildren(
    el(
      'button',
      { type: 'button', class: 'text-button', onclick: () => notesPanel.show() },
      icon(ICONS.note, { size: 16 }),
      count ? t('study.chapterNotesCount', { n: count }) : t('study.chapterNotes'),
    ),
    el('a', { class: 'text-button', href: pageHref(PAGES.study) }, icon(ICONS.bookmark, { size: 16 }), t('study.myStudy')),
    el('a', { class: 'text-button', href: introHref(book) }, icon(ICONS.info, { size: 16 }), t('intro.link', { book: bookName(book) })),
  );
}

/**
 * KJV+ on screen for the first time: a one-line hint that its words can be
 * tapped, until the reader dismisses it.
 */
async function showStrongsTip(view, columns) {
  view.element.querySelector('.reader-tip')?.remove();
  if (!columns.some((info) => info.strongs)) return;
  const seen = await storage.get(TIPS_KEY, {});
  if (seen?.strongs || !main.contains(view.element)) return;
  const tip = el(
    'p',
    { class: 'reader-tip' },
    icon(ICONS.info, { size: 16 }),
    el('span', {}, t('reader.strongsTip')),
    el(
      'button',
      {
        type: 'button',
        class: 'text-button',
        onclick: () => {
          storage.set(TIPS_KEY, { ...seen, strongs: true });
          tip.remove();
        },
      },
      t('reader.dismissTip'),
    ),
  );
  view.textRoot.before(tip);
}

/** KJV+'s entry in translations.json (it has Strong's numbers), or null. */
async function strongsTranslation() {
  return (await listTranslations()).find((info) => info.strongs) ?? null;
}

/* ---------------------------------------------------------------------- */
/* Backup: the rest of what's saved on this device                         */
/* ---------------------------------------------------------------------- */

/** For the backup file, besides the study items (js/study/backup.js). */
async function backupData() {
  const { prefs } = await translationState();
  return { settings: getSettings(), translations: prefs, lastRead: await storage.get(LAST_READ_KEY, null), plans: planStore.all() };
}

/**
 * Apply a backup's settings, translation choices and last chapter. Each is
 * cleaned by its own module (settings.js sanitizes, translations.js
 * normalizes on load); an unknown book or chapter is ignored.
 */
async function applyBackupExtras({ settings, translations, lastRead, plans = [], mode = 'merge' }) {
  if (translations) await savePrefs(translations);
  if (plans.length || mode === 'replace') await planStore.importRecords(plans, mode);
  const book = lastRead && getBook(lastRead.bookId);
  if (book && isValidChapter(book, lastRead.chapter)) saveLastRead(book, lastRead.chapter);
  if (settings) updateSettings({ theme: settings.theme, fontScale: settings.fontScale, language: settings.language ?? null });
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
  rememberSearchPlace();
  currentRoute = route;
  for (const [id, view] of [['search-link', 'search'], ['study-link', 'study']]) {
    const link = document.getElementById(id);
    if (route.view === view) link?.setAttribute('aria-current', 'page');
    else link?.removeAttribute('aria-current');
  }
  // Verse actions and "translate" work on the chapter on screen; showReader
  // sets them again. The Notes panel stays open from chapter to chapter.
  selectionTranslate.setContext(null);
  verseActions.setContext(null);
  researchPanel.setContext(null);
  if (route.view !== 'reader') {
    notesPanel.close();
    researchPanel.close();
  }
  if (route.view !== 'maps') {
    mapPage?.destroy();
    mapPage = null;
  }
  if (route.view !== 'explore' || route.pageId !== explorePage?.id) {
    explorePage?.view.destroy();
    explorePage = null;
  }

  switch (route.view) {
    case 'start': {
      // A visit with no hash: resume where the reader left off.
      const last = await getLastRead();
      if (isCurrent()) navigate(last ? chapterHref(last.book, last.chapter) : '#/', { replace: true });
      return;
    }
    case 'books': {
      // The header's translation dropdown shows here too (without Compare):
      // it chooses what the books open in. Without the list of translations (offline before
      // the first visit), the books still show, without them.
      const [lastRead, state, readings] = await Promise.all([getLastRead(), translationState().catch(() => null), homeReadings()]);
      if (!isCurrent()) return;
      if (state) translationControl.update({ translations: state.translations, ids: selectionFromPrefs(state.prefs), compare: false });
      mount(renderBookList({ lastRead, studyCount: studyStore.all().length, readings }), { title: null, controls: Boolean(state), preserve: rerender });
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
    case 'search':
      return showSearchPage(route, isCurrent, rerender);
    case 'study':
      return showStudyPage({
        route,
        isCurrent,
        rerender,
        mount,
        main,
        store: studyStore,
        toaster,
        translationState,
        getProvider,
        showLoadFailure,
        backupData,
        applyBackupExtras,
      });
    case 'intro':
      return showIntroPage(route, isCurrent, rerender);
    case 'timeline':
      return showTimelinePage(route, isCurrent, rerender);
    case 'maps':
      return showMapsPage(route, isCurrent, rerender);
    case 'explore':
      return showExplorePage(route, isCurrent, rerender);
    case 'commentary':
      return showCommentaryPage(route, isCurrent, rerender);
    case 'plans':
      return showPlansPage(route, isCurrent, rerender);
    case 'topics':
      return showTopicsPage(route, isCurrent, rerender);
    default:
      return showNotFound(route, rerender);
  }
}

/* ---------------------------------------------------------------------- */
/* Study pages: book introductions, timeline, maps                         */
/* ---------------------------------------------------------------------- */

let mapPage = null; // the map on screen, so its resize observer can be released
let explorePage = null; // { id, view }: the interactive study on screen

/**
 * A passage's text in the translation being read, or the KJV if that one
 * lacks the book (the Septuagint has no New Testament): { text, lang, name }
 * (name: the translation's, in the interface language) or null.
 */
async function passageText(ref) {
  const { prefs } = await translationState();
  for (const id of [...new Set([selectionFromPrefs(prefs)[0], 'kjv'])]) {
    try {
      const provider = await getProvider(id);
      const parts = [];
      for (let chapter = ref.chapter; chapter <= ref.endChapter; chapter += 1) {
        const data = await provider.getChapter(ref.book, chapter);
        const first = chapter === ref.chapter ? ref.verse : 1;
        const last = chapter === ref.endChapter ? ref.endVerse : Infinity;
        for (const verse of data?.verses ?? []) if (verse.number >= first && verse.number <= last) parts.push(verse.text);
      }
      if (parts.length) return { text: parts.join(' '), lang: provider.info.language, name: localizeTranslation(provider.info).name };
    } catch {
      // try the next translation
    }
  }
  return null;
}

async function showExplorePage(route, isCurrent, rerender) {
  let pages;
  try {
    pages = await researchData.explore();
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  if (!route.pageId) {
    mount(renderExploreIndex({ pages }), { title: t('explore.title'), preserve: rerender });
    return;
  }
  const entry = pages.find((page) => page.id === route.pageId);
  const render = EXPLORE_VIEWS[route.pageId];
  if (!entry || !render) {
    showNotFound({ ...route, reason: 'page' }, rerender);
    return;
  }
  let data;
  let places;
  let basemap;
  try {
    [data, places, basemap] = await Promise.all([researchData.explorePage(entry.id), researchData.places(), researchData.basemapWide()]);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  explorePage?.view.destroy();
  const view = render({
    data,
    places,
    basemap,
    partId: route.params.part ?? null,
    readingId: route.params.reading ?? null,
    passageText,
    // Keep the choice in the URL (for sharing) without a history entry per click.
    onChange: ({ part, reading }) => replaceHash(exploreHref(entry.id, new URLSearchParams({ part, reading }).toString())),
  });
  explorePage = { id: entry.id, view };
  enableJumpLinks(view.element);
  mount(view.element, { title: localizeText(data.title), preserve: rerender });
}

/** Under a chapter, links to the interactive studies about it (Daniel 2: the statue). */
async function addExploreLinks(view, book, chapter) {
  let pages;
  try {
    pages = await researchData.explore();
  } catch {
    return; // offline before the data was stored: no links, nothing else lost
  }
  const links = view.element.querySelector('.chapter-study');
  if (!links || !main.contains(view.element)) return;
  links.querySelector('.explore-link')?.remove();
  const page = pages.find((entry) => entry.chapters.includes(`${book.id} ${chapter}`));
  if (page) links.append(el('a', { class: 'text-button explore-link', href: exploreHref(page.id) }, icon(ICONS[page.icon] ?? ICONS.research, { size: 16 }), localizeText(page.title)));
}

/**
 * Under a chapter, the Adventist commentary on it ("The Desire of Ages ·
 * 17. Nicodemus"), once the commentary index has loaded.
 */
async function addCommentaryLinks(view, book, chapter) {
  let index;
  try {
    index = await researchData.commentary();
  } catch {
    return; // offline before the index was stored: no links
  }
  if (!main.contains(view.element)) return;
  view.element.querySelector('.chapter-commentary')?.remove();
  const nav = chapterCommentaryLinks(partsFor(index, book.id, chapter), { book, chapter });
  const links = view.element.querySelector('.chapter-study');
  if (nav && links) links.after(nav);
}

/* ---------------------------------------------------------------------- */
/* Reading plans                                                           */
/* ---------------------------------------------------------------------- */

/** The plans data, or null (offline before it was ever loaded). */
const loadPlans = () => researchData.plans().then((data) => data.plans).catch(() => null);

/** The home page's "Today's reading" links, one per unfinished plan. */
async function homeReadings() {
  if (planStore.all().length === 0) return [];
  const plans = await loadPlans();
  return plans ? todaysReadings({ plans, records: planStore.all(), today: localDate() }) : [];
}

/* ---------------------------------------------------------------------- */
/* Topics                                                                  */
/* ---------------------------------------------------------------------- */

/** #/topics (?q= the search box) and #/topics/<id> (?s= a statement). */
async function showTopicsPage(route, isCurrent, rerender) {
  let index;
  let topic = null;
  try {
    [index, topic] = await Promise.all([researchData.topicsIndex(), route.topicId ? researchData.topic(route.topicId).catch(() => null) : null]);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  if (!route.topicId) {
    const element = renderTopicsIndex({
      index,
      query: route.params.q ?? '',
      loadStatements: () =>
        researchData.topicStatements().then((entries) => {
          entries.byKey ??= new Map(entries.map((entry) => [`${entry[0]}.${entry[1]}`, entry]));
          return entries;
        }),
      // Typing doesn't add history entries; the URL just keeps the text for Back.
      onQuery: (q) => {
        const href = topicHref(null, q ? `q=${encodeURIComponent(q)}` : '');
        replaceHash(href);
        currentRoute = resolveRoute(href);
      },
    });
    mount(element, { title: t('topics.title'), preserve: rerender });
    return;
  }
  if (!topic || !index.topics.some((entry) => entry.id === route.topicId)) {
    showNotFound({ ...route, reason: 'page' }, rerender);
    return;
  }
  const { translations, prefs } = await translationState();
  const quoteId = selectionFromPrefs(prefs)[0];
  const quoteInfo = translations.find((info) => info.id === quoteId);
  const focus = /^\d+$/.test(route.params.s ?? '') ? Number(route.params.s) : null;
  const original = route.params.lang === 'en';
  mount(renderTopicPage({ topic, index, focus, original, quote: (ref) => quoteRef(ref, quoteId), quoteName: `${quoteInfo?.abbreviation ?? ''} · ${quoteInfo?.name ?? ''}` }), {
    title: topicTitle(topic),
    preserve: rerender,
  });
  if (focus !== null && !rerender) {
    const target = main.querySelector(`#s${focus}`);
    target?.scrollIntoView({ block: 'center' });
  }
}

/** A reference's text ("ROM 12:3") in a translation, falling back to the KJV. */
async function quoteRef(text, translationId) {
  const ref = parseRef(text);
  if (!ref) return null;
  for (const id of [...new Set([translationId, 'kjv'])]) {
    try {
      const provider = await getProvider(id);
      const parts = [];
      for (const { chapter, from, to } of refChapters(ref)) {
        const data = await provider.getChapter(ref.book, chapter);
        for (const verse of data?.verses ?? []) if (verse.number >= from && verse.number <= to) parts.push(verse.text);
      }
      if (parts.length) return { text: parts.join(' '), lang: provider.info.language, name: localizeTranslation(provider.info).name };
    } catch {
      // the next translation
    }
  }
  return null;
}

// The day a plan page's reading card stays on after it was ticked there.
let planCard = null; // { plan, day }

/** #/plans and #/plans/<id>. */
async function showPlansPage(route, isCurrent, rerender) {
  if (!rerender || planCard?.plan !== route.planId) planCard = null;
  let data;
  try {
    data = await researchData.plans();
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  const today = localDate();
  // A re-render (progress changed) keeps focus on the same control.
  const focusKey = rerender ? document.activeElement?.dataset?.focusKey : null;
  if (!route.planId) {
    mount(renderPlansList({ plans: data.plans, records: planStore.all(), today }), { title: t('plans.title'), preserve: rerender });
  } else {
    const plan = data.plans.find((entry) => entry.id === route.planId);
    if (!plan) {
      showNotFound({ ...route, reason: 'page' }, rerender);
      return;
    }
    const record = planStore.get(plan.id);
    const actions = {
      start: (date) => planStore.start(plan.id, date),
      toggle: (day, keys, read, fromCard) => {
        planCard = fromCard ? { plan: plan.id, day } : planCard;
        return setPlanRead(plan, day, keys, read);
      },
      nextDay: async () => {
        planCard = null;
        await handleRoute(currentRoute, { rerender: true });
        main.querySelector('.plan-next .plan-tick')?.focus();
      },
      // Behind: move the start so that the next unread day is today; ticks stay.
      reschedule: () => {
        const current = planStore.get(plan.id);
        const next = plan.days.findIndex((_, i) => !isDayDone(plan, current, i));
        planStore.restore({ ...current, started: addDaysToToday(-Math.max(0, next)), updated: new Date().toISOString() });
      },
      stop: async () => {
        const removed = await planStore.stop(plan.id);
        if (removed) toaster.show(t('plans.stopped', { name: planName(plan) }), { action: { label: t('study.undo'), onClick: () => planStore.restore(removed) } });
      },
    };
    const cardDay = record && planCard ? planCard.day : null;
    mount(renderPlanPage({ plan, record, today, cardDay, actions }), { title: planName(plan), preserve: rerender });
  }
  if (focusKey) main.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

function addDaysToToday(n) {
  const date = new Date();
  date.setDate(date.getDate() + n);
  return localDate(date);
}

/** Tick or untick chapters; a day finished gets a short "Day 12 done". */
async function setPlanRead(plan, day, keys, read) {
  const wasDone = isDayDone(plan, planStore.get(plan.id), day);
  await planStore.setRead(plan.id, day, keys, read);
  const record = planStore.get(plan.id);
  if (read && !wasDone && record && isDayDone(plan, record, day)) toaster.show(t('plans.dayDoneToast', { day: day + 1 }));
}

/**
 * Under a chapter that belongs to a started plan's reading (today's, or one
 * the reader is catching up on): "Bible in a year · Day 12 [Mark as read]",
 * and once read, a link to the next chapter of the plan.
 */
async function addPlanBars(view, book, chapter) {
  const records = planStore.all();
  const focusKey = view.element.contains(document.activeElement) ? document.activeElement?.dataset?.focusKey : null;
  const plans = records.length ? await loadPlans() : null;
  if (!main.contains(view.element)) return;
  view.element.querySelector('.chapter-plans')?.remove();
  if (!plans) return;
  const today = localDate();
  const key = chapterKey(book.id, chapter);
  const bars = records.flatMap((record) => {
    const plan = plans.find((p) => p.id === record.plan);
    const day = plan && dayForChapter(plan, record, key, today);
    if (day === null || day === undefined) return [];
    return [renderPlanBar({ plan, record, day, key, next: nextChapter(plan, record, day, key), onToggle: (read) => setPlanRead(plan, day, [key], read) })];
  });
  if (!bars.length) return;
  const section = el('section', { class: 'chapter-plans', 'aria-label': t('plans.title') }, bars);
  (view.element.querySelector('.chapter-study') ?? view.actionsSlot).before(section);
  if (focusKey) section.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

/** #/commentary, a commentary book (#/commentary/<id>) or one of its chapters. */
async function showCommentaryPage(route, isCurrent, rerender) {
  let index;
  try {
    index = await researchData.commentary();
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  if (!route.workId) {
    mount(renderCommentaryLibrary({ index }), { title: t('commentary.title'), preserve: rerender });
    return;
  }
  const work = index.works.find((entry) => entry.id === route.workId);
  const part = route.partId ? work?.parts.find((entry) => entry.id === route.partId) : null;
  if (!work || (route.partId && !part)) {
    showNotFound({ ...route, reason: 'page' }, rerender);
    return;
  }
  if (!part) {
    // ?book=daniel: only the chapters on that book of the Bible.
    const element = renderCommentaryWork({ work, bookId: route.params.book ? findBook(route.params.book)?.id ?? null : null });
    mount(element, { title: workTitle(work), preserve: rerender });
    return;
  }
  // The text's language: ?lang= if given, otherwise Russian in the Russian
  // interface when the chapter is translated, otherwise the English original.
  const asked = ['ru', 'en'].includes(route.params.lang) ? route.params.lang : null;
  const lang = (asked ?? (getLanguage() === 'ru' ? 'ru' : 'en')) === 'ru' && part.ru ? 'ru' : 'en';
  let data;
  try {
    data = await researchData.commentaryPart(work.id, part.id, lang);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  const verse = Number.parseInt(route.params.v, 10);
  const { element, target } = renderCommentaryPart({ work, part, data, verse: verse > 0 ? verse : null, note: route.params.note ?? null, keepLang: asked });
  enableJumpLinks(element);
  mount(element, { title: `${data.title} · ${workTitle(work)}`, preserve: rerender });
  // ?v=31 or ?note=5: open at that verse's section or that note.
  if (target && !rerender) {
    target.scrollIntoView({ block: 'start' });
    target.focus({ preventScroll: true });
  }
}

/** A study page's data failed to load: say so, with a way to try again. */
function showStudyLoadFailure(error, route) {
  console.error(error);
  mount(
    renderMessage({
      title: t('page.loadFailedTitle'),
      text: t('page.loadFailed'),
      links: [{ href: '#/', label: t('notFound.browse') }],
      actions: [{ label: t('action.retry'), onClick: () => handleRoute(route) }],
    }),
    { title: t('title.error') },
  );
}

async function showIntroPage(route, isCurrent, rerender) {
  const { book } = route;
  let intro;
  let timeline;
  let places;
  let maps;
  let explore = [];
  try {
    [intro, timeline, places, maps] = await Promise.all([researchData.bookIntro(book.id), researchData.timeline(), researchData.places(), researchData.maps()]);
    explore = (await researchData.explore()).filter((page) => page.books.includes(book.id)).map(exploreCard);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  const lastRead = await getLastRead();
  const backTo = lastRead?.book === book ? lastRead : { book, chapter: 1 };
  const { element, quotes } = renderBookIntro({
    book,
    intro,
    timeline,
    places,
    maps,
    explore,
    back: { href: chapterHref(backTo.book, backTo.chapter), label: t('translations.back', { title: chapterTitle(backTo.book, backTo.chapter) }) },
  });
  enableJumpLinks(element);
  mount(element, { title: t('intro.link', { book: bookName(book) }), preserve: rerender });
  // Key verses, quoted in the translation being read.
  for (const quote of quotes) {
    passageText(quote.ref).then((found) => {
      if (found && isCurrent()) quote.fill(found.text, found.lang);
    });
  }
}

async function showTimelinePage(route, isCurrent, rerender) {
  let timeline;
  let places;
  let maps;
  try {
    [timeline, places, maps] = await Promise.all([researchData.timeline(), researchData.places(), researchData.maps()]);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  const { element, target } = renderTimelinePage({ timeline, places, maps, eventId: route.params.event ?? null });
  enableJumpLinks(element);
  mount(element, { title: t('timeline.title'), preserve: rerender });
  if (target && !rerender) {
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }
}

async function showMapsPage(route, isCurrent, rerender) {
  let maps;
  let basemap;
  let places;
  try {
    [maps, basemap, places] = await Promise.all([researchData.maps(), researchData.basemap(), researchData.places()]);
  } catch (error) {
    if (isCurrent()) showStudyLoadFailure(error, route);
    return;
  }
  if (!isCurrent()) return;
  mapPage?.destroy();
  mapPage = null;
  if (!route.mapId) {
    mount(renderMapsIndex({ maps }), { title: t('maps.title'), preserve: rerender });
    return;
  }
  const map = maps.find((candidate) => candidate.id === route.mapId);
  if (!map) {
    showNotFound({ ...route, reason: 'page' }, rerender);
    return;
  }
  mapPage = renderMapPage({
    map,
    maps,
    basemap,
    places,
    placeId: route.params.place ?? null,
    // Keep the selected place in the URL (for sharing) without a history entry per click.
    onPlaceChange: (id) => replaceHash(mapHref(map.id, id ? `place=${id}` : '')),
  });
  enableJumpLinks(mapPage.element);
  mount(mapPage.element, { title: localizeText(map.title), preserve: rerender });
}

const localizeText = (text) => text?.[getLanguage()] ?? text?.en ?? '';

async function showReader(route, isCurrent) {
  const { book, chapter, verse, verseEnd = null } = route;
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
  const href = chapterHref(book, chapter, verse, query, verseEnd);
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
    // Highlights, bookmarks and notes, painted onto the text; again whenever they change.
    const paint = () => {
      paintStudyMarks(view.textRoot, studyStore.inChapter(book.id, chapter), { book, chapter, onOpenNote: (id) => notesPanel.openNote(id) });
      updateChapterStudyLinks(view, book, chapter);
      addExploreLinks(view, book, chapter);
    };
    reader = { book, chapter, verse, verseEnd, ids, view, paint };
    paint();
    addPlanBars(view, book, chapter);
    addCommentaryLinks(view, book, chapter);
    selectionTranslate.setContext({ book, chapter, shownIds: ids });
    verseActions.setContext({ book, chapter, view, columns, query });
    notesPanel.setContext({ book, chapter, query });
    researchPanel.setContext({ book, chapter, columns, query });
    showStrongsTip(view, columns);
    audioPlayer.setChapter({ view, book, chapter, ids });
    document.title = `${title} (${columns.map((c) => c.abbreviation).join(', ')}) · ${t('app.name')}`;
    if (results.some((r) => r.chapter)) saveLastRead(book, chapter);
  };

  const sameChapter =
    reader &&
    reader.book === book &&
    reader.chapter === chapter &&
    reader.verse === verse &&
    reader.verseEnd === verseEnd &&
    main.contains(reader.view.element);

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
    view.show(results, { verse, verseEnd });
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

  // A verse jumped to (from a link, a search result or a typed reference)
  // pulses briefly so the eye finds it.
  const target = view.show(results, { verse, verseEnd, flash: true });
  if (target) {
    // A range starts near the top, so as much of it as possible is visible.
    target.scrollIntoView({ block: verseEnd ? 'start' : 'center' });
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

/* ---------------------------------------------------------------------- */
/* Search                                                                  */
/* ---------------------------------------------------------------------- */

/**
 * The reader for a typed reference. It opens in the translation chosen on
 * the search page, or in the translations last read if that one is among
 * them (so a comparison stays a comparison) or "All translations" is chosen.
 */
function referenceHref(reference, prefs, translationId = null) {
  const { book, chapter, verse, verseEnd } = reference;
  const lastRead = selectionFromPrefs(prefs);
  const ids = !translationId || translationId === ALL_TRANSLATIONS || lastRead.includes(translationId) ? lastRead : [translationId];
  return chapterHref(book, chapter, verse, selectionQuery(ids), verseEnd);
}

/** Before leaving a search page: remember the scroll position and results shown. */
function rememberSearchPlace() {
  if (currentRoute?.view !== 'search' || !search || !main.contains(search.view.element)) return;
  searchPlaces.set(search.hash, { y: window.scrollY, loaded: search.view.loadedCount(), focusHref: searchClickedHref });
  searchClickedHref = null;
}

function selectedTranslations(params, translations) {
  // "All translations" skips editions of a translation already searched (KJV+ is the KJV's text).
  return params.t === ALL_TRANSLATIONS ? translations.filter((info) => !info.basedOn) : translations.filter((info) => info.id === params.t);
}

async function showSearchPage(route, isCurrent, rerender = false) {
  let state;
  try {
    state = await translationState();
  } catch (error) {
    if (isCurrent()) showLoadFailure(error);
    return;
  }
  if (!isCurrent()) return;
  const translations = state.translations.filter(isSearchable);
  const params = readSearchParams(route.params, translations.map((info) => info.id));

  // "Jn 3:16", "Romans 8": open the passage rather than search for the words.
  const reference = params.q ? parseReference(params.q) : null;
  if (reference) {
    navigate(referenceHref(reference, state.prefs, params.t), { replace: true });
    return;
  }

  // No translation named: search the one being read. The URL then says so.
  params.t ??= selectionFromPrefs(state.prefs).find((id) => translations.some((info) => info.id === id)) ?? translations[0].id;
  const hash = searchHref(params);
  if (window.location.hash !== hash) replaceHash(hash);
  currentRoute = { ...route, params: { ...route.params, t: params.t } };

  const place = searchPlaces.get(hash) ?? null;
  searchPlaces.delete(hash);
  const title = params.q ? `${params.q} · ${t('title.search')}` : t('title.search');

  let view;
  if (search && main.contains(search.view.element) && !rerender) {
    // Same page, new search (or Back to an earlier one): keep the form.
    view = search.view;
    view.setParams(params);
    document.title = `${title} · ${t('app.name')}`;
  } else {
    view = createSearchView({
      params,
      translations,
      onSubmit: submitSearch,
      // Options change the search on screen; Back goes to the previous search, not each tweak.
      onChange: (next) => navigate(searchHref(next), { replace: true }),
      onMore: loadMoreResults,
    });
  }
  // A new object per search: async work started for an older one checks
  // `search === current` and gives up when it no longer is.
  search = { view, hash, params, translations, query: parseQuery(params.q, params.match) };
  if (!main.contains(view.element)) {
    mount(view.element, { title, preserve: rerender || Boolean(place) });
    // A new, empty search page: ready to type.
    if (!params.q && !rerender) view.input.focus({ preventScroll: true });
  }

  // Index the chosen translation(s) while the reader types.
  searchClient.prepare(selectedTranslations(params, translations));

  const shown = await runSearch({ limit: Math.max(SEARCH_PAGE_SIZE, place?.loaded ?? 0) });
  if (shown && place && isCurrent()) {
    window.scrollTo(0, place.y);
    const link = place.focusHref && [...main.querySelectorAll('.search-results a')].find((a) => a.getAttribute('href') === place.focusHref);
    link?.focus({ preventScroll: true });
  }
}

function submitSearch(params) {
  const reference = params.q ? parseReference(params.q) : null;
  if (reference) {
    translationState()
      .then(({ prefs }) => navigate(referenceHref(reference, prefs, params.t)))
      .catch(() => navigate(chapterHref(reference.book, reference.chapter, reference.verse, '', reference.verseEnd)));
    return;
  }
  navigate(searchHref(params));
}

/** "Downloading the King James Version… (2 of 7)" */
function progressText({ phase, id, step, steps }) {
  const name = search?.translations.find((info) => info.id === id)?.name ?? id;
  const text = t(phase === 'loading' ? 'search.loading' : 'search.indexing', { name });
  return steps > 1 ? t('search.step', { text, n: step, total: steps }) : text;
}

/** Run the search on screen. Resolves true once results are shown. */
async function runSearch({ limit = SEARCH_PAGE_SIZE } = {}) {
  const current = search;
  const { view, params, query, translations } = current;
  const book = bookOnly(params.q);
  // Above the results: the book named, and topics whose titles match the words.
  const topicBox = el('div', { class: 'search-topic-box' });
  const bookSuggestion = [book ? bookSuggestionLink(book) : null, topicBox];
  const words = book ? '' : topicQuery(params.q);
  if (words) {
    researchData
      .topicsIndex()
      .then((index) => topicBox.replaceChildren(renderTopicSuggestions(index.topics, words) ?? ''))
      .catch(() => {}); // offline before the topics were saved: no suggestions
  }
  if (query.clauses.length === 0) {
    view.setStatus('');
    view.showTips({ bookSuggestion });
    return false;
  }

  // "Searching…" only if it takes a moment (the first search builds the index).
  const slow = setTimeout(() => view.setStatus(t('search.searching')), 200);
  try {
    const page = await searchClient.search(
      { translations: selectedTranslations(params, translations), text: params.q, match: params.match, scope: params.in, offset: 0, limit },
      { onProgress: (progress) => search === current && view.setStatus(progressText(progress)) },
    );
    if (!page || search !== current) return false; // a newer search took over
    view.showResults({ params, query, ...page, bookSuggestion });
    view.setStatus(page.total ? summaryText(page.total, page.books.length) : t('search.none', { q: params.q }));
    return true;
  } catch (error) {
    console.error(error);
    if (search !== current) return false;
    view.setStatus('');
    view.showError(error, () => runSearch({ limit }));
    return false;
  } finally {
    clearTimeout(slow);
  }
}

async function loadMoreResults() {
  const current = search;
  const { view, params, query, translations } = current;
  try {
    const page = await searchClient.search({
      translations: selectedTranslations(params, translations),
      text: params.q,
      match: params.match,
      scope: params.in,
      offset: view.loadedCount(),
      limit: SEARCH_PAGE_SIZE,
    });
    if (!page || search !== current) return;
    // Keyboard users carry on from the first new result.
    view.showResults({ params, query, ...page })?.focus();
  } catch (error) {
    console.error(error);
    view.setStatus(t('search.failed'));
  }
}

function showNotFound(route, rerender = false) {
  if (route.reason === 'page') {
    mount(
      renderMessage({ title: t('notFound.pageTitle'), text: t('notFound.pageText'), links: [{ href: '#/', label: t('notFound.browse') }] }),
      { title: t('title.notFound'), preserve: rerender },
    );
    return;
  }
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
      text: errorText(error),
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
function mount(node, { title, location = null, controls = false, preserve = false }) {
  const scrollY = window.scrollY;
  main.replaceChildren(node);
  document.title = title ? `${title} · ${t('app.name')}` : t('app.name');
  header.setLocation(location, { controls });
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
  // "/" searches, as on many sites.
  if (event.key === '/' && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
    event.preventDefault();
    if (currentRoute?.view === 'search' && search) {
      search.view.input.focus();
      search.view.input.select();
    } else {
      navigate(searchHref());
    }
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  // Leave browser shortcuts alone (Alt+← is "Back") and form controls (the
  // translation dropdowns and theme buttons use arrow keys). Ignore
  // auto-repeat, so holding a key doesn't race through dozens of chapters.
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (currentRoute?.view !== 'reader' || !currentRoute.ids || isTypingTarget(event.target)) return;

  if (turnChapter(event.key === 'ArrowRight' ? 1 : -1)) event.preventDefault();
}

/** Go to the next (1) or previous (-1) chapter in the same translations; false if there's none. */
function turnChapter(delta) {
  if (currentRoute?.view !== 'reader' || !currentRoute.ids) return false;
  const target = adjacentChapter(currentRoute.book, currentRoute.chapter, delta);
  if (!target) return false;
  navigate(chapterHref(target.book, target.chapter, null, selectionQuery(currentRoute.ids)));
  return true;
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
  toaster = createToaster();
  initOffline({ toaster, appSection: document.getElementById('settings-app') });
  notesPanel = initNotesPanel({ store: studyStore, toaster });
  searchClient = createSearchClient();
  researchPanel = initResearchPanel({
    data: researchData,
    getProvider,
    concordance: (request) => searchClient.concordance(request),
    strongsTranslation,
    strongsHref: (book, chapter, verse) => chapterHref(book, chapter, verse, selectionQuery([STRONGS_ID])),
  });
  initFootnotes();
  audioPlayer = initAudioPlayer({
    data: researchData,
    // The recording moved on from the chapter on screen: turn the page with
    // it, unless the reader has gone elsewhere meanwhile.
    onFollow: ({ from, to }) => {
      if (currentRoute?.view !== 'reader' || currentRoute.book.id !== from.book.id || currentRoute.chapter !== from.chapter) return;
      navigate(chapterHref(to.book, to.chapter, null, selectionQuery(currentRoute.ids)));
    },
  });
  verseActions = initVerseActions({
    root: main,
    store: studyStore,
    toaster,
    onNote: (ref) => notesPanel.newNote(ref),
    onTranslate: (request) => selectionTranslate.open(request),
    readTextSelection: () => selectionTranslate.readTextSelection(),
    onResearch: (selection) => researchPanel.showVerses(selection),
    onWord: (word) => researchPanel.showWord(word),
  });
  // Highlights, notes and bookmarks are painted with the first chapter, so
  // they're read before routing starts (a quick read from this device).
  await studyStore.load();
  await planStore.load();
  planStore.subscribe(() => {
    if (reader && main.contains(reader.view.element)) addPlanBars(reader.view, reader.book, reader.chapter);
    if (currentRoute?.view === 'plans' || currentRoute?.view === 'books') handleRoute(currentRoute, { rerender: true });
  });
  studyStore.subscribe((items, change) => {
    if (reader && main.contains(reader.view.element)) reader.paint();
    verseActions.refresh();
    // Another tab changed them while this one shows My Study: show the new list.
    if (change.external && currentRoute?.view === 'study') handleRoute(currentRoute, { rerender: true });
  });
  // Which result was opened, to put focus back on it after Back.
  main.addEventListener('click', (event) => {
    const link = event.target.closest?.('.search-results a[href]');
    if (link) searchClickedHref = link.getAttribute('href');
  });
  translationControl = initTranslationControl(document.getElementById('translation-control'), {
    onSelect: selectTranslation,
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
    notesPanel.refresh();
    researchPanel.refresh();
    audioPlayer.refresh();
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
