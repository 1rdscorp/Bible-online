/**
 * An interactive SVG map of Bible places: coastlines, lakes and rivers
 * (data/geo/basemap.json), the map's places and region names
 * (data/study/maps.json), and journeys drawn between places. No map library
 * and no tiles: it works offline once the data is stored, and in every theme.
 *
 * Zoom and pan:
 *   - mouse: drag to pan; Ctrl/⌘ + scroll (or a trackpad pinch) zooms; a
 *     double-click zooms in (Shift: out). Plain scrolling still scrolls the
 *     page, with a hint, so the map never traps the reader.
 *   - touch: two fingers pinch and pan; one finger scrolls the page, with a
 *     hint. In full screen one finger pans too.
 *   - keyboard (the map is focusable): + and − zoom, arrow keys pan, 0 shows
 *     the whole map, Escape leaves full screen.
 *   - buttons: zoom in, zoom out, whole map, full screen.
 * Zooming out or panning past the map's own bounds shows the lands around
 * it, as far as the basemap goes. "Show all places" adds every place
 * OpenBible.info locates, not only the ones this map names.
 *
 * How it's drawn: the coastlines are paths in "base" units (the map's bounds
 * fitted to the frame), moved by one transform (js/geo/view.js), with
 * strokes that don't scale. Places and names are laid out again in screen
 * units after every move, so text and dots keep their size and more names
 * fit as you zoom in. During a gesture only the map's own places get names;
 * the rest are labelled once it settles.
 *
 * Clicking or tapping selects the nearest place. The SVG itself is a picture
 * for screen readers: the page lists the same places as buttons
 * (js/views/maps.js).
 */
import { t } from '../i18n.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { pathData, placeLabels, projection } from './projection.js';
import { centerOn, clampView, minZoom, panBy, toBase, toScreen, zoomAround } from './view.js';

const SVG = 'http://www.w3.org/2000/svg';
const MAX_HEIGHT = 0.78; // of the window height, outside full screen
const MAX_ZOOM = 12;
const TAP_REACH = 18; // px: how far from a dot a tap still selects it
const SETTLE_MS = 140; // after the last move, lay out every name

