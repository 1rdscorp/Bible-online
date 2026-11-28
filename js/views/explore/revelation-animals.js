/**
 * #/explore/revelation-animals: the animals of Revelation.
 *
 * Fifteen plates, one for each creature or group of creatures in the book,
 * in the order they appear: the four living creatures, the Lion of Judah,
 * the Lamb, the four horses, the eagle, the locusts, the horses with lions'
 * heads, the dragon, the beast from the sea, the beast from the earth, the
 * three frogs, the scarlet beast, the birds, the white horse of chapter 19,
 * and the animals named in passing.
 *
 * Choose a plate in the gallery. The plate carries numbered points; a point
 * and its entry in the list beside it are one selection, shown again under
 * the plate. Below: the key verse (in the translation being read), what the
 * Bible says, and what Ellen G. White wrote, each entry marked by how much
 * she wrote ("level": detail, brief or none). Then a key to the symbols, a
 * chart of the dated periods, and the sources.
 *
 * Content: data/study/explore/revelation-animals.json, whose rich text
 * links every verse it cites. A plate is either a picture or a drawing. A
 * picture is a creature's "image" in the content: a file in img/revelation/,
 * shown at its own shape (all fifteen plates are pictures at present). A
 * creature without one is drawn: the drawings (revelation-plates.js, built by
 * tools/build-revelation.mjs from tools/art/revelation/) can be large, so
 * they load only when the page has a drawn plate. ?part=<creature> keeps the
 * choice in the URL.
 */
import { chapterTitle, t } from '../../i18n.js';
import { formatRef, parseRef } from '../../research/refs.js';
import { pageHref, PAGES } from '../../router.js';
import { el } from '../../ui/dom.js';
import { localize } from '../maps.js';
import { richHtml, verseHref } from '../templates/rich-html.js';

const SVG = 'http://www.w3.org/2000/svg';
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Two columns (the plate beside its list) from this width: css/revelation.css.
const sideBySide = () => globalThis.matchMedia?.('(min-width: 60rem)').matches;
const refLabel = (ref) => formatRef(ref, chapterTitle);

/** 1 → "I", 14 → "XIV": the plates are numbered as on an old prophetic chart. */
export function roman(n) {
  const steps = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let rest = n;
  let out = '';
  for (const [value, letters] of steps) {
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  }
  return out;
}

/** The creature with this id, or the first one. */
export function creatureOf(data, id) {
  return data.creatures.find((creature) => creature.id === id) ?? data.creatures[0];
}

/** A year's place on the chart, as a percentage of its width. */
export function chartPosition(year, [from, to]) {
  return ((year - from) / (to - from)) * 100;
}

/** The chart's gridlines, every `step` years. There is no year 0: it is labelled 1. */
export function chartYears([from, to], step = 250) {
  const years = [];
  // `|| 0`: a range that starts below zero would otherwise begin at -0.
  for (let year = Math.ceil(from / step) * step || 0; year <= to; year += step) years.push({ year, label: year === 0 ? 1 : year });
  return years;
}

/**
 * The grid a plate's points are placed on. It is 640 wide: a drawing is 400
 * high, a picture as high as its own shape makes it.
 */
export function plateSize(creature) {
  const { image } = creature;
  return { width: 640, height: image ? Math.round((640 * image.height) / image.width) : 400 };
}

let platesModule = null;
/** The drawings, fetched once. A failed fetch (offline, not yet saved) can be tried again. */
function loadPlates() {
  platesModule ??= import('./revelation-plates.js').catch((error) => {
    platesModule = null;
    throw error;
  });
  return platesModule;
}

function svgNode(name, attributes = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}

/**
 * A plate as an <svg>: the creature's picture, or its drawing from the plates
 * module. With a label it is a group (its points are buttons); without,
 * decoration.
 */
function plateSvg(plates, creature, { className, label = null }) {
  const { width, height } = plateSize(creature);
  const svg = svgNode('svg', { class: className, viewBox: `0 0 ${width} ${height}`, focusable: 'false' });
  if (label) {
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  if (creature.image) {
    svg.append(svgNode('image', { href: creature.image.src, width, height, preserveAspectRatio: 'xMidYMid slice' }));
  } else {
    const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG}">${plates.PLATES[creature.id] ?? ''}</svg>`, 'image/svg+xml');
    svg.append(...[...parsed.documentElement.childNodes].map((node) => document.importNode(node, true)));
  }
  return svg;
}

