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
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPinned, download } from './lib/download.mjs';
import { readScrollmapper } from './lib/read-scrollmapper.mjs';
import { readUsfx } from './lib/read-usfx.mjs';
import { buildBooks, relabelVerses, splitVerses, writeTranslationFile } from './lib/translation-file.mjs';
import { createVersificationMapper, nativeChapterSpans, remapVerses } from './lib/versification.mjs';
import { readZipEntry } from './lib/zip.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = join(ROOT, 'data', 'translations.json');

// Each reader turns the downloaded bytes (a Buffer) into a stream of verses.
const READERS = {
  scrollmapper: (bytes) => readScrollmapper(JSON.parse(bytes.toString('utf8'))),
  usfx: (bytes, source) => readUsfx(bytes.toString('utf8'), { wordTags: Boolean(source.wordTags) }),
  // eBible.org's zipped USFX download; `entry` names the XML file inside.
  'usfx-zip': (bytes, source) => readUsfx(readZipEntry(bytes, source.entry).toString('utf8'), { wordTags: Boolean(source.wordTags) }),
};

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

  const bytes = await download(source.url);
  checkPinned(id, source.sha256, bytes);
  let verses = read(bytes, source);
  // Verses a source ran together, split at the given phrase (source numbering).
  if (source.splitVerses) verses = splitVerses(verses, source.splitVerses);
  // Lettered verses that belong elsewhere (source numbering), e.g. Brenton's Proverbs 24:22f–t.
  if (source.relabel) verses = relabelVerses(verses, source.relabel);

  let native = null;
  if (source.versification) {
    // e.g. Russian Synodal ("rso") → English numbering, via the original-language numbering.
    const { scheme, corrections = {} } = source.versification;
    const [from, to] = await Promise.all(
      [scheme, 'eng'].map(async (name) => JSON.parse((await download(`${sources._versificationMappings}${name}.json`)).toString('utf8'))),
    );
    const remapped = [...remapVerses(verses, createVersificationMapper({ from, to, corrections }))];
    // Remember where each English chapter sits in the source's own numbering,
    // so the reader can show it (e.g. "Псалом 22" beside English Psalm 23).
    native = nativeChapterSpans(remapped, from.maxVerses);
    verses = remapped;
    console.log(`  renumbered from "${scheme}" to English verse numbers (${Object.keys(corrections).length} corrections)`);
  }

  // "wordTags": keep the source's Strong's numbers as "tags" (KJV+).
  const { books, fixCounts, droppedChapters } = buildBooks(verses, { fixes: source.fixes ?? [], wordTags: Boolean(source.wordTags) });
  if (droppedChapters.length) console.log(`  left out (past the book's last chapter): ${droppedChapters.join(', ')}`);
  for (const book of books) if (native?.[book.id]) book.native = native[book.id];

  const result = await writeTranslationFile(join(ROOT, entry.url), {
    id,
    abbreviation: entry.abbreviation,
    name: entry.name,
    language: entry.language,
    direction: entry.direction ?? 'ltr',
    license: entry.license,
    source: source.url,
    ...(source.versification ? { nativeVersification: source.versification.scheme } : {}),
    ...(source.testaments ? { testaments: source.testaments } : {}),
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
