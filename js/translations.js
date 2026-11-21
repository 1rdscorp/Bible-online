/**
 * Which translation(s) the reader shows.
 *
 * The URL is the source of truth: #/john/3?t=kjv for one translation, and
 * #/john/3?t=kjv,asv,web for 2–4 in parallel, so every view is a precise,
 * shareable link and Back undoes a translation change. The last selection
 * is also saved, so links without ?t= (the chapter grid, "Continue reading",
 * a Stage 1 link) open in whatever the reader used last.
 *
 * Everything except loadPrefs/savePrefs is pure, and tested in
 * tests/translations.test.js.
 */
import { storage } from './storage.js';

export const MAX_COLUMNS = 4;
const PREFS_KEY = 'translations';

/** "kjv,ASV, web,kjv,nope" → ['kjv','asv','web']: known ids only, no repeats, at most 4. */
export function parseSelection(param, knownIds) {
  if (typeof param !== 'string') return [];
  const known = new Set(knownIds);
  const ids = [];
  for (const part of param.split(',')) {
    const id = part.trim().toLowerCase();
    if (known.has(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_COLUMNS) break;
  }
  return ids;
}

/** The query string for a selection: "t=kjv,asv". */
export function selectionQuery(ids) {
  return `t=${ids.join(',')}`;
}

/**
 * Saved preferences, repaired against the translations that exist now:
 *   single:   the translation for one-column reading
 *   parallel: the last set of columns, restored when Compare is switched on
 *   mode:     which of the two was used last
 */
export function normalizePrefs(raw, knownIds, defaultId) {
  const single = knownIds.includes(raw?.single) ? raw.single : defaultId;
  const parallel = parseSelection(Array.isArray(raw?.parallel) ? raw.parallel.join(',') : '', knownIds);
  const mode = raw?.mode === 'parallel' && parallel.length >= 2 ? 'parallel' : 'single';
  return { single, parallel, mode };
}

export function selectionFromPrefs(prefs) {
  return prefs.mode === 'parallel' ? prefs.parallel : [prefs.single];
}

/** Remember what's on screen. */
export function prefsWithSelection(prefs, ids) {
  if (ids.length >= 2) return { ...prefs, mode: 'parallel', parallel: [...ids] };
  return { ...prefs, mode: 'single', single: ids[0] };
}

/**
 * Columns when Compare is switched on: the current translation first, then the
 * columns used last time (or the next translation in the list).
 */
export function startComparing(ids, prefs, knownIds) {
  const first = ids[0];
  const remembered = prefs.parallel.filter((id) => id !== first);
  const others = remembered.length > 0 ? remembered : knownIds.filter((id) => id !== first).slice(0, 1);
  return [first, ...others].slice(0, MAX_COLUMNS);
}

/** Back to one column: keep the first. */
export function stopComparing(ids) {
  return ids.slice(0, 1);
}

/** Add the first translation not already shown (no-op at 4 columns). */
export function addColumn(ids, knownIds) {
  if (ids.length >= MAX_COLUMNS) return ids;
  const next = knownIds.find((id) => !ids.includes(id));
  return next ? [...ids, next] : ids;
}

/** Remove a column; parallel view keeps at least two. */
export function removeColumn(ids, index) {
  if (ids.length <= 2) return ids;
  return ids.filter((_, i) => i !== index);
}

/** Show `id` in column `index`. A translation already shown elsewhere is ignored. */
export function replaceColumn(ids, index, id) {
  if (ids.includes(id)) return ids;
  const next = [...ids];
  next[index] = id;
  return next;
}

export async function loadPrefs(knownIds, defaultId) {
  return normalizePrefs(await storage.get(PREFS_KEY, null), knownIds, defaultId);
}

export function savePrefs(prefs) {
  return storage.set(PREFS_KEY, prefs);
}
