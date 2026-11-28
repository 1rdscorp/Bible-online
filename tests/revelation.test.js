/**
 * "The Animals of Revelation" (#/explore/revelation-animals): the page's
 * helpers, its hand-written content (data/study/explore/revelation-animals.json)
 * and its drawings (tools/art/revelation/ → js/views/explore/revelation-plates.js).
 * Every reference must exist (verse counts from data/kjv.json), every text
 * needs English and Russian with the same markup, every numbered point must
 * sit on its plate, and every citation of Ellen White must be explained
 * under Sources. Run `node tools/build-study.mjs` after editing the content
 * and `node tools/build-revelation.mjs` after changing a drawing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseRef } from '../js/research/refs.js';
import { VIEWS } from '../js/views/explore.js';
import { chartPosition, chartYears, creatureOf, plateSize, roman } from '../js/views/explore/revelation-animals.js';
import { workHref } from '../js/views/templates/rich-html.js';
import { OUTPUT, PLATE_IDS, VIEW_BOX, convertPlate, drawnIds, platesModule, readArt, webpSize } from '../tools/build-revelation.mjs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const page = readJson('data/study/explore/revelation-animals.json');
const kjv = readJson('data/kjv.json');
const commentary = readJson('data/commentary/index.json');

// Verses per chapter, English numbering.
const lengths = new Map(kjv.books.map((book) => [book.id, book.chapters.map((verses) => verses.length)]));
const versesIn = (book, chapter) => lengths.get(book)?.[chapter - 1] ?? 0;

function refProblems(text, label) {
  const ref = parseRef(text);
  if (!ref) return [`${label}: can't read "${text}"`];
  const problems = [];
  if (ref.verse > versesIn(ref.book, ref.chapter)) problems.push(`${label}: ${text} starts at a verse that doesn't exist`);
  if (ref.endVerse > versesIn(ref.book, ref.endChapter)) problems.push(`${label}: ${text} ends at a verse that doesn't exist`);
  return problems;
}

const CYRILLIC = /[А-Яа-яЁё]/;
/** Plain text: { en, ru }, no markup, Russian in Cyrillic (unless it is only figures, as on a chart bar). */
function plain(value, label) {
  if (!value || typeof value.en !== 'string' || !value.en.trim()) return [`${label}.en is missing`];
  const problems = [];
  if (typeof value.ru !== 'string' || !(CYRILLIC.test(value.ru) || (/^[\d\s.,]+$/.test(value.en) && value.ru === value.en))) problems.push(`${label}.ru is missing or not in Russian`);
  for (const lang of ['en', 'ru']) if (/[<>]|\s{2,}|^\s|\s$/.test(value[lang] ?? '')) problems.push(`${label}.${lang}: no markup, double spaces or edge spaces`);
  return problems;
}

// The markup the page's rich text uses (js/views/templates/rich-html.js renders it).
const ALLOWED = /^<\/?(b|i|cite)>$|^<\/(a|span)>$|^<a data-ref="[1-3]?[A-Z]{2,3} \d+:\d+(-(\d+:)?\d+)?">$|^<span class="cite-ref">$|^<a class="cite-ref" data-work="[a-z0-9-]+" data-part="\d+">$/;
const tags = (html) => html.match(/<[^>]+>/g) ?? [];
/** Rich text: the same markup in both languages, verse links that exist, commentary links the site has. */
function rich(value, label, { latin = false } = {}) {
  if (!value || typeof value.en !== 'string' || !value.en.trim()) return [`${label}.en is missing`];
  const problems = [];
  if (typeof value.ru !== 'string' || !(latin ? value.ru.trim() : CYRILLIC.test(value.ru))) problems.push(`${label}.ru is missing or not in Russian`);
  for (const tag of tags(value.en)) if (!ALLOWED.test(tag)) problems.push(`${label}: tag ${tag} isn't allowed`);
  if (tags(value.en).join('') !== tags(value.ru ?? '').join('')) problems.push(`${label}: English and Russian markup differ`);
  for (const [, ref] of value.en.matchAll(/data-ref="([^"]+)"/g)) problems.push(...refProblems(ref, label));
  for (const [, work, part] of value.en.matchAll(/data-work="([^"]+)" data-part="([^"]+)"/g)) {
    if (!commentary.works.find((entry) => entry.id === work)?.parts.some((entry) => entry.id === part)) problems.push(`${label}: the commentary has no ${work}/${part}`);
  }
  return problems;
}

/** The citations of Ellen White in a rich text: ["GC 438", "AA 589"]. */
const citations = (html) => [...html.matchAll(/class="cite-ref"[^>]*>([^<]+)</g)].map((m) => m[1]);

