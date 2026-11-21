/**
 * Chapter view: #/john/3?t=kjv (one translation) or #/john/3?t=kjv,asv,web
 * (2–4 in parallel).
 *
 * One translation keeps the Stage 1 reading layout. Several are laid out in
 * rows, one row per verse number (verse-alignment.js), with a column per
 * translation side by side, or stacked when the screen is too narrow (see
 * fitColumns below and css/parallel.css).
 *
 * createReaderView() builds the page straight away: heading, column pickers,
 * licence area and previous/next links, none of which need the text.
 * main.js fills in the text with show() once the providers respond.
 */
import { adjacentChapter, chapterTitle } from '../canon.js';
import { chapterHref, pageHref } from '../router.js';
import { addColumn, MAX_COLUMNS, removeColumn, replaceColumn } from '../translations.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { createTranslationSelect } from '../ui/translation-select.js';
import { alignVerses } from './verse-alignment.js';

// Side-by-side needs room for every column to be at least this wide (in em of
// the reading text). Below it, each verse's translations stack. In em, a
// larger text size stacks sooner, which keeps lines readable.
const MIN_COLUMN_EM = 13;
const NUMBER_GUTTER_EM = 2;
const COLUMN_GAP_EM = 1.25;

/**
 * @param {object} options
 * @param {object} options.book, options.chapter
 * @param {object[]} options.columns       TranslationInfo for each column shown (1 = single, 2–4 = parallel)
 * @param {object[]} options.translations  every available translation (for the column pickers)
 * @param {string} [options.query]         "t=kjv,asv", kept on previous/next links
 * @param {(ids: string[], focusKey: string) => void} [options.onColumnsChange]
 * @param {() => void} [options.onRetry]
 */
