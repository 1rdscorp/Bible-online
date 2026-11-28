/**
 * The statue of Daniel 2: a picture of it (head of gold, chest and arms of
 * silver, belly and thighs of bronze, legs of iron, feet of iron and clay)
 * in a ruined hall, with the stone "cut out without hands" in the air. The
 * picture is tools/art/daniel-statue.jpg; tools/build-statue.py crops it
 * into img/daniel-statue/ and traces its parts into statue-photo.js.
 *
 * Each part's outline lies over the picture: pointing at a part lights it,
 * clicking chooses it, and the chosen part stays lit while the rest of the
 * picture dims.
 *
 * release() acts out Daniel 2:34–35: the stone falls on the feet, the
 * statue breaks into shards and chaff that the wind carries away, and the
 * stone grows into a great mountain. With reduced motion it goes straight to
 * the end. raise() brings the statue back.
 *
 * The picture is an image for screen readers (role="img" with a
 * description): the page's list of parts beside it is the control.
 */
import { STATUE_PHOTO as PHOTO } from './statue-photo.js';

const SVG = 'http://www.w3.org/2000/svg';
const FOLDER = 'img/daniel-statue/';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where each part's label sits beside the picture, as a share of its height. */
export const PART_LEVELS = PHOTO.levels;

// Chaff colours by height, head to feet: gold, silver, bronze, iron, clay.
const CHAFF = [
  [421, '#e2b33c'],
  [630, '#d3dae2'],
  [1186, '#b07a3c'],
  [1645, '#6d7480'],
  [Infinity, '#a8714f'],
];

function svg(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  node.append(...children.filter(Boolean));
  return node;
}

const [VX, VY, VW, VH] = PHOTO.viewBox.split(' ').map(Number);
const photo = (file, className) => svg('image', { class: className, href: `${FOLDER}${file}`, x: VX, y: VY, width: VW, height: VH, preserveAspectRatio: 'none' });

// The stone: its middle, and where it lands and grows (in the picture's pixels).
const STONE = PHOTO.stone;
const STONE_MIDDLE = [STONE.x + STONE.width / 2, STONE.y + STONE.height / 2];
const FEET = [800, 1690];
const MOUNTAIN_SCALE = 5;
const MOUNTAIN = [VX + VW * 0.48, VY + VH - 20]; // its foot, middle and bottom
const at = ([x, y]) => `translate(${(x - STONE_MIDDLE[0]).toFixed(1)}px, ${(y - STONE_MIDDLE[1]).toFixed(1)}px)`;
const MOUNTAIN_TRANSFORM = `${at([MOUNTAIN[0], MOUNTAIN[1] - (STONE.height * MOUNTAIN_SCALE) / 2])} scale(${MOUNTAIN_SCALE})`;

/**
 * @param {object} options
 * @param {string} options.label  the picture's description
 * @param {(id: string) => void} options.onSelect  a part was clicked
 */
