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
});
