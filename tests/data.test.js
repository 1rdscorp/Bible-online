/**
 * Checks the real files in /data: every translation listed in
 * translations.json must exist and pass the format validator. A translation
 * added later is checked automatically.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateTranslation } from '../tools/validate-translation.mjs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

const manifest = readJson('data/translations.json');

test('translations.json is well formed', () => {
  assert.ok(Array.isArray(manifest.translations) && manifest.translations.length > 0);
  assert.ok(manifest.translations.some((t) => t.id === manifest.default), 'default must be a listed id');
  for (const t of manifest.translations) {
    for (const field of ['id', 'abbreviation', 'name', 'language', 'provider']) {
      assert.equal(typeof t[field], 'string', `${t.id}: "${field}" is required`);
    }
  }
});

for (const entry of manifest.translations.filter((t) => t.provider === 'json')) {
  test(`${entry.url} passes validation`, () => {
    const data = readJson(entry.url);
    const { errors, warnings, stats } = validateTranslation(data);
    assert.deepEqual(errors, []);
    assert.equal(data.id, entry.id, 'id in the file must match translations.json');
    if (warnings.length) console.log(`${entry.url} warnings:\n  ${warnings.join('\n  ')}`);
    assert.ok(stats.verses > 0);
  });
}

test('KJV spot checks', () => {
  const kjv = readJson('data/kjv.json');
  const verse = (book, chapter, number) => kjv.books.find((b) => b.id === book).chapters[chapter - 1][number - 1];
  const { warnings, stats } = validateTranslation(kjv);

  assert.equal(stats.verses, 31102);
  assert.deepEqual(warnings, []);
  assert.equal(verse('GEN', 1, 1), 'In the beginning God created the heaven and the earth.');
  assert.match(verse('JHN', 3, 16), /^For God so loved the world, that he gave his only begotten Son/);
  assert.equal(verse('PSA', 23, 1), 'The LORD is my shepherd; I shall not want.');
  assert.equal(verse('JHN', 11, 35), 'Jesus wept.');
  // The source's placeholder "[]" for 3 John 1:15 was dropped.
  assert.equal(kjv.books.find((b) => b.id === '3JN').chapters[0].length, 14);
});
