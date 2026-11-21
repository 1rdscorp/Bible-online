/**
 * The study store: the reader's highlights, notes and bookmarks.
 *
 * It keeps the items in memory and saves them through js/storage.js (the
 * only module that touches persistence) under one key, "study". Views ask
 * it for items and subscribe to changes; nothing else reads or writes study
 * data. A cloud sync can later sit behind this API: items already carry
 * random ids and "updated" times for merging.
 *
 * Changes made in another tab arrive through storage.onExternalChange, so
 * two open tabs don't overwrite each other's notes.
 */
import { storage as defaultStorage } from '../storage.js';
import { mergeItems } from './backup.js';
import { applyHighlight, createItem, marksCoveredBy, marksOverlapping, normalizeTags, sameRef, sanitizeItem } from './model.js';

export const STUDY_KEY = 'study';
const STUDY_VERSION = 1;

/**
 * @param {object} [options]
 * @param {typeof defaultStorage} [options.storage]  injectable for tests
 * @param {() => string} [options.now]  clock, injectable for tests
 */
export function createStudyStore({ storage = defaultStorage, now = () => new Date().toISOString() } = {}) {
  let items = [];
  let loaded = null;
  const listeners = new Set();

  const read = (value) => (Array.isArray(value?.items) ? value.items.map(sanitizeItem).filter(Boolean) : []);

  function load() {
    loaded ??= storage.get(STUDY_KEY, null).then((value) => {
      items = read(value);
      storage.onExternalChange?.(STUDY_KEY, (next) => {
        items = read(next);
        emit({ external: true });
      });
      return items;
    });
    return loaded;
  }

  function emit(change) {
    for (const listener of listeners) listener(items, change);
  }

  /**
   * Apply a change: remove ids, add or replace items. Saves, then tells
   * subscribers. Resolves { ok, saved } (saved=false: storage failed, but
   * the change stays in memory for this visit).
   */
  async function commit({ remove = [], put = [] }, change = {}) {
    await load();
    const gone = new Set([...remove, ...put.map((item) => item.id)]);
    items = [...items.filter((item) => !gone.has(item.id)), ...put];
    const saved = await storage.set(STUDY_KEY, { version: STUDY_VERSION, items });
    emit({ ...change, saved });
    return { ok: true, saved };
  }

  return {
    load,

    /** All items (don't modify them). */
    all: () => items,

    get: (id) => items.find((item) => item.id === id) ?? null,

    /** Items on one chapter. */
    inChapter: (bookId, chapter) => items.filter((item) => item.ref.book === bookId && item.ref.chapter === chapter),

    /** Listen for changes: listener(items, change). Returns an unsubscribe function. */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Highlight a verse range in `color`, or clear highlighting there (color null). */
    highlight(ref, color) {
      const { remove, add } = applyHighlight(items, ref, color, now());
      return commit({ remove, put: add }, { type: 'highlight', ref });
    },

    /**
     * Highlight particular words in one translation. Word highlights wholly
     * inside the new one are replaced; others that overlap stay underneath.
     */
    addMark(translation, ref, spans, color) {
      const replaced = marksCoveredBy(items, translation, ref, spans).map((item) => item.id);
      const item = createItem('mark', ref, { translation, spans, color }, now());
      return commit({ remove: replaced, put: [item] }, { type: 'mark', ref }).then((result) => ({ ...result, item }));
    },

    /** Remove the word highlights touching `spans`; resolves them (for Undo). */
    async removeMarks(translation, ref, spans) {
      await load();
      const removed = marksOverlapping(items, translation, ref, spans);
      if (removed.length) await commit({ remove: removed.map((item) => item.id) }, { type: 'mark', ref });
      return removed;
    },

    addNote(ref, { text = '', tags = [] } = {}) {
      const item = createItem('note', ref, { text, tags }, now());
      return commit({ put: [item] }, { type: 'note', id: item.id }).then((result) => ({ ...result, item }));
    },

    updateNote(id, { text, tags }) {
      const item = items.find((entry) => entry.id === id && entry.type === 'note');
      if (!item) return Promise.resolve({ ok: false });
      const next = { ...item, text: text ?? item.text, tags: tags === undefined ? item.tags : normalizeTags(tags), updated: now() };
      return commit({ put: [next] }, { type: 'note', id });
    },

    /** Bookmark a range, or remove the bookmark if that exact range has one. Resolves the new state. */
    async toggleBookmark(ref) {
      await load();
      const existing = items.find((item) => item.type === 'bookmark' && sameRef(item.ref, ref));
      if (existing) {
        await commit({ remove: [existing.id] }, { type: 'bookmark', ref });
        return { bookmarked: false, removed: existing };
      }
      const item = createItem('bookmark', ref, {}, now());
      await commit({ put: [item] }, { type: 'bookmark', ref });
      return { bookmarked: true, item };
    },

    /** Remove items by id; resolves the removed items (for Undo). */
    async remove(ids) {
      await load();
      const removed = items.filter((item) => ids.includes(item.id));
      await commit({ remove: ids }, { type: 'remove' });
      return removed;
    },

    /** Put items back exactly as they were (Undo). */
    restore(saved) {
      return commit({ put: saved }, { type: 'restore' });
    },

    /** Import: merge with or replace everything. Resolves { added, updated }. */
    async importItems(incoming, mode) {
      await load();
      const result = mergeItems(items, incoming, mode);
      items = result.items;
      const saved = await storage.set(STUDY_KEY, { version: STUDY_VERSION, items });
      emit({ type: 'import', saved });
      return { added: result.added, updated: result.updated, saved };
    },
  };
}

/** The app's store. */
export const studyStore = createStudyStore();
