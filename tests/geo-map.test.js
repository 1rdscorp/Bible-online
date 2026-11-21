import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapForPlace, pathData, placeLabels, projection, textWidth, touchesBounds } from '../js/geo/projection.js';

test('projection: west/north is the top-left corner, and longitude shrinks with latitude', () => {
  const p = projection([30, 30, 40, 40], 1000);
  assert.equal(p.x(30), 0);
  assert.equal(p.y(40), 0);
  assert.equal(Math.round(p.x(40)), 1000);
  const k = Math.cos((35 * Math.PI) / 180);
  assert.equal(Math.round(p.height), Math.round(1000 / k));
});

test('pathData draws flat point lists', () => {
  const p = projection([0, 0, 10, 10], 100);
  assert.match(pathData([0, 10, 10, 10, 10, 0], p, true), /^M0\.0 0\.0L\d+\.\d 0\.0L\d+\.\d \d+\.\dZ$/);
  assert.equal(pathData([], p, true), '');
});

test('touchesBounds skips shapes far off the map', () => {
  assert.ok(touchesBounds([1, 1, 2, 2], [0, 0, 10, 10]));
  assert.ok(!touchesBounds([20, 20, 21, 21], [0, 0, 10, 10]));
});

test('placeLabels avoids other dots and labels, and the map edge', () => {
  const fontSize = 10;
  const points = [
    { id: 'a', x: 50, y: 50, text: 'Jerusalem', priority: 900 },
    { id: 'b', x: 52, y: 50, text: 'Bethany', priority: 10 }, // right beside a
    { id: 'c', x: 195, y: 10, text: 'Edge', priority: 5 }, // at the right edge: goes left
  ];
  const placed = placeLabels(points, { width: 200, height: 100, fontSize });
  // Beside a, either side would cover b's dot: a goes above, b below.
  assert.deepEqual(placed.get('a'), { x: 50, y: 40, anchor: 'middle' });
  assert.deepEqual(placed.get('b'), { x: 52, y: 60, anchor: 'middle' });
  assert.equal(placed.get('c').anchor, 'end');
  assert.ok(textWidth('Jerusalem', fontSize) > 40);
});

test('placeLabels leaves out labels that fit nowhere', () => {
  const placed = placeLabels([{ id: 'x', x: 5, y: 5, text: 'A very long name indeed', priority: 1 }], { width: 20, height: 10, fontSize: 10 });
  assert.equal(placed.size, 0);
});

test('mapForPlace prefers a map that labels the place, then one that contains it', () => {
  const maps = [
    { id: 'wide', bounds: [0, 0, 50, 50], places: ['far'] },
    { id: 'near', bounds: [30, 30, 40, 40], places: ['jer'] },
  ];
  assert.equal(mapForPlace(maps, { lon: 35, lat: 31 }, 'jer').id, 'near');
  assert.equal(mapForPlace(maps, { lon: 35, lat: 31 }, 'other').id, 'wide');
  assert.equal(mapForPlace(maps, { lon: 90, lat: 0 }, 'x'), null);
  assert.equal(mapForPlace(maps, null, 'x'), null);
});

import { centerOn, clampView, minZoom, panBy, toBase, toScreen, zoomAround } from '../js/geo/view.js';

// A 100×80 frame showing a map drawn 100×80 at zoom 1, inside a 300×240 extent.
const limits = { width: 100, height: 80, extent: [-100, -80, 200, 160], minK: 1 / 3, maxK: 8 };

test('minZoom: as far out as the extent still fills the frame', () => {
  assert.equal(minZoom(limits.extent, 100, 80), 1 / 3);
  assert.equal(minZoom([0, 0, 100, 80], 100, 80), 1, 'never past the map itself… ');
  assert.equal(minZoom([0, 0, 50, 50], 100, 80, 1), 1, '…when the extent is smaller than the frame');
});

test('clampView keeps zoom in range and the extent covering the frame', () => {
  assert.deepEqual(clampView({ k: 1, x: 0, y: 0 }, limits), { k: 1, x: 0, y: 0 });
  assert.equal(clampView({ k: 20, x: 0, y: 0 }, limits).k, 8);
  assert.equal(clampView({ k: 0.01, x: 0, y: 0 }, limits).k, 1 / 3);
  // Panned too far right: the extent's left edge (−100) would show a gap.
  assert.deepEqual(clampView({ k: 1, x: 500, y: 0 }, limits), { k: 1, x: 100, y: 0 });
  assert.deepEqual(clampView({ k: 1, x: -500, y: -500 }, limits), { k: 1, x: -100, y: -80 });
});

test('zoomAround keeps the point under the cursor still', () => {
  const view = { k: 1, x: 0, y: 0 };
  const zoomed = zoomAround(view, 2, 30, 20, limits);
  assert.equal(zoomed.k, 2);
  const before = toBase(view, 30, 20);
  const after = toBase(zoomed, 30, 20);
  assert.deepEqual(after.map((n) => Math.round(n * 1e6) / 1e6), before);
  assert.equal(zoomAround(view, 100, 30, 20, limits).k, 8, 'capped');
});

test('panBy and centerOn', () => {
  assert.deepEqual(panBy({ k: 2, x: 0, y: 0 }, -10, -5, limits), { k: 2, x: -10, y: -5 });
  const centred = centerOn(70, 60, 4, limits);
  assert.deepEqual(toScreen(centred, 70, 60), [50, 40]);
});

test('projection inverts', () => {
  const p = projection([30, 30, 40, 40], 800);
  assert.equal(Math.round(p.lon(p.x(35.25)) * 1e6) / 1e6, 35.25);
  assert.equal(Math.round(p.lat(p.y(31.5)) * 1e6) / 1e6, 31.5);
});
