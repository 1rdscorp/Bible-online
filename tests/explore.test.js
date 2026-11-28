import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { kingdomBounds, kingdomOf, railLayout, regionMetals, shortRef } from '../js/views/explore/daniel-statue.js';
import { formatYear, gridYears, namePlace, yearPosition } from '../js/views/explore/statue-timeline.js';
import { parseRef } from '../js/research/refs.js';

const statue = JSON.parse(readFileSync(new URL('../data/study/explore/daniel-statue.json', import.meta.url), 'utf8'));
const part = (id) => statue.parts.find((p) => p.id === id);

test('each part stands for a kingdom in each reading; Babylon and the stone in both', () => {
  assert.equal(kingdomOf(part('head'), 'traditional').name.en, 'Babylon');
  assert.equal(kingdomOf(part('head'), 'scholarly').name.en, 'Babylon');
  assert.deepEqual(
    statue.parts.map((p) => kingdomOf(p, 'traditional').name.en),
    ['Babylon', 'Medo-Persia', 'Greece', 'Rome', 'The divided kingdom', 'The kingdom of God'],
  );
  assert.deepEqual(
    statue.parts.map((p) => kingdomOf(p, 'scholarly').name.en),
    ['Babylon', 'Media', 'Persia', 'Greece', 'The divided kingdom', 'The kingdom of God'],
  );
});

test('kingdomBounds frames a kingdom’s regions and places; the stone shows all four kingdoms', () => {
  const babylon = kingdomOf(part('head'), 'traditional');
  const [w, s, e, n] = kingdomBounds(babylon, statue.regions, [{ lon: 35.2, lat: 31.8 }]);
  assert.ok(w <= 34.2 && e >= 48.8 && s <= 27.3 && n >= 37.4, `${[w, s, e, n]}`);
  assert.equal(kingdomBounds({ regions: [] }, statue.regions, []), null);
  // Rome reaches from Spain to Mesopotamia.
  const [rw, , re] = kingdomBounds(kingdomOf(part('legs'), 'traditional'), statue.regions, []);
  assert.ok(rw <= -10 && re >= 48);
  // The stone: Rome's extent in the Roman sequence, Alexander's in the Greek.
  assert.deepEqual(kingdomOf(part('stone'), 'traditional').regions, ['rome', 'alexander', 'persia', 'babylon']);
  assert.deepEqual(kingdomOf(part('stone'), 'scholarly').regions, ['alexander', 'persia', 'media', 'babylon']);
});

test('regionMetals: the part’s metal, iron and clay for the feet, the stone’s own list', () => {
  assert.deepEqual(regionMetals(part('head'), kingdomOf(part('head'), 'traditional')), ['gold']);
  assert.deepEqual(regionMetals(part('feet'), kingdomOf(part('feet'), 'traditional')), ['iron', 'clay']);
  assert.deepEqual(regionMetals(part('stone'), kingdomOf(part('stone'), 'scholarly')), ['iron', 'bronze', 'silver', 'gold']);
});

test('shortRef drops the book name', () => {
  assert.equal(shortRef(parseRef('DAN 2:32')), '2:32');
  assert.equal(shortRef(parseRef('DAN 2:37-38')), '2:37–38');
  assert.equal(shortRef(parseRef('DAN 1:1-2:4')), '1:1–2:4');
});

test('timeline layout: positions, bar names, gridlines, years', () => {
  const range = [-650, 500];
  assert.equal(yearPosition(-650, range), 0);
  assert.equal(yearPosition(500, range), 100);
  assert.equal(namePlace({ from: -168, to: 476 }, range), 'inside');
  assert.equal(namePlace({ from: -626, to: -539 }, range), 'after');
  assert.equal(namePlace({ from: 395, to: 476, tail: 500 }, range), 'before');
  const years = gridYears(range);
  assert.equal(years[0].year, -600);
  assert.equal(years.at(-1).year, 400);
  assert.ok(years.find((y) => y.year === -400).major && !years.find((y) => y.year === -300).major);
  assert.equal(formatYear(-605), '605 BC');
  assert.equal(formatYear(70), 'AD 70');
  assert.equal(formatYear(0), 'AD 1');
});

test('the statue picture: its parts, shards and labels (built by tools/build-statue.py)', async () => {
  const { STATUE_PHOTO } = await import('../js/views/explore/statue-photo.js');
  const [x, y, width, height] = STATUE_PHOTO.viewBox.split(' ').map(Number);
  const points = (d) => [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const within = ([px, py]) => px >= x && px <= x + width && py >= y && py <= y + height;
  assert.deepEqual(Object.keys(STATUE_PHOTO.parts), ['head', 'chest', 'belly', 'legs', 'feet', 'stone']);
  for (const [id, d] of Object.entries(STATUE_PHOTO.parts)) {
    assert.match(d, /^(M[\d. L-]+Z)+$/, id);
    assert.ok(points(d).every(within), `${id} lies on the picture`);
  }
  // The parts stack from head to feet, and their labels in the same order.
  const middle = (d) => points(d).reduce((sum, [, py]) => sum + py, 0) / points(d).length;
  const order = ['head', 'chest', 'belly', 'legs', 'feet'];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(middle(STATUE_PHOTO.parts[order[i]]) > middle(STATUE_PHOTO.parts[order[i - 1]]), order[i]);
    assert.ok(STATUE_PHOTO.levels[order[i]] > STATUE_PHOTO.levels[order[i - 1]], `label ${order[i]}`);
  }
  assert.ok(STATUE_PHOTO.shards.length >= 50 && STATUE_PHOTO.shards.every((shard) => /^M/.test(shard.d) && points(shard.d).every(within)));
  // The pictures exist, are WebP, and the picture has the crop's shape.
  for (const file of ['statue', 'plate', 'stone']) {
    const bytes = readFileSync(new URL(`../img/daniel-statue/${file}.webp`, import.meta.url));
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP', file);
    assert.ok(bytes.length < 150_000, `${file} is small`);
  }
  assert.ok(Math.abs(STATUE_PHOTO.picture.width / STATUE_PHOTO.picture.height - width / height) < 0.01);
  assert.match(readFileSync(new URL('../js/views/explore/statue-photo.js', import.meta.url), 'utf8'), /^\/\/ Generated by tools\/build-statue\.py/);
});

test('railLayout keeps the buttons level with their parts, without overlapping or running off the end', () => {
  // Room for everything: each button centred on its part.
  assert.deepEqual(railLayout([50, 150, 250], [20, 20, 20], 400), [40, 140, 240]);
  // Too close: the second moves down to clear the first.
  assert.deepEqual(railLayout([50, 60], [40, 40], 400, 4), [30, 74]);
  // Past the bottom: the last one moves up, and the one above it with it.
  assert.deepEqual(railLayout([300, 330], [40, 40], 340, 4), [256, 300]);
  // Never above the top.
  assert.deepEqual(railLayout([5], [40], 400), [0]);
});