function svg(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

/**
 * @param {object} options
 * @param {object} options.map        one entry of data/study/maps.json (its `places` may include extra ids)
 * @param {object} options.basemap    data/geo/basemap.json
 * @param {object} options.places     data/geo/places.json "places"
 * @param {(place) => string} options.nameOf  a place's name in the interface language
 * @param {(text: {en, ru}) => string} options.localize
 * @param {string} options.label      the map's accessible name
 * @param {(id: string) => void} options.onSelect
 * @param {HTMLElement} [options.details]  the selected place's details: shown under the map, and in full screen too
 */
export function createMapView({ map, basemap, places, nameOf, localize, label, onSelect, details = null }) {
  let selected = null;
  let routes = new Set((map.routes ?? []).map((route) => route.id));
  let showAll = false;
  let fullscreen = false;
  let size = { width: 0, height: 0 };
  let proj = null;
  let limits = null;
  let view = { k: 1, x: 0, y: 0 };
  let home = null; // the starting view: the map's bounds, fitted
  let keep = null; // { lon, lat, k } to restore after a resize
  let busyUntil = 0; // while a gesture is under way, skip the full name layout
  let settleTimer = 0;
  let frameRequest = 0;
  let shown = []; // the points drawn last, in screen units: for taps
  let animation = 0;
  let goal = null; // where a running animation is heading

  const mapIds = new Set(map.places ?? []);

  /* -------- elements -------- */

  const geo = svg('g', { class: 'map-geo' });
  const overlay = svg('g', { class: 'map-overlay' });
  // The drawing is hidden from screen readers: the frame (a labelled group
  // with key help) speaks for it, and the page lists its places as buttons.
  const drawing = svg('svg', { class: 'map', 'aria-hidden': 'true', focusable: 'false' }, svg('rect', { class: 'map-water', width: '100%', height: '100%' }), geo, overlay);
  const hint = el('p', { class: 'map-hint', 'aria-hidden': 'true', hidden: true });
  const keysHelp = el('p', { class: 'visually-hidden', id: `map-keys-${map.id}` }, t('maps.keys'));

  const button = (key, path, onclick) => el('button', { type: 'button', class: 'map-button', 'data-map-action': key, onclick }, icon(path, { size: 18 }));
  const zoomInButton = button('zoom-in', ICONS.plus, () => zoomBy(1.6));
  const zoomOutButton = button('zoom-out', ICONS.minus, () => zoomBy(1 / 1.6));
  const homeButton = button('home', ICONS.fit, () => animateTo(home));
  const fullButton = button('fullscreen', ICONS.expand, () => setFullscreen(!fullscreen));
  const controls = el('div', { class: 'map-controls' }, zoomInButton, zoomOutButton, homeButton, fullButton);

  const frame = el(
    'div',
    { class: 'map-frame', tabindex: '0', role: 'group', 'aria-label': label, 'aria-describedby': keysHelp.id },
    drawing,
    controls,
    hint,
  );

  const allInput = el('input', { type: 'checkbox', class: 'map-all-input' });
  allInput.addEventListener('change', () => {
    showAll = allInput.checked;
    render(true);
  });
  const options = el('div', { class: 'map-options' }, el('label', {}, allInput, el('span', { class: 'map-all-label' }, t('maps.showAll'))));

  const container = el('div', { class: 'map-wrap' }, options, frame, keysHelp, details);
  const placeholder = document.createComment('map');

  /* -------- size and base drawing -------- */

  const resize = new ResizeObserver(() => scheduleMeasure());
  resize.observe(container);
  resize.observe(frame);
  let measureRequest = 0;
  function scheduleMeasure() {
    cancelAnimationFrame(measureRequest);
    measureRequest = requestAnimationFrame(measure);
  }

  function measure() {
    const width = Math.round(fullscreen ? frame.clientWidth : container.clientWidth);
    if (!width) return;
    const ratio = projection(map.bounds, 1).height;
    const height = Math.round(fullscreen ? frame.clientHeight : Math.max(260, Math.min(width * ratio, window.innerHeight * MAX_HEIGHT)));
    if (width === size.width && height === size.height) return;
    // Keep the same place in the middle, at the same zoom, across a resize.
    if (proj) {
      const [bx, by] = toBase(view, size.width / 2, size.height / 2);
      keep = { lon: proj.lon(bx), lat: proj.lat(by), k: view.k };
    }
    size = { width, height };
    build();
  }

  /** Base units: the map's bounds fitted inside the frame; paths for everything the basemap has. */
  function build() {
    const { width, height } = size;
    const ratio = projection(map.bounds, 1).height;
    proj = projection(map.bounds, Math.min(width, height / ratio));
    const [W, S, E, N] = basemap.bounds;
    const extent = [proj.x(W), proj.y(N), proj.x(E), proj.y(S)];
    limits = { width, height, extent, minK: minZoom(extent, width, height, 1), maxK: MAX_ZOOM };
    home = centerOn(proj.width / 2, proj.height / 2, 1, limits);
    view = keep ? centerOn(proj.x(keep.lon), proj.y(keep.lat), keep.k, limits) : home;
    keep = null;

    drawing.setAttribute('viewBox', `0 0 ${width} ${height}`);
    drawing.setAttribute('width', width);
    drawing.setAttribute('height', height);
    frame.style.height = fullscreen ? '' : `${height}px`;

    const land = basemap.land.map((ring) => pathData(ring, proj, true)).join('');
    const lakes = basemap.lakes.flatMap((lake) => lake.rings.map((ring) => pathData(ring, proj, true))).join('');
    const rivers = basemap.rivers.flatMap((river) => river.lines.map((line) => pathData(line, proj))).join('');
    geo.replaceChildren(
      svg('path', { class: 'map-land', d: land, 'fill-rule': 'evenodd' }),
      svg('path', { class: 'map-lake', d: lakes }),
      svg('path', { class: 'map-river', d: rivers }),
      svg(
        'g',
        { class: 'map-routes' },
        (map.routes ?? []).map((route, index) => {
          const stops = route.stops.map((id) => places[id]).filter(Boolean);
          const d = stops.map((place, i) => `${i ? 'L' : 'M'}${proj.x(place.lon).toFixed(1)} ${proj.y(place.lat).toFixed(1)}`).join('');
          return svg('path', { class: `map-route map-route--${index + 1}`, d, 'data-route': route.id, hidden: !routes.has(route.id) });
        }),
      ),
    );
    apply();
  }

  /* -------- the view -------- */

  function setView(next) {
    view = clampView(next, limits);
    apply();
  }

  function apply() {
    geo.setAttribute('transform', `matrix(${view.k} 0 0 ${view.k} ${view.x.toFixed(2)} ${view.y.toFixed(2)})`);
    zoomInButton.disabled = view.k >= limits.maxK - 1e-6;
    zoomOutButton.disabled = view.k <= limits.minK + 1e-6;
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => render(false));
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => render(true), Math.max(0, busyUntil - performance.now()) + 20);
  }

  /** Mark a gesture as under way, so names are laid out fully only once it settles. */
  function busy() {
    busyUntil = performance.now() + SETTLE_MS;
  }

  // Quick presses build on each other: each step starts from where the last
  // one is heading, not from halfway there.
  function zoomBy(factor, at = [size.width / 2, size.height / 2]) {
    animateTo(zoomAround(goal ?? view, factor, at[0], at[1], limits), at);
  }

  /** Move smoothly to `target` (instantly with reduced motion). `anchor`: the screen point a zoom keeps still. */
  function animateTo(target, anchor = null) {
    cancelAnimationFrame(animation);
    goal = null;
    if (reducedMotion()) {
      setView(target);
      return;
    }
    goal = target;
    const start = view;
    const began = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - began) / 220);
      const ease = 1 - (1 - progress) ** 3;
      busy();
      if (anchor) {
        const factor = (target.k / start.k) ** ease;
        setView(zoomAround(start, factor, anchor[0], anchor[1], limits));
      } else {
        setView({ k: start.k + (target.k - start.k) * ease, x: start.x + (target.x - start.x) * ease, y: start.y + (target.y - start.y) * ease });
      }
      if (progress < 1) {
        animation = requestAnimationFrame(step);
      } else {
        goal = null;
        setView(target);
      }
    };
    animation = requestAnimationFrame(step);
  }

  /* -------- places and names, in screen units -------- */

  function render(settled) {
    if (!proj) return;
    const { width, height } = size;
    const fontSize = width < 480 ? 11 : 12.5;
    const margin = 24;
    const inFrame = ([x, y]) => x >= -margin && y >= -margin && x <= width + margin && y <= height + margin;

    // Region, water and river names: fixed places on the map, obstacles for place names.
    const obstacles = [];
    const regionNodes = [];
    for (const item of map.labels ?? []) {
      const [x, y] = toScreen(view, proj.x(item.lon), proj.y(item.lat));
      if (!inFrame([x, y])) continue;
      const text = localize(item.text);
      const textSize = item.kind === 'region' ? fontSize * 0.92 : fontSize;
      const w = text.length * textSize * (item.kind === 'region' ? 0.72 : 0.56);
      obstacles.push({ x: x - w / 2, y: y - textSize * 0.6, width: w, height: textSize * 1.2 });
      regionNodes.push(
        svg('text', { class: `map-label map-label--${item.kind}`, x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': textSize.toFixed(1) }, text),
      );
    }

    // The map's own places (and the selected one) always; every other place on "Show all".
    const points = [];
    const add = (id, major) => {
      const place = places[id];
      if (!place) return;
      const [x, y] = toScreen(view, proj.x(place.lon), proj.y(place.lat));
      if (!inFrame([x, y])) return;
      const priority = id === selected ? Infinity : (major ? 1e6 : 0) + place.verses.length;
      points.push({ id, place, x, y, text: nameOf(place), priority, major });
    };
    for (const id of mapIds) add(id, true);
    if (selected && !mapIds.has(selected)) add(selected, true);
    if (showAll) for (const id of Object.keys(places)) if (!mapIds.has(id) && id !== selected) add(id, false);
    shown = points;

    // Mid-gesture, only the map's own places get names (fast); every name once it settles.
    const named = settled || performance.now() >= busyUntil ? points : points.filter((point) => point.major);
    const labels = placeLabels(named, { width, height, fontSize, obstacles });
    // The selected place always shows its name, even where there's no room.
    if (selected && !labels.has(selected)) {
      const point = points.find((p) => p.id === selected);
      if (point) labels.set(selected, { x: point.x + 7, y: point.y, anchor: 'start' });
    }

    const minor = points.filter((point) => !point.major);
    const minorDots = minor.map(({ x, y }) => `M${(x - 2.4).toFixed(1)} ${y.toFixed(1)}a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0`).join('');
    const name = (point, className) => {
      const spot = labels.get(point.id);
      return spot ? svg('text', { class: className, 'data-id': point.id, x: spot.x.toFixed(1), y: spot.y.toFixed(1), 'text-anchor': spot.anchor, 'dominant-baseline': 'middle', 'font-size': fontSize }, point.text) : null;
    };

    overlay.replaceChildren(
      ...regionNodes,
      minorDots ? svg('path', { class: 'map-minor', d: minorDots }) : null,
      ...minor.map((point) => name(point, 'map-name map-name--minor')),
      // Major places last, the selected one on top.
      ...points
        .filter((point) => point.major)
        .sort((a, b) => (a.id === selected) - (b.id === selected))
        .map((point) =>
          svg(
            'g',
            { class: `map-place${point.id === selected ? ' is-selected' : ''}`, 'data-id': point.id, 'data-type': point.place.type },
            svg('circle', { class: 'map-dot', cx: point.x.toFixed(1), cy: point.y.toFixed(1), r: 3.6 }),
            name(point, 'map-name'),
          ),
        ),
    );
  }

  /** The nearest place drawn within reach of a screen point. */
  function placeAt(x, y) {
    let best = null;
    for (const point of shown) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= TAP_REACH && (!best || distance < best.distance || (distance === best.distance && point.major))) best = { id: point.id, distance };
    }
    return best?.id ?? null;
  }

  /* -------- input -------- */

  /** A client (page) point → a point in the frame's screen units. */
  function local(clientX, clientY) {
    const rect = drawing.getBoundingClientRect();
    const scale = size.width / (rect.width || size.width);
    return [(clientX - rect.left) * scale, (clientY - rect.top) * scale];
  }

  let hintTimer = 0;
  function showHint(text) {
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hint.hidden = true;
    }, 1600);
  }

  // Mouse and pen: drag to pan. (Touch is handled with touch events below.)
  let drag = null; // { x, y, moved }
  let suppressClick = false;
  frame.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0 || event.target.closest('.map-controls')) return;
    drag = { x: event.clientX, y: event.clientY, moved: 0 };
    frame.setPointerCapture?.(event.pointerId);
  });
  frame.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerType === 'touch') return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) };
    if (drag.moved > 3) {
      frame.classList.add('is-dragging');
      busy();
      setView(panBy(view, dx, dy, limits));
    }
  });
  const endDrag = () => {
    if (!drag) return;
    suppressClick = drag.moved > 3;
    drag = null;
    frame.classList.remove('is-dragging');
  };
  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);

  frame.addEventListener('click', (event) => {
    if (event.target.closest('.map-controls')) return;
    if (suppressClick || performance.now() < ignoreClicksUntil) {
      suppressClick = false;
      return;
    }
    const id = placeAt(...local(event.clientX, event.clientY));
    if (id) onSelect(id);
  });

  frame.addEventListener('dblclick', (event) => {
    if (event.target.closest('.map-controls')) return;
    event.preventDefault();
    zoomBy(event.shiftKey ? 1 / 2 : 2, local(event.clientX, event.clientY));
  });

  // Ctrl/⌘ + wheel (a trackpad pinch sends the same) zooms; plain scrolling
  // scrolls the page, except in full screen, where the map has the window.
  frame.addEventListener(
    'wheel',
    (event) => {
      if (!fullscreen && !event.ctrlKey && !event.metaKey) {
        showHint(t('maps.hintWheel', { key: isMac() ? '⌘' : 'Ctrl' }));
        return;
      }
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      busy();
      setView(zoomAround(view, Math.exp(-delta * 0.002), ...local(event.clientX, event.clientY), limits));
    },
    { passive: false },
  );

  // Touch: two fingers pinch and pan (one finger in full screen); one finger
  // otherwise scrolls the page. Taps select, double taps zoom in.
  let touch = null; // { points: Map(id → [x, y]), moved, start }
  let lastTap = 0;
  let ignoreClicksUntil = 0;
  const touchPoints = (event) => new Map([...event.touches].map((point) => [point.identifier, local(point.clientX, point.clientY)]));
  const centre = (points) => {
    const list = [...points.values()];
    return [list.reduce((sum, p) => sum + p[0], 0) / list.length, list.reduce((sum, p) => sum + p[1], 0) / list.length];
  };
  const spread = (points) => {
    const [a, b] = [...points.values()];
    return b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0;
  };
  frame.addEventListener(
    'touchstart',
    (event) => {
      if (event.target.closest('.map-controls')) return;
      const points = touchPoints(event);
      const handled = fullscreen || points.size >= 2;
      if (handled) event.preventDefault();
      touch = { points, handled, moved: touch && points.size > 1 ? touch.moved : 0, start: performance.now(), hinted: touch?.hinted ?? false };
    },
    { passive: false },
  );
  frame.addEventListener(
    'touchmove',
    (event) => {
      if (!touch) return;
      const points = touchPoints(event);
      const handled = fullscreen || points.size >= 2;
      if (!handled) {
        // One finger outside full screen: the page scrolls; say how to move the map.
        const [before] = touch.points.values();
        const [now] = points.values();
        if (before && now && !touch.hinted && Math.hypot(now[0] - before[0], now[1] - before[1]) > 12) {
          touch.hinted = true;
          showHint(t('maps.hintTouch'));
        }
        return;
      }
      event.preventDefault();
      // Compare with the same fingers as before.
      const previous = new Map([...touch.points].filter(([id]) => points.has(id)));
      const current = new Map([...points].filter(([id]) => previous.has(id)));
      if (current.size === 0) {
        touch = { ...touch, points };
        return;
      }
      const [cx, cy] = centre(current);
      const [px, py] = centre(previous);
      let next = panBy(view, cx - px, cy - py, limits);
      if (current.size >= 2 && spread(previous) > 0) next = zoomAround(next, spread(current) / spread(previous), cx, cy, limits);
      touch = { ...touch, points, handled: true, moved: touch.moved + Math.abs(cx - px) + Math.abs(cy - py) + Math.abs(spread(current) - spread(previous)) };
      busy();
      setView(next);
    },
    { passive: false },
  );
  frame.addEventListener('touchend', (event) => {
    if (!touch) return;
    const remaining = touchPoints(event);
    if (remaining.size > 0) {
      touch = { ...touch, points: remaining };
      return;
    }
    const wasTap = touch.moved < 8 && performance.now() - touch.start < 400 && touch.points.size === 1;
    const [at] = touch.points.values();
    const handled = touch.handled;
    touch = null;
    if (!wasTap || !at) return;
    // In full screen the browser sends no click (touchstart was taken), so taps are handled here.
    const now = performance.now();
    if (now - lastTap < 320) {
      zoomBy(2, at);
      lastTap = 0;
    } else {
      lastTap = now;
      const id = placeAt(...at);
      if (id) onSelect(id);
    }
    // Outside full screen the browser also sends a click, which would select again.
    if (!handled || fullscreen) ignoreClicksUntil = now + 500;
  });

  frame.addEventListener('keydown', (event) => {
    if (event.target !== frame) return;
    const step = event.shiftKey ? 240 : 80;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      animateTo(panBy(goal ?? view, ...moves[event.key], limits));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomBy(1.6);
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomBy(1 / 1.6);
    } else if (event.key === '0') {
      event.preventDefault();
      animateTo(home);
    }
  });

  /* -------- full screen --------
     The map takes the whole window (not the Fullscreen API, which iPhones
     don't offer for pages). It moves to the end of <body> meanwhile, and the
     rest of the page is inert, so focus and screen readers stay with it. */

  const inertTargets = [];
  function setFullscreen(on) {
    if (on === fullscreen) return;
    fullscreen = on;
    if (on) {
      container.replaceWith(placeholder);
      document.body.append(container);
      for (const node of document.body.children) {
        if (node !== container && !node.inert && node.tagName !== 'SCRIPT') {
          node.inert = true;
          inertTargets.push(node);
        }
      }
      document.documentElement.classList.add('has-map-fullscreen');
    } else {
      for (const node of inertTargets.splice(0)) node.inert = false;
      placeholder.replaceWith(container);
      document.documentElement.classList.remove('has-map-fullscreen');
    }
    container.classList.toggle('is-fullscreen', on);
    frame.style.height = ''; // full screen: the frame fills the window (CSS); otherwise measure() sets it
    if (on) {
      container.setAttribute('role', 'dialog');
      container.setAttribute('aria-modal', 'true');
      container.setAttribute('aria-label', label);
    } else {
      for (const name of ['role', 'aria-modal', 'aria-label']) container.removeAttribute(name);
    }
    renderButtons();
    frame.focus({ preventScroll: true });
    scheduleMeasure();
  }

  document.addEventListener('keydown', onEscape);
  function onEscape(event) {
    if (event.key === 'Escape' && fullscreen) {
      event.preventDefault();
      setFullscreen(false);
    }
  }

  function renderButtons() {
    const labels = [
      [zoomInButton, t('maps.zoomIn')],
      [zoomOutButton, t('maps.zoomOut')],
      [homeButton, t('maps.wholeMap')],
      [fullButton, fullscreen ? t('maps.exitFullscreen') : t('maps.fullscreen')],
    ];
    for (const [node, text] of labels) {
      node.setAttribute('aria-label', text);
      node.title = text;
    }
    fullButton.replaceChildren(icon(fullscreen ? ICONS.collapse : ICONS.expand, { size: 18 }));
    fullButton.setAttribute('aria-pressed', String(fullscreen));
  }
  renderButtons();

  return {
    element: container,

    /**
     * Mark a place as selected (or none). With `reveal`, a place outside
     * the frame is brought to its middle.
     */
    select(id, { reveal = false } = {}) {
      selected = places[id] ? id : null;
      if (selected && reveal && proj) {
        const place = places[selected];
        const [x, y] = toScreen(view, proj.x(place.lon), proj.y(place.lat));
        const pad = 40;
        if (x < pad || y < pad || x > size.width - pad || y > size.height - pad) {
          animateTo(centerOn(proj.x(place.lon), proj.y(place.lat), Math.max(view.k, 1), limits));
          return;
        }
      }
      render(true);
    },

    /** Show these routes (ids), hide the rest. */
    setRoutes(ids) {
      routes = new Set(ids);
      for (const path of geo.querySelectorAll('.map-route')) {
        if (routes.has(path.dataset.route)) path.removeAttribute('hidden');
        else path.setAttribute('hidden', '');
      }
    },

    /** The current zoom (1 = the map's bounds fill the frame), for tests and debugging. */
    zoom: () => view.k,

    destroy() {
      setFullscreen(false);
      resize.disconnect();
      document.removeEventListener('keydown', onEscape);
      cancelAnimationFrame(frameRequest);
      cancelAnimationFrame(animation);
      clearTimeout(settleTimer);
    },
  };
}
