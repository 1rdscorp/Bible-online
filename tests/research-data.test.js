/**
 * Checks the research data in /data (cross references; later Strong's,
 * maps and study pages) against data/research.json: files present and well
 * formed, references readable, and "version" (the cache key) up to date.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BOOKS } from '../js/canon.js';
import { parseRef } from '../js/research/refs.js';
import { contentVersion } from '../tools/lib/translation-file.mjs';

const root = new URL('../', import.meta.url);
const readText = (path) => readFileSync(new URL(path, root), 'utf8');
const research = JSON.parse(readText('data/research.json'));

describe('cross references (data/xref/)', () => {
  const texts = BOOKS.map((book) => readText(`${research.xref.url}${book.id}.json`));

  test('one well-formed file per book, best references first', () => {
    let count = 0;
    BOOKS.forEach((book, index) => {
      const file = JSON.parse(texts[index]);
      assert.equal(file.formatVersion, 1);
      assert.equal(file.book, book.id);
      for (const [verse, list] of Object.entries(file.verses)) {
        assert.match(verse, /^\d+:\d+$/, `${book.id} ${verse}`);
        assert.ok(list.length > 0);
        for (let i = 0; i < list.length; i += 1) {
          const [ref, votes] = list[i];
          assert.ok(parseRef(ref), `${book.id} ${verse}: ${ref}`);
          assert.ok(Number.isInteger(votes) && votes >= 1);
          if (i > 0) assert.ok(votes <= list[i - 1][1], `${book.id} ${verse}: sorted`);
        }
        count += list.length;
      }
    });
    assert.equal(count, research.xref.references);
    assert.ok(count > 300000);
  });

  test('"version" matches the files (run `node tools/build-xref.mjs` after editing)', () => {
    assert.equal(research.xref.version, contentVersion(texts.join('')));
  });

  test('spot checks', () => {
    const john = JSON.parse(texts[BOOKS.findIndex((b) => b.id === 'JHN')]);
    assert.deepEqual(john.verses['3:16'][0], ['ROM 5:8', 995]);
    const isaiah = JSON.parse(texts[BOOKS.findIndex((b) => b.id === 'ISA')]);
    assert.ok(isaiah.verses['44:28'].some(([ref]) => ref === 'EZR 1:1-3'), 'a range across books, split');
  });
});

describe("Strong's dictionaries (data/strongs/)", () => {
  const files = {};
  for (const name of ['hebrew', 'greek']) files[name] = readText(research.strongs[name].url);
  const entries = { ...JSON.parse(files.hebrew).entries, ...JSON.parse(files.greek).entries };

  test('"version" matches each file (run `node tools/build-strongs.mjs` after editing)', () => {
    for (const name of ['hebrew', 'greek']) assert.equal(research.strongs[name].version, contentVersion(files[name]), name);
  });

  test('every entry has a word and a meaning; links point to real entries', () => {
    const keys = Object.keys(entries);
    assert.equal(keys.length, research.strongs.hebrew.entries + research.strongs.greek.entries);
    for (const key of keys) {
      const entry = entries[key];
      assert.ok(entry.lemma && entry.xlit && (entry.def || entry.kjv), key);
      for (const link of `${entry.deriv ?? ''} ${entry.def ?? ''}`.match(/\b[HG]\d+\b/g) ?? []) {
        if (!entries[link]) assert.fail(`${key} links to ${link}, which doesn't exist`);
      }
    }
    assert.equal(entries.H7225.lemma.normalize('NFC'), 'רֵאשִׁית'.normalize('NFC'));
    assert.equal(entries.G3056.lemma, 'λόγος');
  });

  test("every Strong's number in KJV+ has an entry", () => {
    const kjvs = JSON.parse(readText('data/kjvs.json'));
    const missing = new Set();
    for (const book of kjvs.books) {
      for (const chapter of book.tags) {
        for (const verse of chapter) {
          for (const tag of verse ? verse.split(' ') : []) for (const n of tag.split('.')[2].split('+')) if (!entries[n]) missing.add(n);
        }
      }
    }
    assert.deepEqual([...missing], []);
  });
});
