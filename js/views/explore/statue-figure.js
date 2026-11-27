/**
 * The statue of Daniel 2 as an SVG figure: head of gold, chest and arms of
 * silver, belly and thighs of bronze, legs of iron, feet of iron and clay,
 * on a plinth, with the stone "cut out without hands" floating beside it.
 * Clicking a part selects it. The drawing is tools/art/daniel-statue.svg,
 * built into statue-drawing.js by tools/build-statue.mjs.
 *
 * release() acts out Daniel 2:34–35: the stone falls on the feet, the
 * statue breaks into chaff that the wind carries away, and the stone grows
 * into a mountain. With reduced motion it goes straight to the end.
 * raise() brings the statue back.
 *
 * The drawing is a picture for screen readers (role="img" with a
 * description): the page's list of parts beside it is the control.
 */

import { DRAWING, VIEW_BOX } from './statue-drawing.js';

const SVG = 'http://www.w3.org/2000/svg';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Chaff colours by height, head to feet: gold, silver, bronze, iron, clay.
const CHAFF = ['#e2b33c', '#d3dae2', '#c07d3c', '#7d8894', '#c47a58'];

/**
 * @param {object} options
 * @param {string} options.label  the picture's description
 * @param {(id: string) => void} options.onSelect  a part was clicked
 */
export function createStatueFigure({ label, onSelect }) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG}">${DRAWING}</svg>`, 'image/svg+xml');
  const element = document.createElementNS(SVG, 'svg');
  element.setAttribute('class', 'statue');
  element.setAttribute('viewBox', VIEW_BOX);
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.append(...[...doc.documentElement.childNodes].map((node) => document.importNode(node, true)));

  const parts = new Map([...element.querySelectorAll('.statue-part')].map((node) => [node.dataset.part, node]));
  // The chaff flies in front of the statue, behind the stone.
  const chaffLayer = document.createElementNS(SVG, 'g');
  chaffLayer.setAttribute('class', 'statue-chaff');
  parts.get('stone').before(chaffLayer);
  const mountain = element.querySelector('.statue-mountain');
  const plinth = element.querySelector('.statue-plinth');
  let busy = false;
  let fallen = false;
  let running = [];

  element.addEventListener('click', (event) => {
    const part = event.target.closest?.('.statue-part');
    if (part && !busy) onSelect(part.dataset.part);
  });

  function select(id) {
    element.classList.toggle('has-selection', Boolean(id));
    for (const [partId, node] of parts) node.classList.toggle('is-selected', partId === id);
  }

  function stop() {
    for (const animation of running) animation.cancel();
    running = [];
    chaffLayer.replaceChildren();
  }

  function setFallen(value) {
    stop();
    fallen = value;
    element.classList.toggle('is-fallen', value);
  }

  const play = (node, keyframes, options) => {
    const animation = node.animate(keyframes, { fill: 'forwards', ...options });
    running.push(animation);
    return animation;
  };

  /** Small pieces of every metal, blown away to the right. */
  function scatterChaff() {
    for (let i = 0; i < 80; i += 1) {
      const y = 30 + Math.random() * 630;
      const piece = document.createElementNS(SVG, 'rect');
      piece.setAttribute('x', (100 + Math.random() * 160).toFixed(1));
      piece.setAttribute('y', y.toFixed(1));
      piece.setAttribute('width', (2 + Math.random() * 4).toFixed(1));
      piece.setAttribute('height', (1.4 + Math.random() * 2.4).toFixed(1));
      piece.setAttribute('fill', CHAFF[Math.min(4, Math.floor((y / 700) * 5))]);
      piece.setAttribute('opacity', '0');
      chaffLayer.append(piece);
      const drift = play(
        piece,
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
          { opacity: 0.95, offset: 0.12 },
          { transform: `translate(${180 + Math.random() * 240}px, ${-70 + Math.random() * 130}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
        ],
        { duration: 1500 + Math.random() * 900, delay: 150 + (1 - y / 700) * 520 + Math.random() * 260, easing: 'ease-out', fill: 'none' },
      );
      drift.onfinish = () => piece.remove();
    }
  }

  /** The end of the dream. Resolves once the mountain stands. */
  async function release() {
    if (busy || fallen) return;
    if (reducedMotion() || typeof element.animate !== 'function') {
      setFallen(true);
      return;
    }
    busy = true;
    element.classList.add('is-busy');
    try {
      const stone = parts.get('stone');
      await play(
        stone,
        [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: 'translate(-36px, 150px) rotate(-90deg)', offset: 0.45 }, { transform: 'translate(-128px, 566px) rotate(-250deg)' }],
        { duration: 850, easing: 'cubic-bezier(.55, 0, .85, .35)' },
      ).finished;
      scatterChaff();
      const falling = ['feet', 'legs', 'belly', 'chest', 'head'].map((id, i) => {
        const side = i % 2 ? 1 : -1;
        return play(
          parts.get(id),
          [
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${side * (8 + i * 5)}px, ${36 + i * 26}px) rotate(${side * (5 + i * 2)}deg)`, opacity: 0.85, offset: 0.5 },
            { transform: `translate(${50 + i * 26}px, ${80 + i * 52}px) rotate(${i % 2 ? 12 : -10}deg)`, opacity: 0 },
          ],
          { duration: 900, delay: i * 120, easing: 'ease-in' },
        );
      });
      falling.push(play(plinth, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 500 }));
      await Promise.all(falling.map((animation) => animation.finished));
      play(stone, [{ opacity: 1 }, { opacity: 0 }], { duration: 450 });
      await play(mountain, [{ transform: 'scale(.04)', opacity: 0.5 }, { transform: 'scale(1)', opacity: 1 }], { duration: 1500, easing: 'cubic-bezier(.2, .7, .2, 1)' }).finished;
    } catch {
      // Interrupted (raise() or leaving the page): go to the end state.
    }
    busy = false;
    element.classList.remove('is-busy');
    if (element.isConnected) setFallen(true);
  }

  return {
    element,
    select,
    release,
    raise: () => setFallen(false),
    get fallen() {
      return fallen;
    },
    get busy() {
      return busy;
    },
    destroy: stop,
  };
}
