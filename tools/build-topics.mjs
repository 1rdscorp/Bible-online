#!/usr/bin/env node
/**
 * Builds the topical index (data/topics/) from R. A. Torrey's New Topical
 * Textbook (1897, public domain), as CCEL publishes it in ThML with every
 * Scripture reference marked up:
 *
 *   node tools/build-topics.mjs
 *
 * Torrey arranges each topic as short statements, each followed by the
 * verses that show it ("Is the gift of God — Ro 12:3; Eph 2:8"); some
 * statements head a group of sub-statements ("The objects of, are" → "God",
 * "Christ" …). The output:
 *
 *   data/topics/index.json   [{ id, en, ru, letter, refs }] for the list and lookups
 *   data/topics/<id>.json    { id, en, ru, lines: [{ l: 1|2, t: "Is of God", ru: "От Бога", r: ["PSA 65:4"], see: ["prayer"] }] }
 *   data/topics/refs.json    { GEN: [[chapter, verse, endChapter, endVerse, topic, line], …] }
 *                            which statements cite each passage (the Research panel's Topics tab)
 *
 * Every reference is checked against the KJV's verses; CCEL's few that point
 * to verses that don't exist are left out (and counted). The Russian titles
 * come from tools/topics-ru.json, and the Russian statements (an AI
 * translation, line for line) from tools/topics-ru/<id>.txt: see
 * tools/translate-topics.mjs.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { download } from './lib/download.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { decodeEntities, scripRefTargets } from './lib/thml.mjs';
import { problems, readTranslation } from './translate-topics.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SOURCE = {
  name: "Torrey's New Topical Textbook",
  author: 'R. A. Torrey',
  year: 1897,
  url: 'https://www.ccel.org/ccel/t/torrey/ttt.xml',
  page: 'https://www.ccel.org/ccel/torrey/ttt.html',
  license: 'Public domain',
};

/**
 * Topics CCEL titles wrongly, by the id of their <term>: a lone letter,
 * a garbled title, and two topics that repeat the title before them.
 */
export const TITLE_FIXES = {
  'b-p166.4': 'Beasts',
  'a-p1077.2': 'Arts',
  'c-p1155.2': 'Compassion and Sympathy',
  'e-p77.2': 'Earth',
};

/** "Affections, The" → "Affections"; "Herbs, &amp; C" → "Herbs, &c." */
export function cleanTitle(raw) {
  return decodeEntities(raw)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*&\s*C$/i, ', etc.')
    .replace(/,\s*The$/i, '')
    .trim();
}

/** A URL-safe id from a title: "Access to God" → "access-to-god". */
export function slug(title) {
  return title
    .toLowerCase()
    .replace(/’/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const plain = (html) => decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/**
 * One paragraph of a topic: its statement, references and "See …" links.
 * "Is by Christ — Joh 10:7, 9; 14:6." → { t: "Is by Christ", r: ["JHN 10:7", "JHN 10:9", "JHN 14:6"], seeText: [] }
 */
export function readLine(html, lastVerse) {
  const refs = [];
  let bad = 0;
  // CCEL tags a one-chapter book's reference as "Jude 1" and leaves the
  // verse outside the tag ("<scripRef>Jude 1</scripRef>:20"): read it back in.
  const text = html.replace(/<scripRef([^>]*)>([\s\S]*?)<\/scripRef>(?::(\d+)(?:[-–](\d+))?)?/g, (all, attrText, shown, verse, endVerse) => {
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((m) => [m[1], decodeEntities(m[2])]));
    const single = verse && /^Bible:(Obad|Phlm|2John|3John|Jude)\.1\.\d+$/.exec(attrs.osisRef ?? '');
    if (single) attrs.osisRef = `Bible:${single[1]}.1.${verse}${endVerse ? `-${single[1]}.1.${endVerse}` : ''}`;
    const found = scripRefTargets(attrs, lastVerse, single ? '' : plain(shown));
    if (!found.length) bad += 1;
    refs.push(...found);
    return '\u0000';
  });
  const flat = plain(text);
  // The statement: what comes before the dash (or the first reference).
  const dash = flat.search(/\s[—–-]\s|\u0000/);
  let statement = (dash === -1 ? flat : flat.slice(0, dash)).replace(/\u0000/g, '');
  const rest = dash === -1 ? '' : flat.slice(dash);
  statement = statement.replace(/[\s.,;:—–-]+$/, '').replace(/^[–—-]\s*/, '').trim();
  // "See Prayer." / "See also Faith; Hope" after the dash.
  const seeText = [];
  for (const m of rest.replace(/\u0000/g, ' ').matchAll(/\bSee(?: also)?\s+([^.;]+?)(?=[.;]|$)/g)) {
    for (const name of m[1].split(/,\s*|\s+and\s+/)) if (name.trim()) seeText.push(name.trim());
  }
  return { t: statement, r: [...new Set(refs)], seeText, bad };
}

/** Topics in the book: [{ title, lines: [{ l, t, r, seeText }] }]. */
export function readTopics(xml, lastVerse) {
  const topics = [];
  let bad = 0;
  const pattern = /<term(?:[^>]*\sid="([^"]*)")?[^>]*>([\s\S]*?)<\/term>\s*<def[^>]*>([\s\S]*?)<\/def>/g;
  for (const [, termId, term, def] of xml.matchAll(pattern)) {
    const lines = [];
    for (const [, level, body] of def.matchAll(/<p class="index(\d)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const line = readLine(body, lastVerse);
      bad += line.bad;
      delete line.bad;
      if (!line.t && !line.r.length) continue;
      lines.push({ l: Number(level) >= 2 ? 2 : 1, ...line });
    }
    topics.push({ title: TITLE_FIXES[termId] ?? cleanTitle(term), lines });
  }
  return { topics, bad };
}

/** Link "See Prayer" to the topic called Prayer (or "Prayer, The"), where there is one. */
export function linkSee(topics) {
  const byName = new Map(topics.map((topic) => [topic.title.toLowerCase(), topic.id]));
  for (const topic of topics) {
    for (const line of topic.lines) {
      const see = line.seeText.map((name) => byName.get(name.toLowerCase().replace(/^the\s+/, '').replace(/,\s*the$/, ''))).filter((id) => id && id !== topic.id);
      delete line.seeText;
      if (see.length) line.see = [...new Set(see)];
    }
  }
}

const refPattern = /^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;

/** The reverse index: per book, [chapter, verse, endChapter, endVerse, topic, line]. */
export function refIndex(topics) {
  const byBook = Object.fromEntries(BOOKS.map((book) => [book.id, []]));
  topics.forEach((topic, t) => {
    topic.lines.forEach((line, l) => {
      for (const ref of line.r) {
        const m = refPattern.exec(ref);
        const chapter = Number(m[2]);
        const verse = Number(m[3]);
        const endChapter = m[4] ? Number(m[4]) : chapter;
        const endVerse = m[5] ? Number(m[5]) : verse;
        byBook[m[1]].push([chapter, verse, endChapter, endVerse, t, l]);
      }
    });
  });
  for (const list of Object.values(byBook)) list.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[4] - b[4] || a[5] - b[5]);
  return byBook;
}

