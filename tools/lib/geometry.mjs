/**
 * Small geometry helpers for the map build (tools/build-geo.mjs). Points are
 * [lon, lat] in degrees; a box is [west, south, east, north].
 */

const inside = (p, edge, box) =>
  edge === 0 ? p[0] >= box[0] : edge === 1 ? p[1] >= box[1] : edge === 2 ? p[0] <= box[2] : p[1] <= box[3];

function crossing(a, b, edge, box) {
  if (edge === 0 || edge === 2) {
    const x = box[edge];
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + t * (b[1] - a[1])];
  }
  const y = box[edge];
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

/**
 * Clip a polygon ring to a box (Sutherland–Hodgman, one box edge at a time).
 * Where the ring leaves the box it's replaced by a run along the box's edge,
 * so a filled shape stays filled; those runs lie on the box's border.
 */
export function clipRing(ring, box) {
  let points = ring;
  for (let edge = 0; edge < 4 && points.length; edge += 1) {
    const next = [];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const previous = points[(i + points.length - 1) % points.length];
      const inNow = inside(current, edge, box);
      if (inNow) {
        if (!inside(previous, edge, box)) next.push(crossing(previous, current, edge, box));
        next.push(current);
      } else if (inside(previous, edge, box)) {
        next.push(crossing(previous, current, edge, box));
      }
    }
    points = next;
  }
  return points.length >= 3 ? points : [];
}

const inBox = (p, box) => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];

/** Clip a line to a box: the pieces inside it (points outside are cut, not interpolated). */
export function clipLine(line, box) {
  const pieces = [];
  let piece = [];
  for (const p of line) {
    if (inBox(p, box)) piece.push(p);
    else if (piece.length) {
      if (piece.length > 1) pieces.push(piece);
      piece = [];
    }
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces;
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas–Peucker simplification: drop points closer than `tolerance(point)`
 * (degrees) to the line through their neighbours. The tolerance can vary by
 * place, to keep more detail where maps zoom in. Iterative, so long
 * coastlines don't overflow the stack.
 */
export function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let farthest = -1;
    let excess = 0;
    for (let i = first + 1; i < last; i += 1) {
      const over = distanceToSegment(points[i], points[first], points[last]) - tolerance(points[i]);
      if (over > excess) {
        excess = over;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** A ring's area in square degrees (shoelace formula, unsigned). */
export function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** [[lon, lat], …] → [lon, lat, lon, lat, …] rounded to 3 decimals (about 100 m), repeats dropped. */
export function flatten(points) {
  const flat = [];
  for (const [lon, lat] of points) {
    const x = Math.round(lon * 1000) / 1000;
    const y = Math.round(lat * 1000) / 1000;
    if (flat.length && flat[flat.length - 2] === x && flat[flat.length - 1] === y) continue;
    flat.push(x, y);
  }
  return flat;
}

/** The rings (polygons) or lines of a GeoJSON geometry. */
export function geometryParts(geometry) {
  const { type, coordinates } = geometry ?? {};
  if (type === 'Polygon' || type === 'MultiLineString') return coordinates;
  if (type === 'MultiPolygon') return coordinates.flat();
  if (type === 'LineString') return [coordinates];
  return [];
}
