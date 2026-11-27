/**
 * The topical index (data/topics/, built by tools/build-topics.mjs from
 * Torrey's New Topical Textbook): well-formed topics with Russian titles,
 * references to verses that exist, "See" links to real topics, the reverse
 * index in step with the topics, and data/research.json's version current.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BOOKS } from '../js/canon.js';
import { cleanTitle, readLine, slug } from '../tools/build-topics.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const research = JSON.parse(read('data/research.json'));
const index = JSON.parse(read('data/topics/index.json'));
const topics = index.topics.map((entry) => JSON.parse(read(`data/topics/${entry.id}.json`)));
const kjv = JSON.parse(read('data/kjv.json'));
const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
const lastVerse = (book, chapter) => (chapters.get(book)?.[chapter - 1] ?? []).filter(Boolean).length;
const REF = /^([1-3A-Z]{3}) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/;

describe('the build (tools/build-topics.mjs)', () => {
  test('titles and ids', () => {
    assert.equal(cleanTitle('Affections, The'), 'Affections');
    assert.equal(cleanTitle('Herbs, &amp; C'), 'Herbs, etc.');
    assert.equal(slug('Communion of the Lord’s Supper'), 'communion-of-the-lords-supper');
  });

  test('a line: statement, references (one-chapter books mended), See links', () => {
    const ref = (osis, shown) => `<scripRef passage="${shown}" osisRef="Bible:${osis}">${shown}</scripRef>`;
    assert.deepEqual(readLine(`Is by Christ — ${ref('John.10.7', 'Joh 10:7')}, ${ref('John.10.9', '9')}.`, lastVerse), { t: 'Is by Christ', r: ['JHN 10:7', 'JHN 10:9'], seeText: [], bad: 0 });
    assert.deepEqual(readLine(`Most holy. — ${ref('Jude.1.1', 'Jude 1')}:20.`, lastVerse).r, ['JUD 1:20']);
    assert.deepEqual(readLine(`In Prayer — See Prayer. ${ref('Deut.4.7', 'De 4:7')}.`, lastVerse).seeText, ['Prayer']);
    assert.deepEqual(readLine('The objects of, are', lastVerse), { t: 'The objects of, are', r: [], seeText: [], bad: 0 });
  });
});

describe('data/topics/', () => {
  test('is listed in data/research.json with its current version', () => {
    const hash = createHash('sha256');
    for (const name of [...index.topics.map((entry) => `${entry.id}.json`), 'index.json', 'refs.json']) hash.update(name).update(read(`data/topics/${name}`));
    assert.equal(research.topics.url, 'data/topics/');
    assert.equal(research.topics.version, hash.digest('hex').slice(0, 12), 'run node tools/build-topics.mjs');
    assert.equal(research.topics.topics, index.topics.length);
  });

  test('623 topics, each with English and Russian titles and unique ids', () => {
    assert.equal(index.topics.length, 623);
    assert.equal(new Set(index.topics.map((t) => t.id)).size, 623);
    for (const entry of index.topics) {
      assert.match(entry.id, /^[a-z0-9-]+$/);
      assert.ok(entry.en && entry.ru && /[А-Яа-яЁё]/.test(entry.ru), entry.id);
    }
    // CCEL's mislabelled topics have their real titles.
    for (const id of ['beasts', 'arts', 'compassion-and-sympathy', 'earth']) assert.ok(index.topics.some((t) => t.id === id), id);
  });

  test('every reference is a verse that exists; See links go to topics', () => {
    const ids = new Set(index.topics.map((t) => t.id));
    let total = 0;
    for (const topic of topics) {
      assert.ok(topic.lines.length > 0, topic.id);
      let count = 0;
      for (const line of topic.lines) {
        assert.ok(line.l === 1 || line.l === 2);
        assert.ok(line.t.length > 0, `${topic.id}: a line without a statement`);
        for (const ref of line.r) {
          const m = REF.exec(ref);
          assert.ok(m, `${topic.id}: ${ref}`);
          const endChapter = Number(m[4] ?? m[2]);
          assert.ok(lastVerse(m[1], Number(m[2])) >= Number(m[3]), `${topic.id}: ${ref}`);
          assert.ok(lastVerse(m[1], endChapter) >= Number(m[5] ?? m[3]), `${topic.id}: ${ref}`);
        }
        for (const see of line.see ?? []) assert.ok(ids.has(see), `${topic.id}: see ${see}`);
        count += line.r.length;
      }
      assert.equal(count, index.topics.find((t) => t.id === topic.id).refs);
      total += count;
    }
    assert.equal(total, research.topics.references);
    assert.ok(total > 35000);
  });

  test('the reverse index lists every reference once, under its book', () => {
    const refs = JSON.parse(read('data/topics/refs.json'));
    assert.deepEqual(Object.keys(refs), BOOKS.map((b) => b.id));
    let count = 0;
    for (const [book, list] of Object.entries(refs)) {
      for (const [chapter, verse, , , t, l] of list) {
        const line = topics[t].lines[l];
        assert.ok(line.r.some((ref) => ref.startsWith(`${book} ${chapter}:${verse}`)), `${book} ${chapter}:${verse} → ${topics[t].id}`);
        count += 1;
      }
    }
    assert.equal(count, research.topics.references);
  });
});
