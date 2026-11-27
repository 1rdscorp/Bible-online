/**
 * Backup files: everything the reader has saved on this device, as one JSON
 * file they can keep, and import again here or on another device.
 *
 *   {
 *     "format": "bible-online-backup", "version": 1,
 *     "exported": "2026-11-21T18:00:00.000Z",
 *     "data": {
 *       "study":        { "items": [ … highlights, notes, bookmarks … ] },
 *       "settings":     { "theme": "sepia", "fontScale": 110, "language": "ru" },
 *       "translations": { … which translations were last shown … },
 *       "lastRead":     { "bookId": "JHN", "chapter": 3 },
 *       "plans":        [ … reading-plan progress (js/plans/model.js records) … ]
 *     }
 *   }
 *
 * Importing never trusts the file: every study item is checked
 * (model.js sanitizeItem) and bad ones are skipped and counted; settings and
 * translation choices are cleaned by their own modules when applied; plan
 * records are checked by js/plans/model.js sanitizeRecord. Backups made
 * before reading plans existed simply have no "plans".
 *
 * Pure: unit-tested in tests/study-backup.test.js.
 */
import { sanitizeRecord } from '../plans/model.js';
import { applyHighlight, sanitizeItem } from './model.js';

export const BACKUP_FORMAT = 'bible-online-backup';
export const BACKUP_VERSION = 1;
// A backup bigger than this is not one of ours (a year of daily notes is a
// few megabytes at most).
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export function makeBackup({ items = [], settings = null, translations = null, lastRead = null, plans = [] }, now = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported: now,
    data: { study: { items }, settings, translations, lastRead, plans },
  };
}

/** "bible-online-backup-2026-11-21.json" */
export function backupFileName(now = new Date()) {
  return `bible-online-backup-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Read a backup file's text. Returns
 *   { ok: true, items, skipped, settings, translations, lastRead, plans, exported }
 * or { ok: false, error: 'json' | 'format' | 'version' | 'size' }.
 */
export function readBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'size' };
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!file || typeof file !== 'object' || file.format !== BACKUP_FORMAT || typeof file.data !== 'object' || !file.data) {
    return { ok: false, error: 'format' };
  }
  if (!Number.isInteger(file.version) || file.version > BACKUP_VERSION) return { ok: false, error: 'version' };

  const raw = Array.isArray(file.data.study?.items) ? file.data.study.items : [];
  const items = [];
  const ids = new Set();
  let skipped = 0;
  for (const entry of raw) {
    const item = sanitizeItem(entry);
    if (!item || ids.has(item.id)) {
      skipped += 1;
      continue;
    }
    ids.add(item.id);
    items.push(item);
  }
  const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
  return {
    ok: true,
    items,
    skipped,
    settings: object(file.data.settings),
    translations: object(file.data.translations),
    lastRead: object(file.data.lastRead),
    plans: (Array.isArray(file.data.plans) ? file.data.plans : []).map((raw) => sanitizeRecord(raw)).filter(Boolean),
    exported: typeof file.exported === 'string' ? file.exported : null,
  };
}

/**
 * Highlights may overlap after combining two sets (a verse yellow here,
 * green in the backup). Re-apply them oldest first, so the most recently
 * changed colour wins and each verse ends up with one.
 */
export function normalizeHighlights(items) {
  const others = items.filter((item) => item.type !== 'highlight');
  const highlights = items.filter((item) => item.type === 'highlight').sort((a, b) => (a.updated < b.updated ? -1 : a.updated > b.updated ? 1 : 0));
  let kept = [];
  for (const item of highlights) {
    const { remove, add } = applyHighlight(kept, item.ref, item.color, item.updated);
    // Keep the item's own id and dates for the range it was given.
    kept = kept.filter((existing) => !remove.includes(existing.id));
    for (const added of add) {
      const own = added.ref.start === item.ref.start && added.ref.end === item.ref.end && added.color === item.color;
      kept.push(own ? item : added);
    }
  }
  return [...others, ...kept];
}

/**
 * Combine the items on this device with imported ones.
 *   'merge'   both sets; for the same id, the more recently changed copy
 *   'replace' only the imported ones
 * Returns { items, added, updated }.
 */
export function mergeItems(current, incoming, mode = 'merge') {
  if (mode === 'replace') return { items: normalizeHighlights(incoming), added: incoming.length, updated: 0 };
  const byId = new Map(current.map((item) => [item.id, item]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const mine = byId.get(item.id);
    if (!mine) {
      byId.set(item.id, item);
      added += 1;
    } else if (item.updated > mine.updated) {
      byId.set(item.id, item);
      updated += 1;
    }
  }
  return { items: normalizeHighlights([...byId.values()]), added, updated };
}
