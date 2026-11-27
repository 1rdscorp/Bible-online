/**
 * Checks the hand-written study content in data/study/:
 *   books/<BOOK>.json   book introductions (author, date, themes, outline)
 *   timeline.json       the timeline
 *   maps.json           the map pages
 * Every reference must exist (verse counts from data/kjv.json, English
 * numbering), outlines must cover their book without gaps, every place id
 * must be in data/geo/places.json, and every text needs English and Russian.
 * Run `node tools/build-study.mjs` after editing, to update the version in
 * data/research.json.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BOOKS, getBook } from '../js/canon.js';
import { parseRef } from '../js/research/refs.js';
import { studyVersion } from '../tools/build-study.mjs';

const root = new URL('../', import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const kjv = readJson('data/kjv.json');
const places = readJson('data/geo/places.json').places;
const basemap = readJson('data/geo/basemap.json');
const research = readJson('data/research.json');

// Verses per chapter, English numbering.
const lengths = new Map(kjv.books.map((b) => [b.id, b.chapters.map((verses) => verses.length)]));
const versesIn = (book, chapter) => lengths.get(book)?.[chapter - 1] ?? 0;

/** Problems with a reference string ("GEN 1:1-11:32"), or [] if it's fine. */
function refProblems(text, label) {
  const ref = parseRef(text);
  if (!ref) return [`${label}: can't read "${text}" (write "GEN 1:1", "GEN 1:1-5" or "GEN 1:1-2:3")`];
  const problems = [];
  if (ref.verse > versesIn(ref.book, ref.chapter)) problems.push(`${label}: ${text} starts at a verse that doesn't exist`);
  if (ref.endVerse > versesIn(ref.book, ref.endChapter)) problems.push(`${label}: ${text} ends at a verse that doesn't exist`);
  return problems;
}

/** A localized text: { en: "…", ru: "…" }, both non-empty, Russian in Cyrillic. */
function textProblems(value, label) {
  if (!value || typeof value !== 'object') return [`${label}: needs { "en": …, "ru": … }`];
  const problems = [];
  if (typeof value.en !== 'string' || !value.en.trim()) problems.push(`${label}.en is missing`);
  if (typeof value.ru !== 'string' || !/[А-Яа-яЁё]/.test(value.ru)) problems.push(`${label}.ru is missing or not in Russian`);
  for (const lang of ['en', 'ru']) {
    if (typeof value[lang] === 'string' && /[<>]|\s{2,}|^\s|\s$/.test(value[lang])) problems.push(`${label}.${lang}: no markup, double spaces or edge spaces`);
  }
  return problems;
}

const placeProblems = (ids, label) => (ids ?? []).filter((id) => !places[id]).map((id) => `${label}: unknown place id ${id}`);

/** Everything wrong with one book introduction. */
export function bookProblems(data, bookId) {
  const problems = [];
  const book = getBook(bookId);
  if (data.formatVersion !== 1) problems.push('formatVersion must be 1');
  if (data.book !== bookId) problems.push(`"book" must be "${bookId}"`);
  for (const field of ['author', 'date', 'summary']) problems.push(...textProblems(data[field], field));
  if (!Array.isArray(data.themes) || data.themes.length < 3 || data.themes.length > 6) problems.push('themes: 3 to 6');
  (data.themes ?? []).forEach((theme, i) => problems.push(...textProblems(theme, `themes[${i}]`)));

  // Outline: in order, no gaps or overlaps, from 1:1 to the book's last verse.
  const outline = data.outline ?? [];
  if (outline.length < 2 || outline.length > 10) problems.push('outline: 2 to 10 sections');
  let expected = { chapter: 1, verse: 1 };
  outline.forEach((section, i) => {
    const label = `outline[${i}]`;
    problems.push(...textProblems(section, label), ...refProblems(section.ref, label));
    const ref = parseRef(section.ref);
    if (!ref) return;
    if (ref.book !== bookId) problems.push(`${label}: ${section.ref} is not in ${bookId}`);
    if (expected && (ref.chapter !== expected.chapter || ref.verse !== expected.verse)) {
      problems.push(`${label}: ${section.ref} should start at ${expected.chapter}:${expected.verse} (no gaps or overlaps)`);
    }
    const last = versesIn(bookId, ref.endChapter);
    expected = ref.endVerse < last ? { chapter: ref.endChapter, verse: ref.endVerse + 1 } : { chapter: ref.endChapter + 1, verse: 1 };
  });
  if (book && outline.length && (expected.chapter !== book.chapters + 1 || expected.verse !== 1)) {
    problems.push(`outline: must end at the book's last verse (${book.chapters}:${versesIn(bookId, book.chapters)})`);
  }

  if (!Array.isArray(data.keyVerses) || data.keyVerses.length < 1 || data.keyVerses.length > 4) problems.push('keyVerses: 1 to 4');
  (data.keyVerses ?? []).forEach((ref, i) => {
    problems.push(...refProblems(ref, `keyVerses[${i}]`));
    if (parseRef(ref) && parseRef(ref).book !== bookId) problems.push(`keyVerses[${i}]: ${ref} is not in ${bookId}`);
  });
  if (data.places !== undefined && (!Array.isArray(data.places) || data.places.length > 8)) problems.push('places: at most 8 ids');
  problems.push(...placeProblems(data.places, 'places'));
  const known = new Set(['formatVersion', 'book', 'author', 'date', 'summary', 'themes', 'outline', 'keyVerses', 'places']);
  for (const key of Object.keys(data)) if (!known.has(key)) problems.push(`unknown field "${key}"`);
  return problems;
}

