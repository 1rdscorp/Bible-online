#!/usr/bin/env node
/**
 * Helpers for translating the commentary into Russian. The translations
 * live in tools/commentary-ru/<work>/<part>.txt (format: tools/lib/commentary-job.mjs;
 * style and terms: tools/commentary-ru/README.md), and
 * tools/build-commentary.mjs builds data/commentary/ru/ from them.
 *
 *   node tools/translate-commentary.mjs export <work> <part>        the English chapter as a job, on stdout
 *   node tools/translate-commentary.mjs check <work> <part> [file]  check a translation (default: its place in tools/commentary-ru/)
 *   node tools/translate-commentary.mjs compare <english> <russian>  check a translated piece of a job against the English piece
 *   node tools/translate-commentary.mjs verse "DAN 2:31-35"          a passage in the Synodal translation (and the KJV)
 *   node tools/translate-commentary.mjs status                      which chapters are translated
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRef } from '../js/research/refs.js';
import { compareJobs, fromJob, toJob } from './lib/commentary-job.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TRANSLATIONS = join(ROOT, 'tools', 'commentary-ru');

const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const index = () => readJson('data/commentary/index.json');

function load(workId, partId) {
  const work = index().works.find((entry) => entry.id === workId);
  const entry = work?.parts.find((part) => part.id === partId);
  if (!entry) throw new Error(`No chapter ${workId}/${partId}`);
  return { work, entry, part: readJson(`data/commentary/${workId}/${partId}.json`) };
}

/** A passage's verses: [[verse, text], …] for "DAN 2:31-35" or a whole chapter "DAN 2". */
export function passage(bible, text) {
  const whole = /^([1-3]?[A-Z]{2,3}) (\d+)$/.exec(text);
  const ref = whole ? { book: whole[1], chapter: Number(whole[2]), verse: 1, endChapter: Number(whole[2]), endVerse: Infinity } : parseRef(text);
  if (!ref) throw new Error(`Can't read "${text}"`);
  const chapters = bible.books.find((book) => book.id === ref.book)?.chapters ?? [];
  const out = [];
  for (let c = ref.chapter; c <= ref.endChapter; c += 1) {
    (chapters[c - 1] ?? []).forEach((verse, i) => {
      const v = i + 1;
      if ((c > ref.chapter || v >= ref.verse) && (c < ref.endChapter || v <= ref.endVerse) && verse) out.push([`${c}:${v}`, verse]);
    });
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'export') {
    const { part, entry } = load(args[0], args[1]);
    process.stdout.write(toJob(part, entry));
  } else if (command === 'check') {
    const { part, entry } = load(args[0], args[1]);
    const file = args[2] ?? join(TRANSLATIONS, args[0], `${args[1]}.txt`);
    const { errors } = fromJob(readFileSync(file, 'utf8'), part, entry);
    if (errors.length) {
      console.log(`${errors.length} problem(s) in ${file}:`);
      for (const error of errors.slice(0, 40)) console.log(`  ${error}`);
      process.exitCode = 1;
    } else {
      console.log(`OK: ${args[0]}/${args[1]}`);
    }
  } else if (command === 'compare') {
    const errors = compareJobs(readFileSync(args[0], 'utf8'), readFileSync(args[1], 'utf8'));
    if (errors.length) {
      console.log(`${errors.length} problem(s) in ${args[1]}:`);
      for (const error of errors.slice(0, 40)) console.log(`  ${error}`);
      process.exitCode = 1;
    } else {
      console.log(`OK: ${args[1]}`);
    }
  } else if (command === 'verse') {
    const rst = readJson('data/rst.json');
    const kjv = readJson('data/kjv.json');
    const english = new Map(passage(kjv, args[0]));
    for (const [where, text] of passage(rst, args[0])) console.log(`${where} ${text}\n      KJV: ${english.get(where) ?? ''}`);
  } else if (command === 'status') {
    let done = 0;
    let total = 0;
    for (const work of index().works) {
      const translated = work.parts.filter((part) => existsSync(join(TRANSLATIONS, work.id, `${part.id}.txt`)));
      done += translated.length;
      total += work.parts.length;
      console.log(`${work.id}: ${translated.length}/${work.parts.length}${translated.length ? ` (${translated.map((part) => part.id).join(', ')})` : ''}`);
    }
    console.log(`${done}/${total} chapters translated`);
  } else {
    console.log('Commands: export <work> <part> | check <work> <part> [file] | compare <english> <russian> | verse "<ref>" | status');
  }
}
