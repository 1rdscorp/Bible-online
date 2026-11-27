/**
 * Reading plans: the schedule logic, with no DOM or storage, so it's
 * unit-tested in Node (tests/plans.test.js).
 *
 * A plan (data/plans.json, built by tools/build-plans.mjs) is a list of days,
 * each a list of passages: "GEN 1-3", "MAT 5". The reader's progress in one
 * plan is a record:
 *
 *   { plan: "bible-year", started: "2026-11-27",            the first day's date (local)
 *     read: { "0": ["GEN.1", "GEN.2", "GEN.3"], "1": [...] },  chapters ticked, by day (0-based)
 *     updated: "2026-11-27T08:00:00.000Z" }                  for merging backups and, later, sync
 *
 * Chapters are ticked by day, not globally, so a plan may read a chapter
 * twice (on two days) and each reading counts on its own day.
 */
import { getBook } from '../canon.js';

const PASSAGE = /^([1-3A-Z]{3}) (\d+)(?:-(\d+))?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "GEN 1-3" → { book: "GEN", from: 1, to: 3 } (null if malformed). */
export function parsePassage(text) {
  const match = PASSAGE.exec(text ?? '');
  if (!match || !getBook(match[1])) return null;
  const from = Number(match[2]);
  const to = Number(match[3] ?? match[2]);
  return to >= from ? { book: match[1], from, to } : null;
}

/** A passage's chapters as keys: "GEN 1-3" → ["GEN.1", "GEN.2", "GEN.3"]. */
export function passageChapters(text) {
  const passage = parsePassage(text);
  if (!passage) return [];
  return Array.from({ length: passage.to - passage.from + 1 }, (_, i) => `${passage.book}.${passage.from + i}`);
}

export const dayChapters = (plan, index) => (plan.days[index] ?? []).flatMap(passageChapters);

export const chapterKey = (bookId, chapter) => `${bookId}.${chapter}`;

export function parseChapterKey(key) {
  const [book, chapter] = String(key).split('.');
  return { book, chapter: Number(chapter) };
}

/* Dates: plans count calendar days where the reader is, so local dates. */

/** "2026-11-27" for a Date, in local time. */
export function localDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const utc = (text) => {
  const [y, m, d] = text.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `from` to `to` ("2026-11-27" → "2026-11-29" = 2). */
export const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / DAY_MS);