export function createReaderView({ book, chapter, columns, translations, query = '', onColumnsChange = () => {}, onRetry = () => {} }) {
  const title = chapterTitle(book, chapter);
  const parallel = columns.length > 1;
  const ids = columns.map((info) => info.id);
  const allIds = translations.map((info) => info.id);

  const heading = el('h1', { class: 'chapter-title', id: 'chapter-title', tabindex: '-1' }, title);
  const loadingText = parallel ? `Loading ${columns.length} translations…` : `Loading the ${columns[0].name}…`;
  const content = el('div', { class: parallel ? 'parallel-rows' : 'scripture' }, status(loadingText));
  const notices = el('footer', { class: 'chapter-notices' });

  let body = content;
  if (parallel) {
    body = el('div', { class: 'parallel' }, columnHeads(), content);
    fitColumns(body, columns.length);
  }

  const article = el(
    'article',
    {
      class: parallel ? 'chapter is-parallel' : 'chapter',
      'aria-labelledby': 'chapter-title',
      'aria-busy': 'true',
      // Column count for css/parallel.css.
      style: parallel ? `--cols: ${columns.length}` : null,
    },
    el('header', { class: 'chapter-header' }, heading, parallel && toolbar()),
    body,
    notices,
    chapterNav(book, chapter, query),
  );
  // Parallel columns use the full width, so the edge chevrons would sit on
  // the text; the bottom links and ← → keys remain.
  const element = el('div', { class: 'reader' }, article, !parallel && sideNav(book, chapter, query));

  /* -------- parallel controls -------- */

  function toolbar() {
    if (ids.length >= MAX_COLUMNS || allIds.length <= ids.length) return null;
    return el(
      'p',
      { class: 'parallel-toolbar' },
      el(
        'button',
        {
          type: 'button',
          class: 'text-button',
          'data-focus-key': 'add-column',
          onclick: () => onColumnsChange(addColumn(ids, allIds), `col-${ids.length}`),
        },
        icon(ICONS.plus, { size: 16 }),
        'Add translation',
      ),
    );
  }

  function columnHeads() {
    return el(
      'div',
      { class: 'parallel-head', role: 'group', 'aria-label': 'Translations in columns' },
      el('span', { class: 'pnum', 'aria-hidden': 'true' }),
      columns.map((info, index) =>
        el(
          'div',
          { class: 'parallel-head-cell' },
          createTranslationSelect({
            translations,
            value: info.id,
            disabledIds: ids, // a translation can't fill two columns
            label: `Column ${index + 1} translation`,
            focusKey: `col-${index}`,
            onChange: (id) => onColumnsChange(replaceColumn(ids, index, id), `col-${index}`),
          }).element,
          ids.length > 2 &&
            el(
              'button',
              {
                type: 'button',
                class: 'icon-button column-remove',
                'aria-label': `Remove ${info.abbreviation} column`,
                'data-focus-key': `remove-${index}`,
                // Focus moves to the column that takes this one's place.
                onclick: () => onColumnsChange(removeColumn(ids, index), `col-${Math.min(index, ids.length - 2)}`),
              },
              icon(ICONS.close, { size: 18 }),
            ),
        ),
      ),
    );
  }

  /* -------- filling in the text -------- */

  function fillSingle({ info, chapter: data, error }) {
    if (error) {
      content.replaceChildren(errorBox(`Sorry, ${title} couldn’t be loaded.`, error));
      return;
    }
    if (!data) {
      content.replaceChildren(status(`${title} isn’t included in the ${info.name}.`));
      return;
    }
    // lang/dir come from the translation, so a later non-English or
    // right-to-left translation is announced and laid out correctly.
    if (info.language) article.lang = info.language;
    article.dir = info.direction === 'rtl' ? 'rtl' : 'ltr';
    content.replaceChildren(
      ...data.verses.map((v) =>
        el(
          'p',
          { class: 'verse', id: `v${v.number}`, 'data-verse': v.number },
          el('span', { class: 'vnum' }, String(v.number)),
          // This space separates number and text for screen readers and
          // copy/paste. The number is absolutely positioned in the margin, so
          // the space falls at the start of the line and CSS drops it.
          ' ',
          v.text,
        ),
      ),
    );
  }

  function fillParallel(results) {
    const problems = results.flatMap(({ info, chapter: data, error }) => {
      if (error) {
        return [
          el(
            'p',
            { class: 'column-problem', role: 'alert' },
            `The ${info.name} couldn’t be loaded. `,
            el('button', { type: 'button', class: 'text-button', onclick: onRetry }, 'Try again'),
          ),
        ];
      }
      return data ? [] : [el('p', { class: 'column-problem' }, `${title} isn’t included in the ${info.name}.`)];
    });

    const rows = alignVerses(results.map((r) => r.chapter)).map((row) =>
      el(
        'div',
        { class: 'prow', id: `v${row.number}`, 'data-verse': row.number },
        el('span', { class: 'pnum' }, String(row.number)),
        row.cells.map((text, index) => cell(results[index].info, text)),
      ),
    );
    content.replaceChildren(...problems, ...rows);
  }

  // Each cell carries a translation label. It's visible when columns stack
  // (on phones), and visually hidden but still read aloud when they're side
  // by side under the column headings.
  function cell(info, text) {
    const missing = text === null;
    return el(
      'div',
      {
        class: missing ? 'pcell is-missing' : 'pcell',
        lang: info.language || null,
        dir: info.direction === 'rtl' ? 'rtl' : null,
      },
      el('span', { class: 'pcell-label' }, info.abbreviation),
      ' ',
      missing ? [el('span', { 'aria-hidden': 'true' }, '—'), el('span', { class: 'visually-hidden' }, 'not in this translation')] : text,
    );
  }

  function renderNotices(results) {
    notices.replaceChildren(
      ...results.map(({ info, chapter: data }) =>
        el('p', { class: 'notice' }, el('abbr', { title: info.name }, info.abbreviation), ' · ', noticeText(info, data)),
      ),
      el('p', { class: 'notice' }, el('a', { href: pageHref('translations') }, 'About these translations')),
    );
  }

  function errorBox(message, error) {
    return el(
      'div',
      { class: 'load-error', role: 'alert' },
      el('p', {}, message),
      el('p', { class: 'load-error-detail' }, error?.message ?? String(error)),
      el('button', { type: 'button', class: 'button', onclick: onRetry }, 'Try again'),
    );
  }

  return {
    element,
    heading,

    /**
     * Render the text. `results` has one entry per column:
     * { info, chapter: Chapter|null, error: Error|null }.
     * Returns the element for `verse` (highlighted) if it exists, so the
     * caller can scroll to it.
     */
    show(results, { verse = null } = {}) {
      if (parallel) fillParallel(results);
      else fillSingle(results[0]);
      renderNotices(results);
      article.removeAttribute('aria-busy');

      const target = verse ? content.querySelector(`#v${verse}`) : null;
      if (!target) return null;
      target.classList.add('is-target');
      target.tabIndex = -1;
      return target;
    },

    /** Dim the page while a translation change downloads. */
    setBusy(busy) {
      article.classList.toggle('is-busy', busy);
      if (busy) article.setAttribute('aria-busy', 'true');
      else article.removeAttribute('aria-busy');
    },
  };
}

