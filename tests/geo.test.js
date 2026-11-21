import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertPlace } from '../tools/build-geo.mjs';
import { clipLine, clipRing, flatten, geometryParts, ringArea, simplify } from '../tools/lib/geometry.mjs';

const BOX = [0, 0, 10, 10];

test('clipRing keeps what is inside the box, running along its edge where the ring leaves', () => {
  assert.deepEqual(clipRing([[2, 2], [8, 2], [8, 8], [2, 8]], BOX), [[2, 2], [8, 2], [8, 8], [2, 8]], 'inside: unchanged');
  const clipped = clipRing([[5, 5], [15, 5], [15, 15], [5, 15]], BOX);
  assert.equal(ringArea(clipped), 25, 'the quarter inside');
  assert.ok(clipped.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10));
  assert.deepEqual(clipRing([[20, 20], [30, 20], [30, 30]], BOX), [], 'outside: gone');
});

test('clipLine splits a line where it leaves the box', () => {
  assert.deepEqual(clipLine([[1, 1], [2, 2], [20, 2], [3, 3], [4, 4]], BOX), [[[1, 1], [2, 2]], [[3, 3], [4, 4]]]);
});

test('simplify drops points within the tolerance and keeps corners', () => {
  const line = [[0, 0], [1, 0.001], [2, 0], [2, 5]];
  assert.deepEqual(simplify(line, () => 0.01), [[0, 0], [2, 0], [2, 5]]);
  assert.deepEqual(simplify(line, () => 0.0001), line, 'a finer tolerance keeps the bump');
});

test('flatten rounds to about 100 m and drops repeated points', () => {
  assert.deepEqual(flatten([[35.23456, 31.77712], [35.2346, 31.7771], [35.3, 31.8]]), [35.235, 31.777, 35.3, 31.8]);
});

test('geometryParts lists rings or lines of any GeoJSON geometry', () => {
  assert.equal(geometryParts({ type: 'MultiPolygon', coordinates: [[[[0, 0]]], [[[1, 1]], [[2, 2]]]] }).length, 3);
  assert.equal(geometryParts({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }).length, 1);
  assert.deepEqual(geometryParts(null), []);
});

test('convertPlace keeps location, confidence and verses, in Bible order', () => {
  const record = {
    id: 'a15257a',
    friendly_id: 'Bethlehem 1',
    url_slug: 'bethlehem-1',
    types: ['settlement'],
    identifications: [{ resolutions: [{ lonlat: '35.207639,31.704306' }], score: { vote_total: 500 } }],
    verses: [
      { usx: 'MAT 2:1', sort: '40002001' },
      { usx: 'GEN 35:19', sort: '01035019' },
      { usx: 'GEN 35:19', sort: '01035019' },
    ],
  };
  assert.deepEqual(convertPlace(record, { ru: 'Вифлеем' }), {
    name: 'Bethlehem',
    type: 'settlement',
    lon: 35.2076,
    lat: 31.7043,
    score: 500,
    slug: 'bethlehem-1',
    verses: ['GEN 35:19', 'MAT 2:1'],
    ru: 'Вифлеем',
  });
  assert.equal(convertPlace({ ...record, identifications: [] }), null, 'no location');
  assert.equal(convertPlace(record, { en: 'Bethlehem of Judah' }).name, 'Bethlehem of Judah');
});
