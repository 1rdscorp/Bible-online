/**
 * Map maths with no DOM, so Node tests can check it.
 *
 * Projection: equirectangular, with longitude scaled by the cosine of the
 * map's middle latitude. Over the few degrees these maps cover, that keeps
 * shapes close to true without a map library.
 */

/** A projection of `bounds` ([west, south, east, north]) onto a `width`-unit-wide map. */
export function projection(bounds, width) {
  const [west, south, east, north] = bounds;
  const k = Math.cos((((south + north) / 2) * Math.PI) / 180);
  const scale = width / ((east - west) * k);
  return {
    width,
    height: (north - south) * scale,
    x: (lon) => (lon - west) * k * scale,
    y: (lat) => (north - lat) * scale,
    // And back: map units → longitude and latitude.
    lon: (x) => west + x / (k * scale),
    lat: (y) => north - y / scale,
  };
}

/** Height ÷ width of a map of these bounds. */
export const aspectRatio = (bounds) => {
  const p = projection(bounds, 1);
  return p.height;
};

/** SVG path data for a flat [lon, lat, lon, lat, …] list. */
export function pathData(flat, proj, close = false) {
  let d = '';
  for (let i = 0; i < flat.length; i += 2) d += `${i ? 'L' : 'M'}${proj.x(flat[i]).toFixed(1)} ${proj.y(flat[i + 1]).toFixed(1)}`;
  return close && d ? `${d}Z` : d;
}

/** Does a flat point list come anywhere near the bounds? (Skips drawing what's off the map.) */
export function touchesBounds(flat, [west, south, east, north], margin = 0.5) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    minLon = Math.min(minLon, flat[i]);
    maxLon = Math.max(maxLon, flat[i]);
    minLat = Math.min(minLat, flat[i + 1]);
    maxLat = Math.max(maxLat, flat[i + 1]);
  }
  return maxLon >= west - margin && minLon <= east + margin && maxLat >= south - margin && minLat <= north + margin;
}

/**
 * Place labels beside their points without overlapping each other, the
 * fixed labels, or the map's edge. Most important first (`priority`); each
 * tries the right, left, above, then below. Labels that fit nowhere are
 * left out (the place still shows, and its name appears when selected).
 *
 * @param {{ id, x, y, text, priority }[]} points  in map units
 * @param {object} options
 * @param {number} options.width
 * @param {number} options.height
 * @param {number} options.fontSize
 * @param {{ x, y, width, height }[]} [options.obstacles]  boxes already taken (region names)
 * @returns {Map<string, { x, y, anchor: 'start'|'end'|'middle' }>}
 */
export function placeLabels(points, { width, height, fontSize, obstacles = [] }) {
  const taken = [...obstacles];
  const placed = new Map();
  const gap = fontSize * 0.45;
  const overlaps = (box) => taken.some((other) => box.x < other.x + other.width && other.x < box.x + box.width && box.y < other.y + other.height && other.y < box.y + box.height);
  const inside = (box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;
  // The dots themselves are obstacles too, so a label never covers another place.
  for (const point of points) taken.push({ x: point.x - 3, y: point.y - 3, width: 6, height: 6 });

  for (const point of [...points].sort((a, b) => b.priority - a.priority)) {
    const w = textWidth(point.text, fontSize);
    const h = fontSize * 1.1;
    const options = [
      { box: { x: point.x + gap, y: point.y - h / 2, width: w, height: h }, x: point.x + gap, y: point.y, anchor: 'start' },
      { box: { x: point.x - gap - w, y: point.y - h / 2, width: w, height: h }, x: point.x - gap, y: point.y, anchor: 'end' },
      { box: { x: point.x - w / 2, y: point.y - gap - h, width: w, height: h }, x: point.x, y: point.y - gap - h / 2, anchor: 'middle' },
      { box: { x: point.x - w / 2, y: point.y + gap, width: w, height: h }, x: point.x, y: point.y + gap + h / 2, anchor: 'middle' },
    ];
    // Its own dot isn't in the way.
    const own = taken.findIndex((box) => box.x === point.x - 3 && box.y === point.y - 3);
    const ownBox = own >= 0 ? taken.splice(own, 1)[0] : null;
    const choice = options.find((option) => inside(option.box) && !overlaps(option.box));
    if (ownBox) taken.push(ownBox);
    if (!choice) continue;
    taken.push(choice.box);
    placed.set(point.id, { x: choice.x, y: choice.y, anchor: choice.anchor });
  }
  return placed;
}

/** About how wide a label is: a sans-serif averages a little over half its size per character. */
export function textWidth(text, fontSize) {
  return String(text).length * fontSize * 0.56 + 2;
}

/**
 * The map to show a place on: the first that labels it, else the first
 * whose bounds contain it, else null.
 */
export function mapForPlace(maps, place, id) {
  if (!place) return null;
  return (
    maps.find((map) => map.places?.includes(id)) ??
    maps.find(({ bounds: [w, s, e, n] }) => place.lon >= w && place.lon <= e && place.lat >= s && place.lat <= n) ??
    null
  );
}
