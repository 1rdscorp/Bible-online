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
import { adjacentChapter } from '../canon.js';
import { chapterTitle, t } from '../i18n.js';
import { chapterHref, pageHref } from '../router.js';
import { formatWordTags } from '../providers/json-provider.js';
import { addColumn, MAX_COLUMNS, removeColumn, replaceColumn } from '../translations.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { verseNodes } from '../ui/text-ranges.js';
import { createTranslationSelect } from '../ui/translation-select.js';
import { nativePsalmLabel } from './numbering.js';
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
  // Compare mode: one slot per column for that translation's own Psalm number
  // ("Псалом 22"), filled in by show() once the text arrives.
  const numberingLabels = columns.map(() => el('p', { class: 'column-numbering', hidden: true }));
  const loadingText = parallel ? t('reader.loadingMany', { n: columns.length }) : t('reader.loadingOne', { name: columns[0].name });
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
        t('reader.addTranslation'),
      ),
    );
  }

  function columnHeads() {
    return el(
      'div',
      { class: 'parallel-head', role: 'group', 'aria-label': t('reader.columnsGroup') },
      el('span', { class: 'pnum', 'aria-hidden': 'true' }),
      columns.map((info, index) =>
        el(
          'div',
          { class: 'parallel-head-cell' },
          createTranslationSelect({
            translations,
            value: info.id,
            disabledIds: ids, // a translation can't fill two columns
            label: t('reader.columnLabel', { n: index + 1 }),
            focusKey: `col-${index}`,
            onChange: (id) => onColumnsChange(replaceColumn(ids, index, id), `col-${index}`),
          }).element,
          ids.length > 2 &&
            el(
              'button',
              {
                type: 'button',
                class: 'icon-button column-remove',
                'aria-label': t('reader.removeColumn', { abbr: info.abbreviation }),
                'data-focus-key': `remove-${index}`,
                // Focus moves to the column that takes this one's place.
                onclick: () => onColumnsChange(removeColumn(ids, index), `col-${Math.min(index, ids.length - 2)}`),
              },
              icon(ICONS.close, { size: 18 }),
            ),
          numberingLabels[index],
        ),
      ),
    );
  }

  // Show a column's own Psalm number where it differs from the English one.
  function renderNumbering(results) {
    results.forEach(({ info, chapter: data }, index) => {
      const slot = numberingLabels[index];
      const label = book.id === 'PSA' ? nativePsalmLabel(data?.native, info.numbering) : null;
      if (!label) {
        slot.hidden = true;
        slot.replaceChildren();
        return;
      }
      const name = info.numbering?.name ?? t('numbering.fallback', { abbr: info.abbreviation });
      slot.title = name;
      slot.replaceChildren(el('span', { class: 'visually-hidden' }, `${name}: `), el('span', { lang: info.language || null }, label));
      slot.hidden = false;
    });
  }

  /* -------- filling in the text -------- */

  function fillSingle({ info, chapter: data, error }) {
    if (error) {
      content.replaceChildren(errorBox(t('reader.loadFailed', { title }), error));
      return;
    }
    if (!data) {
      content.replaceChildren(status(t('reader.notIncluded', { title, name: info.name })));
      return;
    }
    // The text is in the translation's language; the rest of the page (title,
    // notices, links) is in the interface language. So lang/dir go on the
    // text alone: screen readers switch voice for it, and the font stack for
    // its script applies (base.css).
    if (info.language) content.lang = info.language;
    content.dir = info.direction === 'rtl' ? 'rtl' : 'ltr';
    // Which translation the text is (used by "translate selection").
    content.dataset.translation = info.id;
    content.replaceChildren(
      ...data.verses.map((v) =>
        el(
          'p',
          { class: 'verse', id: `v${v.number}`, 'data-verse': v.number },
          verseButton('vnum', v.number),
          // This space separates number and text for screen readers and
          // copy/paste. The number is absolutely positioned in the margin, so
          // the space falls at the start of the line and CSS drops it.
          ' ',
          // The words alone, so a highlight paints the text, not the margin.
          verseText(v.text, v.words),
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
            `${t('reader.columnFailed', { name: info.name })} `,
            el('button', { type: 'button', class: 'text-button', onclick: onRetry }, t('action.retry')),
          ),
        ];
      }
      return data ? [] : [el('p', { class: 'column-problem' }, t('reader.notIncluded', { title, name: info.name }))];
    });

    const rows = alignVerses(results.map((r) => r.chapter)).map((row) =>
      el(
        'div',
        { class: 'prow', id: `v${row.number}`, 'data-verse': row.number },
        verseButton('pnum', row.number),
        row.cells.map((text, index) => cell(results[index].info, text, row.words[index])),
      ),
    );
    content.replaceChildren(...problems, ...rows);
  }

  // Each cell carries a translation label. It's visible when columns stack
  // (on phones), and visually hidden but still read aloud when they're side
  // by side under the column headings.
  function cell(info, text, words) {
    const missing = text === null;
    return el(
      'div',
      {
        class: missing ? 'pcell is-missing' : 'pcell',
        'data-translation': info.id,
        lang: info.language || null,
        dir: info.direction === 'rtl' ? 'rtl' : null,
      },
      el('span', { class: 'pcell-label' }, info.abbreviation),
      ' ',
      missing ? [el('span', { 'aria-hidden': 'true' }, '—'), el('span', { class: 'visually-hidden' }, t('reader.missingVerse'))] : verseText(text, words),
    );
  }

  // A verse's words. In KJV+ each tagged word is a <span class="w">, and the
  // tags stay on the element so highlights can be repainted around them
  // (js/ui/text-ranges.js).
  function verseText(text, words) {
    if (!words?.length) return el('span', { class: 'vtext' }, text);
    return el('span', { class: 'vtext', 'data-tags': formatWordTags(words) }, verseNodes(text, [], words));
  }

  // The verse number is a button: it selects the verse for highlighting,
  // notes and the rest (js/ui/verse-actions.js, which also manages which
  // number is in the Tab order).
  function verseButton(className, number) {
    return el('button', { type: 'button', class: className, tabindex: '-1', 'aria-label': t('study.verse', { n: number }), 'aria-pressed': 'false' }, String(number));
  }

  function renderNotices(results) {
    notices.replaceChildren(
      ...results.map(({ info, chapter: data }) =>
        el('p', { class: 'notice' }, el('abbr', { title: info.name }, info.abbreviation), ' · ', noticeText(info, data)),
      ),
      el('p', { class: 'notice' }, el('a', { href: pageHref('translations') }, t('reader.about'))),
    );
  }

  function errorBox(message, error) {
    return el(
      'div',
      { class: 'load-error', role: 'alert' },
      el('p', {}, message),
      el('p', { class: 'load-error-detail' }, error?.message ?? String(error)),
      el('button', { type: 'button', class: 'button', onclick: onRetry }, t('action.retry')),
    );
  }

  return {
    element,
    heading,
    // The verses (.verse or .prow rows live inside), and the place for the
    // verse action bar: right after the text, so Tab reaches it next.
    textRoot: content,
    actionsSlot: notices,

    /**
     * Render the text. `results` has one entry per column:
     * { info, chapter: Chapter|null, error: Error|null }.
     * `verse` (to `verseEnd`, for a range) is highlighted; with `flash` it
     * also pulses briefly, to catch the eye after a jump from search.
     * Returns the element for `verse` if it exists, so the caller can
     * scroll to it.
     */
    show(results, { verse = null, verseEnd = null, flash = false } = {}) {
      if (parallel) {
        fillParallel(results);
        renderNumbering(results);
      } else {
        fillSingle(results[0]);
      }
      renderNotices(results);
      article.removeAttribute('aria-busy');

      if (!verse) return null;
      const last = verseEnd > verse ? verseEnd : verse;
      const targets = [...content.querySelectorAll('[data-verse]')].filter((node) => {
        const number = Number(node.dataset.verse);
        return number >= verse && number <= last;
      });
      for (const node of targets) {
        node.classList.add('is-target');
        if (flash) {
          node.classList.add('is-flash');
          node.addEventListener('animationend', () => node.classList.remove('is-flash'), { once: true });
        }
      }
      const target = targets[0] ?? null;
      if (target) target.tabIndex = -1;
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
    { class: 'chapter-nav', 'aria-label': t('reader.chapterNav') },
    previous && navLink(previous, 'prev', t('reader.previous'), query),
    next && navLink(next, 'next', t('reader.next'), query),
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
    el('span', { class: 'visually-hidden' }, t('reader.navJoin')),
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
    [-1, 'prev', 'reader.previousTitle', ICONS.chevronLeft],
    [1, 'next', 'reader.nextTitle', ICONS.chevronRight],
  ].map(([delta, direction, titleKey, path]) => {
    const target = adjacentChapter(book, chapter, delta);
    if (!target) return null;
    return el(
      'a',
      {
        class: `side-nav side-nav--${direction}`,
        href: chapterHref(target.book, target.chapter, null, query),
        'aria-hidden': 'true',
        tabindex: '-1',
        title: t(titleKey, { title: chapterTitle(target.book, target.chapter) }),
      },
      icon(path, { size: 28 }),
    );
  });
}
