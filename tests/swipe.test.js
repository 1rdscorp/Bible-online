/** Which touches turn the chapter (js/ui/swipe-nav.js). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { swipeDirection } from '../js/ui/swipe-nav.js';

const phone = { startX: 200, width: 390, ms: 250 };

test('a quick sideways swipe turns the page: left → next, right → previous', () => {
  assert.equal(swipeDirection({ ...phone, dx: -120, dy: 10 }), 1);
  assert.equal(swipeDirection({ ...phone, dx: 120, dy: -15 }), -1);
});

test('short, slow, steep or edge moves do not', () => {
  assert.equal(swipeDirection({ ...phone, dx: -40, dy: 0 }), 0, 'too short');
  assert.equal(swipeDirection({ ...phone, dx: -70, dy: 0 }), 0, 'a nudge, under a fifth of the screen');
  assert.equal(swipeDirection({ ...phone, dx: -120, dy: 0, ms: 1200 }), 0, 'too slow (reading, dragging)');
  assert.equal(swipeDirection({ ...phone, dx: -120, dy: 90 }), 0, 'mostly a scroll');
  assert.equal(swipeDirection({ ...phone, dx: 150, dy: 0, startX: 10 }), 0, 'from the left edge: the system back gesture');
  assert.equal(swipeDirection({ ...phone, dx: -150, dy: 0, startX: 380 }), 0, 'from the right edge');
});

test('on a wide screen the swipe must be longer (20% of the width)', () => {
  assert.equal(swipeDirection({ startX: 500, width: 1024, ms: 250, dx: -150, dy: 0 }), 0);
  assert.equal(swipeDirection({ startX: 500, width: 1024, ms: 250, dx: -250, dy: 0 }), 1);
});
