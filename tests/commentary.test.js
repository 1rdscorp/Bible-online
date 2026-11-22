/**
 * The commentary in data/commentary/ (tools/build-commentary.mjs), checked
 * against data/research.json and the KJV: files present and well formed,
 * every reference readable and pointing at verses that exist, Smith's
 * sections covering Daniel and the Revelation verse by verse, and the
 * version (the cache key) up to date. Also the lookups in
 * js/research/commentary.js and the routes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { getBook } from '../js/canon.js';
import { bookName, chapterTitle, setLanguage } from '../js/i18n.js';
import { blocksText, neighbours, parsePassage, partsFor, passageLabel, refCovers, sectionsFor } from '../js/research/commentary.js';
import { parseRef } from '../js/research/refs.js';
import { commentaryHref, resolveRoute } from '../js/router.js';
import { contentVersion } from '../tools/lib/translation-file.mjs';

const root = new URL('../', import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), 'utf8');
const { commentary } = JSON.parse(readText('data/research.json'));
const indexText = readText(`${commentary.url}index.json`);
const index = JSON.parse(indexText);
const partText = (work, part) => readText(`${commentary.url}${work.id}/${part.id}.json`);
const ruText = (work, part) => readText(`${commentary.url}ru/${work.id}/${part.id}.json`);
const rst = JSON.parse(readText('data/rst.json'));
const rstChapters = new Map(rst.books.map((book) => [book.id, book.chapters]));
const kjv = JSON.parse(readText('data/kjv.json'));
const kjvChapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
const lastVerse = (book, chapter) => (kjvChapters.get(book)?.[chapter - 1] ?? []).filter(Boolean).length;

/** Does a passage name verses (or chapters) that exist? */
function exists(passage) {
  const ref = parsePassage(passage);
  if (!ref) return false;
  if (ref.whole) return ref.endChapter <= getBook(ref.book).chapters;
  return lastVerse(ref.book, ref.chapter) >= ref.verse && lastVerse(ref.book, ref.endChapter) >= ref.endVerse;
}

function* allRuns(block) {
  if (block.t === 'q') for (const line of block.lines) yield* line;
  else yield* block.c;
}

