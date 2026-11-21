#!/usr/bin/env node
/**
 * Rebuild data/strongs/hebrew.json and greek.json, the Strong's dictionaries
 * behind KJV+'s word study, from Open Scriptures' JSON edition (CC BY-SA;
 * see tools/research-sources.json).
 *
 *   node tools/build-strongs.mjs
 *
 * The sources are JavaScript files (`var strongsHebrewDictionary = {…}`).
 * Each entry becomes:
 *
 *   "H7225": { "lemma": "רֵאשִׁית", "xlit": "rêʼshîyth", "pron": "ray-sheeth'",
 *              "def": "the first, in place, time, order or rank…",
 *              "kjv": "beginning, chief(-est), first(-fruits, part, time)…",
 *              "deriv": "from the same as H7218 (רֹאשׁ);" }
 *
 * "pron" (a pronunciation guide) is Hebrew only; empty fields are left out.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from './lib/download.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const STRONGS_FORMAT_VERSION = 1;

/** The object literal in `var x = {…}; module.exports = x;`. */
export function readDictionarySource(text) {
  const start = text.indexOf('{', text.indexOf('= '));
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No dictionary object found.');
  return JSON.parse(text.slice(start, end + 1));
}

// Strong's braces mark a definition borrowed from the related word
// ("{father}" for the Aramaic H2); the braces mean nothing to readers.
// Links to other entries lose their zero padding ("H0175" → "H175"), to
// match the keys.
const tidy = (value) =>
  String(value ?? '')
    .replace(/[{}]/g, '')
    .replace(/\b([HG])0+(\d)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

// The Greek dictionary marks renderings with symbols where the Hebrew one
// has words: "X" an idiom, "+" a phrase. A few KJV lists also start with
// the "--" that separates them from the definition in print.
const tidyKjvGreek = (value) =>
  tidy(value)
    .replace(/^--/, '')
    .replace(/:--/g, '; ')
    .replace(/(^|[\s(,])X(?=\s)/g, '$1[idiom]')
    .replace(/(^|[\s(,])\+(?=\s)/g, '$1[phrase]');

/** One source entry in the site's shape. */
export function convertEntry(entry, language) {
  const out = {
    lemma: tidy(entry.lemma),
    xlit: tidy(entry.xlit ?? entry.translit),
    pron: tidy(entry.pron),
    def: tidy(entry.strongs_def),
    kjv: language === 'grc' ? tidyKjvGreek(entry.kjv_def) : tidy(entry.kjv_def),
    deriv: tidy(entry.derivation),
  };
  for (const key of Object.keys(out)) if (out[key] === '') delete out[key];
  return out;
}

/**
 * Entries in number order ("H1", "H2", … "H10"), one per line.
 * `corrections`: { "G25": { "G5689": "H5689" } } fixes links that name the wrong entry.
 */
export function dictionaryFile(language, source, corrections = {}) {
  const number = (key) => Number(key.slice(1));
  const keys = Object.keys(source).filter((key) => /^[HG]\d+$/.test(key)).sort((a, b) => number(a) - number(b));
  const lines = keys.map((key) => {
    const entry = convertEntry(source[key], language);
    for (const [wrong, right] of Object.entries(corrections[key] ?? {})) {
      const pattern = new RegExp(`\\b${wrong}\\b`, 'g');
      if (!pattern.test(`${entry.deriv} ${entry.def}`)) throw new Error(`${key}: no link to ${wrong} to correct.`);
      for (const field of ['deriv', 'def']) if (entry[field]) entry[field] = entry[field].replace(pattern, right);
    }
    return `${JSON.stringify(key)}:${JSON.stringify(entry)}`;
  });
  return { text: `{"formatVersion":${STRONGS_FORMAT_VERSION},"language":"${language}","entries":{\n${lines.join(',\n')}\n}}\n`, count: keys.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { strongs: sources } = JSON.parse(await readFile(join(ROOT, 'tools', 'research-sources.json'), 'utf8'));
  console.log("Strong's dictionaries (Open Scriptures)");
  await mkdir(join(ROOT, 'data', 'strongs'), { recursive: true });
  const manifest = {
    license: 'CC BY-SA',
    source: { name: 'Open Scriptures', url: 'https://github.com/openscriptures/strongs' },
  };
  // "hbo": Ancient Hebrew (Biblical Aramaic entries are marked "(Aramaic)" in "deriv").
  for (const [name, language] of [['hebrew', 'hbo'], ['greek', 'grc']]) {
    const source = readDictionarySource((await download(sources[name])).toString('utf8'));
    const { text, count } = dictionaryFile(language, source, sources.linkCorrections);
    const url = `data/strongs/${name}.json`;
    await writeFile(join(ROOT, url), text);
    manifest[name] = { url, version: contentVersion(text), entries: count };
    console.log(`  ${name}: ${count} entries, ${(Buffer.byteLength(text) / 1e6).toFixed(1)} MB`);
  }
  await updateResearchManifest('strongs', manifest);
}
