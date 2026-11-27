/**
 * #/explore/daniel-statue: the statue of Nebuchadnezzar's dream (Daniel 2).
 *
 * At the top, the statue on a glazed-brick wall (as on Babylon's Ishtar
 * Gate) stays in view beside the selected part's dossier: its verses (in
 * the translation being read), the kingdom it stands for in the chosen
 * reading, facts and figures, the kingdom on the map, the material, where
 * readers differ, and the evidence for it. "Release the stone" acts out
 * Daniel 2:34–35. Below: a timeline whose bars move with the reading, the
 * evidence that survives, research notes, the chapters to read, sources.
 *
 * Two readings are offered, because the text names only the first kingdom:
 * the Roman sequence (Babylon, Medo-Persia, Greece, Rome; reading id
 * "traditional") and the Greek sequence (Babylon, Media, Persia, Greece;
 * "scholarly"). Content: data/study/explore/daniel-statue.json, whose rich
 * text links every verse it cites. ?part=…&reading=… keep the choice in
 * the URL.
 */
import { chapterTitle, t } from '../../i18n.js';
import { createMapView } from '../../geo/map.js';
import { formatRef, parseRef } from '../../research/refs.js';
import { pageHref, PAGES } from '../../router.js';
import { el } from '../../ui/dom.js';
import { localize, placeName } from '../maps.js';
import { refHref, richHtml, verseHref } from '../templates/rich-html.js';
import { createStatueEvidence } from './statue-evidence.js';
import { createStatueFigure } from './statue-figure.js';
import { createStatueTimeline } from './statue-timeline.js';

const WHOLE_MAP = [-10, 18, 76, 50];
// Where each part's button sits beside the figure, as a share of its height
// (level with the part in tools/art/daniel-statue.svg).
const RAIL_AT = { head: 16, chest: 31, belly: 50, legs: 78, feet: 91 };

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
 * The metal each shaded region is drawn in: the kingdom's own list (the
 * stone shows all four kingdoms), the feet's two kingdoms in iron and clay,
 * otherwise the part's metal.
 */
export function regionMetals(part, kingdom) {
  return kingdom.regions.map((id, index) => kingdom.regionMetals?.[index] ?? (part.metal === 'mix' ? ['iron', 'clay'][index % 2] : part.metal));
}

/**
 * Tops for the buttons beside the figure (px): each as level with its part
 * as it can be (`centers`), moved down just enough to clear the one above,
 * then up again where they would run past the bottom (`total`). Long names
 * (Russian, a phone) need it: the legs and the feet are close together.
 */
export function railLayout(centers, heights, total, gap = 4) {
  const tops = centers.map((center, i) => center - heights[i] / 2);
  for (let i = 0; i < tops.length; i += 1) tops[i] = Math.max(tops[i], i === 0 ? 0 : tops[i - 1] + heights[i - 1] + gap);
  for (let i = tops.length - 1; i >= 0; i -= 1) tops[i] = Math.min(tops[i], i === tops.length - 1 ? total - heights[i] : tops[i + 1] - gap - heights[i]);
  return tops.map((top) => Math.max(0, top));
}

/** "2:32", "2:37–38": a reference without the book's name. */
export function shortRef(ref) {
  const end = ref.endChapter !== ref.chapter ? `–${ref.endChapter}:${ref.endVerse}` : ref.endVerse !== ref.verse ? `–${ref.endVerse}` : '';
  return `${ref.chapter}:${ref.verse}${end}`;
}

/**
 * @param {object} options
 * @param {object} options.data        the page's content
 * @param {object} options.places      data/geo/places.json "places"
 * @param {object} options.basemap     the wide basemap
 * @param {string} options.partId
 * @param {string} options.readingId
 * @param {(state: { part, reading }) => void} options.onChange  to keep the URL in step
 * @param {(ref) => Promise<{ text, lang, name }|null>} options.passageText
 */
