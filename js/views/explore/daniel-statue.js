/**
 * #/explore/daniel-statue: the statue of Nebuchadnezzar's dream (Daniel 2),
 * interactive. Choose a part (on the figure or in the list) to see its
 * verses, the kingdom it stands for in the chosen reading, that kingdom's
 * history and related passages, its era on the time bar and its extent on
 * the map. "Play the dream" acts out Daniel 2:34–35.
 *
 * Two readings are offered, because the text names only some of the
 * kingdoms: the traditional one (Babylon, Medo-Persia, Greece, Rome) and the
 * one many modern scholars hold (Babylon, Media, Persia, Greece). Content:
 * data/study/explore/daniel-statue.json. ?part=…&reading=… keep the choice in
 * the URL.
 */
import { getBook } from '../../canon.js';
import { chapterTitle, t } from '../../i18n.js';
import { createMapView } from '../../geo/map.js';
import { formatRef, parseRef } from '../../research/refs.js';
import { chapterHref, pageHref, PAGES } from '../../router.js';
import { el, icon, ICONS } from '../../ui/dom.js';
import { localize, placeName } from '../maps.js';
import { eraBar } from '../templates/era-bar.js';
import { passageQuote, studyPage } from '../templates/study-page.js';
import { createStatueFigure } from './statue-figure.js';

const METAL_OF = { head: 'gold', chest: 'silver', belly: 'bronze', legs: 'iron', feet: 'clay', stone: 'stone' };
const WHOLE_MAP = [-10, 18, 76, 50];

const refHref = (ref) => chapterHref(getBook(ref.book), ref.chapter, ref.verse, '', ref.endChapter === ref.chapter ? ref.endVerse : null);
const refLabel = (ref) => formatRef(ref, chapterTitle);

/** The kingdom a part stands for in a reading. */
export function kingdomOf(part, reading) {
  return part.kingdom ?? part.kingdoms?.[reading] ?? null;
}

