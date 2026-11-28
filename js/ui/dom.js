/**
 * A small DOM builder.
 *
 * Strings are always inserted as text (never innerHTML), so verse text from a
 * data file or, later, an API cannot inject markup.
 *
 *   el('a', { href: '#/john/3', class: 'link' }, 'John 3')
 *
 * Props: `class`, `dataset` (object), `on<event>` functions, `true` for a
 * boolean attribute; null/false/undefined values are skipped. Children may be
 * nodes, strings, numbers, arrays, or null/false (skipped).
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A decorative 24×24 stroke icon (hidden from screen readers). */
export function icon(pathData, { size = 24, className = 'icon' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attributes = {
    class: className,
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, String(value));
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

export const ICONS = Object.freeze({
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M6 9l6 6 6-6',
  columns: 'M4 5h6v14H4zM14 5h6v14h-6z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  // Two scripts with an arrow between ("translate")
  translate: 'M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  bookmark: 'M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1z',
  note: 'M5 4h14v11l-5 5H5zM14 20v-5h5M8 9h8M8 13h4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  share: 'M12 15V3M7 8l5-5 5 5M5 13v7h14v-7',
  marker: 'M15 4l5 5-9 9H6v-5zM4 21h16',
  eraser: 'M8 20h12M4 16l9-9 6 6-7 7H8zM9 11l6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8M6 20h8M14 4l-4 16',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  // An open book (Research: cross-references and word study).
  research: 'M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v14.5',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  minus: 'M5 12h14',
  // The whole map: four corners. Full screen: arrows out; leaving it: arrows in.
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  collapse: 'M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7',
  play: 'M8 5v14l11-7z',
  // A standing figure (the statue of Daniel 2; interactive studies).
  statue: 'M12 2.5l1.5 1.5-1.5 1.5-1.5-1.5zM12 6.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8.5 11.5h7l-.8 5h-5.4zM10 16.5l-.5 5M14 16.5l.5 5M8 21.5h8',
  // A four-legged animal with a horn (the animals of Revelation; interactive studies).
  creature: 'M4 12c0-2 1.6-3.5 4-3.5h6l2.5-3 .6 2.6L19.5 9l1 2.5-2.5 1V20M15 13v7M8 13.5V20M5 13v7M4 12l-1.5-2.5M17.2 5.2L18.5 3',
  timeline: 'M4 12h16M7 8v8M12 6v12M17 9v6',
  // An open book with lines of text: commentary.
  commentary: 'M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6zM12 6v14.5M6.5 8.5c1.2-.2 2.3 0 3.3.4M6.5 12c1.2-.2 2.3 0 3.3.4M14.2 8.9c1-.4 2.1-.6 3.3-.4M14.2 12.4c1-.4 2.1-.6 3.3-.4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  // A calendar page (reading plans) and a tick (read).
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  // A tag (topics).
  topics: 'M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9zM8 8h.01',
});
