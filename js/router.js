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
 *
 * Anything after "?" is parsed into `route.params` (e.g. #/john/3?t=asv), so
 * later stages can add options such as translation or compare mode without
 * changing the path scheme.
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

export function chapterHref(book, chapter, verse = null) {
  return `#/${book.slug}/${chapter}${verse ? `/${verse}` : ''}`;
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
  const book = findBook(bookPart);
  if (!book) return { ...base, view: 'not-found', reason: 'book', query: bookPart };

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
    return { ...base, view: 'reader', book, chapter: 1, verse: number, redirect: chapterHref(book, 1, number) + suffix };
  }

  if (!isValidChapter(book, number)) {
    return { ...base, view: 'not-found', reason: 'chapter', book, query: chapterPart };
  }

  // An unreadable verse ("#/john/3/abc") is dropped by the canonical redirect.
  // Whether the verse exists is checked by the reader once the text loads.
  const verse = versePart === undefined ? null : toPositiveInt(versePart);
  return withCanonical({ ...base, view: 'reader', book, chapter: number, verse }, chapterHref(book, number, verse) + suffix, raw);
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
