#!/usr/bin/env node
/**
 * The Russian translation of Torrey's statements (data/topics/<id>.json
 * "lines") lives in tools/topics-ru/<id>.txt: one line per statement, in
 * the same order. This tool hands the English out as numbered jobs, takes
 * translated jobs back in, and checks them. Guidelines: tools/topics-ru/README.md.
 *
 *   node tools/translate-topics.mjs export <id>…            the English of these topics, as a job
 *   node tools/translate-topics.mjs batches <n> <dir>        all untranslated topics as n jobs of similar size
 *   node tools/translate-topics.mjs import <job file>…       check translated jobs and write tools/topics-ru/<id>.txt
 *   node tools/translate-topics.mjs check [<id>…]            check the translations (all by default)
 *   node tools/translate-topics.mjs status                   how many topics are translated
 *
 * A job: for each topic a header, then its statements, numbered; a
 * sub-statement (Torrey's second level) is indented two spaces:
 *
 *   ## faith | Faith | Вера
 *   1	Is the substance of things hoped for
 *   4	The objects of, are
 *   5	  God
 *
 * The translated job keeps every header and number and replaces the text.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'tools', 'topics-ru');
const index = () => JSON.parse(readFileSync(join(ROOT, 'data', 'topics', 'index.json'), 'utf8')).topics;
const topic = (id) => JSON.parse(readFileSync(join(ROOT, 'data', 'topics', `${id}.json`), 'utf8'));
const fileOf = (id) => join(DIR, `${id}.txt`);

export function exportJob(ids, titles) {
  return ids
    .map((id) => {
      const { en, ru, lines } = topic(id);
      return [`## ${id} | ${en} | ${titles?.get(id) ?? ru ?? ''}`, ...lines.map((line, i) => `${i + 1}\t${line.l === 2 ? '  ' : ''}${line.t}`)].join('\n');
    })
    .join('\n\n');
}

/** A job's text → Map(id → [lines]); throws with what's wrong. */
export function readJob(text) {
  const out = new Map();
  let id = null;
  for (const [n, raw] of text.split('\n').entries()) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    const head = /^##\s+([a-z0-9-]+)\s*\|/.exec(line);
    if (head) {
      id = head[1];
      if (out.has(id)) throw new Error(`line ${n + 1}: ${id} appears twice`);
      out.set(id, []);
      continue;
    }
    const m = /^(\d+)\t(.*)$/.exec(line);
    if (!m || !id) throw new Error(`line ${n + 1}: expected "<number><tab><text>": ${line.slice(0, 80)}`);
    const list = out.get(id);
    if (Number(m[1]) !== list.length + 1) throw new Error(`${id}: statement ${m[1]} where ${list.length + 1} was expected`);
    list.push(m[2].trim());
  }
  return out;
}

/**
 * Problems with one topic's Russian lines (empty = fine). `english` is the
 * topic's statements (default: data/topics/<id>.json's).
 */
export function problems(id, lines, english = topic(id).lines) {
  const out = [];
  if (lines.length !== english.length) out.push(`${id}: ${lines.length} lines for ${english.length} statements`);
  lines.forEach((line, i) => {
    if (!line.trim()) out.push(`${id} ${i + 1}: empty`);
    // Russian, unless the English is only numbers or symbols.
    else if (!/[А-Яа-яЁё]/.test(line) && /[A-Za-z]/.test(english[i]?.t ?? '')) out.push(`${id} ${i + 1}: not Russian: ${line}`);
    if (/\t/.test(line)) out.push(`${id} ${i + 1}: a tab inside the text`);
  });
  return out;
}

export const readTranslation = (id) => (existsSync(fileOf(id)) ? readFileSync(fileOf(id), 'utf8').replace(/\n$/, '').split('\n') : null);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, ...args] = process.argv.slice(2);
  const all = index();
  if (command === 'export') {
    console.log(exportJob(args));
  } else if (command === 'batches') {
    const [count, dir] = [Number(args[0]), args[1]];
    const todo = all.filter((entry) => !existsSync(fileOf(entry.id)));
    const words = (id) => topic(id).lines.reduce((sum, line) => sum + line.t.split(' ').length, 0);
    const total = todo.reduce((sum, entry) => sum + words(entry.id), 0);
    mkdirSync(dir, { recursive: true });
    let batch = [];
    let size = 0;
    let n = 1;
    for (const entry of todo) {
      batch.push(entry.id);
      size += words(entry.id);
      if (size >= total / count && n < count) {
        writeFileSync(join(dir, `batch-${n}.en.txt`), `${exportJob(batch)}\n`);
        console.log(`batch-${n}: ${batch.length} topics, ${size} words`);
        batch = [];
        size = 0;
        n += 1;
      }
    }
    if (batch.length) {
      writeFileSync(join(dir, `batch-${n}.en.txt`), `${exportJob(batch)}\n`);
      console.log(`batch-${n}: ${batch.length} topics, ${size} words`);
    }
  } else if (command === 'import') {
    mkdirSync(DIR, { recursive: true });
    let bad = 0;
    for (const file of args) {
      const job = readJob(readFileSync(file, 'utf8'));
      for (const [id, lines] of job) {
        const found = problems(id, lines);
        if (found.length) {
          bad += found.length;
          console.error(found.join('\n'));
          continue;
        }
        writeFileSync(fileOf(id), `${lines.join('\n')}\n`);
      }
      console.log(`${file}: ${job.size} topics read`);
    }
    if (bad) process.exitCode = 1;
  } else if (command === 'check') {
    const ids = args.length ? args : all.map((entry) => entry.id);
    const found = ids.flatMap((id) => {
      const lines = readTranslation(id);
      return lines ? problems(id, lines) : [`${id}: not translated`];
    });
    console.log(found.length ? found.join('\n') : `OK: ${ids.length} topics`);
    if (found.length) process.exitCode = 1;
  } else if (command === 'status') {
    const done = all.filter((entry) => existsSync(fileOf(entry.id))).length;
    console.log(`${done} of ${all.length} topics translated`);
  } else {
    console.log('Commands: export, batches, import, check, status (see the top of this file).');
  }
}
