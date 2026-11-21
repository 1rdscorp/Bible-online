#!/usr/bin/env node
/**
 * Rebuild data/<id>.json for the site's translations from their sources.
 *
 *   npm run build-data              all translations in tools/data-sources.json
 *   npm run build-data -- asv web   only these
 *
 * For each translation: download the source (cached in .cache/sources/,
 * which git ignores), convert it, renumber it to English verse numbers if its
 * source numbers verses differently ("versification", see
 * lib/versification.mjs), apply its text fixes, validate, write the file, and
 * update that translation's "version" in data/translations.json. Display
 * metadata (name, licence…) comes from data/translations.json.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readScrollmapper } from './lib/read-scrollmapper.mjs';
import { readUsfx } from './lib/read-usfx.mjs';
import { buildBooks, writeTranslationFile } from './lib/translation-file.mjs';
import { createVersificationMapper, remapVerses } from './lib/versification.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CACHE_DIR = join(ROOT, '.cache', 'sources');
const MANIFEST = join(ROOT, 'data', 'translations.json');

const READERS = {
  scrollmapper: (bytes) => readScrollmapper(JSON.parse(bytes)),
  usfx: (bytes) => readUsfx(bytes),
};

async function download(url) {
  // The URL is pinned to a commit, so a cached copy never goes stale.
  const file = join(CACHE_DIR, `${url.split('/').at(-2)}-${basename(url)}`.replace(/[^\w.-]/g, '_'));
  try {
    return await readFile(file, 'utf8');
  } catch {
    process.stdout.write(`  downloading ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const text = await response.text();
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, text);
    return text;
  }
}

const sources = JSON.parse(await readFile(join(ROOT, 'tools', 'data-sources.json'), 'utf8'));
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const wanted = process.argv.slice(2).map((id) => id.toLowerCase());
const ids = Object.keys(sources).filter((id) => !id.startsWith('_') && (wanted.length === 0 || wanted.includes(id)));

const unknown = wanted.filter((id) => !sources[id]);
if (unknown.length) {
  console.error(`No source configured for: ${unknown.join(', ')}`);
  process.exit(2);
}

let failed = false;
for (const id of ids) {
  const source = sources[id];
  const entry = manifest.translations.find((t) => t.id === id);
  if (!entry) {
    console.error(`${id}: add an entry to data/translations.json first.`);
    failed = true;
    continue;
  }
  console.log(`\n${entry.abbreviation} (${source.format})`);
  const read = READERS[source.format];
  if (!read) throw new Error(`${id}: unknown format "${source.format}"`);

  let verses = read(await download(source.url));
  if (source.versification) {
    // e.g. Russian Synodal ("rso") → English numbering, via the original-language numbering.
    const { scheme, corrections = {} } = source.versification;
    const [from, to] = await Promise.all(
      [scheme, 'eng'].map(async (name) => JSON.parse(await download(`${sources._versificationMappings}${name}.json`))),
    );
    verses = remapVerses(verses, createVersificationMapper({ from, to, corrections }));
    console.log(`  renumbered from "${scheme}" to English verse numbers (${Object.keys(corrections).length} corrections)`);
  }

  const { books, fixCounts } = buildBooks(verses, { fixes: source.fixes ?? [] });
  const result = await writeTranslationFile(join(ROOT, entry.url), {
    id,
    abbreviation: entry.abbreviation,
    name: entry.name,
    language: entry.language,
    direction: entry.direction ?? 'ltr',
    license: entry.license,
    source: source.url,
    books,
  });
  if (!result.ok) {
    failed = true;
    continue;
  }
  if (Object.keys(fixCounts).length) console.log(`  fixes applied: ${JSON.stringify(fixCounts)}`);
  console.log(`  ${(result.bytes / 1e6).toFixed(1)} MB, version ${result.version}`);
  entry.version = result.version;
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
if (failed) process.exit(1);
