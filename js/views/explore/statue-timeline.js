/**
 * The statue page's timeline (#/explore/daniel-statue): one row per part of
 * the statue, a bar for the kingdom it stands for in the chosen reading,
 * a row of markers for events, and the events listed below with filters.
 *
 * Selecting a bar opens that part; a marker scrolls to its event in the
 * list. The markers are for the pointer only: the list holds the same
 * events for the keyboard and screen readers.
 *
 * The layout helpers have no DOM, for tests/explore.test.js.
 */
import { chapterTitle, t } from '../../i18n.js';
import { el } from '../../ui/dom.js';
import { localize } from '../maps.js';
import { richHtml, richPlain, verseHref } from '../templates/rich-html.js';
import { formatRef, parseRef } from '../../research/refs.js';

/** "605 BC", "AD 70" (in the interface language). Year 0 is shown as AD 1. */
export function formatYear(year) {
  const n = Math.abs(year === 0 ? 1 : year);
  return year < 0 ? t('year.bc', { n }) : t('year.ad', { n });
}

/** A year's place along the range, in percent. */
export const yearPosition = (year, [from, to]) => ((year - from) / (to - from)) * 100;

/**
 * Where a bar's name goes: 'inside' a wide bar, 'before' a short one near
 * the right edge (so it stays on the track), else 'after' it.
 */
export function namePlace(band, range) {
  const width = yearPosition(band.to, range) - yearPosition(band.from, range);
  if (width > 30) return 'inside';
  const end = yearPosition(band.tail ?? band.to, range);
  return end > 78 ? 'before' : 'after';
}

/** Gridlines every century, stronger every second one: [{ year, major }]. */
export function gridYears([from, to]) {
  const years = [];
  for (let year = Math.ceil(from / 100) * 100; year <= to; year += 100) years.push({ year, major: year % 200 === 0 });
  return years.filter(({ year }) => year > from && year < to);
}

/** The year shown beside an event: its own label ("603/602 BC") or the year. */
export const eventYear = (event) => (event.when ? localize(event.when) : formatYear(event.year));

// Bar names sit on the metal: dark text on the light metals, white on iron.
const LIGHT_TEXT = new Set(['iron']);

/**
 * @param {object} options
 * @param {object} options.timeline  the page data's `timeline`
 * @param {object[]} options.parts   the page data's `parts`
 * @param {(part, reading) => object} options.kingdomOf
 * @param {(id: string) => void} options.onSelect  a bar was chosen
 */
