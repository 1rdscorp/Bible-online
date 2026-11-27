/**
 * Swipe left or right on a chapter (phones and tablets) to go to the next
 * or previous chapter, like turning a page; the same move as ← / →.
 *
 * Only a deliberate swipe counts (swipeDirection, unit-tested in
 * tests/swipe.test.js): long enough, mostly sideways and quick. A swipe is
 * ignored when it starts near the screen's edge (the system's own back
 * gesture lives there), with two fingers (pinch-zoom), while text is
 * selected, or in a panel, the audio player, the verse action bar, a
 * form control or anything that scrolls sideways. The text follows the
 * finger a little, so the turn can be seen coming, unless the reader
 * prefers reduced motion.
 */

const EDGE = 24; // px from either side left to the system's gestures
const MIN_DISTANCE = 80; // px, or 20% of the screen's width if more
const MAX_TIME = 800; // ms
const RATIO = 1.8; // sideways at least this many times the vertical move
const FOLLOW = 0.3; // how far the text follows the finger

const IGNORE = 'input, textarea, select, [contenteditable], .side-panel, .audio-player, .verse-actions, .fn-box, .toast-region';

/**
 * Which way a finished touch moves: 1 (next chapter, a swipe to the left),
 * -1 (previous, to the right) or 0 (not a swipe).
 */
export function swipeDirection({ dx, dy, ms, startX, width }) {
  if (startX < EDGE || startX > width - EDGE) return 0;
  if (ms > MAX_TIME) return 0;
  if (Math.abs(dx) < Math.max(MIN_DISTANCE, width * 0.2)) return 0;
  if (Math.abs(dx) < Math.abs(dy) * RATIO) return 0;
  return dx < 0 ? 1 : -1;
}

/** Inside something that scrolls sideways (a wide table), the swipe is its own. */
function scrollsSideways(node, root) {
  for (let el = node; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root  where chapters are shown (<main>)
 * @param {() => HTMLElement | null} options.page  the chapter on screen, if any
 * @param {(direction: 1 | -1) => boolean} options.onSwipe  turn the page; false if there's no chapter that way
 */
export function initSwipeNav({ root, page, onSwipe }) {
  let start = null; // { x, y, time, element }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function reset(element) {
    if (!element) return;
    element.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    element.style.transform = '';
    element.style.opacity = '';
    element.addEventListener('transitionend', () => (element.style.transition = ''), { once: true });
  }

  root.addEventListener(
    'touchstart',
    (event) => {
      start = null;
      const element = page();
      if (!element || event.touches.length !== 1) return;
      if (event.target.closest?.(IGNORE) || scrollsSideways(event.target, root)) return;
      if (!document.getSelection()?.isCollapsed) return; // selecting text
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, time: event.timeStamp, element, following: false };
    },
    { passive: true },
  );

  root.addEventListener(
    'touchmove',
    (event) => {
      if (!start) return;
      if (event.touches.length !== 1 || !document.getSelection()?.isCollapsed) {
        reset(start.element);
        start = null;
        return;
      }
      const touch = event.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      // Follow the finger once the move is clearly sideways.
      if (!reduced() && (start.following || (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * RATIO))) {
        start.following = true;
        start.element.style.transform = `translateX(${dx * FOLLOW}px)`;
        start.element.style.opacity = String(1 - Math.min(0.4, Math.abs(dx) / window.innerWidth));
      }
    },
    { passive: true },
  );

  function end(event) {
    if (!start) return;
    const { element } = start;
    const touch = event.changedTouches?.[0];
    const direction = touch
      ? swipeDirection({ dx: touch.clientX - start.x, dy: touch.clientY - start.y, ms: event.timeStamp - start.time, startX: start.x, width: window.innerWidth })
      : 0;
    start = null;
    if (!(direction && document.getSelection()?.isCollapsed && onSwipe(direction))) reset(element);
  }
  root.addEventListener('touchend', end, { passive: true });
  root.addEventListener('touchcancel', end, { passive: true });
}
