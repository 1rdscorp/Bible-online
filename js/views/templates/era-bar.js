/**
 * An era bar: periods of history as coloured bars on one time axis, with
 * numbered events beneath (the statue of Daniel 2 uses it for its
 * kingdoms; other pages can for reigns, journeys…). Periods that overlap go
 * on separate lanes. The periods are buttons; the events are a list.
 */
import { t } from '../../i18n.js';
import { el } from '../../ui/dom.js';

/**
 * Put overlapping periods on separate lanes, each on the first lane that's
 * free (sorted by start): [{ from, to }] → the same order, with `lane`.
 */
export function layoutLanes(periods) {
  const ends = []; // the end of the last period on each lane
  const order = periods.map((period, index) => ({ period, index })).sort((a, b) => a.period.from - b.period.from || a.index - b.index);
  const lanes = new Array(periods.length);
  for (const { period, index } of order) {
    let lane = ends.findIndex((end) => end <= period.from);
    if (lane < 0) lane = ends.length;
    ends[lane] = period.to;
    lanes[index] = lane;
  }
  return periods.map((period, index) => ({ ...period, lane: lanes[index] }));
}

/** −586 → "586 BC" / "586 до н. э."; 70 → "AD 70" / "70 н. э." (no year 0). */
export function formatYear(year) {
  const n = Math.abs(year);
  return year < 0 ? t('year.bc', { n }) : t('year.ad', { n });
}

/** Tick years every `step`, from the first multiple inside the range (BC/AD 1 shown as the boundary). */
export function ticks([from, to], step) {
  const list = [];
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) list.push(year === 0 ? 1 : year);
  return list;
}

/**
 * @param {object} options
 * @param {[number, number]} options.range   years shown (BC negative)
 * @param {{ id, from, to, label, kind, open? }[]} options.periods  `kind` picks the colour; `open`: it continues past the range
 * @param {{ year, label, href? }[]} [options.events]
 * @param {string|null} [options.selected]  the period id shown as selected
 * @param {(id: string) => void} [options.onSelect]
 * @param {string} options.label  accessible name
 */
export function eraBar({ range, periods, events = [], selected = null, onSelect = () => {}, label }) {
  const [from, to] = range;
  const at = (year) => `${(((year - from) / (to - from)) * 100).toFixed(3)}%`;
  const width = (a, b) => `${(((b - a) / (to - from)) * 100).toFixed(3)}%`;
  const laid = layoutLanes(periods);
  const laneCount = Math.max(1, ...laid.map((period) => period.lane + 1));

  const bars = laid.map((period) =>
    el(
      'button',
      {
        type: 'button',
        class: `era-period era-period--${period.kind}${period.open ? ' is-open' : ''}`,
        'data-id': period.id,
        'aria-pressed': String(period.id === selected),
        style: `left:${at(period.from)};width:${width(period.from, period.to)};top:calc(${period.lane} * var(--era-lane))`,
        title: `${period.label}: ${formatYear(period.from)} – ${period.open ? t('era.onwards') : formatYear(period.to)}`,
        onclick: () => onSelect(period.id),
      },
      el('span', { class: 'era-period-label' }, period.label),
      el('span', { class: 'visually-hidden' }, `, ${formatYear(period.from)} – ${period.open ? t('era.onwards') : formatYear(period.to)}`),
    ),
  );
  // Numbered markers on two alternating rows, so close events don't cover each other.
  const markers = events.map((event, index) =>
    el('span', { class: `era-event${index % 2 ? ' is-low' : ''}`, style: `left:${at(event.year)}`, 'aria-hidden': 'true', title: `${formatYear(event.year)}: ${event.label}` }, String(index + 1)),
  );
  // Every 100 years; on narrow screens only the 300-year ones (css/explore.css).
  const axis = ticks(range, 100).map((year) =>
    el('span', { class: `era-tick${(year === 1 ? 0 : year) % 300 === 0 ? ' is-major' : ''}`, style: `left:${at(year)}`, 'aria-hidden': 'true' }, formatYear(year)),
  );

  const element = el(
    'div',
    { class: 'era-bar', role: 'group', 'aria-label': label },
    el('div', { class: 'era-track', style: `--era-lanes:${laneCount}` }, bars),
    events.length > 0 && el('div', { class: 'era-markers' }, markers),
    el('div', { class: 'era-axis' }, axis),
    events.length > 0 &&
      el(
        'ol',
        { class: 'era-events' },
        events.map((event) =>
          el('li', {}, el('span', { class: 'era-event-year' }, formatYear(event.year)), ' ', event.href ? el('a', { href: event.href }, event.label) : event.label),
        ),
      ),
  );

  return {
    element,
    select(id) {
      for (const bar of element.querySelectorAll('.era-period')) bar.setAttribute('aria-pressed', String(bar.dataset.id === id));
    },
  };
}
