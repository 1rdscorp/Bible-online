/**
 * Search page: #/search?q=…&t=…&in=…&match=… (see js/search/params.js).
 *
 * createSearchView() builds the form straight away. main.js runs the search
 * (in the worker) and passes the results to showResults(); the view only
 * displays them and reports what the reader asks for:
 *   onSubmit(params)  the form was sent (Enter or the button)
 *   onChange(params)  an option changed while there's a query
 *   onMore()          "Show more"
 *
 * Results are grouped by book, with counts, and matching words are marked.
 * Clicking anywhere on a result opens the verse (unless text is being
 * selected); the reference itself is the link, for keyboards and screen
 * readers.
 */
import { booksInTestament, getBook } from '../canon.js';
import { bookName, chapterTitle, t, testamentName } from '../i18n.js';
import { errorText } from '../offline.js';
import { bookHref, chapterHref } from '../router.js';
import { ALL_TRANSLATIONS, searchHref } from '../search/params.js';
import { highlightRanges, MATCH_MODES } from '../search/text.js';
import { el, icon, ICONS } from '../ui/dom.js';

const MATCH_LABELS = { all: 'search.matchAll', any: 'search.matchAny', phrase: 'search.matchPhrase' };

/** "John 3:16" / "От Иоанна 3:16" */
export function verseReference(book, chapter, verse) {
  return `${chapterTitle(book, chapter)}:${verse}`;
}