export function renderDanielStatue({ data, places, basemap, partId, readingId, onChange, passageText }) {
  let part = data.parts.find((p) => p.id === partId) ?? data.parts[0];
  let reading = data.readings.some((r) => r.id === readingId) ? readingId : data.readings[0].id;

  // The map's places: the Bible's, plus historical sites from this page.
  const mapPlaces = { ...places };
  for (const [id, landmark] of Object.entries(data.landmarks)) {
    mapPlaces[id] = { name: landmark.name.en, ru: landmark.name.ru, lon: landmark.lon, lat: landmark.lat, type: 'landmark', score: 500, verses: [], note: landmark.note };
  }

  /* -------- the stage: the statue, its parts, the stone -------- */

  const figure = createStatueFigure({ label: localize(data.stage.figure), onSelect: (id) => choose(id) });
  const caption = el('p', { class: 'statue-caption', 'aria-live': 'polite' });
  const releaseButton = el('button', { type: 'button', class: 'statue-release' }, t('statue.release'));
  const railButtons = new Map();

  function railButton(p) {
    const button = el(
      'button',
      { type: 'button', class: 'statue-rail-button', 'data-metal': p.metal, 'aria-pressed': 'false' },
      el('span', { class: 'statue-swatch', 'aria-hidden': 'true' }),
      el('span', { class: 'statue-rail-part' }, localize(p.label)),
      el('span', { class: 'statue-rail-kingdom' }),
    );
    button.addEventListener('click', () => choose(p.id));
    railButtons.set(p.id, button);
    return button;
  }

  const rail = el(
    'ul',
    { class: 'statue-rail', role: 'list', 'aria-label': t('statue.parts') },
    data.parts.filter((p) => RAIL_AT[p.id] !== undefined).map((p) => el('li', { style: `top:${RAIL_AT[p.id]}%`, 'data-at': String(RAIL_AT[p.id]) }, railButton(p))),
  );
  // Lay the buttons out again when the figure's size or their names change.
  function layoutRail() {
    const height = rail.clientHeight;
    if (!height) return;
    const items = [...rail.children];
    const tops = railLayout(items.map((li) => (Number(li.dataset.at) / 100) * height), items.map((li) => li.offsetHeight), height);
    items.forEach((li, i) => {
      li.style.top = `${tops[i].toFixed(1)}px`;
      li.classList.add('is-placed');
    });
  }
  const railObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layoutRail()) : null;
  railObserver?.observe(rail);
  const stoneButton = railButton(data.parts.find((p) => p.id === 'stone'));

  releaseButton.addEventListener('click', async () => {
    if (figure.fallen) {
      figure.raise();
      showCaption();
      return;
    }
    choose('stone');
    releaseButton.disabled = true;
    await figure.release();
    releaseButton.disabled = false;
    showCaption();
  });

  function showCaption() {
    caption.replaceChildren(richHtml(localize(figure.fallen ? data.stage.fallen : data.stage.start)));
    releaseButton.textContent = figure.fallen ? t('statue.raise') : t('statue.release');
  }

  const stage = el(
    'div',
    { class: 'statue-stage' },
    el(
      'div',
      { class: 'statue-stage-inner' },
      caption,
      el('div', { class: 'statue-figure-row' }, figure.element, rail),
      el('div', { class: 'statue-stage-foot' }, stoneButton, releaseButton),
    ),
    frieze(),
  );

  /* -------- the title and the reading switch -------- */

  const readingButtons = new Map();
  const readingNote = el('p', { class: 'statue-reading-note' });
  const readingSwitch = el(
    'div',
    { class: 'statue-reading', role: 'group', 'aria-labelledby': 'statue-reading-label' },
    el('span', { class: 'statue-reading-label', id: 'statue-reading-label' }, t('statue.reading')),
    el(
      'div',
      { class: 'statue-segments' },
      data.readings.map((r) => {
        const button = el('button', { type: 'button', 'aria-pressed': 'false' }, localize(r.title));
        button.addEventListener('click', () => {
          reading = r.id;
          update();
        });
        readingButtons.set(r.id, button);
        return button;
      }),
    ),
    readingNote,
  );

  const mast = el(
    'header',
    { class: 'statue-mast' },
    el('p', { class: 'statue-eyebrow' }, localize(data.eyebrow)),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, localize(data.title)),
    el('p', { class: 'statue-lede' }, richHtml(localize(data.summary))),
    readingSwitch,
  );

  /* -------- the map, kept while the dossier changes around it -------- */

  const placeCard = el('div', { class: 'place-details statue-place', 'aria-live': 'polite' });
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
  const mapLegend = el('ul', { class: 'statue-legend', role: 'list' });
  const mapNote = el('figcaption', { class: 'statue-map-note' });
  const mapFigure = el('figure', { class: 'statue-map', id: 'statue-map', 'aria-labelledby': 'statue-map-title' }, el('h3', { id: 'statue-map-title' }, t('statue.mapHeading')), mapLegend, map.element, placeCard, mapNote);

  function showPlace(id) {
    map.select(id);
    const place = mapPlaces[id];
    if (!place) {
      placeCard.replaceChildren(el('p', { class: 'place-hint' }, t('maps.pickPlace')));
      return;
    }
    const refs = place.verses.map(parseRef).filter(Boolean);
    const type = place.type === 'landmark' ? t('statue.landmark') : t(`maps.type.${place.type}`) === `maps.type.${place.type}` ? t('maps.type.place') : t(`maps.type.${place.type}`);
    placeCard.replaceChildren(
      el('h4', { class: 'place-name' }, placeName(place)),
      el('p', { class: 'place-meta' }, type),
      place.note ? el('p', {}, localize(place.note)) : null,
      refs.length ? el('p', { class: 'place-count' }, t('maps.namedIn', { n: refs.length })) : null,
      refs.length ? el('ul', { class: 'place-verses', role: 'list' }, refs.slice(0, 8).map((ref) => el('li', {}, el('a', { href: refHref(ref) }, refLabel(ref))))) : null,
    );
  }

  function renderMap(kingdom) {
    const metals = regionMetals(part, kingdom);
    map.setRegions(
      kingdom.regions.map((id, index) => {
        const region = data.regions[id];
        return { id, kind: metals[index], rings: region.rings, label: { text: localize(region.title), lon: region.label[0], lat: region.label[1] } };
      }),
    );
    const ids = [...kingdom.places, ...kingdom.landmarks];
    map.setPlaces(ids);
    map.select(null);
    placeCard.replaceChildren(el('p', { class: 'place-hint' }, t('maps.pickPlace')));
    // The legend: the shaded kingdoms with their dates. The stone's four are
    // drawn largest first, but listed in the statue's order, head first.
    const shaded = kingdom.regions.map((id, index) => ({ id, metal: metals[index] }));
    if (kingdom.regionMetals) shaded.reverse();
    mapLegend.replaceChildren(
      ...shaded.map(({ id, metal }) => el('li', { 'data-metal': metal }, el('i', { 'aria-hidden': 'true' }), `${localize(data.regions[id].title)}, ${localize(data.regions[id].date)}`)),
    );
    mapNote.replaceChildren(kingdom.mapNote ? richHtml(localize(kingdom.mapNote)) : t('statue.mapNote'));
    const bounds = kingdomBounds(kingdom, data.regions, ids.map((id) => mapPlaces[id]).filter(Boolean));
    map.fitBounds(bounds ?? WHOLE_MAP, { padding: 28 });
  }

  /* -------- the dossier of the selected part -------- */

  const evidence = createStatueEvidence(data.evidence);
  const dossier = el('article', { class: 'statue-dossier', 'aria-labelledby': 'statue-part-title' });

  function verseQuote(text) {
    const ref = parseRef(text);
    const body = el('span', { class: 'statue-verse-text' });
    const line = el('p', {}, el('a', { class: 'statue-verse-ref', href: verseHref(text), 'aria-label': refLabel(ref) }, shortRef(ref)), ' ', body);
    return { line, ref, body };
  }

  function renderDossier() {
    const kingdom = kingdomOf(part, reading);
    const index = data.parts.indexOf(part);
    const prev = data.parts[index - 1];
    const next = data.parts[index + 1];
    const readingTitle = localize(data.readings.find((r) => r.id === reading).title);

    const quotes = part.verses.map(verseQuote);
    const credit = el('p', { class: 'statue-verse-credit' });
    const shown = part;
    Promise.all(quotes.map(({ ref }) => passageText(ref).catch(() => null))).then((found) => {
      if (shown !== part) return; // another part was chosen meanwhile
      found.forEach((passage, i) => {
        if (!passage) return;
        quotes[i].body.textContent = passage.text;
        if (passage.lang) quotes[i].body.lang = passage.lang;
      });
      credit.textContent = [...new Set(found.map((passage) => passage?.name).filter(Boolean))].join(' · ');
    });

    const pagerButton = (target, label) => {
      const button = el('button', { type: 'button', class: 'statue-pager-button' }, label);
      button.addEventListener('click', () => choose(target.id, { reveal: true }));
      return button;
    };

    dossier.dataset.metal = part.metal;
    dossier.replaceChildren(
      el('div', { class: 'statue-dossier-bar', 'aria-hidden': 'true' }),
      el('p', { class: 'statue-kicker' }, `${t('statue.partOf', { n: index + 1, total: data.parts.length })} · ${localize(part.refs)}`),
      el('h2', { class: 'statue-part-title', id: 'statue-part-title', tabindex: '-1' }, localize(part.title)),
      el(
        'p',
        { class: 'statue-kingdom' },
        el('span', { class: 'statue-kingdom-name' }, localize(kingdom.name)),
        el('span', { class: 'statue-kingdom-dates' }, localize(kingdom.dates)),
        el('span', { class: `statue-badge${kingdom.agree ? '' : ' is-reading'}` }, kingdom.agree ? t('statue.agree') : readingTitle),
      ),
      el('p', { class: 'statue-full' }, localize(kingdom.full)),
      el('blockquote', { class: 'statue-verses' }, quotes.map((quote) => quote.line)),
      credit,
      el('div', { class: 'statue-summary' }, richHtml(localize(kingdom.summary))),
      el('dl', { class: 'statue-stats' }, kingdom.stats.flatMap(([label, value]) => [el('dt', {}, localize(label)), el('dd', {}, richHtml(localize(value)))])),
      mapFigure,
      el(
        'div',
        { class: 'statue-two' },
        el('section', { 'aria-labelledby': 'statue-material' }, el('h3', { id: 'statue-material' }, t('statue.material')), el('ul', { class: 'statue-facts' }, kingdom.facts.map((fact) => el('li', {}, richHtml(localize(fact)))))),
        el('section', { class: 'statue-differ', 'aria-labelledby': 'statue-differ' }, el('h3', { id: 'statue-differ' }, t('statue.differ')), richHtml(localize(kingdom.differ))),
      ),
      kingdom.evidence.length > 0 &&
        el(
          'section',
          { class: 'statue-see', 'aria-labelledby': 'statue-see' },
          el('h3', { id: 'statue-see' }, t('statue.evidenceFor')),
          el(
            'ul',
            { class: 'statue-chips', role: 'list' },
            kingdom.evidence.map((id) => {
              const item = data.evidence.items.find((candidate) => candidate.id === id);
              if (!item) return null;
              const chip = el('button', { type: 'button', class: 'statue-chip' }, richHtml(localize(item.title)));
              chip.addEventListener('click', () => evidence.show(id));
              return el('li', {}, chip);
            }),
          ),
        ),
      el(
        'nav',
        { class: 'statue-pager', 'aria-label': t('statue.parts') },
        prev ? pagerButton(prev, `← ${localize(prev.short)}`) : el('span'),
        next ? pagerButton(next, `${localize(next.short)} →`) : el('span'),
      ),
    );
    renderMap(kingdom);
  }

  /* -------- the sections below -------- */

  const timeline = createStatueTimeline({ timeline: data.timeline, parts: data.parts, kingdomOf, onSelect: (id) => choose(id, { reveal: true }) });

  const band = (id, title, intro, ...content) =>
    el(
      'section',
      { class: 'statue-band', 'aria-labelledby': id },
      el('h2', { id, tabindex: '-1' }, title),
      intro && el('p', { class: 'statue-intro' }, richHtml(localize(intro))),
      ...content,
    );

  const notes = el(
    'div',
    { class: 'statue-notes' },
    data.notes.items.map((note, index) =>
      el('details', { open: index === 0 }, el('summary', {}, el('h3', {}, localize(note.title))), el('div', { class: 'statue-note-body' }, richHtml(localize(note.body)))),
    ),
  );

  const readList = el(
    'ul',
    { class: 'statue-read' },
    [
      [data.passage, t('statue.readDream')],
      ['DAN 7:1-28', t('statue.readBeasts')],
      ['DAN 8:1-27', t('statue.readRamGoat')],
      ['DAN 11:1-45', t('statue.readKings')],
    ].map(([text, about]) => el('li', {}, el('a', { href: verseHref(text) }, refLabel(parseRef(text))), ' — ', about)),
  );

  const sources = el(
    'div',
    { class: 'statue-sources' },
    data.sources.groups.map((group) => el('section', {}, el('h3', {}, localize(group.title)), el('ul', { role: 'list' }, group.items.map((item) => el('li', {}, richHtml(localize(item))))))),
  );

  const jumps = [
    ['statue-top', t('statue.jumpStatue')],
    ['statue-timeline', t('statue.jumpTimeline')],
    ['statue-evidence', t('statue.jumpEvidence')],
    ['statue-research', t('statue.jumpResearch')],
    ['statue-read', t('statue.jumpRead')],
    ['statue-sources', t('statue.jumpSources')],
  ];

  const element = el(
    'article',
    { class: 'page statue-page', 'aria-labelledby': 'view-title' },
    el(
      'div',
      { class: 'statue-topbar' },
      el('p', { class: 'back' }, el('a', { class: 'back-link', href: pageHref(PAGES.explore) }, el('span', { 'aria-hidden': 'true' }, '←'), t('explore.back'))),
      el('nav', { class: 'statue-jump', 'aria-label': t('page.onThisPage') }, el('ul', { role: 'list' }, jumps.map(([id, label]) => el('li', {}, el('a', { href: `#${id}`, 'data-jump': id }, label))))),
    ),
    el('section', { class: 'statue-hero', id: 'statue-top', tabindex: '-1', 'aria-labelledby': 'view-title' }, stage, mast, dossier),
    band('statue-timeline', localize(data.timeline.title), data.timeline.intro, timeline.gantt, timeline.tools, timeline.list),
    band('statue-evidence', localize(data.evidence.title), data.evidence.intro, evidence.tools, evidence.grid),
    band('statue-research', localize(data.notes.title), data.notes.intro, notes),
    band('statue-read', t('statue.read'), null, readList),
    band('statue-sources', localize(data.sources.title), data.sources.intro, sources),
    el('footer', { class: 'statue-footer' }, data.footer.map((paragraph) => el('p', {}, richHtml(localize(paragraph)))), el('p', {}, t('statue.mapCredits'))),
  );

  /* -------- choosing a part or a reading -------- */

  /**
   * @param {string} id
   * @param {{ reveal?: boolean }} [options]  reveal: bring the dossier into
   *   view and focus its title (chosen from the timeline or the pager)
   */
  function choose(id, { reveal = false } = {}) {
    if (figure.busy) return;
    const next = data.parts.find((p) => p.id === id);
    if (!next) return;
    // Choosing a part of the statue after the stone fell brings it back.
    if (figure.fallen && id !== 'stone') {
      figure.raise();
      showCaption();
    }
    part = next;
    update();
    if (reveal) {
      const title = dossier.querySelector('#statue-part-title');
      title?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      title?.focus({ preventScroll: true });
    }
  }

  function update() {
    onChange({ part: part.id, reading });
    figure.select(part.id);
    for (const [id, button] of railButtons) {
      button.setAttribute('aria-pressed', String(id === part.id));
      button.querySelector('.statue-rail-kingdom').textContent = localize(kingdomOf(data.parts.find((p) => p.id === id), reading).rail);
    }
    layoutRail();
    for (const [id, button] of readingButtons) button.setAttribute('aria-pressed', String(id === reading));
    readingNote.replaceChildren(richHtml(localize(data.readings.find((r) => r.id === reading).note)));
    renderDossier();
    timeline.update({ reading, part: part.id });
  }

  showCaption();
  update();

  return {
    element,
    destroy() {
      railObserver?.disconnect();
      figure.destroy();
      map.destroy();
    },
  };
}

/** The band of rosettes under the stage, as on the Ishtar Gate. */
function frieze() {
  const SVG = 'http://www.w3.org/2000/svg';
  const node = (name, attrs = {}, ...children) => {
    const n = document.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, String(value));
    n.append(...children);
    return n;
  };
  const petals = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => node('ellipse', { rx: 1.9, ry: 4.3, cy: -4.4, transform: `rotate(${angle})` }));
  return node(
    'svg',
    { class: 'statue-frieze', viewBox: '0 0 400 22', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' },
    node('defs', {}, node('pattern', { id: 'statue-rosette', width: 27, height: 22, patternUnits: 'userSpaceOnUse' }, node('g', { transform: 'translate(13.5 11)', fill: '#f1ecdc' }, ...petals, node('circle', { r: 2.5, fill: '#e2b33c' })))),
    node('rect', { width: 400, height: 22, fill: 'url(#statue-rosette)' }),
  );
}