describe('commentary data (data/commentary/)', () => {
  test('the index: five books, Ellen White’s in series order, then Smith', () => {
    assert.equal(index.formatVersion, 1);
    assert.deepEqual(index.works.map((work) => work.id), ['patriarchs-and-prophets', 'prophets-and-kings', 'desire-of-ages', 'acts-of-the-apostles', 'daniel-and-the-revelation']);
    assert.deepEqual(index.works.filter((work) => work.series).map((work) => work.volume), [1, 2, 3, 4]);
    assert.equal(commentary.works, index.works.length);
    for (const work of index.works) {
      assert.equal(work.license, 'Public domain', work.id);
      assert.equal(work.tradition, 'adventist');
      assert.ok(work.year < 1931, `${work.id} published before 1931`);
      assert.match(work.source.url, /^https:\/\//);
      assert.equal(new Set(work.parts.map((part) => part.id)).size, work.parts.length, `${work.id}: unique chapter ids`);
    }
    const counts = Object.fromEntries(index.works.map((work) => [work.id, work.parts.length]));
    assert.deepEqual(counts, { 'patriarchs-and-prophets': 74, 'prophets-and-kings': 61, 'desire-of-ages': 87, 'acts-of-the-apostles': 58, 'daniel-and-the-revelation': 36 });
  });

  test('every chapter’s passages name verses that exist', () => {
    let linked = 0;
    for (const work of index.works) {
      for (const part of work.parts) {
        for (const passage of part.passages) assert.ok(exists(passage), `${work.id}/${part.id}: ${passage}`);
        if (part.passages.length) linked += 1;
      }
    }
    assert.ok(linked >= 280, `${linked} chapters linked to passages`);
  });

  test('each chapter’s file: well-formed blocks and runs; links to verses and notes that exist', () => {
    const kinds = new Set();
    for (const work of index.works) {
      for (const part of work.parts) {
        const file = JSON.parse(partText(work, part));
        assert.equal(file.formatVersion, 1);
        assert.equal(file.work, work.id);
        assert.equal(file.id, part.id);
        assert.equal(file.title, part.title);
        assert.deepEqual(file.passages, part.passages);
        assert.ok(file.sections.length > 0, `${work.id}/${part.id}: sections`);
        const notes = new Set((file.notes ?? []).map((note) => note.n));
        // The chapter's notes are runs too (they link to the appendix).
        const blocks = [...file.sections.flatMap((section) => section.blocks), ...(file.notes ?? []).map((note) => ({ t: 'n', c: note.c }))];
        for (const block of blocks) {
          assert.ok(['p', 'q', 'n'].includes(block.t), `${work.id}/${part.id}: block ${block.t}`);
          for (const run of allRuns(block)) {
            if (typeof run === 'string') continue;
            const kind = Object.keys(run).sort().join('+');
            kinds.add(kind);
            if (run.r) {
              assert.ok(parseRef(run.r), `${work.id}/${part.id}: ${run.r}`);
              assert.ok(exists(run.r), `${work.id}/${part.id}: ${run.r} exists`);
            }
            if (run.fn) assert.ok(notes.has(run.fn), `${work.id}/${part.id}: note ${run.fn}`);
            if (run.to) {
              const [target, anchor] = run.to.split('#');
              const other = JSON.parse(partText(work, { id: target }));
              assert.ok(other.sections.some((s) => s.blocks.some((b) => b.id === anchor)), `${run.to}`);
            }
          }
        }
      }
    }
    assert.deepEqual([...kinds].sort(), ['b', 'fn', 'i', 'pg', 'r+x', 'to+x']);
  });

  test('Smith: every verse of Daniel and the Revelation in exactly one section, quoted from the KJV', () => {
    const smith = index.works.find((work) => work.kind === 'verses');
    for (const [book, count] of [['DAN', 12], ['REV', 22]]) {
      for (let chapter = 1; chapter <= count; chapter += 1) {
        const part = smith.parts.find((entry) => entry.book === book && entry.chapter === chapter);
        assert.ok(part, `${book} ${chapter}`);
        const file = JSON.parse(partText(smith, part));
        const seen = [];
        for (const section of file.sections.filter((entry) => entry.ref)) {
          const ref = parseRef(section.ref);
          assert.equal(ref.book, book);
          assert.equal(ref.chapter, chapter);
          for (let verse = ref.verse; verse <= ref.endVerse; verse += 1) seen.push(verse);
          assert.deepEqual(section.quote.map(([verse]) => verse), seen.slice(-(ref.endVerse - ref.verse + 1)));
          for (const [verse, text] of section.quote) assert.equal(text, kjvChapters.get(book)[chapter - 1][verse - 1]);
        }
        assert.deepEqual(seen, Array.from({ length: lastVerse(book, chapter) }, (_, i) => i + 1), `${book} ${chapter}`);
      }
    }
  });

  test('"version" matches the files (run `node tools/build-commentary.mjs` after editing)', () => {
    let all = indexText;
    for (const work of index.works) {
      for (const part of work.parts) {
        all += partText(work, part);
        if (part.ru) all += ruText(work, part);
      }
    }
    assert.equal(commentary.version, contentVersion(all));
  });

  test('Ellen White’s chapters link to the official Russian edition', () => {
    for (const work of index.works.filter((entry) => entry.author === 'Ellen G. White')) {
      assert.match(work.ruEdition.url, /^https:\/\/m\.egwwritings\.org\/ru\/book\/\d+$/, work.id);
      assert.match(work.ruEdition.title, /^[А-Яа-яЁё ]+$/);
      for (const part of work.parts) {
        if (part.id === 'appendix') continue; // the Russian edition has no appendix
        assert.ok(Number.isInteger(part.ruEdition?.para) && part.ruEdition.para > 0, `${work.id}/${part.id}`);
        assert.match(part.ruEdition.title, /[А-Яа-яЁё]/, `${work.id}/${part.id}`);
      }
    }
    assert.equal(index.works.find((work) => work.kind === 'verses').ruEdition, undefined, 'Smith has no Russian edition there');
  });

  test('Russian translations: the same blocks as the English, references kept, Smith’s verses in the Synodal', () => {
    let translated = 0;
    for (const work of index.works) {
      for (const part of work.parts.filter((entry) => entry.ru)) {
        translated += 1;
        const en = JSON.parse(partText(work, part));
        const ru = JSON.parse(ruText(work, part));
        assert.equal(ru.lang, 'ru');
        assert.equal(ru.title, part.ru.title);
        assert.match(ru.title, /[А-Яа-яЁё]/);
        assert.equal(ru.sections.length, en.sections.length, `${work.id}/${part.id}`);
        ru.sections.forEach((section, i) => {
          const original = en.sections[i];
          assert.equal(section.ref, original.ref);
          assert.deepEqual(section.blocks.map((block) => block.t), original.blocks.map((block) => block.t), `${work.id}/${part.id} section ${i + 1}`);
          const refs = (blocks) => blocks.flatMap((block) => [...allRuns(block)]).filter((run) => run?.r).map((run) => run.r).sort();
          assert.deepEqual(refs(section.blocks), refs(original.blocks), `${work.id}/${part.id} section ${i + 1}: references`);
          if (section.quote) {
            const ref = parseRef(section.ref);
            for (const [verse, text] of section.quote) assert.equal(text, rstChapters.get(ref.book)[ref.chapter - 1][verse - 1]);
          }
        });
      }
    }
    assert.equal(translated, index.works.reduce((n, work) => n + work.parts.filter((part) => part.ru).length, 0));
  });

  test('spot checks', () => {
    const da = JSON.parse(partText({ id: 'desire-of-ages' }, { id: '17' }));
    assert.equal(da.title, 'Nicodemus');
    assert.deepEqual(da.passages, ['JHN 3:1-17']);
    assert.match(da.sections[0].blocks[0].c[0], /^Nicodemus held a high position of trust in the Jewish nation/);
    const pp = JSON.parse(partText({ id: 'patriarchs-and-prophets' }, { id: '2' }));
    assert.equal(pp.title, 'The Creation');
    assert.deepEqual(pp.passages, ['GEN 1-2']);
    const dan2 = JSON.parse(partText({ id: 'daniel-and-the-revelation' }, { id: 'dan-2' }));
    assert.match(dan2.sections[0].blocks[0].c[0], /^Daniel was carried into captivity in the first year of Nebuchadnezzar\./);
  });
});

describe('commentary lookups (js/research/commentary.js)', () => {
  test('passages: short whole-chapter form and verse ranges', () => {
    assert.deepEqual(parsePassage('GEN 39-41'), { book: 'GEN', chapter: 39, verse: 1, endChapter: 41, endVerse: Infinity, whole: true });
    assert.equal(parsePassage('LUK 2:1-20').endVerse, 20);
    assert.equal(parsePassage('XYZ 1'), null);
    assert.equal(refCovers('GEN 39-41', 'GEN', 40, 5), true);
    assert.equal(refCovers('LUK 2:1-20', 'LUK', 2, 21), false);
    assert.equal(refCovers('LUK 2:1-20', 'LUK', 2), true);
  });

  test('labels in the interface language', () => {
    const names = { bookName, chapterTitle };
    assert.equal(passageLabel('GEN 39-41', names), 'Genesis 39–41');
    assert.equal(passageLabel('PHM 1', names), 'Philemon');
    assert.equal(passageLabel('LUK 2:1-20', names), 'Luke 2:1–20');
    assert.equal(passageLabel('ACT 4:32-5:11', names), 'Acts 4:32–5:11');
    setLanguage('ru');
    try {
      assert.equal(passageLabel('LUK 2', names), 'От Луки 2');
    } finally {
      setLanguage('en');
    }
  });

  test('which chapters discuss a passage, the closest first', () => {
    const ids = (found) => found.map(({ work, part }) => `${work.id}/${part.id}`);
    assert.deepEqual(ids(partsFor(index, 'JHN', 3, 16)), ['desire-of-ages/17']);
    assert.deepEqual(ids(partsFor(index, 'DAN', 2)), ['prophets-and-kings/40', 'daniel-and-the-revelation/dan-2']);
    assert.deepEqual(ids(partsFor(index, 'LUK', 2, 30)), ['desire-of-ages/5']);
    assert.deepEqual(ids(partsFor(index, 'PSA', 119)), []);
    // Acts 13: the chapters telling it come before those based on whole letters.
    const acts = partsFor(index, 'ACT', 13);
    assert.ok(acts.length >= 2 && acts.every(({ work }) => work.id === 'acts-of-the-apostles'));
    // Chapters on all of 1 Corinthians follow any closer match.
    const cor = ids(partsFor(index, '1CO', 13));
    assert.deepEqual(cor, ['acts-of-the-apostles/29', 'acts-of-the-apostles/30']);
  });

  test('Smith’s sections on a verse; neighbouring chapters; excerpts', () => {
    const smith = index.works.find((work) => work.kind === 'verses');
    const dan2 = JSON.parse(partText(smith, { id: 'dan-2' }));
    assert.deepEqual(sectionsFor(dan2, 'DAN', 2, 33).map((section) => section.ref), ['DAN 2:31-35']);
    assert.deepEqual(neighbours(smith, 'dan-intro').prev, null);
    assert.equal(neighbours(smith, 'dan-2').next.id, 'dan-3');
    assert.equal(neighbours(smith, 'rev-22').next, null);
    const excerpt = blocksText([{ t: 'p', c: ['A long ', { i: 'sentence' }, ' that goes on and on.'] }, { t: 'n', c: ['note'] }], 20);
    assert.equal(excerpt, 'A long sentence…');
  });
});

describe('commentary routes', () => {
  test('#/commentary, a book, a chapter', () => {
    assert.deepEqual(resolveRoute('#/commentary'), { params: {}, view: 'commentary' });
    assert.deepEqual(resolveRoute('#/commentary/desire-of-ages'), { params: {}, view: 'commentary', workId: 'desire-of-ages', partId: null });
    assert.deepEqual(resolveRoute('#/commentary/daniel-and-the-revelation/dan-2?v=31'), { params: { v: '31' }, view: 'commentary', workId: 'daniel-and-the-revelation', partId: 'dan-2' });
    assert.equal(resolveRoute('#/Commentary/Desire-of-Ages/4').redirect, '#/commentary/desire-of-ages/4');
    assert.equal(resolveRoute('#/commentary/a/b/c').view, 'not-found');
    assert.equal(resolveRoute('#/commentary/a_b').view, 'not-found');
    assert.equal(commentaryHref('desire-of-ages', '4', 'v=2'), '#/commentary/desire-of-ages/4?v=2');
    assert.equal(commentaryHref(), '#/commentary');
  });
});
