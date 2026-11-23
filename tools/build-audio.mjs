#!/usr/bin/env node
/**
 * Build the audio Bible data from tools/audio-sources.json:
 *
 *   data/audio/<source>.json   one entry per recorded chapter, in canon order
 *   data/research.json         its "audio" entry (sources, credit, versions)
 *
 *   NODE_USE_ENV_PROXY=1 node tools/build-audio.mjs
 *
 * Only the source's catalogue page is read (cached in .cache/sources/): the
 * recordings stay on the source's site and the player streams them from
 * there, unchanged, as its terms ask.
 *
 * A recording is numbered like the printed Bible it was read from. For the
 * Synodal, the Psalms follow the Greek numbering (its Psalm 22 is the KJV's
 * Psalm 23) and a few chapters start a verse or two apart. The site uses KJV
 * numbers everywhere, so each recorded chapter is matched to the site's
 * chapters with the translation's own numbering (data/<translation>.json
 * keeps it per chapter as `native`; see tools/lib/versification.mjs):
 *
 *   chapter   the site chapter it belongs to: the first one holding at least a
 *             quarter of it (so a verse spilling over a boundary doesn't count)
 *   chapters  every site chapter it covers, when more than that one
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { download } from './lib/download.mjs';
import { decodeEntities } from './lib/thml.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const AUDIO_FORMAT_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Reading predanie.ru's catalogue page                                */
/* ------------------------------------------------------------------ */

/** "8:03" or "1:02:03" → seconds. */
export function seconds(text) {
  return String(text)
    .split(':')
    .reduce((sum, part) => sum * 60 + Number(part), 0);
}

/**
 * A predanie.ru work page → [{ title, rows: [{ id, title, page, src, seconds }] }].
 * The page lists its files by section (one per book) and carries the
 * player's playlist (file paths and lengths) as JSON in `data-playlist`.
 */
export function readPredaniePage(html) {
  const playlistText = /data-playlist="([^"]*)"/.exec(html)?.[1];
  if (!playlistText) throw new Error('predanie.ru: no data-playlist on the page');
  const playlist = new Map(JSON.parse(decodeEntities(playlistText)).map((track) => [track.id, track]));
  const sections = [];
  const sectionPattern = /<div class="collapsible-section" id="audio-section-\d+">([\s\S]*?)(?=<div class="collapsible-section"|$)/g;
  for (const [, body] of html.matchAll(sectionPattern)) {
    const title = decodeEntities(/<h4 class="section-title">([\s\S]*?)<\/h4>/.exec(body)?.[1] ?? '').trim();
    const rows = [];
    const rowPattern = /<div class="file-row" id="audio-(\d+)"[\s\S]*?<h5 class="file-title">([\s\S]*?)<\/h5>[\s\S]*?href="(\/audio\/[^"]+\/)"/g;
    for (const [, id, rowTitle, page] of body.matchAll(rowPattern)) {
      const track = playlist.get(Number(id));
      if (!track) throw new Error(`predanie.ru: file ${id} isn't in the playlist`);
      rows.push({ id: Number(id), title: decodeEntities(rowTitle).trim(), page, src: track.src, seconds: seconds(track.duration) });
    }
    sections.push({ title, rows });
  }
  return sections;
}

/** A file's chapter number from its title ("Глава 01", "Псалом 150", "…Паралипоменон, 1"), or null. */
export function chapterNumber(title) {
  const numbers = title.match(/\d+/g);
  return numbers ? Number(numbers.at(-1)) : null;
}

/* ------------------------------------------------------------------ */
/* Matching recorded chapters to the site's chapters                   */
/* ------------------------------------------------------------------ */

/**
 * For one book: recorded (native) chapter → [{ chapter, verses }], the site
 * chapters it covers and roughly how many of its verses fall in each.
 * `native` is the translation's map of site chapter → native spans
 * ([[22]] a whole chapter, [[9, 22, 39]] verses 22–39 of chapter 9);
 * `verseCount(chapter)` the verses in a site chapter.
 */
export function nativeCoverage(chapterCount, native = {}, verseCount = () => 1) {
  const coverage = new Map();
  for (let chapter = 1; chapter <= chapterCount; chapter += 1) {
    const spans = native[chapter] ?? [[chapter]];
    const partial = spans.filter((span) => span.length === 3).reduce((sum, [, from, to]) => sum + to - from + 1, 0);
    const wholes = spans.filter((span) => span.length === 1).length;
    for (const [n, from, to] of spans) {
      const verses = from === undefined ? Math.max(1, (verseCount(chapter) - partial) / wholes) : to - from + 1;
      if (!coverage.has(n)) coverage.set(n, []);
      coverage.get(n).push({ chapter, verses });
    }
  }
  return coverage;
}

/** The site chapter a recorded chapter belongs to: the first holding at least a quarter of it. */
export function primaryChapter(parts) {
  const total = parts.reduce((sum, part) => sum + part.verses, 0);
  return (parts.find((part) => part.verses >= total / 4) ?? parts.reduce((a, b) => (b.verses > a.verses ? b : a))).chapter;
}

