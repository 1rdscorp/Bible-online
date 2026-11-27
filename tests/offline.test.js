/**
 * Offline support: sw.js lists the site's current files (rerun
 * tools/build-offline.mjs after changing HTML, CSS, JavaScript or icons),
 * and the app manifest and icons are in place.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { appFiles, currentBlock, offlineBlock, ROOT } from '../tools/build-offline.mjs';

test('sw.js is up to date (run: node tools/build-offline.mjs)', () => {
  assert.equal(currentBlock(), offlineBlock());
});

test('the app shell has every page file and nothing missing', () => {
  const files = appFiles();
  for (const file of files) assert.ok(existsSync(join(ROOT, file)), file);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="([^"#:]+)"/g)) {
    assert.ok(files.includes(href), `index.html loads ${href}, which isn't saved for offline use`);
  }
  assert.ok(files.includes('js/search/worker.js'), 'the search worker');
  assert.ok(!files.some((file) => file.startsWith('data/')), 'the Bible text is saved as it is opened, not up front');
});

test('the app manifest names the app and its icons', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  for (const icon of manifest.icons) assert.ok(existsSync(join(ROOT, icon.src)), icon.src);
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
});
