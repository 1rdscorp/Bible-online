/**
 * Zoom and pan for the maps, as pure functions (no DOM), so Node tests can
 * check them.
 *
 * A map is drawn once in "base" units: its projection fits the map's bounds
 * to the frame at zoom 1. A view { k, x, y } then places it on screen:
 * screen = base × k + (x, y). Every change goes through clampView, which
 * keeps the zoom between its limits and the picture covering the frame, so
 * the reader can't lose the map off the edge. The edge is the basemap's
 * extent, wider than the map's own bounds: zooming out or panning shows the
 * lands around it.
 *
 * @typedef {{ k: number, x: number, y: number }} View
 * @typedef {object} Limits
 * @property {number} width   the frame, in screen pixels
 * @property {number} height
 * @property {[number, number, number, number]} extent  what may be shown: [x0, y0, x1, y1] in base units
 * @property {number} minK
 * @property {number} maxK
 */

/** The smallest zoom at which `extent` still fills the frame (never more than `cap`). */
export function minZoom(extent, width, height, cap = 1) {
  const [x0, y0, x1, y1] = extent;
  return Math.min(cap, Math.max(width / (x1 - x0), height / (y1 - y0)));
}

/** Keep the zoom within its limits and the extent covering the frame. */
export function clampView({ k, x, y }, { width, height, extent, minK, maxK }) {
  const [x0, y0, x1, y1] = extent;
  const zoom = Math.min(maxK, Math.max(minK, k));
  const clamp = (value, low, high) => (low > high ? (low + high) / 2 : Math.min(high, Math.max(low, value)));
  return {
    k: zoom,
    x: clamp(x, width - x1 * zoom, -x0 * zoom),
    y: clamp(y, height - y1 * zoom, -y0 * zoom),
  };
}

/** The view with base point (bx, by) at the frame's centre, at zoom k. */
export function centerOn(bx, by, k, limits) {
  return clampView({ k, x: limits.width / 2 - bx * k, y: limits.height / 2 - by * k }, limits);
}

/** Zoom by `factor` keeping the screen point (sx, sy) still (under the cursor or between the fingers). */
export function zoomAround(view, factor, sx, sy, limits) {
  const k = Math.min(limits.maxK, Math.max(limits.minK, view.k * factor));
  const ratio = k / view.k;
  return clampView({ k, x: sx - (sx - view.x) * ratio, y: sy - (sy - view.y) * ratio }, limits);
}

export function panBy(view, dx, dy, limits) {
  return clampView({ k: view.k, x: view.x + dx, y: view.y + dy }, limits);
}

/** Screen point → base units. */
export const toBase = (view, sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

/** Base units → screen point. */
export const toScreen = (view, bx, by) => [bx * view.k + view.x, by * view.k + view.y];
