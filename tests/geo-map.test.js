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
