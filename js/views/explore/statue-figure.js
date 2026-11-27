/**
 * The statue of Daniel 2 as an SVG figure, on a 360 × 700 grid: head of
 * gold, chest and arms of silver, belly and thighs of bronze, legs of iron,
 * feet of iron and clay, on a plinth, with the stone "cut out without
 * hands" floating beside it. Clicking a part selects it.
 *
 * release() acts out Daniel 2:34–35: the stone falls on the feet, the
 * statue breaks into chaff that the wind carries away, and the stone grows
 * into a mountain. With reduced motion it goes straight to the end.
 * raise() brings the statue back.
 *
 * The drawing is a picture for screen readers (role="img" with a
 * description): the page's list of parts beside it is the control.
 */

const SVG = 'http://www.w3.org/2000/svg';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The drawing: gradients for the metals, the mountain (hidden until the
// end), the plinth, the parts from the feet up, a layer for the chaff and
// the stone. Class names are styled in css/explore.css.
const DRAWING = `
<defs>
<linearGradient id="st-gold" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="290" y2="0"><stop offset="0" stop-color="#6f4f08"/><stop offset=".27" stop-color="#d9a520"/><stop offset=".42" stop-color="#fff0a6"/><stop offset=".6" stop-color="#e0b030"/><stop offset="1" stop-color="#6a4a06"/></linearGradient>
<linearGradient id="st-silver" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="290" y2="0"><stop offset="0" stop-color="#4f5761"/><stop offset=".27" stop-color="#b4bcc7"/><stop offset=".42" stop-color="#ffffff"/><stop offset=".6" stop-color="#c3cad3"/><stop offset="1" stop-color="#4a515b"/></linearGradient>
<linearGradient id="st-bronze" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="290" y2="0"><stop offset="0" stop-color="#4c2a0e"/><stop offset=".27" stop-color="#a8642a"/><stop offset=".42" stop-color="#f0b77c"/><stop offset=".6" stop-color="#b57132"/><stop offset="1" stop-color="#47250b"/></linearGradient>
<linearGradient id="st-iron" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="290" y2="0"><stop offset="0" stop-color="#191e23"/><stop offset=".27" stop-color="#56606b"/><stop offset=".42" stop-color="#a3aeb9"/><stop offset=".6" stop-color="#5f6974"/><stop offset="1" stop-color="#171b20"/></linearGradient>
<linearGradient id="st-clay" gradientUnits="userSpaceOnUse" x1="70" y1="0" x2="290" y2="0"><stop offset="0" stop-color="#7a3d26"/><stop offset=".27" stop-color="#c47a58"/><stop offset=".42" stop-color="#eeb49a"/><stop offset=".6" stop-color="#c07351"/><stop offset="1" stop-color="#6f361f"/></linearGradient>
<linearGradient id="st-stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6d3c6"/><stop offset=".5" stop-color="#96958b"/><stop offset="1" stop-color="#57574f"/></linearGradient>
<linearGradient id="st-plinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b8fa0"/><stop offset="1" stop-color="#4a4e60"/></linearGradient>
</defs>
<g class="statue-mountain">
<path d="M-12 700 L38 524 L84 568 L140 344 L180 172 L216 312 L252 264 L306 472 L332 442 L372 700 Z" fill="url(#st-stone)" stroke="rgba(4,10,30,.6)"/>
<path d="M180 172 L157 268 L174 248 L190 282 L201 246 Z" fill="#f4f2ea" opacity=".85"/>
<path d="M140 344 L152 456 L108 628 M216 312 L228 424 L268 596 M252 264 L264 384" fill="none" stroke="rgba(4,10,30,.3)" stroke-width="1.4"/>
</g>
<g class="statue-plinth">
<path d="M86 662 H274 L286 692 H74 Z" fill="url(#st-plinth)"/>
<path d="M104 676 l8 -5 v10 z M124 676 l8 -5 v10 z M150 671 v10 M158 676 l8 -5 v10 z M190 671 v10 M198 676 l8 -5 v10 z M224 671 v10 M240 676 l8 -5 v10 z" fill="none" stroke="rgba(10,16,40,.55)" stroke-width="1.2"/>
</g>
<g class="statue-part" data-part="feet">
<path d="M132 622 H170 L176 646 V662 H112 V652 Q112 644 120 640 Z" fill="url(#st-iron)"/>
<path d="M228 622 H190 L184 646 V662 H248 V652 Q248 644 240 640 Z" fill="url(#st-iron)"/>
<path d="M132 622 H152 L147 637 L127 639 Z" fill="url(#st-clay)"/>
<path d="M156 640 L174 638 L176 652 L160 652 Z" fill="url(#st-clay)"/>
<path d="M228 622 H206 L210 634 L230 641 Z" fill="url(#st-clay)"/>
<path d="M186 642 L204 640 L208 652 L184 652 Z" fill="url(#st-clay)"/>
<rect x="113" y="651" width="11" height="11" rx="2.5" fill="url(#st-clay)"/><rect x="126" y="651" width="11" height="11" rx="2.5" fill="url(#st-iron)"/><rect x="139" y="651" width="11" height="11" rx="2.5" fill="url(#st-clay)"/><rect x="152" y="651" width="11" height="11" rx="2.5" fill="url(#st-iron)"/><rect x="165" y="651" width="11" height="11" rx="2.5" fill="url(#st-clay)"/>
<rect x="184" y="651" width="11" height="11" rx="2.5" fill="url(#st-iron)"/><rect x="197" y="651" width="11" height="11" rx="2.5" fill="url(#st-clay)"/><rect x="210" y="651" width="11" height="11" rx="2.5" fill="url(#st-iron)"/><rect x="223" y="651" width="11" height="11" rx="2.5" fill="url(#st-clay)"/><rect x="236" y="651" width="11" height="11" rx="2.5" fill="url(#st-iron)"/>
</g>
<g class="statue-part" data-part="legs">
<path d="M124 470 H174 L170 622 H132 Z" fill="url(#st-iron)"/>
<path d="M186 470 H236 L228 622 H190 Z" fill="url(#st-iron)"/>
<ellipse cx="149" cy="485" rx="15" ry="9" fill="url(#st-iron)"/><ellipse cx="211" cy="485" rx="15" ry="9" fill="url(#st-iron)"/>
<path class="statue-ln" d="M150 500 L151 600 M210 500 L209 600 M132.5 606 H170.4 M133 614 H170.2 M189.6 606 H227.5 M189.8 614 H227"/>
<path class="statue-hl" d="M140 500 L143 598 M200 500 L201 598"/>
</g>
<g class="statue-part" data-part="belly">
<path d="M114 252 H246 L250 320 H110 Z" fill="url(#st-bronze)"/>
<path d="M110 334 H178 L174 470 H124 Z" fill="url(#st-bronze)"/>
<path d="M182 334 H250 L236 470 H186 Z" fill="url(#st-bronze)"/>
<path d="M108 318 H252 V336 H108 Z" fill="url(#st-bronze)"/>
<path class="statue-ln" d="M180 258 V292 M148 272 Q180 284 212 272 M146 346 L150 462 M214 346 L210 462"/>
<circle class="statue-flat" cx="180" cy="302" r="3.2" fill="rgba(40,16,2,.6)"/>
<path class="statue-ln" d="M122 327 h6 M144 327 h6 M166 327 h6 M188 327 h6 M210 327 h6 M232 327 h6"/>
<path class="statue-hl" d="M132 346 L138 458 M194 346 L198 458 M126 262 L122 314"/>
</g>
<g class="statue-part" data-part="chest">
<path d="M108 122 Q82 124 80 152 L76 250 L80 348 Q80 352 84 352 H98 Q102 352 102 348 L106 250 L112 158 Z" fill="url(#st-silver)"/>
<path d="M252 122 Q278 124 280 152 L284 250 L280 348 Q280 352 276 352 H262 Q258 352 258 348 L254 250 L248 158 Z" fill="url(#st-silver)"/>
<rect x="74" y="350" width="30" height="34" rx="9" fill="url(#st-silver)"/><rect x="256" y="350" width="30" height="34" rx="9" fill="url(#st-silver)"/>
<path d="M106 134 Q106 120 122 120 H238 Q254 120 254 134 L246 252 H114 Z" fill="url(#st-silver)"/>
<path class="statue-ln" d="M124 180 Q152 200 180 180 Q208 200 236 180 M180 152 V250 M78.4 198 H109.2 M78.1 206 H108.7 M250.8 198 H281.6 M251.3 206 H281.9 M79.4 334 H102.6 M257.4 334 H280.6 M82 362 h14 M82 370 h14 M264 362 h14 M264 370 h14"/>
<path class="statue-hl" d="M124 136 L120 244 M86 156 L83 246"/>
</g>
<g class="statue-part" data-part="head">
<path d="M147 54 H161 V128 H155 Q147 128 147 120 Z" fill="url(#st-gold)"/>
<path d="M213 54 H199 V128 H205 Q213 128 213 120 Z" fill="url(#st-gold)"/>
<path d="M152 46 L157 15 H203 L208 46 Z" fill="url(#st-gold)"/>
<path d="M171 15 L175 4 H185 L189 15 Z" fill="url(#st-gold)"/>
<rect x="147" y="44" width="66" height="10" rx="2" fill="url(#st-gold)"/>
<path d="M160 54 H200 V88 Q200 98 192 100 H168 Q160 98 160 88 Z" fill="url(#st-gold)"/>
<path d="M161 94 H199 L197 140 Q180 150 163 140 Z" fill="url(#st-gold)"/>
<path class="statue-ln" d="M166 17 L164 44 M180 17 V44 M194 17 L196 44 M147 68 H161 M147 82 H161 M147 96 H161 M147 110 H161 M199 68 H213 M199 82 H213 M199 96 H213 M199 110 H213"/>
<path class="statue-ln" d="M165 66 Q171 62 177 66 M183 66 Q189 62 195 66 M180 67 L177 84 H183 M171 92 Q180 88 189 92 M163 106 H197 M163 118 H197 M164 130 H196 M171 96 V142 M180 96 V146 M189 96 V142"/>
<ellipse class="statue-flat" cx="171" cy="72" rx="4.2" ry="2.3" fill="rgba(50,30,0,.7)"/><ellipse class="statue-flat" cx="189" cy="72" rx="4.2" ry="2.3" fill="rgba(50,30,0,.7)"/>
</g>
<g class="statue-chaff"></g>
<g class="statue-part" data-part="stone">
<path d="M280 57.5 L297.5 37.5 L325 42.5 L340 65 L332.5 92.5 L305 102.5 L282.5 87.5 Z" fill="url(#st-stone)"/>
<path class="statue-ln" d="M297.5 37.5 L310 65 L340 65 M280 57.5 L310 65 L305 102.5"/>
</g>`;

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
  element.setAttribute('viewBox', '0 0 360 700');
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.append(...[...doc.documentElement.childNodes].map((node) => document.importNode(node, true)));

  const parts = new Map([...element.querySelectorAll('.statue-part')].map((node) => [node.dataset.part, node]));
  const chaffLayer = element.querySelector('.statue-chaff');
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
