/**
 * #/timeline: the Bible story in order, era by era, each event with its
 * date, a sentence, the passages that tell it, and its place on a map.
 * ?event=<id> brings one event into view (book introductions link to them).
 */
import { t } from '../i18n.js';
import { mapForPlace } from '../geo/projection.js';
import { mapHref, pageHref, PAGES } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { localize, placeName, refLink } from './maps.js';
import { studyPage } from './templates/study-page.js';

export const timelineHref = (eventId = null) => `${pageHref(PAGES.timeline)}${eventId ? `?event=${encodeURIComponent(eventId)}` : ''}`;

/**
 * "On the map: Jerusalem" (or with `nameOnly`, "Jerusalem"), linking to the
 * map that shows it best.
 */
export function placeLink(id, places, maps, { nameOnly = false } = {}) {
  const place = places?.[id];
  const map = place && mapForPlace(maps, place, id);
  if (!map) return null;
  const label = nameOnly ? placeName(place) : t('timeline.onMap', { place: placeName(place) });
  return el('a', { class: 'place-link', href: mapHref(map.id, `place=${id}`) }, icon(ICONS.map, { size: 16 }), label);
}

function eventItem(event, { places, maps, eventId }) {
  return el(
    'li',
    { class: `timeline-event${event.id === eventId ? ' is-target' : ''}`, id: `event-${event.id}`, tabindex: '-1' },
    el('p', { class: 'timeline-date' }, localize(event.date)),
    el('h3', { class: 'timeline-title' }, localize(event.title)),
    el('p', { class: 'timeline-summary' }, localize(event.summary)),
    el('p', { class: 'timeline-links' }, event.refs.map((ref) => refLink(ref, 'timeline-ref')), event.place ? placeLink(event.place, places, maps) : null),
  );
}

/**
 * @param {object} options
 * @param {object} options.timeline  data/study/timeline.json
 * @param {object} options.places    data/geo/places.json "places"
 * @param {object[]} options.maps    data/study/maps.json "maps"
 * @param {string|null} [options.eventId]
 * @returns {{ element: HTMLElement, target: HTMLElement|null }}  `target`: the event asked for
 */
export function renderTimelinePage({ timeline, places, maps, eventId = null }) {
  const sections = timeline.eras.map((era) => {
    const events = timeline.events.filter((event) => event.era === era.id);
    return {
      id: `era-${era.id}`,
      title: localize(era.title),
      content: [
        el('p', { class: 'era-dates' }, localize(era.dates)),
        // An era can have no dated events (Genesis 1–11).
        events.length > 0 && el('ol', { class: 'timeline' }, events.map((event) => eventItem(event, { places, maps, eventId }))),
      ],
    };
  });
  const element = studyPage({
    kicker: t('page.study'),
    title: t('timeline.title'),
    lead: t('timeline.intro'),
    className: 'timeline-page',
    sections,
    footer: el('p', {}, t('timeline.note')),
  });
  return { element, target: eventId ? element.querySelector(`#event-${CSS.escape(eventId)}`) : null };
}
