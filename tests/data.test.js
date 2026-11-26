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

test('every translation has Russian metadata for the Russian interface', () => {
  for (const info of manifest.translations) {
    const ru = info.i18n?.ru;
    assert.ok(ru, `${info.id}: needs i18n.ru`);
    for (const field of ['license', 'copyright', 'description']) {
      assert.ok(typeof ru[field] === 'string' && /[А-Яа-я]/.test(ru[field]), `${info.id}: i18n.ru.${field} in Russian`);
    }
  }
});

test('the public-domain translations are all present, and the licensed BTI', () => {
  assert.deepEqual(
    manifest.translations.map((t) => t.id),
    ['kjv', 'asv', 'web', 'ylt', 'darby', 'bbe', 'rst', 'bti', 'lxx', 'kjvs'],
  );
});

for (const entry of jsonTranslations) {
  describe(entry.url, () => {
    const text = readText(entry.url);
    const data = JSON.parse(text);

    test('passes validation and matches its translations.json entry', () => {
      const { errors, warnings, stats } = validateTranslation(data);
      assert.deepEqual(errors, []);
      assert.deepEqual(warnings, [], 'all its books (66, or one Testament’s), standard chapter counts');
      // A one-Testament translation (the Septuagint) says so in "testaments".
      assert.ok(stats.verses > (data.testaments?.length === 1 ? 22000 : 31000), `${stats.verses} verses`);
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

  test('KJV+ (Strong’s numbers)', () => {
    const kjvs = load('kjvs');
    assert.equal(validateTranslation(kjvs).stats.verses, 31102);
    const book = (id) => kjvs.books.find((b) => b.id === id);
    const tagged = (id, chapter, number) => {
      const text = book(id).chapters[chapter - 1][number - 1];
      return book(id).tags[chapter - 1][number - 1].split(' ').map((tag) => {
        const [start, length, strongs] = tag.split('.');
        return `${text.substr(Number(start), Number(length))}=${strongs}`;
      });
    };
    assert.equal(verse(kjvs, 'GEN', 1, 1), 'In the beginning God created the heaven and the earth.');
    assert.deepEqual(tagged('GEN', 1, 1), ['beginning=H7225', 'God=H430', 'created=H1254', 'heaven=H8064', 'and=H853', 'earth=H776']);
    assert.deepEqual(tagged('JHN', 3, 16).slice(0, 4), ['For=G1063', 'God=G2316', 'so=G3779', 'loved=G25']);
    assert.ok(tagged('PSA', 23, 1).includes('LORD=H3068'));
    let tags = 0;
    for (const b of kjvs.books) for (const chapter of b.tags) for (const v of chapter) tags += v ? v.split(' ').length : 0;
    assert.ok(tags > 340000, `${tags} tagged words`);
    assert.ok(!kjvs.books.some((b) => b.chapters.flat().some((v) => v.includes('¶'))), 'no paragraph marks');
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

  test('LXX: the Greek Old Testament, renumbered to English verse numbers', () => {
    const lxx = load('lxx');
    assert.deepEqual(lxx.testaments, ['OT']);
    assert.equal(lxx.books.length, 39);
    assert.equal(lxx.books.reduce((n, b) => n + b.chapters.length, 0), 929, 'every Old Testament chapter');
    assert.match(verse(lxx, 'GEN', 1, 1), /ἀρχῇ ἐποίησεν ὁ Θεὸς τὸν οὐρανὸν καὶ τὴν γῆν\.$/);
    // Psalms: Greek Psalm 22 is English Psalm 23; 9:22–39 is Psalm 10
    assert.equal(verse(lxx, 'PSA', 23, 1), 'Ψαλμὸς τῷ Δαυίδ. Κύριος ποιμαίνει με, καὶ οὐδέν με ὑστερήσει.');
    assert.match(verse(lxx, 'PSA', 10, 1), /^Ἱνατί, Κύριε, ἀφέστηκας μακρόθεν/);
    assert.equal(lxx.books.find((b) => b.id === 'PSA').chapters.length, 150, 'Psalm 151 left out');
    // The corrections (tools/data-sources.json)
    assert.match(verse(lxx, 'DEU', 29, 1), /^Οὗτοι οἱ λόγοι τῆς διαθήκης/, 'Deuteronomy 29 as in English');
    assert.match(verse(lxx, '1KI', 21, 1), /ἀμπελὼν εἷς ἦν τῷ Ναβουθαὶ/, '3 Kingdoms 20 (Naboth) is 1 Kings 21');
    assert.match(verse(lxx, '1KI', 20, 1), /συνήθροισεν υἱὸς Ἄδερ/);
    assert.match(verse(lxx, 'NEH', 4, 1), /ἤκουσε Σαναβαλλὰτ, ὅτι ἡμεῖς οἰκοδομοῦμεν τὸ τεῖχος/, '2 Esdras 13:33');
    assert.match(verse(lxx, 'NEH', 7, 73), /^Καὶ ἔδωκαν οἱ κατάλοιποι τοῦ λαοῦ/);
    assert.match(verse(lxx, 'PRO', 30, 1), /^Τοὺς ἐμοὺς λόγους υἱὲ φοβήθητι/, 'Brenton’s 24:22f');
    assert.match(verse(lxx, 'PRO', 30, 15), /^Τῇ βδέλλῃ τρεῖς θυγατέρες/);
    assert.match(verse(lxx, 'PRO', 31, 1), /^Οἱ ἐμοὶ λόγοι εἴρηνται ὑπὸ Θεοῦ/);
    assert.match(verse(lxx, 'PRO', 31, 10), /^Γυναῖκα ἀνδρείαν τίς εὑρήσει/);
    assert.match(verse(lxx, 'JER', 25, 15), /λάβε τὸ ποτήριον τοῦ οἴνου/, 'Jeremiah in Greek order (32:1)');
    assert.match(verse(lxx, 'EXO', 20, 13), /^Οὐ φονεύσεις\.$/);
    // Additions: the Song of the Three stays with Daniel 3:23; 3:24 is Greek 3:91
    assert.match(verse(lxx, 'DAN', 3, 23), /Καὶ συστὰς Ἀζαρίας προσηύξατο.*Εὐλογεῖτε πάντα τὰ ἔργα Κυρίου τὸν Κύριον/s, 'Prayer of Azariah and Song of the Three');
    assert.match(verse(lxx, 'DAN', 3, 24), /^Καὶ Ναβουχοδονόσορ ἤκουσεν ὑμνούντων αὐτῶν/);
    assert.match(verse(lxx, 'EST', 1, 1), /^“ἜΤΟΥΣ δευτέρου βασιλεύοντος Ἀρταξέρξου.*” Καὶ ἐγένετο μετὰ τοὺς λόγους τούτους/s, 'Addition A, then 1:1');
    assert.deepEqual(lxx.books.find((b) => b.id === 'PSA').native['23'], [[22]]);
    // No brackets left dangling
    assert.equal(lxx.books.flatMap((b) => b.chapters.flat()).filter((t) => /[[\]]/.test(t)).length, 0);
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

  test('BTI: the Institute’s text as written, with its formatting, renumbered to English verse numbers', () => {
    const bti = load('bti');
    const book = (id) => bti.books.find((b) => b.id === id);
    assert.equal(verse(bti, 'JHN', 3, 16), 'Бог ведь так полюбил этот мир, что пожертвовал Сыном Своим единственным, чтобы всякий, кто верит в Него, не погиб, но обрел жизнь вечную.');
    // Its own dashes and quotation marks, untouched (no typography fixes).
    assert.ok(bti.books.flatMap((b) => b.chapters.flat()).some((text) => text.includes(' – ')));
    // Psalms in the Synodal numbering: its Psalm 22, with its title, is English Psalm 23.
    assert.match(verse(bti, 'PSA', 23, 1), /^Псалом Давида Господь – Пастырь мой/);
    assert.match(book('PSA').marks[22][0], /^0\.t 14\.q1/);
    assert.deepEqual(book('PSA').native['23'], [[22]]);
    // Daniel 3–4 in the Hebrew numbering: its 3:31 is English 4:1.
    assert.match(verse(bti, 'DAN', 4, 1), /^«От царя Навуходоносора/);
    // Verses translated together ("11–12"): the text in the first, the second empty.
    assert.deepEqual(book('MAT').ranges[19], [[11, 12]]);
    assert.equal(verse(bti, 'MAT', 20, 12), '');
    // Formatting: small capitals for «Господь», italics for added words, bold for Old Testament quotations.
    const marked = (id, c, v, kind) => book(id).marks[c - 1][v - 1].split(' ').filter((m) => m.endsWith(`.${kind}`)).map((m) => {
      const [start, length] = m.split('.').map(Number);
      return verse(bti, id, c, v).slice(start, start + length);
    });
    assert.deepEqual(marked('RUT', 1, 6, 'sc'), ['Господь']);
    assert.ok(marked('RUT', 1, 1, 'i').includes('в Израиле'));
    assert.ok(marked('MAT', 1, 23, 'b').some((text) => text.startsWith('И вот дева')));
    // Headings and footnotes, each in its verse.
    assert.deepEqual(book('JHN').headings[2][0], [1, 'Беседа с Никодимом']);
    const [v, at, label, ref, text] = book('RUT').notes[0][0];
    assert.deepEqual([v, label, ref, text], [1, 'а', '1:1', 'Букв.: судили.']);
    assert.equal(verse(bti, 'RUT', 1, 1).slice(0, at), 'Во времена, когда в Израиле правили');
  });

  test('BBE', () => {
    const bbe = load('bbe');
    assert.equal(verse(bbe, 'PSA', 23, 1), 'The Lord takes care of me as his sheep; I will not be without any good thing.');
    assert.match(verse(bbe, 'GEN', 43, 1), /^Now the land was in bitter need/, 'aligned with English verse numbers');
    assert.match(verse(bbe, 'MRK', 6, 26), /say ‘No’ to/);
  });
});
