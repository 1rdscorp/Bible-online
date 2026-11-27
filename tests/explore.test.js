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

test('the statue drawing is built from tools/art/daniel-statue.svg (run: node tools/build-statue.mjs)', async () => {
  const { SOURCE, OUTPUT, convertStatue, statueModule } = await import('../tools/build-statue.mjs');
  const svg = readFileSync(SOURCE, 'utf8');
  assert.equal(readFileSync(OUTPUT, 'utf8'), statueModule(svg));
  const { body } = convertStatue(svg);
  for (const part of ['head', 'chest', 'belly', 'legs', 'feet', 'stone']) assert.ok(body.includes(`<g class="statue-part" data-part="${part}">`), part);
  assert.ok(body.includes('<g class="statue-mountain">') && body.includes('<g class="statue-plinth">'));
  // Every id is prefixed, and every reference points at one of them.
  const ids = new Set([...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  assert.ok([...ids].every((id) => id.startsWith('st-')));
  for (const [, ref] of body.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.has(ref), ref);
});

test('the statue converter refuses anything that could run or load', async () => {
  const { convertStatue } = await import('../tools/build-statue.mjs');
  const parts = ['Mountain_hidden', 'Plinth', 'Feet_iron_and_clay', 'Legs_iron', 'Belly_and_thighs_bronze', 'Chest_and_arms_silver', 'Head_gold', 'Stone'].map((id) => `<g id="${id}"></g>`).join('');
  const svg = (inside) => `<svg viewBox="0 0 10 10">${parts}${inside}</svg>`;
  assert.doesNotThrow(() => convertStatue(svg('<path d="M0 0"/>')));
  for (const bad of ['<script>x()</script>', '<path onclick="x()"/>', '<image href="a.png"/>', '<use href="http://x/y#z"/>', '<path fill="url(http://x)"/>', '<foreignObject/>']) {
    assert.throws(() => convertStatue(svg(bad)), /only shapes/, bad);
  }
  assert.throws(() => convertStatue('<svg viewBox="0 0 10 10"><g id="Stone"></g></svg>'), /no group/);
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
