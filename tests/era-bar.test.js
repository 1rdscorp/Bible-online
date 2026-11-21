import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutLanes, ticks } from '../js/views/templates/era-bar.js';

test('layoutLanes puts overlapping periods on separate lanes', () => {
  const laid = layoutLanes([
    { id: 'babylon', from: -626, to: -539 },
    { id: 'media', from: -625, to: -550 },
    { id: 'persia', from: -550, to: -331 },
    { id: 'greece', from: -331, to: -164 },
    { id: 'kingdoms', from: -301, to: -63 },
  ]);
  assert.deepEqual(laid.map((p) => [p.id, p.lane]), [['babylon', 0], ['media', 1], ['persia', 1], ['greece', 0], ['kingdoms', 1]]);
  assert.deepEqual(layoutLanes([{ from: 1, to: 2 }, { from: 2, to: 3 }]).map((p) => p.lane), [0, 0], 'touching is not overlapping');
  assert.deepEqual(layoutLanes([]), []);
});

test('ticks fall on round years, with AD 1 for the boundary', () => {
  assert.deepEqual(ticks([-250, 150], 100), [-200, -100, 1, 100]);
});
