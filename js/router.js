/**
 * Hash router.
 *
 * Hash URLs (#/john/3) work on GitHub Pages with no server configuration:
 * the server always serves index.html and the browser keeps everything after
 * the "#". Every navigation is a real history entry, so Back/Forward and
 * shared links work.
 *
 *   (no hash)     start     main.js resumes the last chapter read, or shows the books
 *   #/            books     the book list
 *   #/john        chapters  the chapter grid for one book
 *   #/john/3      reader    John 3
 *   #/john/3/16   reader    John 3, scrolled to verse 16
 *   #/psalms/23/1-4  reader  Psalm 23, verses 1–4 highlighted
 *   #/translations  translations  about each translation and its licence
 *   #/search?q=…  search    full-text search (parameters: js/search/params.js)
 *   #/study       study     My Study: highlights, notes, bookmarks (filters: js/views/study.js)
 *   #/john/intro  intro     an introduction to John: author, date, themes, outline
 *   #/timeline    timeline  the Bible timeline
 *   #/maps        maps      the list of maps
 *   #/maps/paul   maps      one map (route.mapId = "paul")
 *
 * Anything after "?" is parsed into `route.params`. The reader uses ?t= for
 * its translations (#/john/3?t=kjv,asv); see js/translations.js.
 *
 * URLs that aren't canonical (#/jn/3, #/John/03, #/jude) resolve with a
 * `redirect` to their canonical form, so every passage has exactly one URL.
 *
 * resolveRoute() is pure (no DOM), so it is unit-tested in Node. The
 * functions at the bottom of the file connect it to the browser.
 */
import { findBook, isValidChapter } from './canon.js';

export function bookHref(book) {
  return `#/${book.slug}`;
}

/**
 * `query` is appended after "?" when given, e.g. "t=kjv,asv". `verseEnd`
 * (after `verse`) makes a verse range: #/psalms/23/1-4.
 */
export function chapterHref(book, chapter, verse = null, query = '', verseEnd = null) {
  const verses = verse ? `/${verse}${verseEnd > verse ? `-${verseEnd}` : ''}` : '';
  return `#/${book.slug}/${chapter}${verses}${query ? `?${query}` : ''}`;
}

/**
 * Pages that aren't books. Their names are reserved, so no book alias may
 * use them; tests/router.test.js checks.
 */
export const PAGES = Object.freeze({ translations: 'translations', search: 'search', study: 'study', timeline: 'timeline', maps: 'maps' });

export function pageHref(name) {
  return `#/${name}`;
}

/** A book's introduction: #/john/intro. */
export function introHref(book) {
  return `#/${book.slug}/intro`;
}

/** One map (#/maps/paul), or the list of maps. `query` e.g. "place=a15257a". */
export function mapHref(id = null, query = '') {
  return `${pageHref(PAGES.maps)}${id ? `/${id}` : ''}${query ? `?${query}` : ''}`;
}

/** Split a location.hash into path segments and query parameters. */
export function parseHash(hash) {
  const raw = String(hash ?? '').replace(/^#/, '');
  const queryStart = raw.indexOf('?');
  const path = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const query = queryStart === -1 ? '' : raw.slice(queryStart + 1);
  return {
    raw,
    segments: path.split('/').filter(Boolean).map(safeDecode),
    query,
    params: Object.fromEntries(new URLSearchParams(query)),
  };
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // malformed %-escape: treat it as literal text
  }
}

/** "3" → 3, "03" → 3; "0", "-1", "3a" → null */
function toPositiveInt(text) {
  if (!/^\d+$/.test(text ?? '')) return null;
  const number = Number.parseInt(text, 10);
  return number >= 1 ? number : null;
}

