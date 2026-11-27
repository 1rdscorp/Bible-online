#!/usr/bin/env node
/**
 * Builds the reading plans (data/plans.json) and lists them in
 * data/research.json, so the site loads and saves them for offline use like
 * the other study data.
 *
 *   node tools/build-plans.mjs
 *
 * Each plan reads whole chapters in order. Its days are balanced by length
 * (the KJV's word count per chapter), not by number of chapters, so every
 * day takes about the same time: Psalm 117 and Psalm 119 aren't each a
 * day's reading. A day can cross from one book into the next.
 *
 * File format:
 *   { "formatVersion": 1, "wordsPerMinute": 200,
 *     "plans": [{ "id": "bible-year", "name": { "en", "ru" }, "description": { "en", "ru" },
 *                 "days": [["GEN 1-3"], ["GEN 4-7"], …],   one list of passages per day
 *                 "minutes": [14, 13, …] }] }               reading time per day
 * A passage is a book and a chapter or chapter range ("GEN 50", "EXO 1-2").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const WORDS_PER_MINUTE = 200;

const books = (from, to) => BOOKS.slice(BOOKS.findIndex((b) => b.id === from), BOOKS.findIndex((b) => b.id === to) + 1).map((b) => b.id);

/** The plans: their chapters (book ids), days and names. */
export const PLAN_DEFINITIONS = [
  {
    id: 'bible-year',
    days: 365,
    tracks: [books('GEN', 'REV')],
    name: { en: 'The Bible in a year', ru: 'Библия за год' },
    description: {
      en: 'The whole Bible from Genesis to Revelation, in book order.',
      ru: 'Вся Библия от Бытия до Откровения, по порядку книг.',
    },
  },
  {
    id: 'ot-nt-year',
    days: 365,
    tracks: [books('GEN', 'MAL'), books('MAT', 'REV')],
    name: { en: 'Old and New Testament in a year', ru: 'Ветхий и Новый Завет за год' },
    description: {
      en: 'The whole Bible in a year, reading the Old and New Testaments side by side: the Old every day, the New on most days.',
      ru: 'Вся Библия за год, Ветхий и Новый Завет параллельно: Ветхий каждый день, Новый — почти каждый день.',
    },
  },
  {
    id: 'nt-90',
    days: 90,
    tracks: [books('MAT', 'REV')],
    name: { en: 'The New Testament in 90 days', ru: 'Новый Завет за 90 дней' },
    description: {
      en: 'From Matthew to Revelation in three months.',
      ru: 'От Евангелия от Матфея до Откровения за три месяца.',
    },
  },
  {
    id: 'gospels-30',
    days: 30,
    tracks: [books('MAT', 'JHN')],
    name: { en: 'The Gospels in 30 days', ru: 'Евангелия за 30 дней' },
    description: {
      en: 'Matthew, Mark, Luke and John in a month.',
      ru: 'Евангелия от Матфея, Марка, Луки и Иоанна за месяц.',
    },
  },
  {
    id: 'psalms-proverbs-31',
    days: 31,
    // Proverbs has 31 chapters: one for each day of the month.
    tracks: [['PSA'], ['PRO']],
    name: { en: 'Psalms and Proverbs in a month', ru: 'Псалтирь и Притчи за месяц' },
    description: {
      en: 'A few Psalms and a chapter of Proverbs every day for 31 days.',
      ru: 'Каждый день несколько псалмов и глава из Притчей, 31 день.',
    },
  },
];

const countWords = (text) => (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []).length;

/** Words per chapter: "GEN.1" → 797, from a translation file. */
export function chapterWords(bible) {
  const words = new Map();
  for (const book of bible.books) {
    book.chapters.forEach((verses, index) => {
      words.set(`${book.id}.${index + 1}`, verses.reduce((sum, verse) => sum + countWords(verse ?? ''), 0));
    });
  }
  return words;
}

/**
 * Split items (in order, each with a weight) into `parts` consecutive,
 * non-empty groups of about equal weight: each cut falls at the item
 * boundary nearest to an even share of the total. With fewer items than
 * parts (the New Testament's 260 chapters over 365 days), each item goes to
 * the part where its middle falls, so they spread evenly and some parts
 * stay empty.
 */
