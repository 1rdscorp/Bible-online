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

test('the public-domain translations are all present', () => {
  assert.deepEqual(
    manifest.translations.map((t) => t.id),
    ['kjv', 'asv', 'web', 'ylt', 'darby', 'bbe', 'rst'],
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

  test('RST: renumbered to English verse numbers', () => {
    const rst = load('rst');
    // Psalms: Synodal Psalm 22 is English Psalm 23; titles open verse 1
    assert.equal(verse(rst, 'PSA', 23, 1), 'Псалом Давида. Господь — Пастырь мой; я ни в чем не буду нуждаться:');
    assert.match(verse(rst, 'PSA', 51, 1), /^Начальнику хора\. Псалом Давида, когда приходил к нему пророк Нафан.*Помилуй меня, Боже/);
    assert.match(verse(rst, 'PSA', 51, 2), /^Многократно омой меня/);
    assert.match(verse(rst, 'PSA', 145, 1), /^Хвала Давида\. Буду превозносить Тебя/, 'title moved from the end of the previous Psalm');
    // Elsewhere
    assert.match(verse(rst, 'JOL', 2, 28), /^И будет после того, излию от Духа Моего/);
    assert.match(verse(rst, 'ROM', 16, 25), /^Могущему же утвердить вас/, 'Synodal 14:24–26 doxology moved to 16:25–27');
    assert.match(verse(rst, 'ISA', 3, 26), /^И будут воздыхать и плакать ворота/);
    assert.match(verse(rst, 'DAN', 6, 1), /^Угодно было Дарию/);
    assert.match(verse(rst, '2CO', 13, 14), /^Благодать Господа нашего/);
    assert.match(verse(rst, '3JN', 1, 14), /устами к устам\. Мир тебе\./, 'Synodal 1:15 joined to English 1:14');
    assert.match(verse(rst, 'JOS', 4, 7), /им: «в память того/);
    assert.match(verse(rst, 'JHN', 3, 16), /^Ибо так возлюбил Бог мир/);
  });

  test('RST: its own Psalm numbers are recorded (shown in compare mode)', () => {
    const rst = load('rst');
    const native = rst.books.find((b) => b.id === 'PSA').native;
    assert.equal(rst.nativeVersification, 'rso');
    assert.deepEqual(native['23'], [[22]]);
    assert.deepEqual(native['9'], [[9, 1, 21]], 'English 9 is the first half of Synodal 9');
    assert.deepEqual(native['10'], [[9, 22, 39]]);
    assert.deepEqual(native['116'], [[114], [115]]);
    assert.deepEqual(native['147'], [[146], [147]]);
    assert.equal(native['1'], undefined, 'same number in both: nothing recorded');
    assert.equal(native['148'], undefined);
    assert.equal(load('kjv').books.find((b) => b.id === 'PSA').native, undefined);
    // Synodal Psalm 114:9, split from 114:8 in the source and mapped to English 116:9
    assert.equal(verse(rst, 'PSA', 116, 9), 'Буду ходить пред лицем Господним на земле живых.');
  });

  test('RST: Russian typography, no source markup', () => {
    const verses = load('rst').books.flatMap((b) => b.chapters.flat());
    assert.deepEqual(verses.filter((v) => /(^|\s)-(\s|$)/.test(v)).slice(0, 3), [], 'spaced hyphen instead of a dash');
    assert.deepEqual(verses.filter((v) => /[A-Za-z]/.test(v)).slice(0, 3), [], 'Latin letters (markup)');
    const open = verses.join('').split('«').length - 1;
    const close = verses.join('').split('»').length - 1;
    assert.equal(open, close, '« and » balance');
  });

  test('BBE', () => {
    const bbe = load('bbe');
    assert.equal(verse(bbe, 'PSA', 23, 1), 'The Lord takes care of me as his sheep; I will not be without any good thing.');
    assert.match(verse(bbe, 'GEN', 43, 1), /^Now the land was in bitter need/, 'aligned with English verse numbers');
    assert.match(verse(bbe, 'MRK', 6, 26), /say ‘No’ to/);
  });
});