export function createStatueFigure({ label, onSelect }) {
  const glowFilter = svg('filter', { id: 'st-glow', x: '-20%', y: '-20%', width: '140%', height: '140%' }, svg('feGaussianBlur', { stdDeviation: 9 }));
  const softFilter = svg('filter', { id: 'st-soft', x: '-20%', y: '-20%', width: '140%', height: '140%' }, svg('feGaussianBlur', { stdDeviation: 16 }));
  const hole = svg('path', { class: 'statue-spot-hole', fill: '#000', filter: 'url(#st-soft)' });
  const spot = svg('mask', { id: 'st-spot', maskUnits: 'userSpaceOnUse', x: VX, y: VY, width: VW, height: VH }, svg('rect', { x: VX, y: VY, width: VW, height: VH, fill: '#fff' }), hole);
  const shardClips = svg('g');
  const statueClip = svg('clipPath', { id: 'st-statue' }, svg('path', { d: PHOTO.statue }));
  const defs = svg('defs', {}, glowFilter, softFilter, spot, statueClip, shardClips);

  // Under the picture: the hall without the statue and the stone, seen once they're gone.
  const plate = photo('plate.webp', 'statue-plate');
  const picture = photo('statue.webp', 'statue-picture');
  // While the stone flies: the statue alone, over the empty hall.
  const whole = svg('g', { class: 'statue-whole', 'clip-path': 'url(#st-statue)' }, photo('statue.webp'));
  const shards = svg('g', { class: 'statue-shards' });
  const chaffLayer = svg('g', { class: 'statue-chaff' });
  const stone = svg(
    'g',
    { class: 'statue-stone' },
    svg('image', { href: `${FOLDER}stone.webp`, x: STONE.x, y: STONE.y, width: STONE.width, height: STONE.height, preserveAspectRatio: 'none' }),
  );
  stone.style.transformBox = 'view-box';
  stone.style.transformOrigin = `${STONE_MIDDLE[0]}px ${STONE_MIDDLE[1]}px`;
  // The chosen part lit, the rest dimmed; a glow round the part pointed at.
  const dim = svg('rect', { class: 'statue-dim', x: VX, y: VY, width: VW, height: VH, mask: 'url(#st-spot)' });
  const glow = svg('path', { class: 'statue-glow', filter: 'url(#st-glow)' });
  const hoverGlow = svg('path', { class: 'statue-glow statue-glow--hover', filter: 'url(#st-glow)' });
  // What can be clicked: each part's outline.
  const parts = new Map(Object.entries(PHOTO.parts).map(([id, d]) => [id, svg('path', { class: 'statue-part', 'data-part': id, d })]));

  const element = svg(
    'svg',
    { class: 'statue statue--photo', viewBox: PHOTO.viewBox, role: 'img', 'aria-label': label },
    defs,
    plate,
    picture,
    whole,
    shards,
    chaffLayer,
    stone,
    dim,
    glow,
    hoverGlow,
    svg('g', { class: 'statue-hits' }, ...parts.values()),
  );

  let busy = false;
  let fallen = false;
  let selected = null;
  let running = [];

  element.addEventListener('click', (event) => {
    const part = event.target.closest?.('.statue-part');
    if (part && !busy) onSelect(part.dataset.part);
  });
  element.addEventListener('pointerover', (event) => {
    const part = event.target.closest?.('.statue-part');
    hoverGlow.setAttribute('d', part && part.dataset.part !== selected ? PHOTO.parts[part.dataset.part] : '');
  });
  element.addEventListener('pointerleave', () => hoverGlow.setAttribute('d', ''));

  function select(id) {
    selected = id && PHOTO.parts[id] ? id : null;
    element.classList.toggle('has-selection', Boolean(selected));
    hole.setAttribute('d', selected ? PHOTO.parts[selected] : '');
    glow.setAttribute('d', selected ? PHOTO.parts[selected] : '');
    hoverGlow.setAttribute('d', '');
    for (const [partId, node] of parts) node.classList.toggle('is-selected', partId === selected);
  }

  function stop() {
    for (const animation of running) animation.cancel();
    running = [];
    chaffLayer.replaceChildren();
    shards.replaceChildren();
  }

  function setFallen(value) {
    stop();
    fallen = value;
    element.classList.toggle('is-fallen', value);
    stone.style.transform = value ? MOUNTAIN_TRANSFORM : '';
  }

  const play = (node, keyframes, options) => {
    const animation = node.animate(keyframes, { fill: 'forwards', ...options });
    running.push(animation);
    return animation;
  };

  /** The statue as shards, each a piece of the picture cut to its outline. */
  function breakUp() {
    if (!shardClips.childNodes.length) {
      PHOTO.shards.forEach((shard, i) => shardClips.append(svg('clipPath', { id: `st-shard-${i}` }, svg('path', { d: shard.d }))));
    }
    return PHOTO.shards.map((shard, i) => {
      const piece = svg('g', { class: 'statue-shard' }, svg('image', { href: `${FOLDER}statue.webp`, x: VX, y: VY, width: VW, height: VH, preserveAspectRatio: 'none', 'clip-path': `url(#st-shard-${i})` }));
      shards.append(piece);
      return { piece, y: shard.y };
    });
  }

  /** Small pieces of every metal, blown away to the right. */
  function scatterChaff() {
    for (let i = 0; i < 90; i += 1) {
      const y = 90 + Math.random() * 1690;
      const piece = svg('rect', {
        x: (470 + Math.random() * 520).toFixed(1),
        y: y.toFixed(1),
        width: (5 + Math.random() * 9).toFixed(1),
        height: (3 + Math.random() * 6).toFixed(1),
        fill: CHAFF.find(([below]) => y < below)[1],
        opacity: 0,
      });
      chaffLayer.append(piece);
      const drift = play(
        piece,
        [
          { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
          { opacity: 0.95, offset: 0.12 },
          { transform: `translate(${300 + Math.random() * 600}px, ${-160 + Math.random() * 260}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
        ],
        { duration: 1500 + Math.random() * 900, delay: 100 + (1 - y / 2000) * 650 + Math.random() * 260, easing: 'ease-out', fill: 'none' },
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
      // The stone strikes the feet.
      await play(stone, [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: `${at(FEET)} rotate(-250deg)` }], { duration: 900, easing: 'cubic-bezier(.55, 0, .85, .35)' }).finished;
      // The statue breaks, from the feet up, and the wind carries it away.
      element.classList.add('is-breaking');
      const pieces = breakUp();
      scatterChaff();
      const falling = pieces.map(({ piece, y }) => {
        const height = 1 - (y - 80) / 1720; // 0 at the feet, 1 at the head
        const delay = height * 650 + Math.random() * 120;
        return play(
          piece,
          [
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${(-20 + Math.random() * 60).toFixed(1)}px, ${(40 + Math.random() * 80).toFixed(1)}px) rotate(${(-10 + Math.random() * 20).toFixed(1)}deg)`, opacity: 0.9, offset: 0.35 },
            { transform: `translate(${(260 + Math.random() * 520).toFixed(1)}px, ${(60 + Math.random() * 260).toFixed(1)}px) rotate(${(-90 + Math.random() * 180).toFixed(1)}deg)`, opacity: 0 },
          ],
          { duration: 1100 + Math.random() * 500, delay, easing: 'ease-in' },
        );
      });
      await Promise.all(falling.map((animation) => animation.finished));
      // The stone becomes a great mountain.
      await play(stone, [{ transform: `${at(FEET)} rotate(-250deg)` }, { transform: `${at(FEET)} rotate(-360deg) scale(1.15)`, offset: 0.25 }, { transform: MOUNTAIN_TRANSFORM }], {
        duration: 1700,
        easing: 'cubic-bezier(.2, .7, .2, 1)',
      }).finished;
    } catch {
      // Interrupted (raise() or leaving the page): go to the end state.
    }
    busy = false;
    element.classList.remove('is-busy', 'is-breaking');
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
