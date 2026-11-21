import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { kingdomBounds, kingdomOf } from '../js/views/explore/daniel-statue.js';

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
    ['Babylon', 'Media', 'Persia', 'Greece', 'The Ptolemies and Seleucids', 'The kingdom of God'],
  );
});

test('kingdomBounds frames a kingdom’s regions and places; the stone has none', () => {
  const babylon = kingdomOf(part('head'), 'traditional');
  const [w, s, e, n] = kingdomBounds(babylon, statue.regions, [{ lon: 35.2, lat: 31.8 }]);
  assert.ok(w <= 34.2 && e >= 48.8 && s <= 27.3 && n >= 37.4, `${[w, s, e, n]}`);
  assert.equal(kingdomBounds(kingdomOf(part('stone'), 'traditional'), statue.regions, []), null);
  // Rome reaches from Spain to Mesopotamia.
  const [rw, , re] = kingdomBounds(kingdomOf(part('legs'), 'traditional'), statue.regions, []);
  assert.ok(rw <= -10 && re >= 48);
});
