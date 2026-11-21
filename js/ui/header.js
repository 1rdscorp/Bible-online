/**
 * App header: the current location ("John 3 ⌄", linking to the chapter
 * grid), the reader's translation controls (ui/translation-control.js, which
 * sit inside the location area), and hide-on-scroll.
 *
 * To keep reading distraction-free, the sticky header slides away while you
 * scroll down and comes back as soon as you scroll up. It never hides while
 * it holds keyboard focus (CSS :focus-within) or while `isPinned()` is true
 * (the settings panel is open).
 */
import { chapterTitle } from '../canon.js';
import { bookHref } from '../router.js';

// Ignore tiny scroll movements (trackpad jitter, iOS rubber-banding).
const SCROLL_THRESHOLD = 6;

export function initHeader(root, { isPinned = () => false } = {}) {
  const location = root.querySelector('#header-location');
  const locationLink = root.querySelector('#location-link');
  const locationText = root.querySelector('#location-text');

  let lastY = window.scrollY;
  let frameRequested = false;

  function onScroll() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(() => {
      frameRequested = false;
      const y = window.scrollY;
      if (Math.abs(y - lastY) < SCROLL_THRESHOLD) return;
      const scrollingDown = y > lastY;
      root.classList.toggle('is-hidden', scrollingDown && y > root.offsetHeight && !isPinned());
      lastY = y;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    /** Show "John 3" and the translation controls (or hide both with null). */
    setLocation(position) {
      if (!position) {
        location.hidden = true;
        return;
      }
      const title = chapterTitle(position.book, position.chapter);
      locationText.textContent = title;
      locationLink.href = bookHref(position.book);
      locationLink.setAttribute('aria-label', `${title}: choose another chapter`);
      location.hidden = false;
    },

    reveal() {
      root.classList.remove('is-hidden');
      lastY = window.scrollY;
    },

    /** How far down the viewport the header currently covers (0 when slid away). */
    coveredHeight() {
      return root.classList.contains('is-hidden') ? 0 : Math.max(0, root.getBoundingClientRect().bottom);
    },
  };
}
