#!/usr/bin/env node
/**
 * Convert a USFX file (eBible.org's XML format) into this site's translation
 * format (see data/README.md). Only the 66 canonical books are kept.
 *
 *   node tools/convert-usfx.mjs <input.usfx.xml> <output.json> \
 *     --id web --name "World English Bible" [--abbr WEB] [--lang en] \
 *     [--license "Public domain"] [--source <url>] [--fix typography]
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { readUsfx } from './lib/read-usfx.mjs';
import { buildBooks, TEXT_FIXES, writeTranslationFile } from './lib/translation-file.mjs';

const USAGE = `Usage: node tools/convert-usfx.mjs <input.usfx.xml> <output.json> --id <id> --name <name>
       [--abbr <abbreviation>] [--lang <language>] [--dir ltr|rtl] [--license <text>] [--source <url>]
       [--fix ${Object.keys(TEXT_FIXES).join(',')}]`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    abbr: { type: 'string' },
    lang: { type: 'string', default: 'en' },
    dir: { type: 'string', default: 'ltr' },
    license: { type: 'string', default: 'Public domain' },
    source: { type: 'string', default: 'https://ebible.org/' },
    fix: { type: 'string', default: '' },
  },
});

const [input, output] = positionals;
if (!input || !output || !values.id || !values.name) {
  console.error(USAGE);
  process.exit(2);
}

const id = values.id.toLowerCase();
const fixes = values.fix.split(',').filter(Boolean);
const { books, fixCounts } = buildBooks(readUsfx(await readFile(input, 'utf8')), { fixes });
const result = await writeTranslationFile(output, {
  id,
  abbreviation: values.abbr ?? id.toUpperCase(),
  name: values.name,
  language: values.lang,
  direction: values.dir,
  license: values.license,
  source: values.source,
  books,
});

if (!result.ok) process.exit(1);
if (fixes.length) console.log(`  fixes: ${JSON.stringify(fixCounts)}`);
console.log(`\nWrote ${output} (${(result.bytes / 1e6).toFixed(1)} MB), version ${result.version}.`);
console.log('Add it to data/translations.json (see data/README.md) with "version": ' + JSON.stringify(result.version));