/** Longest common prefix of some strings, cut back to a "/". */
function commonPath(strings) {
  let prefix = strings[0] ?? '';
  for (const text of strings) while (!text.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.slice(0, prefix.lastIndexOf('/') + 1);
}

/**
 * Build one source's data. `sections` from readPredaniePage; `bible` the
 * translation's data file (for its numbering and verse counts).
 * Returns { data, skipped } or throws if the page doesn't match the canon.
 */
export function buildSource(source, sections, bible) {
  const tracks = [];
  const skipped = [];
  const seen = new Set();
  for (const section of sections) {
    const bookId = source.sections[section.title];
    if (!bookId) {
      if (source.skip.includes(section.title)) continue;
      throw new Error(`${source.id}: unknown section "${section.title}"`);
    }
    if (seen.has(bookId)) throw new Error(`${source.id}: ${bookId} listed twice`);
    seen.add(bookId);
    const book = BOOKS.find((entry) => entry.id === bookId);
    const data = bible.books.find((entry) => entry.id === bookId);
    const coverage = nativeCoverage(book.chapters, data?.native, (chapter) => (data?.chapters[chapter - 1] ?? []).filter(Boolean).length || 1);

    const numbered = [];
    for (const row of section.rows) {
      const n = source.fixes?.[row.id]?.n ?? chapterNumber(row.title);
      if (n === null) skipped.push(`${bookId}: ${row.title}`);
      else numbered.push({ ...row, n });
    }
    // Every chapter of the printed numbering once. (The page lists some books
    // in text order, "1, 10, 11 … 2", so sort first.)
    numbered.sort((a, b) => a.n - b.n);
    const expected = [...coverage.keys()].sort((a, b) => a - b);
    const got = numbered.map((row) => row.n);
    if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`${source.id}: ${bookId} has chapters ${got.join(',')}, expected ${expected.join(',')}`);

    const reader = Object.entries(source.otherReaders ?? {}).find(([, books]) => books.includes(bookId))?.[0];
    for (const row of numbered) {
      const parts = coverage.get(row.n);
      const chapter = primaryChapter(parts);
      const chapters = [...new Set(parts.map((part) => part.chapter))];
      tracks.push({
        book: bookId,
        n: row.n,
        chapter,
        ...(chapters.length > 1 || chapters[0] !== chapter ? { chapters } : {}),
        src: row.src,
        page: row.page,
        seconds: row.seconds,
        ...(reader ? { reader } : {}),
      });
    }
  }
  const missing = BOOKS.filter((book) => !seen.has(book.id)).map((book) => book.id);
  if (missing.length) throw new Error(`${source.id}: no recording of ${missing.join(', ')}`);

  // Canon order, then the printed chapter number.
  const order = new Map(BOOKS.map((book, index) => [book.id, index]));
  tracks.sort((a, b) => order.get(a.book) - order.get(b.book) || a.n - b.n);
  // Shorter paths: the parts every file and page share are written once.
  const base = commonPath(tracks.map((track) => track.src));
  const pageBase = commonPath(tracks.map((track) => track.page));
  for (const track of tracks) {
    track.src = track.src.slice(base.length);
    track.page = track.page.slice(pageBase.length);
  }
  return {
    data: { formatVersion: AUDIO_FORMAT_VERSION, source: source.id, base: `${source.site}${base}`, pageBase: `${source.site}${pageBase}`, tracks },
    skipped,
  };
}

/** A data file: one track per line, so rebuild diffs stay readable. */
export function audioFile({ tracks, ...head }) {
  return `${JSON.stringify(head).slice(0, -1)},"tracks":[\n${tracks.map((track) => JSON.stringify(track)).join(',\n')}\n]}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { sources } = JSON.parse(await readFile(join(ROOT, 'tools', 'audio-sources.json'), 'utf8'));
  const entries = [];
  await mkdir(join(ROOT, 'data', 'audio'), { recursive: true });
  for (const source of sources) {
    const html = (await download(source.url)).toString('utf8');
    const bible = JSON.parse(await readFile(join(ROOT, 'data', `${source.translation}.json`), 'utf8'));
    const { data, skipped } = buildSource(source, readPredaniePage(html), bible);
    const text = audioFile(data);
    const file = `data/audio/${source.id}.json`;
    await writeFile(join(ROOT, file), text);
    const hours = data.tracks.reduce((sum, track) => sum + track.seconds, 0) / 3600;
    console.log(`${source.id}: ${data.tracks.length} chapters, ${hours.toFixed(1)} hours${skipped.length ? `; left out: ${skipped.join('; ')}` : ''}`);
    entries.push({
      id: source.id,
      translation: source.translation,
      language: source.language,
      title: source.title,
      url: file,
      version: createHash('sha256').update(text).digest('hex').slice(0, 12),
      tracks: data.tracks.length,
      seconds: data.tracks.reduce((sum, track) => sum + track.seconds, 0),
      readers: source.readers,
      reader: source.reader,
      page: source.url,
      credit: { name: source.credit.name, url: source.credit.url, terms: source.credit.terms },
    });
  }
  await updateResearchManifest('audio', { sources: entries });
}
