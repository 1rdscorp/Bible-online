/**
 * The reading plans (data/plans.json, built by tools/build-plans.mjs):
 * every plan reads its chapters exactly once, in order, in its number of
 * days, with balanced days; and data/research.json's version is current.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BOOKS } from '../js/canon.js';
import { PLAN_DEFINITIONS, partition, toPassages } from '../tools/build-plans.mjs';
import { contentVersion } from '../tools/lib/translation-file.mjs';

const root = new URL('../', import.meta.url);
const text = readFileSync(new URL('data/plans.json', root), 'utf8');
const data = JSON.parse(text);
const research = JSON.parse(readFileSync(new URL('data/research.json', root), 'utf8'));

const chapterKeys = (passage) => {
  const [, book, from, to] = passage.match(/^([1-3A-Z]{3}) (\d+)(?:-(\d+))?$/);
  return Array.from({ length: Number(to ?? from) - Number(from) + 1 }, (_, i) => `${book}.${Number(from) + i}`);
};

describe('the build (tools/build-plans.mjs)', () => {
  test('partition: consecutive, non-empty, balanced groups', () => {
    assert.deepEqual(partition([1, 1, 1, 1], 2), [[0, 2], [2, 4]]);
    assert.deepEqual(partition([10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 2), [[0, 1], [1, 11]]);
    assert.deepEqual(partition([5, 5, 5], 3), [[0, 1], [1, 2], [2, 3]]);
    // Fewer items than days: spread out, some days empty.
    assert.deepEqual(partition([1, 1], 4), [[0, 0], [0, 1], [1, 1], [1, 2]]);
  });

  test('passages join neighbouring chapters of one book', () => {
    assert.deepEqual(toPassages(['GEN.50', 'EXO.1', 'EXO.2', 'EXO.4']), ['GEN 50', 'EXO 1-2', 'EXO 4']);
  });
});

describe('data/plans.json', () => {
  test('is listed in data/research.json with its current version', () => {
    assert.equal(research.plans.url, 'data/plans.json');
    assert.equal(research.plans.version, contentVersion(text), 'run node tools/build-plans.mjs');
    assert.deepEqual(research.plans.plans, data.plans.map((plan) => plan.id));
  });

  for (const definition of PLAN_DEFINITIONS) {
    test(`${definition.id}: every chapter once, in order, over ${definition.days} days`, () => {
      const plan = data.plans.find((p) => p.id === definition.id);
      assert.ok(plan.name.en && plan.name.ru && plan.description.en && plan.description.ru);
      assert.equal(plan.days.length, definition.days);
      assert.equal(plan.minutes.length, definition.days);
      for (const [i, day] of plan.days.entries()) assert.ok(day.length > 0, `day ${i + 1} is empty`);
      definition.tracks.forEach((track) => {
        const expected = track.flatMap((id) => Array.from({ length: BOOKS.find((b) => b.id === id).chapters }, (_, i) => `${id}.${i + 1}`));
        const inTrack = new Set(track);
        const read = plan.days.flatMap((day) => day.flatMap(chapterKeys)).filter((key) => inTrack.has(key.split('.')[0]));
        assert.deepEqual(read, expected);
      });
      // Balanced: no day more than twice the typical length (whole chapters only).
      const sorted = [...plan.minutes].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      assert.ok(sorted.at(-1) <= median * 2, `${sorted.at(-1)} min vs median ${median}`);
    });
  }
});