/** The date `n` days after `date`. */
export function addDays(date, n) {
  const d = new Date(utc(date) + n * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/* Progress */

const readOn = (record, index) => new Set(record.read?.[index] ?? []);

export function isChapterRead(record, index, key) {
  return readOn(record, index).has(key);
}

export function isDayDone(plan, record, index) {
  const read = readOn(record, index);
  return dayChapters(plan, index).every((key) => read.has(key));
}

/** The day the calendar says it is (0-based), from the start date; within the plan. */
export function scheduledDay(plan, record, today) {
  return Math.min(plan.days.length - 1, Math.max(0, daysBetween(record.started, today)));
}

/** The first day not yet finished, or -1 when the plan is done. */
export function nextDay(plan, record) {
  for (let i = 0; i < plan.days.length; i += 1) if (!isDayDone(plan, record, i)) return i;
  return -1;
}

/**
 * Where the reader stands:
 *   { total, done, percent, next, scheduled, behind, ahead, finished }
 * behind: days before today's that aren't finished; ahead: days after
 * today's that are already finished.
 */
export function summarize(plan, record, today) {
  const total = plan.days.length;
  const scheduled = scheduledDay(plan, record, today);
  let done = 0;
  let behind = 0;
  let ahead = 0;
  for (let i = 0; i < total; i += 1) {
    const finished = isDayDone(plan, record, i);
    if (finished) done += 1;
    if (!finished && i < scheduled) behind += 1;
    if (finished && i > scheduled) ahead += 1;
  }
  const next = nextDay(plan, record);
  // Before the start date nothing is due yet.
  const notStarted = daysBetween(record.started, today) < 0;
  return {
    total,
    done,
    percent: Math.floor((done / total) * 100),
    next,
    scheduled,
    behind: notStarted ? 0 : behind,
    ahead,
    finished: next === -1,
  };
}

/**
 * Which day of the plan a chapter being read belongs to, for the reader's
 * "Mark as read" bar: the first unfinished day up to today's (or the next
 * day, if that's further on) that has the chapter; failing that, the last
 * such day where it's already ticked. Null when the chapter isn't due.
 */
export function dayForChapter(plan, record, key, today) {
  const { next, scheduled } = summarize(plan, record, today);
  const last = next === -1 ? plan.days.length - 1 : Math.max(next, scheduled);
  let readDay = null;
  for (let i = 0; i <= last; i += 1) {
    if (!dayChapters(plan, i).includes(key)) continue;
    if (!isChapterRead(record, i, key)) return i;
    readDay = i;
  }
  return readDay;
}

/**
 * The chapter to read after `key` on day `index`: the next unticked one that
 * day, else the first unticked one on a later day. { day, key } or null.
 */
export function nextChapter(plan, record, index, key) {
  const today = dayChapters(plan, index);
  const after = today.slice(today.indexOf(key) + 1).find((k) => !isChapterRead(record, index, k));
  if (after) return { day: index, key: after };
  const before = today.find((k) => k !== key && !isChapterRead(record, index, k));
  if (before) return { day: index, key: before };
  for (let i = index + 1; i < plan.days.length; i += 1) {
    const unread = dayChapters(plan, i).find((k) => !isChapterRead(record, i, k));
    if (unread) return { day: i, key: unread };
  }
  return null;
}

/* Changes: each returns a new record. */

export function newRecord(planId, started, now) {
  return { plan: planId, started, read: {}, updated: now };
}

/** Tick (or untick) chapters on one day. */
export function setRead(record, index, keys, read, now) {
  const current = readOn(record, index);
  for (const key of keys) {
    if (read) current.add(key);
    else current.delete(key);
  }
  const next = { ...record.read };
  if (current.size) next[index] = [...current];
  else delete next[index];
  return { ...record, read: next, updated: now };
}

/**
 * A record read from storage or a backup file, checked: null if it isn't
 * one. `days` (the plan's length), when known, drops days past the end.
 */
export function sanitizeRecord(raw, days = Infinity) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.plan !== 'string' || !/^[a-z0-9-]{1,40}$/.test(raw.plan)) return null;
  if (typeof raw.started !== 'string' || !DATE.test(raw.started) || Number.isNaN(utc(raw.started))) return null;
  const read = {};
  if (raw.read && typeof raw.read === 'object') {
    for (const [day, keys] of Object.entries(raw.read)) {
      const index = Number(day);
      if (!Number.isInteger(index) || index < 0 || index >= days || !Array.isArray(keys)) continue;
      const valid = [...new Set(keys.filter((key) => typeof key === 'string' && /^[1-3A-Z]{3}\.\d{1,3}$/.test(key)))];
      if (valid.length) read[index] = valid;
    }
  }
  const updated = typeof raw.updated === 'string' && !Number.isNaN(Date.parse(raw.updated)) ? raw.updated : new Date(0).toISOString();
  return { plan: raw.plan, started: raw.started, read, updated };
}

/**
 * Combine progress on this device with imported progress: one record per
 * plan, the more recently changed one winning ('merge'), or only the
 * imported ones ('replace').
 */
export function mergeRecords(current, incoming, mode = 'merge') {
  if (mode === 'replace') return [...incoming];
  const byPlan = new Map(current.map((record) => [record.plan, record]));
  for (const record of incoming) {
    const mine = byPlan.get(record.plan);
    if (!mine || record.updated > mine.updated) byPlan.set(record.plan, record);
  }
  return [...byPlan.values()];
}