export function createStatueTimeline({ timeline, parts, kingdomOf, onSelect }) {
  const range = timeline.range;
  const at = (year) => `${yearPosition(year, range).toFixed(2)}%`;
  const partById = new Map(parts.map((part) => [part.id, part]));
  let filter = 'all';

  const gantt = el('div', { class: 'statue-gantt' });
  const chips = el('div', { class: 'statue-chips', role: 'group', 'aria-label': t('statue.filterEvents') });
  const list = el('ol', { class: 'statue-events', role: 'list' });

  const marker = (cat) => el('span', { class: `statue-dot statue-dot--${cat}`, 'aria-hidden': 'true' });

  const key = el(
    'ul',
    { class: 'statue-key', 'aria-label': t('statue.markerKey') },
    timeline.categories.filter((cat) => cat.id !== 'all').map((cat) => el('li', {}, marker(cat.id), t(`statue.cat.${cat.id}`))),
  );

  function flash(node) {
    if (!node) return;
    node.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    node.classList.remove('is-flashing');
    void node.offsetWidth; // restart the highlight
    node.classList.add('is-flashing');
  }

  function showEvent(index) {
    if (filter !== 'all' && timeline.events[index].cat !== filter) {
      filter = 'all';
      renderList();
    }
    flash(list.querySelector(`[data-event="${index}"]`));
  }

  function renderGantt({ reading, part }) {
    const bands = timeline.bands[reading] ?? [];
    const rows = [];
    // Century lines behind every row.
    rows.push(
      el(
        'div',
        { class: 'statue-gantt-grid', style: `grid-row: 1 / ${bands.length + 3}`, 'aria-hidden': 'true' },
        gridYears(range).map(({ year, major }) => el('span', { class: major ? 'is-major' : '', style: `left:${at(year)}` })),
      ),
    );
    // Events: markers for the pointer.
    rows.push(
      el('div', { class: 'statue-gantt-label', style: 'grid-row: 1', 'aria-hidden': 'true' }, el('span', {}, t('statue.events'))),
      el(
        'div',
        { class: 'statue-gantt-track statue-gantt-dots', style: 'grid-row: 1', 'aria-hidden': 'true' },
        timeline.events.map((event, index) => {
          const dot = el('button', { type: 'button', tabindex: '-1', class: `statue-dot statue-dot--${event.cat}`, style: `left:${at(event.year)}`, title: `${eventYear(event)}: ${richPlain(localize(event.title))}` });
          dot.addEventListener('click', () => showEvent(index));
          return dot;
        }),
      ),
    );
    bands.forEach((band, row) => {
      const p = partById.get(band.part);
      const kingdom = kingdomOf(p, reading);
      const name = localize(band.label);
      const dates = band.open ? `${formatYear(band.from)} –` : `${formatYear(band.from)} – ${formatYear(band.to)}`;
      const place = namePlace(band, range);
      const bar = el(
        'button',
        {
          type: 'button',
          class: `${band.open ? 'statue-gantt-open' : 'statue-gantt-bar'}${band.part === part ? ' is-selected' : ''}`,
          style: `left:${at(band.from)};width:${(yearPosition(band.to, range) - yearPosition(band.from, range)).toFixed(2)}%`,
          'aria-label': t('statue.barLabel', { part: localize(p.title), kingdom: localize(kingdom.name), dates }),
          'aria-pressed': String(band.part === part),
          title: `${localize(p.title)}: ${name}`,
        },
      );
      bar.addEventListener('click', () => onSelect(band.part));
      const nameStyle = place === 'after' ? `left:${at(band.tail ?? band.to)}` : `left:${at(band.from)}`;
      const onMetal = place === 'inside' && !band.open;
      rows.push(
        el('div', { class: 'statue-gantt-label', 'data-metal': p.metal, style: `grid-row:${row + 2}` }, el('i', { 'aria-hidden': 'true' }), el('span', {}, localize(p.short))),
        el(
          'div',
          { class: 'statue-gantt-track', 'data-metal': p.metal, style: `grid-row:${row + 2}` },
          band.tail != null && el('span', { class: 'statue-gantt-tail', 'aria-hidden': 'true', style: `left:${at(band.to)};width:${(yearPosition(band.tail, range) - yearPosition(band.to, range)).toFixed(2)}%` }),
          bar,
          el('span', { class: `statue-gantt-name is-${place}${onMetal && LIGHT_TEXT.has(p.metal) ? ' is-light' : ''}${onMetal ? ' is-on-metal' : ''}`, style: nameStyle, 'aria-hidden': 'true' }, name),
        ),
      );
    });
    // The axis.
    const axisYears = [-600, -400, -200, 0, 200, 400].filter((year) => year > range[0] && year < range[1]);
    rows.push(
      el('div', { style: `grid-row:${bands.length + 2}` }),
      el('div', { class: 'statue-gantt-axis', style: `grid-row:${bands.length + 2}`, 'aria-hidden': 'true' }, axisYears.map((year) => el('span', { style: `left:${at(year)}` }, formatYear(year)))),
    );
    gantt.replaceChildren(...rows);
  }

  function renderChips() {
    chips.replaceChildren(
      ...timeline.categories.map((cat) => {
        const count = cat.id === 'all' ? timeline.events.length : timeline.events.filter((event) => event.cat === cat.id).length;
        const chip = el('button', { type: 'button', class: 'statue-chip', 'aria-pressed': String(cat.id === filter) }, localize(cat.label), el('span', { class: 'statue-chip-count' }, String(count)));
        chip.addEventListener('click', () => {
          filter = cat.id;
          renderList();
        });
        return chip;
      }),
    );
  }

  function renderList() {
    renderChips();
    list.replaceChildren(
      ...timeline.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => filter === 'all' || event.cat === filter)
        .map(({ event, index }) => {
          // The event's verse, unless its text already links one.
          const linked = /data-ref=/.test(event.text.en);
          const ref = event.ref && !linked ? parseRef(event.ref) : null;
          const href = ref ? verseHref(event.ref) : null;
          return el(
            'li',
            { class: 'statue-event', 'data-event': String(index) },
            el('span', { class: 'statue-event-year' }, eventYear(event)),
            el('span', { class: 'statue-event-mark' }, marker(event.cat), el('span', { class: 'visually-hidden' }, t(`statue.cat.${event.cat}`))),
            el(
              'div',
              {},
              el('h3', { class: 'statue-event-title' }, richHtml(localize(event.title))),
              el('p', { class: 'statue-event-text' }, richHtml(localize(event.text))),
              href && el('p', { class: 'statue-event-ref' }, el('a', { href }, formatRef(ref, chapterTitle))),
            ),
          );
        }),
    );
  }

  renderList();

  return {
    gantt,
    tools: el('div', { class: 'statue-tools' }, chips, key),
    list,
    update: renderGantt,
  };
}