test('roman numbers the plates', () => {
  assert.deepEqual([1, 4, 5, 9, 10, 14, 15].map(roman), ['I', 'IV', 'V', 'IX', 'X', 'XIV', 'XV']);
});

test('creatureOf finds a creature by id and falls back to the first', () => {
  assert.equal(creatureOf(page, 'dragon').id, 'dragon');
  assert.equal(creatureOf(page, 'no-such-animal').id, page.creatures[0].id);
  assert.equal(creatureOf(page, null).id, 'living-creatures');
});

test('the chart has one scale: positions and gridlines', () => {
  const range = [0, 2000];
  assert.equal(chartPosition(0, range), 0);
  assert.equal(chartPosition(2000, range), 100);
  assert.equal(chartPosition(500, range), 25);
  assert.equal(chartPosition(1798, range) - chartPosition(538, range), 63);
  assert.deepEqual(chartYears(range).map((y) => y.label), [1, 250, 500, 750, 1000, 1250, 1500, 1750, 2000]);
  assert.deepEqual(chartYears([-100, 600], 250).map((y) => y.year), [0, 250, 500]);
});

test('commentary links are made only from a well-formed work and chapter', () => {
  assert.equal(workHref('acts-of-the-apostles', '57'), '#/commentary/acts-of-the-apostles/57');
  for (const [work, part] of [['acts-of-the-apostles', '57a'], ['../x', '1'], ['Acts', '1'], [null, '1'], ['acts-of-the-apostles', null], ['javascript:alert(1)', '1']]) {
    assert.equal(workHref(work, part), null, `${work}/${part}`);
  }
});

test('the page is listed in data/study/explore.json and has a view', () => {
  const entry = readJson('data/study/explore.json').pages.find((candidate) => candidate.id === page.id);
  assert.equal(entry?.file, 'explore/revelation-animals.json');
  assert.equal(typeof VIEWS[page.id], 'function');
  assert.deepEqual(entry.books, ['REV']);
});

test('the content: fifteen creatures, their points, the Bible and the commentary, in both languages', () => {
  const problems = [];
  assert.deepEqual(page.creatures.map((creature) => creature.id), PLATE_IDS);

  problems.push(...plain(page.title, 'title'), ...plain(page.eyebrow, 'eyebrow'), ...plain(page.summary, 'summary'));
  page.about.forEach((paragraph, i) => problems.push(...plain(paragraph, `about[${i}]`)));
  assert.deepEqual(Object.keys(page.levels), ['detail', 'brief', 'none']);
  for (const [level, label] of Object.entries(page.levels)) problems.push(...plain(label, `level ${level}`));

  for (const creature of page.creatures) {
    const at = (key) => `${creature.id}.${key}`;
    if (!/^[a-z0-9-]+$/.test(creature.id)) problems.push(`${creature.id}: id a-z 0-9 -`);
    if (!page.levels[creature.level]) problems.push(`${creature.id}: unknown level ${creature.level}`);
    for (const key of ['title', 'short', 'chapter', 'summary', 'picture']) problems.push(...plain(creature[key], at(key)));
    problems.push(...refProblems(creature.verse, at('verse')), ...rich(creature.where, at('where')));
    if (!creature.where.en.includes('data-ref="REV ')) problems.push(`${creature.id}: "where" names no verse of Revelation`);

    if (!(creature.parts.length >= 4 && creature.parts.length <= 9)) problems.push(`${creature.id}: 4 to 9 numbered points`);
    // A drawing's grid, or a picture's: 640 wide and as high as its shape makes it.
    const { width, height } = plateSize(creature);
    creature.parts.forEach((part, i) => {
      const [x, y] = part.at ?? [];
      // A point is a circle of radius 12: all of it must be on the plate.
      if (!(Number.isInteger(x) && Number.isInteger(y) && x >= 12 && x <= width - 12 && y >= 12 && y <= height - 12)) problems.push(`${at(`parts[${i}]`)}: "at" must be whole numbers on the ${width} × ${height} plate`);
      problems.push(...plain(part.title, at(`parts[${i}].title`)), ...rich(part.refs, at(`parts[${i}].refs`)), ...rich(part.text, at(`parts[${i}].text`)));
      if (!part.refs.en.includes('data-ref=')) problems.push(`${at(`parts[${i}]`)}: no reference`);
    });
    // Two points closer than their own width would cover each other.
    creature.parts.forEach((a, i) => creature.parts.slice(i + 1).forEach((b, j) => {
      if (Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) < 26) problems.push(`${creature.id}: points ${i + 1} and ${i + j + 2} overlap`);
    }));

    if (!(creature.bible.length >= 2)) problems.push(`${creature.id}: at least 2 paragraphs on the Bible`);
    creature.bible.forEach((paragraph, i) => problems.push(...rich(paragraph, at(`bible[${i}]`))));
    if (!(creature.white.length >= 2)) problems.push(`${creature.id}: at least 2 paragraphs on Ellen White`);
    creature.white.forEach((paragraph, i) => problems.push(...rich(paragraph, at(`white[${i}]`))));
    if (creature.context) problems.push(...rich(creature.context, at('context')));
    // "Explained in detail" and "touched on" need a citation; "no direct comment" must not claim one on the creature itself.
    const cited = creature.white.flatMap((paragraph) => citations(paragraph.en));
    if (creature.level !== 'none' && !cited.length) problems.push(`${creature.id}: level "${creature.level}" but no citation of Ellen White`);
  }
  assert.deepEqual(problems, []);
});

