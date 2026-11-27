/**
 * The reading-plan store: the reader's progress in each plan they've
 * started (records: see model.js).
 *
 * Saved through js/storage.js (the only module that touches persistence)
 * under one key, "plans". Views read it and subscribe to changes; a cloud
 * sync can later sit behind this API (records carry "updated" times for
 * merging). Changes made in another tab arrive through
 * storage.onExternalChange.
 */
import { storage as defaultStorage } from '../storage.js';
import { mergeRecords, newRecord, sanitizeRecord, setRead } from './model.js';

export const PLANS_KEY = 'plans';
const PLANS_VERSION = 1;

/**
 * @param {object} [options]
 * @param {typeof defaultStorage} [options.storage]  injectable for tests
 * @param {() => string} [options.now]  clock, injectable for tests
 */
export function createPlanStore({ storage = defaultStorage, now = () => new Date().toISOString() } = {}) {
  let records = [];
  let loaded = null;
  const listeners = new Set();

  const read = (value) => (Array.isArray(value?.records) ? value.records.map((raw) => sanitizeRecord(raw)).filter(Boolean) : []);

  function load() {
    loaded ??= storage.get(PLANS_KEY, null).then((value) => {
      records = read(value);
      storage.onExternalChange?.(PLANS_KEY, (next) => {
        records = read(next);
        emit({ external: true });
      });
      return records;
    });
    return loaded;
  }

  function emit(change) {
    for (const listener of listeners) listener(records, change);
  }

  async function save(next, change) {
    records = next;
    const saved = await storage.set(PLANS_KEY, { version: PLANS_VERSION, records });
    emit({ ...change, saved });
    return saved;
  }

  return {
    load,

    /** Every started plan's record (don't modify them). */
    all: () => records,

    get: (planId) => records.find((record) => record.plan === planId) ?? null,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** Start a plan on `date` (or start it over): progress is cleared. */
    async start(planId, date) {
      await load();
      return save([...records.filter((r) => r.plan !== planId), newRecord(planId, date, now())], { type: 'start', plan: planId });
    },

    /** Stop a plan: its progress is removed. Resolves the removed record (for Undo). */
    async stop(planId) {
      await load();
      const removed = records.find((r) => r.plan === planId) ?? null;
      await save(records.filter((r) => r.plan !== planId), { type: 'stop', plan: planId });
      return removed;
    },

    /** Put a record back as it was (Undo). */
    async restore(record) {
      await load();
      return save([...records.filter((r) => r.plan !== record.plan), record], { type: 'restore', plan: record.plan });
    },

    /** Tick or untick chapters ("GEN.1") on one day of a plan. */
    async setRead(planId, day, keys, isRead) {
      await load();
      const record = records.find((r) => r.plan === planId);
      if (!record) return false;
      return save(records.map((r) => (r === record ? setRead(r, day, keys, isRead, now()) : r)), { type: 'read', plan: planId, day });
    },

    /** Progress from a backup file ('merge' or 'replace'). */
    async importRecords(incoming, mode = 'merge') {
      await load();
      return save(mergeRecords(records, incoming, mode), { type: 'import' });
    },
  };
}

export const planStore = createPlanStore();