describe('book introductions (data/study/books/)', () => {
  const files = readdirSync(new URL('data/study/books/', root)).filter((name) => name.endsWith('.json'));

  for (const name of files) {
    const bookId = name.slice(0, -5);
    test(bookId, () => {
      assert.ok(getBook(bookId)?.id === bookId, `${name}: the file name must be a book id such as GEN.json`);
      assert.deepEqual(bookProblems(readJson(`data/study/books/${name}`), bookId), []);
    });
  }

  test('every book has an introduction', () => {
    const have = new Set(files.map((name) => name.slice(0, -5)));
    assert.deepEqual(BOOKS.map((b) => b.id).filter((id) => !have.has(id)), []);
  });
});

describe('timeline (data/study/timeline.json)', () => {
  const timeline = readJson('data/study/timeline.json');

  test('eras and events are complete and in order', () => {
    const problems = [];
    const eras = new Set();
    let previousEra = -Infinity;
    timeline.eras.forEach((era, i) => {
      const label = `eras[${i}] ${era.id}`;
      if (!/^[a-z0-9-]+$/.test(era.id ?? '') || eras.has(era.id)) problems.push(`${label}: id must be unique, a-z 0-9 -`);
      eras.add(era.id);
      problems.push(...textProblems(era.title, `${label}.title`), ...textProblems(era.dates, `${label}.dates`));
      if (!(Number.isInteger(era.start) && Number.isInteger(era.end) && era.start < era.end)) problems.push(`${label}: start < end (years; BC negative)`);
      if (era.start < previousEra) problems.push(`${label}: eras in order`);
      previousEra = era.start;
    });
    const ids = new Set();
    let previous = -Infinity;
    timeline.events.forEach((event, i) => {
      const label = `events[${i}] ${event.id}`;
      if (!/^[a-z0-9-]+$/.test(event.id ?? '') || ids.has(event.id)) problems.push(`${label}: id must be unique, a-z 0-9 -`);
      ids.add(event.id);
      if (!eras.has(event.era)) problems.push(`${label}: unknown era "${event.era}"`);
      if (!Number.isInteger(event.year) || event.year === 0) problems.push(`${label}: year must be a whole number (BC negative; there is no year 0)`);
      if (event.year < previous) problems.push(`${label}: events in date order`);
      previous = event.year;
      problems.push(...textProblems(event.title, `${label}.title`), ...textProblems(event.date, `${label}.date`), ...textProblems(event.summary, `${label}.summary`));
      if (!Array.isArray(event.refs) || event.refs.length === 0) problems.push(`${label}: at least one reference`);
      (event.refs ?? []).forEach((ref, r) => problems.push(...refProblems(ref, `${label}.refs[${r}]`)));
      problems.push(...placeProblems(event.place ? [event.place] : [], label));
    });
    assert.deepEqual(problems, []);
    assert.ok(timeline.events.length >= 30, `${timeline.events.length} events`);
  });
});

