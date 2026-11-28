/** Ellen G. White citations ("GC 603–604") as links (js/research/egw.js). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EGW_BOOKS, egwHref, egwTitle, findEgwCitations, partForPage, SITE_WORKS } from '../js/research/egw.js';
import { parseInline } from '../js/study/richtext.js';

const cited = (text) => findEgwCitations(text).map((c) => text.slice(c.index, c.index + c.length));

test('finds citations by abbreviation and page, ranges and paragraphs included', () => {
  const text = '4BC 1161, 5T 751–754, GC 603–604';
  assert.deepEqual(cited(text), ['4BC 1161', '5T 751–754', 'GC 603–604']);
  assert.deepEqual(findEgwCitations(text).map(({ abbr, page, endPage }) => [abbr, page, endPage]), [['4BC', 1161, undefined], ['5T', 751, 754], ['GC', 603, 604]]);
  assert.deepEqual(findEgwCitations('DA 44.2')[0], { index: 0, length: 7, abbr: 'DA', page: 44, para: 2 });
  assert.deepEqual(findEgwCitations('PK 479-91')[0].endPage, 491, 'a shortened range');
  assert.deepEqual(cited('See 1SM 22; 10MR 5; GC88 12 and Ed 13.'), ['1SM 22', '10MR 5', 'GC88 12', 'Ed 13']);
});

test('more pages of the same book: "COL 69, 70" links each', () => {
  const found = findEgwCitations('COL 69, 70–72.');
  assert.deepEqual(found.map((c) => [c.abbr, c.page, c.endPage]), [['COL', 69, undefined], ['COL', 70, 72]]);
  assert.deepEqual(cited('COL 69, 70–72.'), ['COL 69', '70–72']);
});

test('leaves Bible references, years and other words alone', () => {
  for (const text of ['Col 1:13', 'AA 1:2', '605 BC', 'AD 70', 'Mar 12', 'Pr 3', 'xGC 603', 'GC', 'GC 603a', 'GC 603.1234', 'gc 603', 'BC 1161', 'SW 12']) {
    assert.deepEqual(findEgwCitations(text), [], text);
  }
});

test('books on this site open here, at the page; others in EGW Writings', () => {
  assert.equal(egwHref({ abbr: 'DA', page: 44 }), '#/commentary/desire-of-ages?p=44');
  assert.equal(egwHref({ abbr: 'GC', page: 603 }), 'https://m.egwwritings.org/en/search?query=GC%20603');
  assert.equal(egwHref({ abbr: '4BC', page: 1161, para: 3 }), 'https://m.egwwritings.org/en/search?query=4BC%201161.3');
  assert.equal(egwHref({ abbr: 'PP', page: 34 }), 'https://m.egwwritings.org/en/search?query=PP%2034', 'no printed pages here');
  assert.equal(egwTitle({ abbr: '5T', page: 751, endPage: 754 }), 'Testimonies for the Church, vol. 5, pp. 751–754');
  assert.equal(EGW_BOOKS['7BC'], 'SDA Bible Commentary (Ellen G. White comments), vol. 7');
});

test('the site’s books have their abbreviation and every chapter’s printed pages, without gaps', () => {
  const index = JSON.parse(readFileSync(new URL('../data/commentary/index.json', import.meta.url), 'utf8'));
  for (const [abbr, id] of Object.entries(SITE_WORKS)) {
    const work = index.works.find((w) => w.id === id);
    assert.equal(work?.abbr, abbr, id);
    const parts = work.parts.filter((part) => part.pages).sort((a, b) => a.pages[0] - b.pages[0]);
    assert.equal(parts.length, work.parts.length, `${id}: every chapter has its pages`);
    // Between some chapters the printed book has a section's title page or two.
    for (let i = 1; i < parts.length; i += 1) assert.ok(parts[i].pages[0] <= parts[i - 1].pages[1] + 3, `${id}: a gap before page ${parts[i].pages[0]}`);
  }
  const da = index.works.find((w) => w.id === 'desire-of-ages');
  assert.equal(partForPage(da, 44)?.id, '4');
  assert.equal(partForPage(da, 20)?.id, '1');
  assert.equal(partForPage(da, 5000), null);
  // Prophets and Kings 117–118: the title pages of a section; chapter 9 starts on 119.
  assert.equal(partForPage(index.works.find((w) => w.id === 'prophets-and-kings'), 117)?.id, '9');
});

test('notes turn citations into links, beside web addresses', () => {
  const runs = parseInline('**See** GC 603–604 and https://example.org, also DA 44.');
  assert.deepEqual(
    runs.filter((run) => run.href).map(({ text, href, title }) => [text, href, title]),
    [
      ['GC 603–604', 'https://m.egwwritings.org/en/search?query=GC%20603', 'The Great Controversy, pp. 603–604'],
      ['https://example.org', 'https://example.org', undefined],
      ['DA 44', '#/commentary/desire-of-ages?p=44', 'The Desire of Ages, p. 44'],
    ],
  );
  assert.equal(runs.map((run) => run.text).join(''), 'See GC 603–604 and https://example.org, also DA 44.');
});

test('letters and manuscripts by number and year, in English and Russian', () => {
  const text = 'Letter 65, 1898; Lt 30, 1888; Ms 140, 1902; Письмо 65, 1898; Рукопись 140, 1902.';
  const found = findEgwCitations(text);
  assert.deepEqual(found.map(({ abbr, number, year }) => [abbr, number, year]), [['Lt', '65', 1898], ['Lt', '30', 1888], ['Ms', '140', 1902], ['Lt', '65', 1898], ['Ms', '140', 1902]]);
  assert.equal(egwHref(found[0]), 'https://m.egwwritings.org/en/search?query=Lt%2065%2C%201898');
  assert.equal(egwTitle(found[2]), 'Manuscript 140, 1902');
  assert.deepEqual(findEgwCitations('Letter 65 is lost; a letter, 1898'), [], 'needs a number and a year');
});

test('"Mar" (Maranatha) counts only in a citation label, not in free text', () => {
  assert.deepEqual(findEgwCitations('Mar 190'), []);
  const [cite] = findEgwCitations('Mar 190', { labels: true });
  assert.equal(egwHref(cite), 'https://m.egwwritings.org/en/search?query=Mar%20190');
  assert.equal(egwTitle(cite), 'Maranatha, p. 190');
});

test('every citation label in the study pages is a citation the site can link', () => {
  for (const file of ['revelation-animals']) {
    const text = readFileSync(new URL(`../data/study/explore/${file}.json`, import.meta.url), 'utf8');
    const labels = [...text.matchAll(/class=\\"cite-ref\\"[^>]*>([^<]+)</g)].map((m) => m[1]);
    assert.ok(labels.length > 50, file);
    const unlinked = labels.filter((label) => {
      const cites = findEgwCitations(label, { labels: true });
      return cites.length !== 1 || cites[0].length !== label.length;
    });
    assert.deepEqual([...new Set(unlinked)], [], file);
  }
});

test('in Russian, a book with a Russian edition opens it at the same page', async () => {
  const { RUSSIAN_EDITIONS } = await import('../js/research/egw-russian.js');
  assert.equal(RUSSIAN_EDITIONS.GC.ru, 'ВБ');
  assert.equal(RUSSIAN_EDITIONS['5T'].ru, '5СЦ');
  const cite = (text) => findEgwCitations(text, { labels: true })[0];
  assert.equal(egwHref(cite('GC 603–604'), 'ru'), `https://m.egwwritings.org/ru/search?query=${encodeURIComponent('ВБ 603')}`);
  assert.equal(egwHref(cite('5T 751–754'), 'ru'), `https://m.egwwritings.org/ru/search?query=${encodeURIComponent('5СЦ 751')}`);
  assert.equal(egwTitle(cite('GC 603–604'), 'ru'), `${RUSSIAN_EDITIONS.GC.title}, стр. 603–604`);
  // Paragraphs are divided differently in Russian: the page only.
  assert.equal(egwHref(cite('GC 603.2'), 'ru'), `https://m.egwwritings.org/ru/search?query=${encodeURIComponent('ВБ 603')}`);
  // The site's own books open the Russian edition too; in English, the site.
  assert.equal(egwHref(cite('DA 44'), 'ru'), `https://m.egwwritings.org/ru/search?query=${encodeURIComponent(`${RUSSIAN_EDITIONS.DA.ru} 44`)}`);
  assert.equal(egwHref(cite('DA 44'), 'en'), '#/commentary/desire-of-ages?p=44');
  // No Russian edition (Manuscript Releases, letters): English, and the tooltip says so.
  assert.equal(egwHref(cite('18MR 326'), 'ru'), 'https://m.egwwritings.org/en/search?query=18MR%20326');
  assert.equal(egwTitle(cite('18MR 326'), 'ru'), 'Manuscript Releases, vol. 18, стр. 326 (на английском)');
  assert.equal(egwHref(cite('Letter 65, 1898'), 'ru'), 'https://m.egwwritings.org/en/search?query=Lt%2065%2C%201898');
  assert.equal(egwTitle(cite('Letter 65, 1898'), 'ru'), 'Письмо 65, 1898 (на английском)');
  // Every Russian abbreviation is Cyrillic (with a volume number), every title Russian.
  for (const [abbr, { ru, title }] of Object.entries(RUSSIAN_EDITIONS)) {
    assert.ok(/^\d?[А-ЯЁа-яё]+$/u.test(ru), `${abbr}: ${ru}`);
    assert.ok(/[А-ЯЁа-яё]/u.test(title), `${abbr}: ${title}`);
  }
});

test('the Russian editions module is generated, not edited by hand', () => {
  const source = readFileSync(new URL('../js/research/egw-russian.js', import.meta.url), 'utf8');
  assert.match(source, /^\/\/ Generated by tools\/fetch-egw-russian\.mjs/);
});
