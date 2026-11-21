/**
 * Checks the real files in /data. Every translation listed in
 * translations.json must exist, pass the format validator, carry its own
 * metadata, and have an up-to-date "version" (the cache key). A translation
 * added later is checked automatically.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { checkTranslationInfo } from '../js/providers/interface.js';
import { contentVersion } from '../tools/lib/translation-file.mjs';
import { validateTranslation } from '../tools/validate-translation.mjs';

const root = new URL('../', import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), 'utf8');
const manifest = JSON.parse(readText('data/translations.json'));
const jsonTranslations = manifest.translations.filter((t) => t.provider === 'json');

test('translations.json is well formed', () => {
  assert.ok(manifest.translations.some((t) => t.id === manifest.default), 'default must be a listed id');
  assert.equal(new Set(manifest.translations.map((t) => t.id)).size, manifest.translations.length, 'ids are unique');
  for (const info of manifest.translations) {
    assert.deepEqual(checkTranslationInfo(info), [], info.id);
    assert.ok(info.copyright, `${info.id}: needs a copyright statement for the Translations page`);
  }
});

test('the six planned public-domain translations are all present', () => {
  assert.deepEqual(
    manifest.translations.map((t) => t.id),
    ['kjv', 'asv', 'web', 'ylt', 'darby', 'bbe'],
  );
});

for (const entry of jsonTranslations) {
  describe(entry.url, () => {
    const text = readText(entry.url);
    const data = JSON.parse(text);

    test('passes validation and matches its translations.json entry', () => {
      const { errors, warnings, stats } = validateTranslation(data);
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, [], 'all 66 books, standard chapter counts');
      assert.ok(stats.verses > 31000);
      assert.equal(data.id, entry.id);
      assert.equal(data.abbreviation, entry.abbreviation);
    });

    test('"version" matches the file (run `npm run build-data` after editing)', () => {
      assert.equal(entry.version, contentVersion(text));
    });

    test('no conversion leftovers (entities, ASCII quotes, footnote marks)', () => {
      const verses = data.books.flatMap((b) => b.chapters.flat());
      const offenders = (re) => verses.filter((v) => re.test(v)).slice(0, 3);
      assert.deepEqual(offenders(/&[a-z]+;|&#\d+;/), [], 'HTML entities');
      assert.deepEqual(offenders(/[`\\"{}<>]/), [], 'backticks, backslashes, straight double quotes, braces');
      assert.deepEqual(offenders(/'/), [], 'straight apostrophes (should be ’)');
      assert.deepEqual(offenders(/--/), [], 'double hyphens (should be —)');
      assert.deepEqual(offenders(/ [,.;:?!]/), [], 'space before punctuation');
      assert.deepEqual(offenders(/[a-z]God/), [], 'words run together');
    });
  });
}

describe('spot checks', () => {
  const load = (id) => JSON.parse(readText(`data/${id}.json`));
  const verse = (data, book, chapter, number) => data.books.find((b) => b.id === book).chapters[chapter - 1][number - 1];

  test('KJV', () => {
    const kjv = load('kjv');
    assert.equal(validateTranslation(kjv).stats.verses, 31102);
    assert.equal(verse(kjv, 'GEN', 1, 1), 'In the beginning God created the heaven and the earth.');
    assert.equal(verse(kjv, 'PSA', 23, 1), 'The LORD is my shepherd; I shall not want.');
    assert.equal(verse(kjv, 'JHN', 11, 35), 'Jesus wept.');
    assert.match(verse(kjv, 'JHN', 3, 16), /^For God so loved the world, that he gave his only begotten Son/);
    // The source's placeholder "[]" for 3 John 1:15 was dropped.
    assert.equal(kjv.books.find((b) => b.id === '3JN').chapters[0].length, 14);
  });

  test('ASV', () => {
    const asv = load('asv');
    assert.equal(verse(asv, 'PSA', 23, 1), 'A Psalm of David. Jehovah is my shepherd; I shall not want.');
    assert.equal(verse(asv, 'MAT', 17, 21), '', 'the 1901 ASV puts Matthew 17:21 in the margin');
    assert.match(verse(asv, 'PSA', 3, 2), /God\. Selah$/);
  });

  test('WEB', () => {
    const web = load('web');
    assert.equal(verse(web, 'PSA', 23, 1), 'A Psalm by David. Yahweh is my shepherd: I shall lack nothing.');
    assert.match(verse(web, 'JHN', 3, 16), /^For God so loved the world, that he gave his one and only Son/);
    assert.match(verse(web, 'MAT', 17, 21), /prayer and fasting\.”$/, 'footnote stripped');
    assert.equal(web.books.find((b) => b.id === 'ROM').chapters[15].length, 24, 'WEB has the doxology in Romans 14');
    assert.match(verse(web, 'PSA', 119, 1), /^Blessed are those/, 'acrostic heading "ALEPH" dropped');
  });

  test('YLT', () => {
    const ylt = load('ylt');
    assert.equal(verse(ylt, 'GEN', 1, 3), 'and God saith, ‘Let light be;’ and light is.');
    assert.match(verse(ylt, 'JHN', 3, 16), /His Son—the only begotten—He gave/);
  });

  test('Darby', () => {
    const darby = load('darby');
    assert.match(verse(darby, 'JHN', 3, 16), /^For God so loved the world/);
    assert.match(verse(darby, 'ROM', 16, 27), /^\[the\] only wise God,/, 'Darby’s own brackets are kept');
    assert.match(verse(darby, 'PSA', 57, 1), /‘Destroy not\.’/);
  });

  test('BBE', () => {
    const bbe = load('bbe');
    assert.equal(verse(bbe, 'PSA', 23, 1), 'The Lord takes care of me as his sheep; I will not be without any good thing.');
    assert.match(verse(bbe, 'GEN', 43, 1), /^Now the land was in bitter need/, 'aligned with English verse numbers');
    assert.match(verse(bbe, 'MRK', 6, 26), /say ‘No’ to/);
  });
});