/** "King James Version (1769). Public domain." An API's own notice wins. */
function noticeText(info, data) {
  const terms = String(data?.copyright ?? info.notice ?? info.license).trim();
  return `${info.name}${info.year ? ` (${info.year})` : ''}. ${/[.!?]$/.test(terms) ? terms : `${terms}.`}`;
}

/**
 * Switch the parallel block between stacked and side-by-side as its width
 * changes. ResizeObserver runs after layout but before paint, so the right
 * layout appears on the first frame. Without it the columns simply stay stacked.
 */
function fitColumns(container, count) {
  if (typeof ResizeObserver === 'undefined') return;
  const neededEm = NUMBER_GUTTER_EM + count * MIN_COLUMN_EM + (count - 1) * COLUMN_GAP_EM;
  new ResizeObserver(([entry]) => {
    const fontSize = parseFloat(getComputedStyle(container).fontSize) || 16;
    container.classList.toggle('is-side-by-side', entry.contentRect.width >= neededEm * fontSize);
  }).observe(container);
}

function status(text) {
  return el('p', { class: 'status' }, text);
}

/** "Previous / Next" links under the text. Crosses book boundaries. */
function chapterNav(book, chapter, query) {
  const previous = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);
  return el(
    'nav',
    { class: 'chapter-nav', 'aria-label': 'Chapter' },
    previous && navLink(previous, 'prev', 'Previous', query),
    next && navLink(next, 'next', 'Next', query),
  );
}

function navLink(position, direction, label, query) {
  return el(
    'a',
    {
      class: `chapter-nav-link chapter-nav-link--${direction}`,
      href: chapterHref(position.book, position.chapter, null, query),
      rel: direction,
    },
    el('span', { class: 'chapter-nav-label' }, label),
    // Accessible name: "Previous chapter: John 2"
    el('span', { class: 'visually-hidden' }, ' chapter: '),
    el('span', { class: 'chapter-nav-target' }, chapterTitle(position.book, position.chapter)),
  );
}

/**
 * Large chevrons at the window edges, shown only on wide screens with a
 * mouse (see reader.css). They repeat the links above for mouse users, so
 * they're hidden from assistive tech and the Tab order. Keyboard users have
 * the bottom links and the ← → keys.
 */
function sideNav(book, chapter, query) {
  return [
    [-1, 'prev', 'Previous chapter', ICONS.chevronLeft],
    [1, 'next', 'Next chapter', ICONS.chevronRight],
  ].map(([delta, direction, label, path]) => {
    const target = adjacentChapter(book, chapter, delta);
    if (!target) return null;
    return el(
      'a',
      {
        class: `side-nav side-nav--${direction}`,
        href: chapterHref(target.book, target.chapter, null, query),
        'aria-hidden': 'true',
        tabindex: '-1',
        title: `${label}: ${chapterTitle(target.book, target.chapter)}`,
      },
      icon(path, { size: 28 }),
    );
  });
}
