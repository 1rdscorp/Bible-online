/**
 * Downloads for the build scripts, cached in .cache/sources/ (git ignores
 * it). GitHub URLs are pinned to a commit, so a cached copy never goes
 * stale. A source that can't be pinned (eBible.org's and OpenBible.info's
 * zips) records the SHA-256 of what was used instead, and checkPinned warns
 * when a fresh download differs.
 *
 * Behind a proxy (as in some cloud sandboxes), run Node with
 * NODE_USE_ENV_PROXY=1 so fetch() uses it.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_DIR = join(fileURLToPath(new URL('../..', import.meta.url)), '.cache', 'sources');

/** The source's bytes (a Buffer), from the cache or the network. */
export async function download(url) {
  const file = join(CACHE_DIR, `${url.split('/').at(-2)}-${basename(url)}`.replace(/[^\w.-]/g, '_'));
  try {
    return await readFile(file);
  } catch {
    process.stdout.write(`  downloading ${url}\n`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, bytes);
    return bytes;
  }
}

/** Warn (don't fail) if an unpinned source has changed since the data was built. */
export function checkPinned(name, expected, bytes) {
  if (!expected) return;
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    console.warn(
      `  warning: ${name}'s source has changed since this data was built (sha256 ${actual}).\n` +
        '  Check it, then put the new hash in tools/data-sources.json.',
    );
  }
}
