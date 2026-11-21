/**
 * Chapter view (#/john/3).
 *
 * createReaderView() returns the page straight away: heading, a loading
 * line, and the previous/next links, which depend only on the canon. main.js
 * then fills in the text with showChapter() once the provider responds. The
 * user can navigate while a translation is still downloading.
 */
import { adjacentChapter, chapterTitle } from '../canon.js';
import { chapterHref } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';

export function createReaderView({ book, chapter }) {
  const title = chapterTitle(book, chapter);
  const heading = el('h1', { class: 'chapter-title', id: 'chapter-title', tabindex: '-1' }, title);
  const body = el('div', { class: 'scripture' }, status('Loading…'));
  const article = el(
    'article',
    { class: 'chapter', 'aria-labelledby': 'chapter-title', 'aria-busy': 'true' },
    el('header', { class: 'chapter-header' }, heading),
    body,
    chapterNav(book, chapter),
  );
  const element = el('div', { class: 'reader' }, article, sideNav(book, chapter));

  const done = () => article.removeAttribute('aria-busy');

  return {
    element,
    heading,

    /**
     * Render the verses. Returns the element for `verse` if it exists, so the
     * caller can scroll to it and focus it.
     */
    showChapter(data, info, { verse = null } = {}) {
      // lang/dir come from the translation, so a later non-English or
      // right-to-left translation is announced and laid out correctly.
      if (info.language) article.lang = info.language;
      article.dir = info.direction === 'rtl' ? 'rtl' : 'ltr';

      body.replaceChildren(
        ...data.verses.map((v) =>
          el(
            'p',
            { class: 'verse', id: `v${v.number}` },
            el('span', { class: 'vnum' }, String(v.number)),
            // This space separates number and text for screen readers and
            // copy/paste. The number is absolutely positioned in the margin,
            // so the space falls at the start of the line, and CSS
            // white-space rules drop it from the layout.
            ' ',
            v.text,
          ),
        ),
      );
      done();

      const target = verse ? body.querySelector(`#v${verse}`) : null;
      if (!target) return null;
      target.classList.add('is-target');
      target.tabIndex = -1;
      return target;
    },

    showMissing(info) {
      body.replaceChildren(status(`${title} isn’t included in the ${info.name}.`));
      done();
    },

    showError(error, retry) {
      body.replaceChildren(
        el(
          'div',
          { class: 'load-error', role: 'alert' },
          el('p', {}, `Sorry, ${title} couldn’t be loaded.`),
          el('p', { class: 'load-error-detail' }, error?.message ?? String(error)),
          el('button', { type: 'button', class: 'button', onclick: retry }, 'Try again'),
        ),
      );
      done();
    },
  };
}

function status(text) {
  return el('p', { class: 'status' }, text);
}

/** "Previous / Next" links under the text. Crosses book boundaries. */
function chapterNav(book, chapter) {
  const previous = adjacentChapter(book, chapter, -1);
  const next = adjacentChapter(book, chapter, 1);
  return el(
    'nav',
    { class: 'chapter-nav', 'aria-label': 'Chapter' },
    previous && navLink(previous, 'prev', 'Previous'),
    next && navLink(next, 'next', 'Next'),
  );
}

function navLink(position, direction, label) {
  return el(
    'a',
    { class: `chapter-nav-link chapter-nav-link--${direction}`, href: chapterHref(position.book, position.chapter), rel: direction },
    el('span', { class: 'chapter-nav-label' }, label),
    // Accessible name: "Previous chapter: John 2"
    el('span', { class: 'visually-hidden' }, ' chapter: '),
    el('span', { class: 'chapter-nav-target' }, chapterTitle(position.book, position.chapter)),
  );
}

/**
 * Large chevrons at the window edges, shown only on wide screens with a mouse
 * (see reader.css). They repeat the links above for mouse users, so they're
 * hidden from assistive tech and the Tab order. Keyboard users have the
 * bottom links and the ← → keys.
 */
function sideNav(book, chapter) {
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
        href: chapterHref(target.book, target.chapter),
        'aria-hidden': 'true',
        tabindex: '-1',
        title: `${label}: ${chapterTitle(target.book, target.chapter)}`,
      },
      icon(path, { size: 28 }),
    );
  });
}