test('the key, the chart and the sources', () => {
  const problems = [];
  problems.push(...plain(page.key.title, 'key.title'), ...plain(page.key.intro, 'key.intro'));
  page.key.rows.forEach((row, i) => problems.push(...plain(row.symbol, `key[${i}].symbol`), ...plain(row.meaning, `key[${i}].meaning`), ...rich(row.refs, `key[${i}].refs`)));
  if (!(page.key.rows.length >= 10)) problems.push('key: at least 10 symbols');

  const { chart } = page;
  const [from, to] = chart.range;
  problems.push(...plain(chart.title, 'chart.title'), ...plain(chart.intro, 'chart.intro'));
  const kinds = new Set();
  chart.rows.forEach((row, i) => {
    problems.push(...plain(row.label, `chart.rows[${i}].label`));
    row.bars.forEach((bar, j) => {
      if (!(Number.isInteger(bar.from) && Number.isInteger(bar.to) && bar.from < bar.to && bar.from >= from && bar.to <= to)) problems.push(`chart.rows[${i}].bars[${j}]: ${bar.from}–${bar.to} outside ${from}–${to}`);
      if (!['a', 'b', 'c'].includes(bar.kind)) problems.push(`chart.rows[${i}].bars[${j}]: unknown kind ${bar.kind}`);
      kinds.add(bar.kind);
      problems.push(...plain(bar.text, `chart.rows[${i}].bars[${j}].text`));
    });
    // Bars in a row follow one another without overlapping.
    row.bars.slice(1).forEach((bar, j) => {
      if (bar.from < row.bars[j].to) problems.push(`chart.rows[${i}]: bars overlap`);
    });
  });
  chart.notes.forEach((note, i) => {
    if (!['a', 'b', 'c', 'd'].includes(note.kind)) problems.push(`chart.notes[${i}]: unknown kind ${note.kind}`);
    problems.push(...rich(note.text, `chart.notes[${i}]`));
  });
  // Every bar's colour is explained by a note.
  for (const kind of kinds) if (!chart.notes.some((note) => note.kind === kind)) problems.push(`chart: no note for the "${kind}" bars`);
  // The 1,260 years and Litch's two periods add up.
  const bars = chart.rows.flatMap((row) => row.bars);
  assert.deepEqual(bars.map((bar) => bar.to - bar.from), [1260, 150, 391]);

  problems.push(...plain(page.sources.title, 'sources.title'), ...plain(page.sources.intro, 'sources.intro'));
  page.sources.groups.forEach((group, i) => {
    problems.push(...plain(group.title, `sources[${i}].title`));
    group.items.forEach((item, j) => problems.push(...rich(item, `sources[${i}][${j}]`, { latin: true })));
  });
  page.footer.forEach((paragraph, i) => problems.push(...plain(paragraph, `footer[${i}]`)));
  assert.deepEqual(problems, []);
});