/**
 * @param {object} options
 * @param {object} options.data      the page's content
 * @param {string} options.partId    the creature to open (?part=…)
 * @param {(state: { part: string }) => void} options.onChange  to keep the URL in step
 * @param {(ref) => Promise<{ text, lang, name }|null>} options.passageText
 */
export function renderRevelationAnimals({ data, partId, onChange, passageText }) {
  let creature = creatureOf(data, partId);
  let point = 1; // the selected numbered point of the plate on screen
  let plates = null; // the drawings, once loaded
  let drawingsFailed = false;
  let alive = true;
  // The parts of the detail that a selection touches; rebuilt with each creature.
  let pins = [];
  let partItems = [];
  let plateFrame = null;
  let readout = null;

  const levelPill = (level) => el('span', { class: 'rv-level', 'data-level': level }, localize(data.levels[level]));

  /* -------- the top: title, the note on the commentary, the gallery -------- */

  const mast = el(
    'header',
    { class: 'statue-mast rv-mast' },
    el('p', { class: 'statue-eyebrow' }, localize(data.eyebrow)),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, localize(data.title)),
    el('p', { class: 'statue-lede' }, localize(data.summary)),
  );

  const about = el(
    'aside',
    { class: 'rv-about', 'aria-labelledby': 'rv-about-title' },
    el('h2', { id: 'rv-about-title' }, t('revelation.about')),
    data.about.map((paragraph) => el('p', {}, localize(paragraph))),
    el('ul', { class: 'rv-legend', role: 'list', 'aria-label': t('revelation.levelLegend') }, Object.keys(data.levels).map((level) => el('li', {}, levelPill(level)))),
  );

  const thumbs = new Map();
  const gallery = el(
    'ul',
    { class: 'rv-gallery', role: 'list', 'aria-label': t('revelation.plates') },
    data.creatures.map((entry, index) => {
      const frame = el('span', { class: 'rv-thumb-frame' });
      // A picture has a small copy for the gallery; a drawing is filled in when the drawings arrive.
      if (entry.image) frame.append(el('img', { class: 'rv-thumb-img', src: entry.image.thumb ?? entry.image.src, alt: '', loading: 'lazy', decoding: 'async' }));
      const button = el(
        'button',
        { type: 'button', class: 'rv-thumb', 'aria-pressed': 'false' },
        frame,
        el('span', { class: 'rv-thumb-caption' }, el('span', { class: 'rv-thumb-number', 'aria-hidden': 'true' }, roman(index + 1)), localize(entry.short)),
      );
      button.addEventListener('click', () => choose(entry.id, { reveal: true }));
      thumbs.set(entry.id, { button, frame });
      return el('li', {}, button);
    }),
  );

  /* -------- the selected creature: plate, points, verse, Bible, commentary -------- */

  const detail = el('section', { class: 'rv-detail', 'aria-labelledby': 'rv-creature-title' });

  /** The plate with its numbered points on top. */
  function stagePlate() {
    const { width, height } = plateSize(creature);
    const svg = plateSvg(plates, creature, { className: 'rv-plate-svg', label: localize(creature.picture) });
    svg.append(svgNode('rect', { class: 'rv-plate-edge', x: 1, y: 1, width: width - 2, height: height - 2 }));
    pins = creature.parts.map((part, index) => {
      const n = index + 1;
      const pin = svgNode(
        'g',
        { class: 'rv-pin', transform: `translate(${part.at[0]} ${part.at[1]})`, tabindex: '0', role: 'button', 'aria-pressed': 'false', 'aria-label': t('revelation.pointLabel', { n, title: localize(part.title) }) },
        svgNode('g', { class: 'rv-pin-mark' }, svgNode('circle', { class: 'rv-pin-hit', r: 22 }), svgNode('circle', { class: 'rv-pin-dot', r: 11.5 }), svgNode('text', { y: 4.3 }, String(n))),
      );
      pin.addEventListener('mouseenter', () => showPoint(n));
      pin.addEventListener('focus', () => showPoint(n));
      pin.addEventListener('click', () => showPoint(n, { reveal: true }));
      pin.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        showPoint(n, { reveal: true });
      });
      svg.append(pin);
      return pin;
    });
    return svg;
  }

  /**
   * Select a numbered point: on the plate, in the list, and under the plate.
   * @param {number} n
   * @param {{ reveal?: boolean }} [options]  reveal: bring its list entry
   *   into view (chosen on the plate, when the list is beside it)
   */
  function showPoint(n, { reveal = false } = {}) {
    point = n;
    pins.forEach((pin, index) => {
      pin.classList.toggle('is-selected', index + 1 === n);
      pin.setAttribute('aria-pressed', String(index + 1 === n));
    });
    partItems.forEach(({ item, button }, index) => {
      item.classList.toggle('is-selected', index + 1 === n);
      button.setAttribute('aria-pressed', String(index + 1 === n));
    });
    const part = creature.parts[n - 1];
    readout.replaceChildren(
      el('span', { class: 'rv-number', 'aria-hidden': 'true' }, n),
      el(
        'span',
        { class: 'rv-readout-body' },
        el('b', {}, localize(part.title)),
        ' ',
        el('span', { class: 'rv-part-refs' }, richHtml(localize(part.refs))),
        el('span', { class: 'rv-readout-text' }, richHtml(localize(part.text))),
      ),
    );
    if (reveal && sideBySide()) {
      const box = partItems[n - 1].item.getBoundingClientRect();
      if (box.top < 72 || box.bottom > globalThis.innerHeight - 8) partItems[n - 1].item.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }

  function renderDetail() {
    const index = data.creatures.indexOf(creature);
    const prev = data.creatures[index - 1];
    const next = data.creatures[index + 1];
    const total = data.creatures.length;

    pins = [];
    const { width, height } = plateSize(creature);
    // A picture needs nothing but itself; a drawing waits for the drawings.
    plateFrame = el('div', { class: 'rv-plate' }, creature.image || plates ? stagePlate() : el('p', { class: 'rv-plate-wait' }, t(drawingsFailed ? 'revelation.noDrawing' : 'revelation.loading')));
    plateFrame.style.aspectRatio = `${width} / ${height}`;
    readout = el('figcaption', { class: 'rv-readout', 'aria-live': 'polite' });
    partItems = creature.parts.map((part, i) => {
      const n = i + 1;
      // The button holds only the name: the references and the text below it have links of their own.
      const button = el('button', { type: 'button', class: 'rv-part-button', 'aria-pressed': 'false' }, el('span', { class: 'rv-number', 'aria-hidden': 'true' }, n), el('span', { class: 'rv-part-title' }, localize(part.title)));
      const item = el('li', { class: 'rv-part' }, button, el('p', { class: 'rv-part-refs' }, richHtml(localize(part.refs))), el('p', { class: 'rv-part-text' }, richHtml(localize(part.text))));
      button.addEventListener('click', () => showPoint(n));
      button.addEventListener('focus', () => showPoint(n));
      item.addEventListener('mouseenter', () => showPoint(n));
      return { item, button };
    });

    // The key verse, in the translation being read.
    const ref = parseRef(creature.verse);
    const verseText = el('p', { class: 'rv-verse-text' });
    const credit = el('span', { class: 'rv-verse-credit' });
    const shown = creature;
    passageText(ref)
      .then((passage) => {
        if (!alive || shown !== creature || !passage) return;
        verseText.textContent = passage.text;
        if (passage.lang) verseText.lang = passage.lang;
        credit.textContent = passage.name;
      })
      .catch(() => {});

    const pagerButton = (target, label) => {
      const button = el('button', { type: 'button', class: 'statue-pager-button' }, label);
      button.addEventListener('click', () => choose(target.id, { reveal: true }));
      return button;
    };

    detail.dataset.level = creature.level;
    detail.replaceChildren(
      el(
        'header',
        { class: 'rv-head' },
        el('p', { class: 'statue-kicker' }, `${t('revelation.plateOf', { n: roman(index + 1), total: roman(total) })} · ${localize(creature.chapter)}`),
        el('h2', { class: 'rv-title', id: 'rv-creature-title', tabindex: '-1' }, localize(creature.title)),
        el('p', { class: 'rv-summary' }, localize(creature.summary)),
        el('p', { class: 'rv-meta' }, el('span', { class: 'rv-where' }, el('b', {}, t('revelation.where')), ' ', richHtml(localize(creature.where))), levelPill(creature.level)),
      ),
      el(
        'div',
        { class: 'rv-stage' },
        el('figure', { class: 'rv-figure' }, plateFrame, readout),
        el('div', { class: 'rv-parts-wrap' }, el('h3', { id: 'rv-parts-title' }, t('revelation.inPicture')), el('ol', { class: 'rv-parts', 'aria-labelledby': 'rv-parts-title' }, partItems.map((entry) => entry.item))),
      ),
      el('blockquote', { class: 'rv-verse' }, verseText, el('footer', {}, el('a', { href: verseHref(creature.verse) }, refLabel(ref)), credit)),
      el(
        'div',
        { class: 'rv-columns' },
        el('section', { class: 'rv-column rv-bible', 'aria-labelledby': 'rv-bible-title' }, el('h3', { id: 'rv-bible-title' }, t('revelation.inBible')), creature.bible.map((paragraph) => el('p', {}, richHtml(localize(paragraph))))),
        el(
          'section',
          { class: 'rv-column rv-white', 'aria-labelledby': 'rv-white-title' },
          el('h3', { id: 'rv-white-title' }, t('revelation.white')),
          creature.white.map((paragraph) => el('p', {}, richHtml(localize(paragraph)))),
          creature.context && el('p', { class: 'rv-context' }, richHtml(localize(creature.context))),
        ),
      ),
      el('nav', { class: 'statue-pager', 'aria-label': t('revelation.plates') }, prev ? pagerButton(prev, `← ${localize(prev.short)}`) : el('span'), next ? pagerButton(next, `${localize(next.short)} →`) : el('span')),
    );
    showPoint(point);
  }

  /* -------- the sections below: key, chart, sources -------- */

  const band = (id, title, intro, ...content) =>
    el('section', { class: 'statue-band rv-band', 'aria-labelledby': id }, el('h2', { id, tabindex: '-1' }, title), intro && el('p', { class: 'statue-intro' }, localize(intro)), ...content);

  const keyTable = el(
    'div',
    { class: 'rv-scroll' },
    el(
      'table',
      { class: 'rv-key' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, t('revelation.symbol')), el('th', { scope: 'col' }, t('revelation.meaning')), el('th', { scope: 'col' }, t('revelation.whereSaid')))),
      el(
        'tbody',
        {},
        data.key.rows.map((row) => el('tr', {}, el('th', { scope: 'row' }, localize(row.symbol)), el('td', {}, localize(row.meaning)), el('td', { class: 'rv-key-refs' }, richHtml(localize(row.refs))))),
      ),
    ),
  );

  // The chart is a picture for screen readers: the notes under it say the same in words.
  const { range } = data.chart;
  const at = (year) => `${chartPosition(year, range).toFixed(2)}%`;
  const years = chartYears(range);
  const chart = el(
    'div',
    { class: 'rv-scroll' },
    el(
      'div',
      { class: 'rv-chart', role: 'img', 'aria-label': t('revelation.chartLabel') },
      data.chart.rows.map((row) =>
        el(
          'div',
          { class: 'rv-chart-row' },
          el('p', { class: 'rv-chart-label' }, localize(row.label)),
          el(
            'div',
            { class: 'rv-chart-track' },
            years.map(({ year }) => el('span', { class: 'rv-chart-grid', style: `left:${at(year)}` })),
            row.bars.map((bar) =>
              el('span', { class: 'rv-chart-bar', 'data-kind': bar.kind, style: `left:${at(bar.from)};width:${(chartPosition(bar.to, range) - chartPosition(bar.from, range)).toFixed(2)}%` }, el('span', {}, localize(bar.text))),
            ),
            [...new Set(row.bars.flatMap((bar) => [bar.from, bar.to]))].map((year) => el('span', { class: 'rv-chart-year', style: `left:${at(year)}` }, year)),
          ),
        ),
      ),
      el('div', { class: 'rv-chart-axis' }, years.map(({ year, label }) => el('span', { style: `left:${at(year)}` }, year === 0 ? t('revelation.yearOne') : label))),
    ),
  );
  const chartNotes = el('ul', { class: 'rv-chart-notes', role: 'list' }, data.chart.notes.map((note) => el('li', { 'data-kind': note.kind }, el('i', { 'aria-hidden': 'true' }), el('span', {}, richHtml(localize(note.text))))));

  const sources = el(
    'div',
    { class: 'statue-sources' },
    data.sources.groups.map((group) => el('section', {}, el('h3', {}, localize(group.title)), el('ul', { role: 'list' }, group.items.map((item) => el('li', {}, richHtml(localize(item))))))),
  );

  const jumps = [
    ['rv-top', t('revelation.jumpPlates')],
    ['rv-key', t('revelation.jumpKey')],
    ['rv-chart', t('revelation.jumpChart')],
    ['rv-sources', t('revelation.jumpSources')],
  ];

  const element = el(
    'article',
    { class: 'page statue-page rv-page', 'aria-labelledby': 'view-title' },
    el(
      'div',
      { class: 'statue-topbar' },
      el('p', { class: 'back' }, el('a', { class: 'back-link', href: pageHref(PAGES.explore) }, el('span', { 'aria-hidden': 'true' }, '←'), t('explore.back'))),
      el('nav', { class: 'statue-jump', 'aria-label': t('page.onThisPage') }, el('ul', { role: 'list' }, jumps.map(([id, label]) => el('li', {}, el('a', { href: `#${id}`, 'data-jump': id }, label))))),
    ),
    el('section', { class: 'rv-hero', id: 'rv-top', tabindex: '-1', 'aria-labelledby': 'view-title' }, el('div', { class: 'rv-hero-top' }, mast, about), gallery),
    detail,
    band('rv-key', localize(data.key.title), data.key.intro, keyTable),
    band('rv-chart', localize(data.chart.title), data.chart.intro, chart, chartNotes),
    band('rv-sources', localize(data.sources.title), data.sources.intro, sources),
    el('footer', { class: 'statue-footer' }, data.footer.map((paragraph) => el('p', {}, localize(paragraph)))),
  );

  /* -------- choosing a creature -------- */

  /**
   * @param {string} id
   * @param {{ reveal?: boolean }} [options]  reveal: bring the creature into
   *   view and focus its title (chosen in the gallery or the pager)
   */
  function choose(id, { reveal = false } = {}) {
    const next = data.creatures.find((entry) => entry.id === id);
    if (!next) return;
    if (next !== creature) {
      creature = next;
      point = 1;
    }
    update();
    if (reveal) {
      const title = detail.querySelector('#rv-creature-title');
      title?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      title?.focus({ preventScroll: true });
    }
  }

  function update() {
    onChange({ part: creature.id });
    for (const [id, { button }] of thumbs) button.setAttribute('aria-pressed', String(id === creature.id));
    renderDetail();
  }

  update();

  const drawn = data.creatures.filter((entry) => !entry.image);
  if (drawn.length) {
    loadPlates()
      .then((module) => {
        if (!alive) return;
        plates = module;
        for (const entry of drawn) thumbs.get(entry.id).frame.replaceChildren(plateSvg(plates, entry, { className: 'rv-thumb-svg' }));
        if (creature.image) return;
        plateFrame.replaceChildren(stagePlate());
        showPoint(point);
      })
      .catch(() => {
        // Offline before the drawings were saved: the text is complete without them.
        drawingsFailed = true;
        if (alive && !creature.image) plateFrame.replaceChildren(el('p', { class: 'rv-plate-wait' }, t('revelation.noDrawing')));
      });
  }

  return {
    element,
    destroy() {
      alive = false;
    },
  };
}