export function partition(weights, parts) {
  if (parts > weights.length) return spread(weights, parts);
  const total = weights.reduce((a, b) => a + b, 0);
  const cuts = [];
  let sum = 0;
  let next = 1;
  for (let i = 0; i < weights.length && next < parts; i += 1) {
    const before = sum;
    sum += weights[i];
    const target = (total * next) / parts;
    if (sum >= target) {
      // Cut after item i, or before it if that's nearer the target.
      let cut = target - before < sum - target && i > (cuts.at(-1) ?? -1) ? i : i + 1;
      // Leave at least one item for every remaining group.
      cut = Math.min(cut, weights.length - (parts - next));
      if (cut <= (cuts.at(-1) ?? 0)) cut = (cuts.at(-1) ?? 0) + 1;
      cuts.push(cut);
      next += 1;
      if (cut === i) {
        i -= 1; // item i starts the next group; look at it again
        sum = before;
      }
    }
  }
  const groups = [];
  let start = 0;
  for (const cut of [...cuts, weights.length]) {
    groups.push([start, cut]);
    start = cut;
  }
  return groups;
}

function spread(weights, parts) {
  const total = weights.reduce((a, b) => a + b, 0);
  const groups = Array.from({ length: parts }, () => null);
  let sum = 0;
  weights.forEach((weight, i) => {
    const part = Math.min(parts - 1, Math.floor(((sum + weight / 2) / total) * parts));
    sum += weight;
    groups[part] = groups[part] ? [groups[part][0], i + 1] : [i, i + 1];
  });
  // Empty parts: an empty range where the next items start.
  let start = 0;
  return groups.map((group) => {
    if (group) start = group[1];
    return group ?? [start, start];
  });
}

/** ["GEN.50", "EXO.1", "EXO.2"] → ["GEN 50", "EXO 1-2"] */
export function toPassages(keys) {
  const passages = [];
  for (const key of keys) {
    const [book, chapter] = key.split('.');
    const n = Number(chapter);
    const last = passages.at(-1);
    if (last && last.book === book && last.to === n - 1) last.to = n;
    else passages.push({ book, from: n, to: n });
  }
  return passages.map(({ book, from, to }) => (from === to ? `${book} ${from}` : `${book} ${from}-${to}`));
}

export function buildPlan(definition, words) {
  const days = Array.from({ length: definition.days }, () => ({ keys: [], words: 0 }));
  for (const track of definition.tracks) {
    const keys = track.flatMap((id) => {
      const book = BOOKS.find((b) => b.id === id);
      return Array.from({ length: book.chapters }, (_, i) => `${id}.${i + 1}`);
    });
    const weights = keys.map((key) => words.get(key) ?? 0);
    partition(weights, definition.days).forEach(([from, to], day) => {
      days[day].keys.push(...keys.slice(from, to));
      days[day].words += weights.slice(from, to).reduce((a, b) => a + b, 0);
    });
  }
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    days: days.map((day) => toPassages(day.keys)),
    minutes: days.map((day) => Math.max(1, Math.round(day.words / WORDS_PER_MINUTE))),
  };
}

export function buildPlans(bible) {
  const words = chapterWords(bible);
  return { formatVersion: 1, wordsPerMinute: WORDS_PER_MINUTE, plans: PLAN_DEFINITIONS.map((definition) => buildPlan(definition, words)) };
}

/** One day per line, so the file stays readable and diffs stay small. */
export function plansFile(data) {
  const plans = data.plans.map((plan) => {
    const days = plan.days.map((day) => `        ${JSON.stringify(day)}`).join(',\n');
    return `    {\n      "id": ${JSON.stringify(plan.id)},\n      "name": ${JSON.stringify(plan.name)},\n      "description": ${JSON.stringify(plan.description)},\n      "minutes": ${JSON.stringify(plan.minutes)},\n      "days": [\n${days}\n      ]\n    }`;
  });
  return `{\n  "formatVersion": ${data.formatVersion},\n  "wordsPerMinute": ${data.wordsPerMinute},\n  "plans": [\n${plans.join(',\n')}\n  ]\n}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bible = JSON.parse(readFileSync(join(ROOT, 'data', 'kjv.json'), 'utf8'));
  const data = buildPlans(bible);
  const text = plansFile(data);
  writeFileSync(join(ROOT, 'data', 'plans.json'), text);
  for (const plan of data.plans) {
    const sorted = [...plan.minutes].sort((a, b) => a - b);
    console.log(`${plan.id}: ${plan.days.length} days, ${sorted[0]}–${sorted.at(-1)} min a day (median ${sorted[sorted.length >> 1]})`);
  }
  await updateResearchManifest('plans', {
    url: 'data/plans.json',
    version: contentVersion(text),
    plans: data.plans.map((plan) => plan.id),
  });
}
