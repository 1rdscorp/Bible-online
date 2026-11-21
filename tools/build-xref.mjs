#!/usr/bin/env node
/**
 * Rebuild data/xref/<BOOK>.json, the cross references, from OpenBible.info's
 * "cross_references.txt" (CC BY; see tools/research-sources.json).
 *
 *   node tools/build-xref.mjs
 *
 * The source is a tab-separated list of 344,800 references, each with the
 * number of votes readers gave it:
 *
 *   From Verse   To Verse              Votes
 *   Gen.1.1      Heb.11.3              1079
 *   Gen.1.1      Col.1.16-Col.1.17     631
 *
 * One file per book keeps each download small (the reader fetches only the
 * book being read). Each verse's references are sorted best first:
 *
 *   { "formatVersion": 1, "book": "JHN",
 *     "verses": { "3:16": [["ROM 5:8", 312], ["1JN 4:9-10", 287], …], … } }
 *
 * Verse numbers are English (KJV) numbering, like the rest of the site. The
 * set's content version goes into data/research.json for cache keys.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { checkPinned, download } from './lib/download.mjs';
import { osisToRefs, parseOsisVerse } from './lib/osis.mjs';
import { contentVersion } from './lib/translation-file.mjs';
import { readZipEntry } from './lib/zip.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'data', 'xref');
export const XREF_FORMAT_VERSION = 1;

/**
 * Parse the source text into Map<"BOOK c:v", Map<targetRef, votes>>.
 * `lastVerse(book, chapter)` says how many verses a chapter has in the KJV
 * (0 if none): a reference from or to a verse it lacks is dropped (and
 * counted), and ranges are clipped to it.
 */
export function parseCrossReferences(text, { minVotes = 1, lastVerse } = {}) {
  const exists = ({ book, chapter, verse }) => !lastVerse || verse <= lastVerse(book, chapter);
  const byVerse = new Map();
  const stats = { rows: 0, kept: 0, lowVotes: 0, unreadable: 0, missingVerse: 0, selfReference: 0, duplicate: 0 };
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('From Verse')) continue;
    const [from, to, votesText] = line.split('\t');
    stats.rows += 1;
    const votes = Number(votesText);
    if (!(votes >= minVotes)) {
      stats.lowVotes += 1;
      continue;
    }
    const source = parseOsisVerse(from);
    const targets = osisToRefs(to, lastVerse);
    if (!source || targets.length === 0) {
      stats.unreadable += 1;
      continue;
    }
    if (!exists(source) || !exists(parseOsisVerse(to.split('-')[0]))) {
      stats.missingVerse += 1;
      continue;
    }
    const key = `${source.book} ${source.chapter}:${source.verse}`;
    let list = byVerse.get(key);
    if (!list) byVerse.set(key, (list = new Map()));
    for (const target of targets) {
      if (target === key) {
        stats.selfReference += 1;
      } else if (list.has(target)) {
        stats.duplicate += 1;
        list.set(target, Math.max(list.get(target), votes));
      } else {
        list.set(target, votes);
        stats.kept += 1;
      }
    }
  }
  return { byVerse, stats };
}

/** Canonical position of a reference, for ordering ties: "GEN 1:1" → [0, 1, 1]. */
function position(ref) {
  const [book, rest] = ref.split(' ');
  const [chapter, verse] = rest.split(/[:-]/).map(Number);
  return [BOOKS.findIndex((b) => b.id === book), chapter, verse];
}

function compareRefs(a, b) {
  const pa = position(a);
  const pb = position(b);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2] || (a < b ? -1 : a > b ? 1 : 0);
}

/** One book's file: verses in order, each verse's references best first (ties in Bible order). */
export function bookFile(bookId, byVerse) {
  const keys = [...byVerse.keys()].filter((key) => key.startsWith(`${bookId} `)).sort(compareRefs);
  const lines = keys.map((key) => {
    const list = [...byVerse.get(key)].sort((a, b) => b[1] - a[1] || compareRefs(a[0], b[0]));
    return `${JSON.stringify(key.slice(bookId.length + 1))}:${JSON.stringify(list)}`;
  });
  // One verse per line keeps rebuild diffs readable.
  return `{"formatVersion":${XREF_FORMAT_VERSION},"book":"${bookId}","verses":{\n${lines.join(',\n')}\n}}\n`;
}

// Run as a script (not when tests import the functions above).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { xref: source } = JSON.parse(await readFile(join(ROOT, 'tools', 'research-sources.json'), 'utf8'));
  console.log('Cross references (OpenBible.info)');
  const bytes = await download(source.url);
  checkPinned('xref', source.sha256, bytes);
  const text = readZipEntry(bytes, source.entry).toString('utf8');

  // Which verses the KJV has, to drop references to verses that don't exist.
  const kjv = JSON.parse(await readFile(join(ROOT, 'data', 'kjv.json'), 'utf8'));
  const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
  const lastVerse = (book, chapter) => {
    const verses = chapters.get(book)?.[chapter - 1] ?? [];
    let last = verses.length;
    while (last > 0 && !verses[last - 1]) last -= 1;
    return last;
  };

  const { byVerse, stats } = parseCrossReferences(text, { minVotes: source.minVotes, lastVerse });
  console.log(`  ${stats.rows} rows: kept ${stats.kept}; left out ${stats.lowVotes} with under ${source.minVotes} vote(s), ` +
    `${stats.unreadable} unreadable, ${stats.missingVerse} to or from a verse the KJV lacks, ` +
    `${stats.selfReference} to themselves, ${stats.duplicate} duplicates`);

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  let all = '';
  let total = 0;
  for (const book of BOOKS) {
    const file = bookFile(book.id, byVerse);
    await writeFile(join(OUT_DIR, `${book.id}.json`), file);
    all += file;
    total += Buffer.byteLength(file);
  }
  const version = contentVersion(all);
  await updateResearchManifest('xref', {
    url: 'data/xref/',
    version,
    references: stats.kept,
    license: 'CC BY',
    source: { name: 'OpenBible.info', url: 'https://www.openbible.info/labs/cross-references/' },
  });
  console.log(`  ${BOOKS.length} files, ${(total / 1e6).toFixed(1)} MB, version ${version}`);
}