test('every citation of Ellen White is explained under Sources', () => {
  const sources = page.sources.groups.flatMap((group) => group.items.map((item) => item.en)).join('\n');
  const texts = [...page.creatures.flatMap((creature) => [...creature.white, creature.context].filter(Boolean)), ...page.chart.notes.map((note) => note.text)];
  const cited = new Set(texts.flatMap((text) => citations(text.en)));
  assert.ok(cited.size >= 25, `${cited.size} citations`);
  const missing = [];
  for (const citation of cited) {
    // "GC 438" → the abbreviation GC; a letter is listed whole ("Letter 65, 1898").
    const key = citation.startsWith('Letter') ? citation : citation.split(' ')[0];
    if (!sources.includes(key)) missing.push(citation);
    // A page of The Great Controversy must fall in a chapter the list gives.
    const m = /^GC (\d+)/.exec(citation);
    if (m) {
      const listed = [...sources.split('\n').find((line) => line.startsWith('<b>GC</b>')).matchAll(/(\d+)(?:–(\d+))? (?:and (\d+)(?:–(\d+))? )?\(ch\. \d+\)/g)].flatMap(([, a, b, c, d]) => [[Number(a), Number(b ?? a)], ...(c ? [[Number(c), Number(d ?? c)]] : [])]);
      if (!listed.some(([first, last]) => Number(m[1]) >= first && Number(m[1]) <= last)) missing.push(`${citation} (no chapter listed for that page)`);
    }
  }
  assert.deepEqual(missing, []);
  // The same citations in Russian (only "Letter" is translated).
  const ru = new Set(texts.flatMap((text) => citations(text.ru)).map((citation) => citation.replace('Письмо', 'Letter')));
  assert.deepEqual([...ru].sort(), [...cited].sort());
});

test('a plate that is a picture has its files, at the size the content gives', () => {
  const pictured = page.creatures.filter((creature) => creature.image);
  assert.deepEqual(pictured.map((creature) => creature.id).concat(drawnIds()).sort(), [...PLATE_IDS].sort(), 'every plate is a picture or a drawing');
  for (const { id, image } of pictured) {
    assert.deepEqual(Object.keys(image).sort(), ['height', 'src', 'thumb', 'width'], id);
    for (const key of ['src', 'thumb']) assert.match(image[key], /^img\/revelation\/[a-z0-9-]+\.webp$/, `${id}.image.${key}`);
    const file = readFileSync(new URL(image.src, root));
    const thumb = readFileSync(new URL(image.thumb, root));
    assert.deepEqual(webpSize(file), { width: image.width, height: image.height }, `${id}: the size in the content is the file's`);
    // Sharp on a large screen, and still a small download (it is saved for offline use).
    assert.ok(image.width >= 1200 && image.width <= 2000 && file.length < 400 * 1024, `${id}: 1200 to 2000 px wide, under 400 KB`);
    const small = webpSize(thumb);
    assert.ok(small.width <= 640 && thumb.length < 60 * 1024, `${id}: the gallery copy is small`);
    assert.ok(Math.abs(small.width / small.height - image.width / image.height) < 0.02, `${id}: the gallery copy has the picture's shape`);
    assert.equal(plateSize({ image }).width, 640);
    assert.equal(plateSize({ image }).height, Math.round((640 * image.height) / image.width));
  }
  assert.deepEqual(plateSize({}), { width: 640, height: 400 });
  assert.throws(() => webpSize(Buffer.from('not a picture at all')), /WebP/);
});

test('the drawn plates are built from tools/art/revelation/ (run: node tools/build-revelation.mjs)', async () => {
  const art = readArt();
  const drawn = drawnIds();
  assert.equal(readFileSync(OUTPUT, 'utf8'), platesModule(art));
  const { PLATES, VIEW_BOX: built } = await import('../js/views/explore/revelation-plates.js');
  assert.equal(built, VIEW_BOX);
  assert.deepEqual(Object.keys(PLATES), drawn);
  for (const id of drawn) {
    assert.ok(PLATES[id].length > 2000, `${id} is drawn`);
    // No words in a drawing (the page has two languages), nothing that loads.
    assert.ok(!/<text|<image|href=|<script/.test(PLATES[id]), id);
  }
});

test('the plate converter refuses anything that could run or load, words, and another grid', () => {
  const svg = (inside, viewBox = VIEW_BOX) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inside}</svg>`;
  assert.equal(convertPlate(svg('\n<g id="a"><path d="M0 0" fill="url(#g)"/></g>\n'), 'lamb'), '<g id="rv-lamb-a"><path d="M0 0" fill="url(#rv-lamb-g)"/></g>');
  for (const bad of ['<script>x()</script>', '<path onclick="x()"/>', '<image href="a.png"/>', '<use href="http://x/y#z"/>', '<path fill="url(http://x)"/>', '<foreignObject/>', '<text>WOE</text>']) {
    assert.throws(() => convertPlate(svg(bad), 'lamb'), /only shapes/, bad);
  }
  assert.throws(() => convertPlate(svg('<path d="M0 0"/>', '0 0 100 100'), 'lamb'), /viewBox/);
  assert.throws(() => platesModule({}, ['lamb']), /No drawing/);
});