/** [west, south, east, north] around a kingdom's regions and places, or null. */
export function kingdomBounds(kingdom, regions, points) {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (lon, lat) => {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  };
  for (const id of kingdom.regions) for (const ring of regions[id]?.rings ?? []) for (let i = 0; i < ring.length; i += 2) add(ring[i], ring[i + 1]);
  for (const point of points) add(point.lon, point.lat);
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

/**
 * @param {object} options
 * @param {object} options.data        the page's content
 * @param {object} options.places      data/geo/places.json "places"
 * @param {object} options.basemap     the wide basemap
 * @param {string} options.partId
 * @param {string} options.readingId
 * @param {(state: { part, reading }) => void} options.onChange  to keep the URL in step
 * @param {(ref) => Promise<{ text, lang }|null>} options.passageText
 */
export function renderDanielStatue({ data, places, basemap, partId, readingId, onChange, passageText }) {
  let part = data.parts.find((p) => p.id === partId) ?? data.parts[0];
  let reading = data.readings.some((r) => r.id === readingId) ? readingId : data.readings[0].id;

  // The map's places: the Bible's, plus historical sites from this page.
  const mapPlaces = { ...places };
  for (const [id, landmark] of Object.entries(data.landmarks)) {
    mapPlaces[id] = { name: landmark.name.en, ru: landmark.name.ru, lon: landmark.lon, lat: landmark.lat, type: 'landmark', score: 500, verses: [], note: landmark.note };
  }

  /* -------- the figure and the list of parts -------- */

  const figure = createStatueFigure({ uid: 'dan2', onSelect: (id) => choose(id, { focus: false }) });
  const caption = el('p', { class: 'statue-caption', 'aria-live': 'polite' });
  const playButton = el('button', { type: 'button', class: 'button statue-play' }, icon(ICONS.play, { size: 18 }), el('span', {}, t('statue.play')));
  let played = false;
  playButton.addEventListener('click', async () => {
    if (played) {
      played = false;
      figure.reset();
      figure.select(part.id);
      caption.textContent = '';
      playButton.lastChild.textContent = t('statue.play');
      return;
    }
    played = true;
    playButton.disabled = true;
    caption.textContent = t('statue.captionStart');
    await figure.play();
    caption.textContent = t('statue.captionEnd');
    playButton.disabled = false;
    playButton.lastChild.textContent = t('statue.replay');
  });

  const tabs = new Map();
  const tabList = el(
    'div',
    { class: 'statue-tabs', role: 'tablist', 'aria-label': t('statue.parts'), 'aria-orientation': 'vertical' },
    data.parts.map((p) => {
      const tab = el(
        'button',
        { type: 'button', role: 'tab', id: `statue-tab-${p.id}`, class: 'statue-tab', 'aria-controls': 'statue-panel', 'data-part': p.id },
        el('span', { class: `statue-swatch statue-swatch--${METAL_OF[p.id]}`, 'aria-hidden': 'true' }),
        el('span', { class: 'statue-tab-text' }, el('span', { class: 'statue-tab-title' }, localize(p.title)), el('span', { class: 'statue-tab-kingdom' })),
      );
      tab.addEventListener('click', () => choose(p.id));
      tabs.set(p.id, tab);
      return tab;
    }),
  );
  tabList.addEventListener('keydown', (event) => {
    const ids = data.parts.map((p) => p.id);
    const index = ids.indexOf(part.id);
    const next = { ArrowDown: index + 1, ArrowRight: index + 1, ArrowUp: index - 1, ArrowLeft: index - 1, Home: 0, End: ids.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(ids[(next + ids.length) % ids.length]);
  });

  const readingGroup = el(
    'fieldset',
    { class: 'statue-readings' },
    el('legend', {}, t('statue.reading')),
    data.readings.map((r) => {
      const input = el('input', { type: 'radio', name: 'statue-reading', value: r.id, checked: r.id === reading });
      input.addEventListener('change', () => {
        if (!input.checked) return;
        reading = r.id;
        update();
      });
      return el('label', { class: 'statue-reading' }, input, el('span', {}, el('span', { class: 'statue-reading-title' }, localize(r.title)), el('span', { class: 'statue-reading-note' }, localize(r.note))));
    }),
  );

  const panel = el('div', { class: 'statue-panel', role: 'tabpanel', id: 'statue-panel', tabindex: '0' });

  /* -------- the era bar and the map -------- */

  const eraSlot = el('div', { class: 'statue-eras' });
  let eras = null;

  const placeCard = el('div', { class: 'place-details statue-place', 'aria-live': 'polite' });
  const regionNote = el('p', { class: 'study-note statue-region-note' });
  const map = createMapView({
    map: { id: 'daniel', bounds: WHOLE_MAP, places: [], labels: [] },
    basemap,
    places: mapPlaces,
    nameOf: placeName,
    localize,
    label: t('statue.mapLabel'),
    details: placeCard,
    allPlacesOption: false,
    onSelect: (id) => showPlace(id),
  });

  function showPlace(id) {
    map.select(id);
    const place = mapPlaces[id];
    if (!place) {
      placeCard.replaceChildren(el('p', { class: 'place-hint' }, t('maps.pickPlace')));
      return;
    }
    const refs = place.verses.map(parseRef).filter(Boolean);
    placeCard.replaceChildren(
      el('h4', { class: 'place-name' }, placeName(place)),
      el('p', { class: 'place-meta' }, place.type === 'landmark' ? t('statue.landmark') : t(`maps.type.${place.type}`) === `maps.type.${place.type}` ? t('maps.type.place') : t(`maps.type.${place.type}`)),
      place.note ? el('p', {}, localize(place.note)) : null,
      refs.length ? el('p', { class: 'place-count' }, t('maps.namedIn', { n: refs.length })) : null,
      refs.length ? el('ul', { class: 'place-verses', role: 'list' }, refs.slice(0, 8).map((ref) => el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref))))) : null,
    );
  }

  /* -------- showing a part -------- */

  function choose(id, { focus = true } = {}) {
    const next = data.parts.find((p) => p.id === id);
    if (!next) return;
    part = next;
    update();
    if (focus) tabs.get(id)?.focus();
  }

  function update() {
    const kingdom = kingdomOf(part, reading);
    onChange({ part: part.id, reading });
    if (!played) figure.select(part.id);
    for (const [id, tab] of tabs) {
      const on = id === part.id;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      tab.querySelector('.statue-tab-kingdom').textContent = localize(kingdomOf(data.parts.find((p) => p.id === id), reading)?.name);
    }
    panel.setAttribute('aria-labelledby', `statue-tab-${part.id}`);
    renderPanel(kingdom);
    renderEras();
    renderMap(kingdom);
  }

  function renderPanel(kingdom) {
    const quotes = [
      [t('statue.dream'), part.refs.text],
      [t('statue.meaning'), part.refs.meaning],
    ].map(([label, text]) => {
      const ref = parseRef(text);
      const quote = passageQuote({ href: refHref(ref), label: refLabel(ref) });
      passageText(ref).then((found) => found && quote.fill(found.text, found.lang));
      return el('div', { class: 'statue-quote' }, el('p', { class: 'statue-quote-label' }, label), quote.node);
    });
    const twoReadings = Boolean(part.kingdoms);
    panel.replaceChildren(
      el('h3', { class: 'statue-part-title' }, el('span', { class: `statue-swatch statue-swatch--${METAL_OF[part.id]}`, 'aria-hidden': 'true' }), localize(part.title)),
      el('p', { class: 'statue-material' }, localize(part.material)),
      el('div', { class: 'statue-quotes' }, quotes),
      el(
        'div',
        { class: `statue-kingdom statue-kingdom--${METAL_OF[part.id]}` },
        el('p', { class: 'statue-kingdom-label' }, twoReadings ? `${t('statue.kingdom')} · ${localize(data.readings.find((r) => r.id === reading).title)}` : t('statue.kingdom')),
        el('p', { class: 'statue-kingdom-name' }, localize(kingdom.name)),
        el('p', { class: 'statue-kingdom-dates' }, localize(kingdom.dates)),
      ),
      el('h4', {}, t('statue.facts')),
      el('ul', { class: 'statue-facts' }, kingdom.facts.map((fact) => el('li', {}, localize(fact)))),
      kingdom.parallels.length > 0 && el('h4', {}, t('statue.parallels')),
      kingdom.parallels.length > 0 &&
        el(
          'ul',
          { class: 'statue-parallels' },
          kingdom.parallels.map((parallel) => {
            const ref = parseRef(parallel.ref);
            return el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref)), ' — ', localize(parallel.text));
          }),
        ),
      el('p', { class: 'statue-jump' }, el('a', { href: '#statue-map', 'data-jump': 'statue-map' }, icon(ICONS.map, { size: 16 }), t('statue.onMap'))),
    );
  }

  function renderEras() {
    const periods = (data.eras[reading] ?? []).map((era) => {
      const p = data.parts.find((candidate) => candidate.id === era.part);
      return { id: era.part, from: era.from, to: era.to, open: Boolean(era.open), kind: METAL_OF[era.part], label: localize(kingdomOf(p, reading).name) };
    });
    const events = data.events.map((event) => {
      const ref = event.ref ? parseRef(event.ref) : null;
      return { year: event.year, label: localize(event.label), href: ref ? refHref(ref) : null };
    });
    eras = eraBar({ range: data.range, periods, events, selected: part.id, onSelect: (id) => choose(id), label: t('statue.history') });
    eraSlot.replaceChildren(eras.element);
  }

  function renderMap(kingdom) {
    // Each region in its part's metal; the feet's two kingdoms in iron and in clay.
    const kinds = part.id === 'feet' ? ['iron', 'clay'] : [METAL_OF[part.id]];
    const regions = kingdom.regions.map((id, index) => {
      const region = data.regions[id];
      return {
        id,
        kind: kinds[index % kinds.length],
        rings: region.rings,
        label: { text: localize(region.title), lon: region.label[0], lat: region.label[1] },
      };
    });
    const ids = [...kingdom.places, ...kingdom.landmarks];
    map.setRegions(regions);
    map.setPlaces(ids);
    map.select(null);
    placeCard.replaceChildren(el('p', { class: 'place-hint' }, t('maps.pickPlace')));
    // Which kingdoms are shaded, and when (the map labels carry only their names).
    const shaded = kingdom.regions.map((id) => `${localize(data.regions[id].title)} (${localize(data.regions[id].date)})`).join(', ');
    regionNote.textContent = regions.length ? t('statue.mapNote', { regions: shaded }) : t('statue.noMap');
    const bounds = kingdomBounds(kingdom, data.regions, ids.map((id) => mapPlaces[id]).filter(Boolean));
    map.fitBounds(bounds ?? WHOLE_MAP, { padding: 28 });
  }

  /* -------- the page -------- */

  const passage = parseRef(data.passage);
  const element = studyPage({
    back: { href: pageHref(PAGES.explore), label: t('explore.back') },
    kicker: t('explore.kicker'),
    title: localize(data.title),
    lead: localize(data.summary),
    className: 'statue-page',
    sections: [
      {
        id: 'statue',
        title: t('statue.figureHeading'),
        content: [
          el('p', { class: 'study-note' }, localize(data.note)),
          el(
            'div',
            { class: 'statue-layout' },
            el('div', { class: 'statue-stage' }, figure.element, el('div', { class: 'statue-play-row' }, playButton), caption),
            el('div', { class: 'statue-side' }, readingGroup, tabList, panel),
          ),
        ],
      },
      { id: 'statue-history', title: t('statue.history'), content: eraSlot },
      { id: 'statue-map', title: t('statue.mapHeading'), content: [regionNote, map.element] },
      {
        id: 'statue-read',
        title: t('statue.read'),
        content: el(
          'ul',
          { class: 'statue-read' },
          [
            [passage, t('statue.readDream')],
            [parseRef('DAN 7:1-28'), t('statue.readBeasts')],
            [parseRef('DAN 8:1-27'), t('statue.readRamGoat')],
            [parseRef('DAN 11:1-45'), t('statue.readKings')],
          ].map(([ref, text]) => el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref)), ' — ', text)),
        ),
      },
    ],
    footer: [el('p', {}, t('statue.sources'))],
  });

  update();

  return {
    element,
    destroy() {
      figure.destroy();
      map.destroy();
    },
  };
}