/** Text with each [start, end) range wrapped in <mark>. */
function marked(text, ranges) {
  const parts = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(el('mark', {}, text.slice(start, end)));
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/**
 * @param {object} options
 * @param {{q, t, in, match}} options.params
 * @param {object[]} options.translations  searchable translations (localized)
 */
export function createSearchView({ params, translations, onSubmit = () => {}, onChange = () => {}, onMore = () => {} }) {
  let current = { ...params };
  const byId = new Map(translations.map((info) => [info.id, info]));

  const heading = el('h1', { class: 'view-title', id: 'search-title', tabindex: '-1' }, t('search.title'));

  const input = el('input', {
    type: 'search',
    id: 'search-input',
    name: 'q',
    class: 'search-input',
    value: params.q,
    placeholder: t('search.placeholder'),
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
  });

  const translationSelect = el(
    'select',
    { name: 't', class: 'search-select', id: 'search-translation' },
    el('option', { value: ALL_TRANSLATIONS }, t('search.allTranslations')),
    translations.map((info) => el('option', { value: info.id }, `${info.abbreviation} — ${info.name}`)),
  );

  const scopeSelect = el(
    'select',
    { name: 'in', class: 'search-select', id: 'search-scope' },
    el('option', { value: 'all' }, t('search.wholeBible')),
    ['OT', 'NT'].map((id) => el('option', { value: id }, testamentName(id))),
    ['OT', 'NT'].map((id) =>
      el(
        'optgroup',
        { label: testamentName(id) },
        booksInTestament(id).map((book) => el('option', { value: book.id }, bookName(book))),
      ),
    ),
  );

  const matchInputs = MATCH_MODES.map((mode) =>
    el('input', { type: 'radio', name: 'match', value: mode }),
  );
  const matchGroup = el(
    'fieldset',
    { class: 'search-match' },
    el('legend', { class: 'search-option-label' }, t('search.match')),
    el(
      'div',
      { class: 'segmented' },
      MATCH_MODES.map((mode, index) => el('label', { class: 'segment' }, matchInputs[index], el('span', {}, t(MATCH_LABELS[mode])))),
    ),
  );

  const form = el(
    'form',
    { class: 'search-form', role: 'search', 'aria-label': t('search.title'), novalidate: true },
    el(
      'div',
      { class: 'search-box' },
      el('label', { class: 'visually-hidden', for: 'search-input' }, t('search.label')),
      icon(ICONS.search, { size: 20, className: 'icon search-box-icon' }),
      input,
      el('button', { type: 'submit', class: 'button search-submit' }, t('search.submit')),
    ),
    el(
      'div',
      { class: 'search-options' },
      el('div', { class: 'search-option' }, el('label', { class: 'search-option-label', for: 'search-translation' }, t('search.translation')), translationSelect),
      el('div', { class: 'search-option' }, el('label', { class: 'search-option-label', for: 'search-scope' }, t('search.books')), scopeSelect),
      matchGroup,
    ),
  );

  // Announced by screen readers: progress, then the number of results.
  const status = el('p', { class: 'search-status', role: 'status', 'aria-live': 'polite' });
  const results = el('div', { class: 'search-results' });
  const element = el('div', { class: 'page search-page' }, heading, form, status, results);

  function readForm() {
    return {
      q: input.value.trim(),
      t: translationSelect.value,
      in: scopeSelect.value,
      match: matchInputs.find((radio) => radio.checked)?.value ?? 'all',
    };
  }

  function setControls(next) {
    if (document.activeElement !== input || input.value.trim() !== next.q) input.value = next.q;
    translationSelect.value = next.t;
    scopeSelect.value = next.in;
    for (const radio of matchInputs) radio.checked = radio.value === next.match;
  }
  setControls(params);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit(readForm());
  });
  for (const control of [translationSelect, scopeSelect, ...matchInputs]) {
    control.addEventListener('change', () => onChange(readForm()));
  }

  // A click anywhere on a result opens it, like its link, unless the reader
  // is selecting text to copy.
  results.addEventListener('click', (event) => {
    const hit = event.target.closest('.search-hit');
    if (!hit || event.target.closest('a, button') || String(window.getSelection?.() ?? '') !== '') return;
    const line = event.target.closest('.search-text');
    (line?.querySelector('.search-badge') ?? hit.querySelector('.search-ref'))?.click();
  });

  /* -------- results -------- */

  // Replace the results area. Unlike replaceChildren(), skips null/false
  // (an absent part), which would otherwise appear as the text "null".
  function show(...parts) {
    results.replaceChildren(...parts.flat().filter((part) => part !== null && part !== undefined && part !== false));
  }

  let state = null; // { query, total, books, loaded, multi, groups: Map<bookId, ol> }

  function hrefFor(hit, translationId) {
    return chapterHref(getBook(hit.bookId), hit.chapter, hit.verse, `t=${translationId}`);
  }

  function hitItem(hit) {
    const book = getBook(hit.bookId);
    const reference = verseReference(book, hit.chapter, hit.verse);
    return el(
      'li',
      { class: 'search-hit' },
      el('a', { class: 'search-ref', href: hrefFor(hit, hit.matches[0].translationId) }, reference),
      hit.matches.map(({ translationId, text }) => {
        const info = byId.get(translationId);
        return el(
          'p',
          { class: state.multi ? 'search-text is-labelled' : 'search-text' },
          // With several translations, each line names its own and links to it.
          state.multi &&
            el(
              'a',
              {
                class: 'search-badge',
                href: hrefFor(hit, translationId),
                'aria-label': t('search.openIn', { ref: reference, name: info?.name ?? translationId }),
              },
              info?.abbreviation ?? translationId,
            ),
          state.multi && ' ',
          el('span', { lang: info?.language || null, dir: info?.direction === 'rtl' ? 'rtl' : null }, marked(text, highlightRanges(text, state.query))),
        );
      }),
    );
  }

  function group(bookId, count) {
    const book = getBook(bookId);
    const id = `search-book-${bookId}`;
    const list = el('ol', { class: 'search-hits' });
    const section = el(
      'section',
      { class: 'search-group', 'aria-labelledby': id },
      el('h2', { class: 'search-group-title', id }, bookName(book), ' ', el('span', { class: 'search-group-count' }, t('search.verses', { n: count }))),
      list,
    );
    return { section, list };
  }

  function addHits(hits) {
    let firstLink = null;
    for (const hit of hits) {
      let target = state.groups.get(hit.bookId);
      if (!target) {
        const count = state.books.find(([id]) => id === hit.bookId)?.[1] ?? 0;
        target = group(hit.bookId, count);
        state.groups.set(hit.bookId, target);
        state.container.append(target.section);
      }
      const item = hitItem(hit);
      target.list.append(item);
      firstLink ??= item.querySelector('.search-ref');
    }
    state.loaded += hits.length;
    return firstLink;
  }

  function moreButton() {
    const left = state.total - state.loaded;
    state.more.hidden = left <= 0;
    state.more.textContent = t('search.more', { n: left });
  }

  function bookOverview(books, params) {
    if (books.length < 2) return null;
    return el(
      'nav',
      { class: 'search-books', 'aria-label': t('search.byBook') },
      el(
        'ul',
        {},
        books.map(([bookId, count]) =>
          el(
            'li',
            {},
            el(
              'a',
              { class: 'search-book', href: searchHref({ ...params, in: bookId }) },
              bookName(getBook(bookId)),
              ' ',
              el('span', { class: 'search-book-count' }, String(count)),
            ),
          ),
        ),
      ),
    );
  }

  function noResults(params, query) {
    const suggestions = [];
    const words = query.clauses.length;
    if (params.match !== 'any' && words > 1) suggestions.push([{ ...params, match: 'any' }, t('search.tryAny')]);
    if (params.in !== 'all') suggestions.push([{ ...params, in: 'all' }, t('search.tryWholeBible')]);
    if (params.t !== ALL_TRANSLATIONS && translations.length > 1) suggestions.push([{ ...params, t: ALL_TRANSLATIONS }, t('search.tryAllTranslations')]);
    const only = query.clauses[0];
    if (words === 1 && only.type === 'word' && !only.prefix && only.term.length >= 3) {
      const prefix = only.term.length > 4 ? only.term.slice(0, -1) : only.term;
      suggestions.push([{ ...params, q: `${prefix}*`, match: 'all' }, t('search.tryPrefix', { prefix })]);
    }
    // "No verses found" itself is in the status line above (main.js).
    return el(
      'div',
      { class: 'search-empty' },
      suggestions.length > 0 && [
        el('p', {}, t('search.noneHint')),
        el('ul', { class: 'search-suggestions' }, suggestions.map(([next, label]) => el('li', {}, el('a', { href: searchHref(next) }, label)))),
      ],
    );
  }

  return {
    element,
    heading,
    input,

    /** Put new parameters in the form (Back/Forward, or a link to another search). */
    setParams(next) {
      current = { ...next };
      setControls(next);
    },

    /** Progress or "Searching…" (text), or nothing. */
    setStatus(text) {
      status.textContent = text ?? '';
    },

    /** No query: show how searching works, with examples to click. */
    showTips({ bookSuggestion = null } = {}) {
      state = null;
      const example = (key, extra = {}) => {
        const q = t(key);
        return el('a', { class: 'search-example', href: searchHref({ ...current, ...extra, q }) }, el('code', {}, q));
      };
      show(
        bookSuggestion,
        el(
          'section',
          { class: 'search-tips', 'aria-labelledby': 'search-tips-title' },
          el('h2', { class: 'search-tips-title', id: 'search-tips-title' }, t('search.tipsTitle')),
          el(
            'dl',
            {},
            el('div', {}, el('dt', {}, example('search.examplePhrase')), el('dd', {}, t('search.tipPhrase'))),
            el('div', {}, el('dt', {}, example('search.exampleAll')), el('dd', {}, t('search.tipAll'))),
            el('div', {}, el('dt', {}, example('search.examplePrefix')), el('dd', {}, t('search.tipPrefix'))),
            el(
              'div',
              {},
              el('dt', {}, [example('search.exampleRef1'), ' ', example('search.exampleRef2'), ' ', example('search.exampleRef3')]),
              el('dd', {}, t('search.tipReference')),
            ),
          ),
          el('p', { class: 'search-tip-key' }, t('search.tipKey')),
        ),
      );
    },

    /**
     * Show a page of results. The first page (offset 0) replaces what was
     * there; later pages are appended. Returns the first new result's link
     * (to move focus to after "Show more").
     */
    showResults({ params, query, total, books, hits, offset, bookSuggestion = null }) {
      if (offset === 0 || !state) {
        if (total === 0) {
          state = null;
          show(bookSuggestion, noResults(params, query));
          return null;
        }
        const container = el('div', { class: 'search-groups' });
        const more = el('button', { type: 'button', class: 'button search-more', onclick: () => onMore() });
        state = { query, total, books, loaded: 0, multi: params.t === ALL_TRANSLATIONS, groups: new Map(), container, more };
        show(
          bookSuggestion,
          params.in !== 'all' && getBook(params.in)
            ? el('p', { class: 'search-scope-note' }, el('a', { href: searchHref({ ...params, in: 'all' }) }, t('search.allBooks')))
            : null,
          bookOverview(books, params),
          container,
          el('p', { class: 'search-more-row' }, more),
        );
      }
      const first = addHits(hits);
      moreButton();
      return first;
    },

    /** How many results are on screen (to restore them after Back). */
    loadedCount() {
      return state?.loaded ?? 0;
    },

    showError(error, onRetry) {
      state = null;
      show(
        el(
          'div',
          { class: 'load-error', role: 'alert' },
          el('p', {}, t('search.failed')),
          el('p', { class: 'load-error-detail' }, errorText(error)),
          el('button', { type: 'button', class: 'button', onclick: onRetry }, t('action.retry')),
        ),
      );
    },
  };
}

/** "Open the book: Romans", for a query that is just a book's name. */
export function bookSuggestionLink(book) {
  return el('p', { class: 'search-book-suggestion' }, el('a', { href: bookHref(book) }, t('search.openBook', { book: bookName(book) })));
}

/** For the summary line: "23 verses in 17 books". */
export function summaryText(total, bookCount) {
  return `${t('search.verses', { n: total })} ${t('search.inBooks', { n: bookCount })}`;
}
