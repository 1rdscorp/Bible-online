/**
 * The search page's URL: #/search?q=faith&t=kjv&in=NT&match=any
 *
 *   q      what was typed
 *   t      a translation id, or "all"
 *   in     "all" (default), "OT", "NT", or a book id ("ROM")
 *   match  "all" words (default), "any" word, or the exact "phrase"
 *
 * Every search is a URL, so it can be bookmarked or shared, and Back
 * returns to it. Defaults are left out, so each search has one URL.
 */
import { getBook } from '../canon.js';
import { pageHref, PAGES } from '../router.js';
import { MATCH_MODES } from './text.js';

export const ALL_TRANSLATIONS = 'all';

/** "all", "OT", "NT" or a book id; anything else → "all". */
export function normalizeScope(value) {
  if (value === 'OT' || value === 'NT') return value;
  return getBook(value)?.id ?? 'all';
}

/**
 * Read route.params. `knownIds` are the translations that can be searched;
 * an unknown or missing `t` gives `t: null`, for the caller to fill in.
 */
export function readSearchParams(params = {}, knownIds = []) {
  const t = params.t === ALL_TRANSLATIONS || knownIds.includes(params.t) ? params.t : null;
  return {
    q: String(params.q ?? '').trim(),
    t,
    in: normalizeScope(params.in),
    match: MATCH_MODES.includes(params.match) ? params.match : 'all',
  };
}

export function searchHref({ q = '', t = null, in: scope = 'all', match = 'all' } = {}) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (t) query.set('t', t);
  if (scope && scope !== 'all') query.set('in', scope);
  if (match && match !== 'all') query.set('match', match);
  const text = query.toString();
  return pageHref(PAGES.search) + (text ? `?${text}` : '');
}