/** Turn a hash into a route object. See the table at the top of this file. */
export function resolveRoute(hash) {
  const { raw, segments, query, params } = parseHash(hash);
  const suffix = query ? `?${query}` : '';
  const base = { params };

  if (raw === '') return { ...base, view: 'start' };
  if (segments.length === 0) return withCanonical({ ...base, view: 'books' }, `#/${suffix}`, raw);

  const [bookPart, chapterPart, versePart] = segments;

  const page = PAGES[bookPart.toLowerCase()];
  if (page === PAGES.maps && chapterPart) {
    // Map ids are lower-case words; whether one exists is checked when maps load.
    const mapId = chapterPart.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(mapId)) return { ...base, view: 'not-found', reason: 'page', query: chapterPart };
    return withCanonical({ ...base, view: page, mapId }, mapHref(mapId) + suffix, raw);
  }
  if (page) return withCanonical({ ...base, view: page }, pageHref(page) + suffix, raw);

  const book = findBook(bookPart);
  if (!book) return { ...base, view: 'not-found', reason: 'book', query: bookPart };

  if (chapterPart?.toLowerCase() === 'intro' && versePart === undefined) {
    return withCanonical({ ...base, view: 'intro', book }, introHref(book) + suffix, raw);
  }

  if (chapterPart === undefined) {
    // A single-chapter book (Obadiah, Philemon, 2–3 John, Jude) skips the
    // chapter grid, which would have only one cell.
    if (book.chapters === 1) {
      return { ...base, view: 'reader', book, chapter: 1, verse: null, redirect: chapterHref(book, 1) + suffix };
    }
    return withCanonical({ ...base, view: 'chapters', book }, bookHref(book) + suffix, raw);
  }

  const number = toPositiveInt(chapterPart);

  // "Jude 3" usually means verse 3 of Jude's only chapter.
  if (book.chapters === 1 && number > 1 && versePart === undefined) {
    return { ...base, view: 'reader', book, chapter: 1, verse: number, verseEnd: null, redirect: chapterHref(book, 1, number) + suffix };
  }

  if (!isValidChapter(book, number)) {
    return { ...base, view: 'not-found', reason: 'chapter', book, query: chapterPart };
  }

  // An unreadable verse ("#/john/3/abc") is dropped by the canonical redirect,
  // as is a range that runs backwards ("16-12" → "16"). Whether the verses
  // exist is checked by the reader once the text loads.
  const { verse, verseEnd } = parseVerses(versePart);
  return withCanonical(
    { ...base, view: 'reader', book, chapter: number, verse, verseEnd },
    chapterHref(book, number, verse, '', verseEnd) + suffix,
    raw,
  );
}

/** "16" → 16; "1-4" (or "1–4") → 1 to 4. */
function parseVerses(text) {
  if (text === undefined) return { verse: null, verseEnd: null };
  const [first, last] = text.split(/[-–]/);
  const verse = toPositiveInt(first);
  const end = last === undefined ? null : toPositiveInt(last);
  return { verse, verseEnd: verse && end > verse ? end : null };
}

function withCanonical(route, canonicalHash, raw) {
  if (`#${raw}` !== canonicalHash) route.redirect = canonicalHash;
  return route;
}

/* ------------------------------------------------------------------------ */
/* Browser wiring                                                            */
/* ------------------------------------------------------------------------ */

let routeListener = null;

function handleLocation() {
  let route = resolveRoute(window.location.hash);
  // Redirects replace the current history entry, so Back skips the old form.
  // Canonical URLs never redirect again; the loop guard is just a safety net.
  for (let hops = 0; route.redirect && hops < 3; hops += 1) {
    window.history.replaceState(window.history.state, '', route.redirect);
    route = resolveRoute(window.location.hash);
  }
  routeListener?.(route);
}

/** Start listening for hash changes and immediately handle the current URL. */
export function startRouter(onRoute) {
  routeListener = onRoute;
  window.addEventListener('hashchange', handleLocation);
  handleLocation();
}

/**
 * Go to a hash URL. A normal navigation adds a history entry (and fires
 * hashchange). `replace` swaps the current entry instead, for redirects.
 */
export function navigate(href, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState(window.history.state, '', href);
    handleLocation();
  } else if (window.location.hash !== href) {
    window.location.hash = href;
  }
}

/**
 * Rewrite the current URL without navigating or re-rendering: for when the
 * page on screen is already right and only its URL needs to say so (e.g. to
 * add ?t=kjv to a plain #/john/3).
 */
export function replaceHash(href) {
  window.history.replaceState(window.history.state, '', href);
}
