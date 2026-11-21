/**
 * #/maps: the list of maps. #/maps/<id>: one map (js/geo/map.js: zoom,
 * pan, full screen, every place on demand), its journeys (shown or hidden),
 * the places on it as a list, and the selected place's details: what kind
 * of place, how sure its location is, and the verses that name it.
 * ?place=<id> selects a place (links from book introductions and the
 * timeline use it).
 */
import { getBook } from '../canon.js';
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { createMapView } from '../geo/map.js';
import { formatRef, parseRef } from '../research/refs.js';
import { chapterHref, mapHref, pageHref, PAGES } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { linkCards, studyPage } from './templates/study-page.js';

const VERSES_SHOWN = 12;

/** { en, ru } → the text in the interface language (English if there's no translation). */
export const localize = (text) => text?.[getLanguage()] ?? text?.en ?? '';

/** A place's name in the interface language. */
export const placeName = (place) => (getLanguage() === 'ru' && place.ru ? place.ru : place.name);

const refLabel = (ref) => formatRef(ref, chapterTitle);
const refHref = (ref) => chapterHref(getBook(ref.book), ref.chapter, ref.verse, '', ref.endChapter === ref.chapter ? ref.endVerse : null);

/** A reference string ("ACT 13:1-14:28") as a link into the reader. */
export function refLink(text, className = '') {
  const ref = parseRef(text);
  return ref ? el('a', { href: refHref(ref), class: className || null }, refLabel(ref)) : null;
}

function sources() {
  return [
    el('p', {}, t('maps.placesSource'), ' ', el('a', { href: 'https://www.openbible.info/geo/', rel: 'noopener', target: '_blank' }, 'OpenBible.info'), ', CC BY 4.0.'),
    el('p', {}, t('maps.basemapSource'), ' ', el('a', { href: 'https://www.naturalearthdata.com/', rel: 'noopener', target: '_blank' }, 'Natural Earth'), '.'),
  ];
}

export function renderMapsIndex({ maps }) {
  return studyPage({
    kicker: t('page.study'),
    title: t('maps.title'),
    lead: t('maps.intro'),
    className: 'maps-page',
    sections: [
      {
        id: 'maps-list',
        title: t('maps.all'),
        content: linkCards(
          maps.map((map) => ({ href: mapHref(map.id), title: localize(map.title), text: localize(map.summary), icon: icon(ICONS.map, { size: 22, className: 'icon link-card-icon' }) })),
        ),
      },
    ],
    footer: sources(),
  });
}

/**
 * @param {object} options
 * @param {object} options.map       the map to show (data/study/maps.json)
 * @param {object[]} options.maps    all of them, for links to the others
 * @param {object} options.basemap
 * @param {object} options.places
 * @param {string|null} options.placeId  the place to select first
 * @param {(id: string|null) => void} options.onPlaceChange  to keep ?place= in the URL
 */