const version = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const kjv = JSON.parse(await readFile(join(ROOT, 'data', 'kjv.json'), 'utf8'));
  const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
  const lastVerse = (book, chapter) => (chapters.get(book)?.[chapter - 1] ?? []).filter(Boolean).length;
  const ru = JSON.parse(await readFile(join(ROOT, 'tools', 'topics-ru.json'), 'utf8'));

  const xml = (await download(SOURCE.url)).toString('utf8');
  const { topics, bad } = readTopics(xml, lastVerse);
  const ids = new Set();
  for (const topic of topics) {
    let id = slug(topic.title);
    while (ids.has(id)) id += '-2';
    ids.add(id);
    topic.id = id;
  }
  linkSee(topics);

  const missing = topics.filter((topic) => !ru[topic.id]).map((topic) => topic.id);
  if (missing.length) console.warn(`  ${missing.length} topics have no Russian title in tools/topics-ru.json: ${missing.slice(0, 10).join(', ')}…`);

  const dir = join(ROOT, 'data', 'topics');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const hash = createHash('sha256');
  const write = async (name, data) => {
    const text = `${JSON.stringify(data)}\n`;
    hash.update(name).update(text);
    await writeFile(join(dir, name), text);
  };
  const count = (topic) => topic.lines.reduce((sum, line) => sum + line.r.length, 0);
  let translated = 0;
  for (const topic of topics) {
    // The Russian statements, where a checked translation exists.
    const lines = readTranslation(topic.id);
    const usable = lines && problems(topic.id, lines, topic.lines).length === 0;
    if (lines && !usable) console.warn(`  tools/topics-ru/${topic.id}.txt doesn't fit the topic: left out (node tools/translate-topics.mjs check ${topic.id})`);
    if (usable) translated += 1;
    const out = topic.lines.map((line, i) => {
      const { l, t, ...rest } = line;
      return usable ? { l, t, ru: lines[i], ...rest } : line;
    });
    await write(`${topic.id}.json`, { id: topic.id, en: topic.title, ru: ru[topic.id] ?? null, lines: out });
  }
  const index = topics.map((topic) => ({ id: topic.id, en: topic.title, ru: ru[topic.id] ?? null, refs: count(topic) }));
  await write('index.json', { formatVersion: 1, source: SOURCE, topics: index });
  await write('refs.json', refIndex(topics));

  const total = topics.reduce((sum, topic) => sum + count(topic), 0);
  console.log(`${topics.length} topics, ${topics.reduce((s, t) => s + t.lines.length, 0)} statements, ${total} references (${bad} references to verses that don't exist left out); ${translated} topics with Russian statements`);
  await updateResearchManifest('topics', {
    url: 'data/topics/',
    version: hash.digest('hex').slice(0, 12),
    topics: topics.length,
    translated,
    references: total,
    license: SOURCE.license,
    source: { name: SOURCE.name, author: SOURCE.author, year: SOURCE.year, url: SOURCE.page },
  });
}

export { version };