describe('map pages (data/study/maps.json)', () => {
  const { maps } = readJson('data/study/maps.json');

  test('maps fit the basemap, and their places and routes exist', () => {
    const problems = [];
    const [W, S, E, N] = basemap.bounds;
    const ids = new Set();
    for (const map of maps) {
      const label = `map ${map.id}`;
      if (!/^[a-z0-9-]+$/.test(map.id ?? '') || ids.has(map.id)) problems.push(`${label}: id must be unique, a-z 0-9 -`);
      ids.add(map.id);
      problems.push(...textProblems(map.title, `${label}.title`), ...textProblems(map.summary, `${label}.summary`));
      const [w, s, e, n] = map.bounds ?? [];
      if (!(w >= W && s >= S && e <= E && n <= N && w < e && s < n)) problems.push(`${label}: bounds [w, s, e, n] inside the basemap's ${basemap.bounds}`);
      problems.push(...placeProblems(map.places, `${label}.places`));
      for (const id of map.places ?? []) {
        const place = places[id];
        if (place && !(place.lon >= w && place.lon <= e && place.lat >= s && place.lat <= n)) problems.push(`${label}: ${place.name} (${id}) is outside the map`);
        if (place && !place.ru) problems.push(`${label}: ${place.name} (${id}) needs a Russian name in tools/place-names.json`);
      }
      for (const [i, item] of (map.labels ?? []).entries()) {
        problems.push(...textProblems(item.text, `${label}.labels[${i}]`));
        if (!(item.lon >= w && item.lon <= e && item.lat >= s && item.lat <= n)) problems.push(`${label}.labels[${i}]: outside the map`);
      }
      for (const [i, route] of (map.routes ?? []).entries()) {
        problems.push(...textProblems(route.title, `${label}.routes[${i}]`), ...refProblems(route.ref, `${label}.routes[${i}]`));
        problems.push(...placeProblems(route.stops, `${label}.routes[${i}].stops`));
        if (!(route.stops?.length >= 2)) problems.push(`${label}.routes[${i}]: at least two stops`);
      }
    }
    assert.deepEqual(problems, []);
  });
});