export function renderMapPage({ map, maps, basemap, places, placeId = null, onPlaceChange = () => {} }) {
  const title = localize(map.title);
  const ids = [...new Set(map.places ?? [])].filter((id) => places[id]);
  // A place asked for in the URL that this map doesn't label is added to it.
  if (placeId && places[placeId] && !ids.includes(placeId)) ids.push(placeId);
  const shownMap = { ...map, places: ids };

  const details = el('div', { class: 'place-details', 'aria-live': 'polite' });
  // The details sit under the map, inside its frame's wrapper, so they come along into full screen.
  const view = createMapView({
    map: shownMap,
    basemap,
    places,
    nameOf: placeName,
    localize,
    label: t('maps.mapLabel', { title }),
    details,
    onSelect: (id) => select(id, { fromUser: true }),
  });

  const placeButtons = new Map();
  const placeList = el(
    'ul',
    { class: 'place-list', role: 'list' },
    [...ids]
      .sort((a, b) => placeName(places[a]).localeCompare(placeName(places[b]), getLanguage()))
      .map((id) => {
        const button = el('button', { type: 'button', class: 'place-button', 'aria-pressed': 'false', onclick: () => select(id, { fromUser: true, reveal: true }) }, placeName(places[id]));
        placeButtons.set(id, button);
        return el('li', {}, button);
      }),
  );

  /** `reveal`: bring the place into view if the map is zoomed or panned away from it. */
  function select(id, { fromUser = false, reveal = false } = {}) {
    const place = places[id] ?? null;
    view.select(place ? id : null, { reveal });
    for (const [key, button] of placeButtons) button.setAttribute('aria-pressed', String(key === id));
    details.replaceChildren(...(place ? placeDetails(id, place) : [el('p', { class: 'place-hint' }, t('maps.pickPlace'))]));
    if (fromUser) onPlaceChange(place ? id : null);
  }

  const routes = map.routes ?? [];
  const routeControls = routes.length
    ? el(
        'fieldset',
        { class: 'route-controls' },
        el('legend', {}, t('maps.journeys')),
        routes.map((route, index) => {
          const input = el('input', { type: 'checkbox', checked: true, 'data-route': route.id });
          input.addEventListener('change', () => view.setRoutes([...routeControls.querySelectorAll('input:checked')].map((box) => box.dataset.route)));
          return el(
            'div',
            { class: 'route-control' },
            el('label', {}, input, el('span', { class: `route-swatch route-swatch--${index + 1}`, 'aria-hidden': 'true' }), localize(route.title)),
            ' ',
            refLink(route.ref, 'route-ref'),
          );
        }),
      )
    : null;

  const others = maps.filter((other) => other.id !== map.id);
  const element = studyPage({
    back: { href: mapHref(), label: t('maps.back') },
    kicker: t('maps.kicker'),
    title,
    lead: localize(map.summary),
    className: 'map-page',
    sections: [
      {
        id: 'map',
        title: t('maps.mapHeading'),
        content: [routeControls, view.element],
      },
      { id: 'map-places', title: t('maps.placesHeading'), content: [el('p', { class: 'study-note' }, t('maps.placesNote')), placeList] },
      others.length && {
        id: 'map-others',
        title: t('maps.others'),
        content: linkCards(others.map((other) => ({ href: mapHref(other.id), title: localize(other.title), icon: icon(ICONS.map, { size: 22, className: 'icon link-card-icon' }) }))),
      },
    ],
    footer: sources(),
  });
  // The map's own heading is visually redundant under the page title.
  element.querySelector('#map')?.classList.add('visually-hidden');

  select(placeId && places[placeId] ? placeId : null);

  return { element, select, destroy: () => view.destroy() };
}

/** What kind of place it is, how sure its location is, and where the Bible names it. */
function placeDetails(id, place) {
  const confidence = place.score >= 500 ? 'high' : place.score >= 300 ? 'medium' : 'low';
  const typeKey = `maps.type.${place.type}`;
  const type = t(typeKey) === typeKey ? t('maps.type.place') : t(typeKey);
  const refs = place.verses.map(parseRef).filter(Boolean);
  const list = el('ul', { class: 'place-verses', role: 'list' }, refs.slice(0, VERSES_SHOWN).map((ref) => el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref)))));
  const more =
    refs.length > VERSES_SHOWN
      ? el('button', {
          type: 'button',
          class: 'text-button',
          onclick: (event) => {
            list.append(...refs.slice(VERSES_SHOWN).map((ref) => el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref)))));
            list.children[VERSES_SHOWN]?.querySelector('a')?.focus();
            event.currentTarget.remove();
          },
        }, t('maps.allVerses', { n: refs.length }))
      : null;
  return [
    el('h3', { class: 'place-name' }, placeName(place), getLanguage() === 'ru' && place.ru ? el('span', { class: 'place-name-en', lang: 'en' }, ` (${place.name})`) : ''),
    el('p', { class: 'place-meta' }, `${type} · ${t(`maps.confidence.${confidence}`)}`),
    refs.length ? el('p', { class: 'place-count' }, t('maps.namedIn', { n: refs.length })) : null,
    list,
    more,
    el(
      'p',
      { class: 'place-more' },
      el('a', { href: `https://www.openbible.info/geo/ancient/${id}/${place.slug}`, rel: 'noopener', target: '_blank' }, t('maps.moreAbout', { name: place.name }), ' ', icon(ICONS.external, { size: 14 })),
    ),
  ];
}

/** The study pages' shared entry links (book list, chapter pages). */
export function studyLinks() {
  return [
    { href: pageHref(PAGES.timeline), title: t('timeline.title'), icon: icon(ICONS.timeline, { size: 22, className: 'icon link-card-icon' }) },
    { href: mapHref(), title: t('maps.title'), icon: icon(ICONS.map, { size: 22, className: 'icon link-card-icon' }) },
  ];
}
