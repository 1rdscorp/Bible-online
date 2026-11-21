/**
 * The statue of Daniel 2 as an SVG figure: head of gold, chest and arms of
 * silver, belly and thighs of bronze, legs of iron, feet of iron and clay,
 * and the stone "cut out without hands". Clicking a part selects it.
 *
 * play() acts out the end of the dream (Daniel 2:34–35): the stone strikes
 * the feet, the statue breaks into dust that the wind carries away, and the
 * stone grows into a mountain. With reduced motion it goes straight to the
 * end. reset() brings the statue back.
 *
 * The drawing is hidden from screen readers: the page's list of parts is
 * the accessible control (js/views/explore/daniel-statue.js).
 */

const SVG = 'http://www.w3.org/2000/svg';

function svg(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
  node.append(...children.flat().filter(Boolean));
  return node;
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Metal colours, dark edge → highlight → dark edge, for a rounded, cast look.
const METALS = {
  gold: ['#7d5a12', '#d9ac3c', '#fff1b8', '#d39f2d', '#7d5a12'],
  silver: ['#646d77', '#bcc4cd', '#ffffff', '#aeb7c1', '#646d77'],
  bronze: ['#5f3311', '#b46f31', '#f0b987', '#a8622a', '#5f3311'],
  iron: ['#272b30', '#5f666f', '#a3aab3', '#565d66', '#272b30'],
  stone: ['#5d5a54', '#8f8b83', '#b7b2a8', '#857f76', '#5d5a54'],
};

// The parts, drawn on a 300 × 640 grid, symmetrical about x = 150, in the
// manner of an ancient Near Eastern royal statue: tall crown, long curled
// hair and beard, bare arms, a belted and pleated kilt.
const SHAPES = {
  head: [
    ['path', { d: 'M122 60 C115 86 116 124 121 150 Q132 158 140 154 L160 154 Q168 158 179 150 C184 124 185 86 178 60 Z' }], // hair, falling to the shoulders
    ['path', { d: 'M127 62 L130 28 Q150 20 170 28 L173 62 Z' }], // crown
    ['path', { d: 'M145 23 L150 13 L155 23 Z' }], // its finial
    ['ellipse', { cx: 150, cy: 87, rx: 22, ry: 27 }], // face
    ['path', { d: 'M131 96 C134 107 140 112 150 113 C160 112 166 107 169 96 L171 148 C163 156 137 156 129 148 Z' }], // beard
  ],
  chest: [
    ['ellipse', { cx: 99, cy: 178, rx: 15, ry: 17 }], // shoulders
    ['ellipse', { cx: 201, cy: 178, rx: 15, ry: 17 }],
    ['path', { d: 'M86 182 C76 196 72 218 72 242 L70 284 C69 292 68 298 67 304 C66 314 74 318 81 315 C86 311 88 304 88 296 L91 262 C93 236 97 214 102 196 Z' }], // arms
    ['path', { d: 'M214 182 C224 196 228 218 228 242 L230 284 C231 292 232 298 233 304 C234 314 226 318 219 315 C214 311 212 304 212 296 L209 262 C207 236 203 214 198 196 Z' }],
    ['path', { d: 'M98 166 C114 154 186 154 202 166 C205 192 200 224 194 254 C176 262 124 262 106 254 C100 224 95 192 98 166 Z' }], // chest
  ],
  belly: [
    ['path', { d: 'M106 254 C124 262 176 262 194 254 L193 288 L107 288 Z' }],
    ['rect', { x: 103, y: 286, width: 94, height: 12, rx: 2 }], // belt
    ['path', { d: 'M104 298 L196 298 L205 356 C180 364 120 364 95 356 Z' }], // pleated kilt
    ['path', { d: 'M110 356 C122 360 134 361 146 360 L143 426 L112 426 Z' }], // thighs
    ['path', { d: 'M190 356 C178 360 166 361 154 360 L157 426 L188 426 Z' }],
  ],
  legs: [
    ['path', { d: 'M112 426 L143 426 C145 456 143 500 139 550 L118 550 C113 504 109 458 112 426 Z' }],
    ['path', { d: 'M188 426 L157 426 C155 456 157 500 161 550 L182 550 C187 504 191 458 188 426 Z' }],
    ['ellipse', { cx: 127, cy: 430, rx: 16, ry: 7 }], // knees
    ['ellipse', { cx: 173, cy: 430, rx: 16, ry: 7 }],
  ],
  feet: [
    ['path', { d: 'M117 550 L140 550 L141 572 C141 582 133 588 119 588 L101 588 C93 588 93 578 101 573 L116 566 Z' }],
    ['path', { d: 'M183 550 L160 550 L159 572 C159 582 167 588 181 588 L199 588 C207 588 207 578 199 573 L184 566 Z' }],
  ],
  stone: [
    ['path', { d: 'M236 576 L240 556 L256 546 L273 553 L276 572 L258 585 Z' }],
    ['path', { d: 'M240 556 L256 546 L262 560 L246 568 Z', class: 'statue-facet' }],
  ],
};

// Engraved lines: curls of hair and beard, eyes, muscles, pleats, toes.
const DETAILS = {
  head: [
    'M128 54 H172 M129 40 H171', // the crown's bands
    'M123 100 q3 4 0 8 q-3 4 0 8 q3 4 0 8 q-3 4 0 8 M177 100 q-3 4 0 8 q3 4 0 8 q-3 4 0 8 q3 4 0 8', // hair curls
    'M138 80 q5 -3 10 0 M152 80 q5 -3 10 0', // brows
    'M140 86 q4 2 8 0 M152 86 q4 2 8 0', // eyes
    'M150 88 v9 M142 102 q8 -3 16 0', // nose, moustache
    'M134 120 H166 M133 130 H167 M133 140 H167', // rows of beard curls
  ].join(' '),
  chest: 'M110 196 C126 207 140 206 147 198 M153 198 C160 206 174 207 190 196 M150 210 V250 M124 232 q26 8 52 0',
  belly: 'M150 262 v24 M114 298 l-3 56 M127 298 l-1 60 M140 298 v61 M160 298 v61 M173 298 l1 60 M186 298 l3 56 M108 292 H192',
  legs: 'M122 470 q3 30 0 60 M178 470 q-3 30 0 60',
  feet: 'M104 586 v-6 M111 587 v-7 M118 587 v-7 M196 586 v-6 M189 587 v-7 M182 587 v-7',
  stone: 'M256 546 L262 560 L276 572 M246 568 L258 585',
};
const FILL = { head: 'gold', chest: 'silver', belly: 'bronze', legs: 'iron', feet: 'clay', stone: 'stone' };

function gradient(id, colors) {
  return svg(
    'linearGradient',
    { id, x1: '0', y1: '0', x2: '1', y2: '0' },
    colors.map((color, i) => svg('stop', { offset: `${(i / (colors.length - 1)) * 100}%`, 'stop-color': color })),
  );
}

/**
 * @param {object} options
 * @param {(id: string) => void} options.onSelect  a part was clicked
 * @param {string} options.uid  unique on the page (gradient ids)
 */
export function createStatueFigure({ onSelect, uid = 'statue' }) {
  const fill = (kind) => (kind === 'clay' ? `url(#${uid}-clay)` : `url(#${uid}-${kind})`);

  // Iron mixed with clay: a patchwork of iron plates set in clay.
  const clayPattern = svg(
    'pattern',
    { id: `${uid}-clay`, width: 16, height: 16, patternUnits: 'userSpaceOnUse' },
    svg('rect', { width: 16, height: 16, fill: '#a77c55' }),
    svg('path', { d: 'M0 0 L7 0 L5 5 L9 8 L4 11 L0 9 Z M10 2 L16 1 L16 8 L12 7 Z M7 13 L13 11 L16 16 L6 16 Z', fill: '#4d545c' }),
    svg('path', { d: 'M1 1 L5 1 L4 4 M11 3 L14 3', stroke: '#8d949d', 'stroke-width': 0.8, fill: 'none' }),
  );
  const defs = svg('defs', {}, Object.entries(METALS).map(([kind, colors]) => gradient(`${uid}-${kind}`, colors)), clayPattern);

  const parts = {};
  for (const [id, shapes] of Object.entries(SHAPES)) {
    parts[id] = svg(
      'g',
      { class: `statue-part statue-part--${id}`, 'data-part': id },
      shapes.map(([tag, attrs]) => svg(tag, { fill: fill(FILL[id]), ...attrs, class: `statue-shape ${attrs.class ?? ''}`.trim() })),
      svg('path', { d: DETAILS[id], class: 'statue-detail' }),
    );
  }
  const figure = svg('g', { class: 'statue-figure' }, parts.feet, parts.legs, parts.belly, parts.chest, parts.head);
  const mountain = svg('path', {
    class: 'statue-mountain',
    d: 'M-30 640 L30 500 L70 520 L120 420 L150 360 L182 418 L215 470 L250 452 L330 640 Z',
    fill: `url(#${uid}-stone)`,
  });
  const dust = svg('g', { class: 'statue-dust' });
  const ground = svg('ellipse', { class: 'statue-ground', cx: 150, cy: 594, rx: 92, ry: 7 });

  const element = svg(
    'svg',
    { class: 'statue', viewBox: '0 0 300 640', 'aria-hidden': 'true', focusable: 'false' },
    defs,
    ground,
    mountain,
    figure,
    dust,
    parts.stone,
  );

  element.addEventListener('click', (event) => {
    const part = event.target.closest?.('.statue-part');
    if (part && !element.classList.contains('is-played')) onSelect(part.dataset.part);
  });

  let running = [];
  let timers = [];

  function select(id) {
    element.classList.toggle('has-selection', Boolean(id));
    for (const [key, node] of Object.entries(parts)) node.classList.toggle('is-selected', key === id);
  }

  function stop() {
    for (const animation of running) animation.cancel();
    running = [];
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    dust.replaceChildren();
  }

  function animate(node, keyframes, options) {
    if (typeof node.animate !== 'function') return null;
    const animation = node.animate(keyframes, { fill: 'forwards', ...options });
    running.push(animation);
    return animation;
  }

  /** The dust the wind carries away: specks in each part's colour. */
  function scatter() {
    const colors = { head: '#d9ac3c', chest: '#bcc4cd', belly: '#b46f31', legs: '#5f666f', feet: '#a77c55' };
    const areas = { head: [120, 30, 180, 160], chest: [66, 155, 234, 310], belly: [98, 250, 202, 420], legs: [108, 420, 192, 550], feet: [92, 548, 208, 590] };
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const [part, [x0, y0, x1, y1]] of Object.entries(areas)) {
      for (let i = 0; i < 14; i += 1) {
        const speck = svg('circle', { cx: (x0 + random() * (x1 - x0)).toFixed(1), cy: (y0 + random() * (y1 - y0)).toFixed(1), r: (1.2 + random() * 2.4).toFixed(1), fill: colors[part] });
        dust.append(speck);
        animate(
          speck,
          [
            { transform: 'translate(0, 0)', opacity: 1 },
            { transform: `translate(${(120 + random() * 220).toFixed(0)}px, ${(-60 - random() * 160).toFixed(0)}px)`, opacity: 0 },
          ],
          { duration: 1400 + random() * 900, delay: random() * 400, easing: 'cubic-bezier(.2,.6,.4,1)' },
        );
      }
    }
  }

  /** The end of the dream. Resolves when it's over. */
  function play() {
    stop();
    select(null);
    element.classList.add('is-playing');
    if (reducedMotion() || typeof element.animate !== 'function') {
      element.classList.add('is-played');
      element.classList.remove('is-playing');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      // The stone flies in from the top right and strikes the feet.
      animate(parts.stone, [{ transform: 'translate(40px, -500px) rotate(-40deg)' }, { transform: 'translate(-96px, 0) rotate(160deg)' }], {
        duration: 900,
        easing: 'cubic-bezier(.55,0,1,.45)',
      });
      timers.push(
        setTimeout(() => {
          // Everything breaks at once: "broken to pieces together".
          animate(figure, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 180 });
          let index = 0;
          for (const id of ['feet', 'legs', 'belly', 'chest', 'head']) {
            const drift = (index % 2 ? 1 : -1) * (6 + index * 3);
            animate(parts[id], [{ transform: 'translate(0, 0) rotate(0)', opacity: 1 }, { transform: `translate(${drift}px, ${30 + index * 10}px) rotate(${drift / 2}deg)`, opacity: 0 }], {
              duration: 900,
              delay: 150 + index * 70,
              easing: 'ease-in',
            });
            index += 1;
          }
          scatter();
        }, 900),
      );
      timers.push(
        setTimeout(() => {
          // The stone becomes a great mountain.
          animate(parts.stone, [{ transform: 'translate(-96px, 0) rotate(160deg)', opacity: 1 }, { transform: 'translate(-96px, 0) rotate(160deg) scale(0.4)', opacity: 0 }], { duration: 500 });
          animate(mountain, [{ transform: 'scale(0.06)', opacity: 0.9 }, { transform: 'scale(1)', opacity: 1 }], { duration: 1500, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }, 1900),
      );
      timers.push(
        setTimeout(() => {
          element.classList.add('is-played');
          element.classList.remove('is-playing');
          resolve();
        }, 3500),
      );
    });
  }

  function reset() {
    stop();
    element.classList.remove('is-played', 'is-playing');
  }

  return { element, select, play, reset, destroy: stop };
}
