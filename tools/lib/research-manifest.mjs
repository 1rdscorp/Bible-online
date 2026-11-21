/**
 * data/research.json: what research data the site has (cross references,
 * Strong's dictionaries, maps, study pages), where it is, its licence, and
 * a content version per data set that the site uses as its cache key (like
 * "version" in data/translations.json). Each build script updates its own
 * entry; tests/research-data.test.js checks the versions are current.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST = join(fileURLToPath(new URL('../..', import.meta.url)), 'data', 'research.json');

export async function updateResearchManifest(key, entry) {
  let manifest = { formatVersion: 1 };
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    // first build
  }
  manifest[key] = entry;
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}