describe('explore pages (data/study/explore.json)', () => {
  const index = readJson('data/study/explore.json');
  const wide = readJson('data/geo/basemap-wide.json');
  const [W, S, E, N] = wide.bounds;
  const onMap = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;

  test('the index lists pages with a file, titles and the passages they belong to', () => {
    const problems = [];
    for (const page of index.pages) {
      if (!/^[a-z0-9-]+$/.test(page.id)) problems.push(`${page.id}: id a-z 0-9 -`);
      problems.push(...textProblems(page.title, `${page.id}.title`), ...textProblems(page.summary, `${page.id}.summary`));
      for (const book of page.books) if (getBook(book)?.id !== book) problems.push(`${page.id}: unknown book ${book}`);
      for (const chapter of page.chapters) {
        const [book, number] = chapter.split(' ');
        if (!(getBook(book)?.id === book && Number(number) >= 1 && Number(number) <= getBook(book).chapters)) problems.push(`${page.id}: bad chapter "${chapter}"`);
      }
      readJson(`data/study/${page.file}`);
    }
    assert.deepEqual(problems, []);
  });

  test('the statue of Daniel 2: parts, both readings, kingdoms, map, timeline, evidence, notes', () => {
    const statue = readJson('data/study/explore/daniel-statue.json');
    const problems = [];
    const readings = statue.readings.map((reading) => reading.id);
    assert.deepEqual(readings, ['traditional', 'scholarly']);
    assert.deepEqual(statue.parts.map((part) => part.id), ['head', 'chest', 'belly', 'legs', 'feet', 'stone']);

    // Rich text: the tags the page renders (js/views/templates/rich-html.js),
    // the same markup in both languages, and verse links that exist.
    const ALLOWED = /^<\/?(p|b|i|cite|sup|ul|li|h4|table|thead|tbody|tr|th|td|div)>$|^<(div|span|td) class="(cols|tscroll|sw-dot|num)">$|^<span class="dbar" data-value="[\d.]+">$|^<(th|td) data-metal="(gold|silver|bronze|iron|mix|stone)">$|^<a data-ref="[^"]+">$|^<\/(div|span|a)>$/;
    const tags = (html) => html.match(/<[^>]+>/g) ?? [];
    // A bibliography entry may stay in its own language (`latin`).
    const rich = (value, label, { latin = false } = {}) => {
      if (!value || typeof value.en !== 'string' || !value.en.trim()) return [`${label}.en is missing`];
      const found = [];
      if (typeof value.ru !== 'string' || !(latin ? value.ru.trim() : /[А-Яа-яЁё]/.test(value.ru))) found.push(`${label}.ru is missing or not in Russian`);
      for (const tag of tags(value.en)) if (!ALLOWED.test(tag)) found.push(`${label}: tag ${tag} isn't allowed`);
      if (tags(value.en).join('') !== tags(value.ru ?? '').join('')) found.push(`${label}: English and Russian markup differ`);
      for (const [, ref] of value.en.matchAll(/data-ref="([^"]+)"/g)) found.push(...refProblems(ref, label));
      return found;
    };
    const plain = (value, label) => textProblems(value, label);

    problems.push(...plain(statue.title, 'title'), ...plain(statue.eyebrow, 'eyebrow'), ...rich(statue.summary, 'summary'), ...refProblems(statue.passage, 'passage'));
    for (const reading of statue.readings) problems.push(...plain(reading.title, `reading ${reading.id}`), ...rich(reading.note, `reading ${reading.id}.note`));
    problems.push(...rich(statue.stage.start, 'stage.start'), ...rich(statue.stage.fallen, 'stage.fallen'), ...plain(statue.stage.figure, 'stage.figure'));

    const evidenceIds = new Set(statue.evidence.items.map((item) => item.id));
    const checkKingdom = (part, kingdom, label) => {
      for (const key of ['name', 'rail', 'full', 'dates']) problems.push(...plain(kingdom[key], `${label}.${key}`));
      problems.push(...rich(kingdom.summary, `${label}.summary`), ...rich(kingdom.differ, `${label}.differ`));
      if (typeof kingdom.agree !== 'boolean') problems.push(`${label}: agree is true or false`);
      if (!(kingdom.facts?.length >= 3)) problems.push(`${label}: at least 3 facts`);
      kingdom.facts.forEach((fact, i) => problems.push(...rich(fact, `${label}.facts[${i}]`)));
      kingdom.stats.forEach(([name, value], i) => problems.push(...plain(name, `${label}.stats[${i}]`), ...rich(value, `${label}.stats[${i}]`)));
      for (const id of kingdom.evidence) if (!evidenceIds.has(id)) problems.push(`${label}: unknown evidence ${id}`);
      for (const id of kingdom.regions) if (!statue.regions[id]) problems.push(`${label}: unknown region ${id}`);
      if (kingdom.regionMetals && kingdom.regionMetals.length !== kingdom.regions.length) problems.push(`${label}: a metal for each region`);
      if (kingdom.mapNote) problems.push(...rich(kingdom.mapNote, `${label}.mapNote`));
      for (const id of kingdom.places) if (!places[id]?.ru) problems.push(`${label}: place ${id} missing or without a Russian name`);
      for (const id of kingdom.landmarks) if (!statue.landmarks[id]) problems.push(`${label}: unknown landmark ${id}`);
      if (part.id !== 'stone' && !kingdom.regions.length) problems.push(`${label}: no region to show on the map`);
    };
    for (const part of statue.parts) {
      for (const key of ['title', 'short', 'label', 'refs']) problems.push(...plain(part[key], `${part.id}.${key}`));
      if (!['gold', 'silver', 'bronze', 'iron', 'mix', 'stone'].includes(part.metal)) problems.push(`${part.id}: unknown metal ${part.metal}`);
      if (!part.verses?.length) problems.push(`${part.id}: no verses`);
      for (const ref of part.verses ?? []) problems.push(...refProblems(ref, `${part.id}.verses`));
      if (part.kingdom) checkKingdom(part, part.kingdom, part.id);
      else for (const reading of readings) part.kingdoms?.[reading] ? checkKingdom(part, part.kingdoms[reading], `${part.id}.${reading}`) : problems.push(`${part.id}: no kingdom for ${reading}`);
    }
    for (const [id, region] of Object.entries(statue.regions)) {
      problems.push(...plain(region.title, `region ${id}`), ...plain(region.date, `region ${id}.date`));
      if (!onMap(...region.label)) problems.push(`region ${id}: label off the wide basemap`);
      for (const ring of region.rings) {
        if (ring.length < 6 || ring.length % 2) problems.push(`region ${id}: a ring needs 3+ [lon, lat] pairs`);
        for (let i = 0; i < ring.length; i += 2) if (!onMap(ring[i], ring[i + 1])) problems.push(`region ${id}: ${ring[i]},${ring[i + 1]} off the wide basemap`);
      }
    }
    for (const [id, landmark] of Object.entries(statue.landmarks)) {
      problems.push(...plain(landmark.name, `landmark ${id}`), ...plain(landmark.note, `landmark ${id}.note`));
      if (!onMap(landmark.lon, landmark.lat)) problems.push(`landmark ${id}: off the wide basemap`);
    }

    const { timeline } = statue;
    const [from, to] = timeline.range;
    problems.push(...plain(timeline.title, 'timeline.title'), ...rich(timeline.intro, 'timeline.intro'));
    const cats = timeline.categories.map((cat) => cat.id);
    for (const cat of timeline.categories) problems.push(...plain(cat.label, `category ${cat.id}`));
    for (const reading of readings) {
      if (!timeline.bands[reading]?.length) problems.push(`timeline: no bars for ${reading}`);
      for (const band of timeline.bands[reading] ?? []) {
        if (!statue.parts.some((part) => part.id === band.part)) problems.push(`bands.${reading}: unknown part ${band.part}`);
        if (!(band.from < band.to && band.from >= from && band.to <= to && (band.tail ?? band.to) <= to)) problems.push(`bands.${reading}.${band.part}: ${band.from}–${band.to} outside ${from}–${to}`);
        problems.push(...plain(band.label, `bands.${reading}.${band.part}`));
      }
    }
    timeline.events.forEach((event, i) => {
      if (!Number.isInteger(event.year) || event.year < from || event.year > to) problems.push(`event ${i}: a whole year within the range`);
      if (!cats.includes(event.cat) || event.cat === 'all') problems.push(`event ${i}: unknown category ${event.cat}`);
      problems.push(...rich(event.title, `event ${i}.title`), ...rich(event.text, `event ${i}.text`));
      if (event.when) problems.push(...plain(event.when, `event ${i}.when`));
      if (event.ref) problems.push(...refProblems(event.ref, `event ${i}`));
    });

    const { evidence } = statue;
    const groups = evidence.groups.map((group) => group.id);
    for (const item of evidence.items) {
      if (!groups.includes(item.group) || item.group === 'all') problems.push(`evidence ${item.id}: unknown group`);
      if (!['tablet', 'cylinder', 'stele', 'scroll', 'book', 'arch', 'brick', 'rock'].includes(item.icon)) problems.push(`evidence ${item.id}: unknown icon`);
      for (const kind of item.kinds) if (!evidence.kinds[kind]) problems.push(`evidence ${item.id}: unknown kind ${kind}`);
      for (const key of ['title', 'meta', 'says', 'bears']) problems.push(...rich(item[key], `evidence ${item.id}.${key}`));
    }
    for (const [kind, label] of Object.entries(evidence.kinds)) problems.push(...plain(label, `kind ${kind}`));

    if (!(statue.notes.items.length >= 5)) problems.push('notes: at least 5');
    statue.notes.items.forEach((note, i) => problems.push(...plain(note.title, `note ${i}.title`), ...rich(note.body, `note ${i}.body`)));
    for (const group of statue.sources.groups) {
      problems.push(...plain(group.title, 'sources group'));
      group.items.forEach((item, i) => problems.push(...rich(item, `${group.title.en} ${i}`, { latin: true })));
    }
    statue.footer.forEach((paragraph, i) => problems.push(...rich(paragraph, `footer ${i}`)));
    assert.deepEqual(problems, []);
  });
});

test('data/research.json has the study content’s current version (run `node tools/build-study.mjs`)', () => {
  assert.equal(research.study?.version, studyVersion());
});
