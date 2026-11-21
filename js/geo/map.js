/**
 * An SVG map of Bible places: coastlines, lakes and rivers (data/geo/
 * basemap.json), the map's places and region names (data/study/maps.json),
 * and journeys drawn between places. No map library and no tiles: it works
 * offline once the data is stored, and in every theme.
 *
 * The map is drawn at the width of its container, so text stays the same
 * size on a phone and a desktop; it redraws when the container resizes.
 * Clicking a place selects it (the page shows its details). The SVG itself
 * is a picture for screen readers: the page lists the same places as
 * buttons (js/views/maps.js), which is also the keyboard path.
 */
import { el } from '../ui/dom.js';
import { pathData, placeLabels, projection, touchesBounds } from './projection.js';

const SVG = 'http://www.w3.org/2000/svg';
const MAX_HEIGHT = 0.78; // of the window height

function svg(name, attrs = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

/**
 * @param {object} options
 * @param {object} options.map        one entry of data/study/maps.json
 * @param {object} options.basemap    data/geo/basemap.json
 * @param {object} options.places     data/geo/places.json "places"
 * @param {(place) => string} options.nameOf  a place's name in the interface language
 * @param {(text: {en, ru}) => string} options.localize
 * @param {string} options.label      the map's accessible name
 * @param {(id: string) => void} options.onSelect
 */
export function createMapView({ map, basemap, places, nameOf, localize, label, onSelect }) {
  let selected = null;
  let routes = new Set((map.routes ?? []).map((route) => route.id));
  let width = 0;

  // The frame hugs the map; the full-width wrapper around it is what's measured.
  const frame = el('div', { class: 'map-frame' });
  const container = el('div', { class: 'map-wrap' }, frame);
  const resize = new ResizeObserver(() => {
    const next = Math.round(container.clientWidth);
    if (next && Math.abs(next - width) > 2) draw(next);
  });
  resize.observe(container);

  function draw(available) {
    // As wide as the column, unless that would make the map taller than the window.
    const ratio = projection(map.bounds, 1).height;
    const maxWidth = (window.innerHeight * MAX_HEIGHT) / ratio;
    width = Math.max(280, Math.min(available, maxWidth));
    const proj = projection(map.bounds, width);
    const fontSize = width < 480 ? 11 : 12.5;

    const land = basemap.land.filter((ring) => touchesBounds(ring, map.bounds)).map((ring) => pathData(ring, proj, true)).join('');
    const lakes = basemap.lakes.flatMap((lake) => lake.rings.filter((ring) => touchesBounds(ring, map.bounds)).map((ring) => pathData(ring, proj, true))).join('');
    const rivers = basemap.rivers.flatMap((river) => river.lines.filter((line) => touchesBounds(line, map.bounds)).map((line) => pathData(line, proj))).join('');

    // Region and water names are fixed; they're obstacles for place names.
    const obstacles = [];
    const regionLabels = (map.labels ?? []).map((item) => {
      const text = localize(item.text);
      const y = proj.y(item.lat);
      const size = item.kind === 'region' ? fontSize * 0.92 : fontSize;
      const w = text.length * size * (item.kind === 'region' ? 0.72 : 0.56);
      // Kept whole inside the map, even near its edge.
      const x = Math.min(Math.max(proj.x(item.lon), w / 2 + 4), proj.width - w / 2 - 4);
      obstacles.push({ x: x - w / 2, y: y - size * 0.6, width: w, height: size * 1.2 });
      return svg('text', { class: `map-label map-label--${item.kind}`, x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': size.toFixed(1) }, text);
    });

    const points = (map.places ?? [])
      .map((id) => ({ id, place: places[id] }))
      .filter(({ place }) => place)
      .map(({ id, place }) => ({ id, place, x: proj.x(place.lon), y: proj.y(place.lat), text: nameOf(place), priority: place.verses.length }));
    const labels = placeLabels(points, { width: proj.width, height: proj.height, fontSize, obstacles });

    const routeLayer = svg(
      'g',
      { class: 'map-routes' },
      (map.routes ?? []).map((route, index) => {
        const stops = route.stops.map((id) => places[id]).filter(Boolean);
        const d = stops.map((place, i) => `${i ? 'L' : 'M'}${proj.x(place.lon).toFixed(1)} ${proj.y(place.lat).toFixed(1)}`).join('');
        return svg('path', { class: `map-route map-route--${index + 1}`, d, 'data-route': route.id, hidden: !routes.has(route.id) });
      }),
    );

    const placeLayer = svg(
      'g',
      { class: 'map-places' },
      points.map(({ id, place, x, y, text }) => {
        const spot = labels.get(id);
        return svg(
          'g',
          { class: `map-place${id === selected ? ' is-selected' : ''}`, 'data-id': id, 'data-type': place.type },
          svg('circle', { class: 'map-hit', cx: x.toFixed(1), cy: y.toFixed(1), r: 12 }),
          svg('circle', { class: 'map-dot', cx: x.toFixed(1), cy: y.toFixed(1), r: 3.6 }),
          spot && svg('text', { class: 'map-name', x: spot.x.toFixed(1), y: spot.y.toFixed(1), 'text-anchor': spot.anchor, 'dominant-baseline': 'middle', 'font-size': fontSize }, text),
          // A place without room for its name shows it when selected.
          !spot && svg('text', { class: 'map-name map-name--hidden', x: (x + 6).toFixed(1), y: y.toFixed(1), 'dominant-baseline': 'middle', 'font-size': fontSize }, text),
        );
      }),
    );

    const drawing = svg(
      'svg',
      { class: 'map', viewBox: `0 0 ${proj.width.toFixed(0)} ${proj.height.toFixed(0)}`, width: proj.width.toFixed(0), height: proj.height.toFixed(0), role: 'img', 'aria-label': label },
      svg('rect', { class: 'map-water', width: '100%', height: '100%' }),
      svg('path', { class: 'map-land', d: land, 'fill-rule': 'evenodd' }),
      svg('path', { class: 'map-lake', d: lakes }),
      svg('path', { class: 'map-river', d: rivers }),
      regionLabels,
      routeLayer,
      placeLayer,
    );
    // A tap selects the nearest place within reach, not whichever dot is
    // drawn on top: neighbours (Corinth and Cenchreae) are only pixels apart.
    drawing.addEventListener('click', (event) => {
      const matrix = drawing.getScreenCTM()?.inverse();
      if (!matrix) return;
      const at = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
      let best = null;
      for (const point of points) {
        const distance = Math.hypot(point.x - at.x, point.y - at.y);
        if (distance <= 16 && (!best || distance < best.distance)) best = { id: point.id, distance };
      }
      const label = event.target.closest?.('.map-place');
      const id = best?.id ?? label?.dataset.id;
      if (id) onSelect(id);
    });
    frame.replaceChildren(drawing);
  }

  return {
    element: container,

    /** Mark a place as selected (or none). */
    select(id) {
      selected = id;
      for (const node of container.querySelectorAll('.map-place')) node.classList.toggle('is-selected', node.dataset.id === id);
      // Drawn last, so it's on top of its neighbours.
      const node = container.querySelector(`.map-place[data-id="${CSS.escape(id ?? '')}"]`);
      node?.parentNode.append(node);
    },

    /** Show these routes (ids), hide the rest. */
    setRoutes(ids) {
      routes = new Set(ids);
      for (const path of container.querySelectorAll('.map-route')) {
        if (routes.has(path.dataset.route)) path.removeAttribute('hidden');
        else path.setAttribute('hidden', '');
      }
    },

    destroy() {
      resize.disconnect();
    },
  };
}
