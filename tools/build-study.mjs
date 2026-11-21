#!/usr/bin/env node
/**
 * The study pages' content (data/study/: book introductions, timeline, map
 * pages, interactive "explore" pages) is written by hand. This stamps its content version into
 * data/research.json, which the site uses as the cache key, and lists the
 * books that have an introduction. tests/study-content.test.js checks the
 * content itself; run it after editing:
 *
 *   node tools/build-study.mjs && node --test tests/study-content.test.js
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STUDY = join(ROOT, 'data', 'study');

/** Book ids with an introduction, in canon order. */
export function introducedBooks() {
  const files = new Set(readdirSync(join(STUDY, 'books')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5)));
  return BOOKS.map((book) => book.id).filter((id) => files.has(id));
}

/** The interactive pages listed in explore.json (their files, relative to data/study/). */
export function explorePages() {
  return JSON.parse(readFileSync(join(STUDY, 'explore.json'), 'utf8')).pages.map((page) => page.file);
}

/** One version for all the study content: any edit refreshes readers' cached copies. */
export function studyVersion() {
  const parts = ['timeline.json', 'maps.json', 'explore.json', ...explorePages(), ...introducedBooks().map((id) => join('books', `${id}.json`))];
  return contentVersion(parts.map((part) => readFileSync(join(STUDY, part), 'utf8')).join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const books = introducedBooks();
  const version = studyVersion();
  await updateResearchManifest('study', {
    url: 'data/study/',
    version,
    books,
  });
  console.log(`Study content: ${books.length} book introductions, timeline, maps; version ${version}`);
}
