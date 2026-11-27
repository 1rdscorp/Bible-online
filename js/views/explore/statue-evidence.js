/**
 * The statue page's "What survives": tablets, cylinders, scrolls and early
 * readers that bear on Daniel 2, as cards filtered by kingdom, each tagged
 * with what it does for the chapter (confirms a detail, adds context, an
 * open question, an early reading). Content: the page data's `evidence`.
 */
import { t } from '../../i18n.js';
import { el } from '../../ui/dom.js';
import { localize } from '../maps.js';
import { richHtml } from '../templates/rich-html.js';

const SVG = 'http://www.w3.org/2000/svg';

// Line drawings, 38 × 38, for the kind of object.
const ICONS = {
  tablet: [['rect', { x: 8, y: 5, width: 22, height: 28, rx: 4 }], ['path', { d: 'M13 12h4M21 12h4M13 17h4M21 17h4M13 22h4M21 22h4M13 27h4' }]],
  cylinder: [['ellipse', { cx: 19, cy: 19, rx: 14, ry: 9.5 }], ['path', { d: 'M9.5 14.5h19M6 19h26M9.5 23.5h19' }]],
  stele: [['path', { d: 'M11 33V13a8 8 0 0 1 16 0v20z' }], ['path', { d: 'M15 17h8M15 22h8M15 27h8' }]],
  scroll: [['rect', { x: 10, y: 8, width: 18, height: 22, rx: 1 }], ['circle', { cx: 10, cy: 11, r: 3 }], ['circle', { cx: 28, cy: 27, r: 3 }], ['path', { d: 'M15 15h8M15 19h8M15 23h5' }]],
  book: [['path', { d: 'M19 10c-3-2-7-2-11-1v20c4-1 8-1 11 1 3-2 7-2 11-1V9c-4-1-8-1-11 1zM19 10v20' }]],
  arch: [['path', { d: 'M7 32V8h24v24h-7V21a5 5 0 0 0-10 0v11zM7 13h24' }]],
  brick: [['path', { d: 'M6 12h26v14H6zM6 19h26M15 12v7M24 12v7M11 19v7M20 19v7M28 19v7' }]],
  rock: [['path', { d: 'M5 32l8-20 6 7 5-11 9 24z' }], ['path', { d: 'M15 27h9M17 23h5' }]],
};

function objectIcon(name) {
  const node = document.createElementNS(SVG, 'svg');
  node.setAttribute('viewBox', '0 0 38 38');
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('class', 'statue-evidence-icon');
  for (const [tag, attrs] of ICONS[name] ?? ICONS.tablet) {
    const shape = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, String(value));
    node.append(shape);
  }
  return node;
}

/** A tag for what an object does for the chapter. */
export const kindTag = (kinds, kind) => el('span', { class: `statue-pill statue-pill--${kind}` }, localize(kinds[kind]));

/**
 * @param {object} evidence  the page data's `evidence`
 * @returns {{ tools: HTMLElement, grid: HTMLElement, show: (id: string) => void }}
 */
export function createStatueEvidence(evidence) {
  let filter = 'all';
  const chips = el('div', { class: 'statue-chips', role: 'group', 'aria-label': t('statue.filterEvidence') });
  const grid = el('div', { class: 'statue-evidence' });
  const key = el('ul', { class: 'statue-key', 'aria-label': t('statue.kindKey') }, Object.keys(evidence.kinds).map((kind) => el('li', {}, kindTag(evidence.kinds, kind))));

  function render() {
    chips.replaceChildren(
      ...evidence.groups.map((group) => {
        const count = group.id === 'all' ? evidence.items.length : evidence.items.filter((item) => item.group === group.id).length;
        const chip = el('button', { type: 'button', class: 'statue-chip', 'aria-pressed': String(group.id === filter) }, localize(group.label), el('span', { class: 'statue-chip-count' }, String(count)));
        chip.addEventListener('click', () => {
          filter = group.id;
          render();
        });
        return chip;
      }),
    );
    grid.replaceChildren(
      ...evidence.items
        .filter((item) => filter === 'all' || item.group === filter)
        .map((item) =>
          el(
            'article',
            { class: 'statue-card', id: `statue-evidence-${item.id}`, 'data-group': item.group, tabindex: '-1', 'aria-labelledby': `statue-evidence-${item.id}-title` },
            el(
              'header',
              {},
              objectIcon(item.icon),
              el('div', {}, el('h3', { id: `statue-evidence-${item.id}-title` }, richHtml(localize(item.title))), el('p', { class: 'statue-card-meta' }, richHtml(localize(item.meta)))),
            ),
            el(
              'dl',
              {},
              el('dt', {}, t('statue.records')),
              el('dd', {}, richHtml(localize(item.says))),
              el('dt', {}, t('statue.bearing')),
              el('dd', {}, richHtml(localize(item.bears))),
            ),
            el('p', { class: 'statue-pills' }, item.kinds.map((kind) => kindTag(evidence.kinds, kind))),
          ),
        ),
    );
  }

  /** Scroll to a card (showing every card first, if a filter hides it) and highlight it. */
  function show(id) {
    if (filter !== 'all' && !grid.querySelector(`#statue-evidence-${CSS.escape(id)}`)) {
      filter = 'all';
      render();
    }
    const card = grid.querySelector(`#statue-evidence-${CSS.escape(id)}`);
    if (!card) return;
    card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    card.focus({ preventScroll: true });
    card.classList.remove('is-flashing');
    void card.offsetWidth; // restart the highlight
    card.classList.add('is-flashing');
  }

  render();
  return { tools: el('div', { class: 'statue-tools' }, chips, key), grid, show };
}
