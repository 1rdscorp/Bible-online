/**
 * Book list (#/) and chapter grid (#/john).
 *
 * Both are built only from canon.js, so they render instantly, before any
 * translation has downloaded. Names are in the interface language (i18n.js).
 */
import { booksInTestament, TESTAMENTS } from '../canon.js';
import { bookName, chapterTitle, t, testamentName } from '../i18n.js';
import { bookHref, chapterHref, introHref, mapHref, pageHref, PAGES } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';

/**
 * @param {{ lastRead?: { book, chapter } | null, studyCount?: number }} options
 * studyCount: highlights, notes and bookmarks saved (shows a My Study link)
 */
export function renderBookList({ lastRead = null, studyCount = 0 } = {}) {
  return el(
    'section',
    { class: 'picker', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('books.title')),
    (lastRead || studyCount > 0) &&
      el('p', { class: 'continue' }, lastRead && continueLink(lastRead), studyCount > 0 && studyLink(studyCount)),
    TESTAMENTS.map((testament) =>
      el(
        'section',
        { class: 'testament', 'aria-labelledby': `testament-${testament.id}` },
        el('h2', { class: 'testament-title', id: `testament-${testament.id}` }, testamentName(testament.id)),
        // role="list" keeps list semantics in Safari/VoiceOver, which drops
        // them when list-style is none.
        el(
          'ul',
          { class: 'book-grid', role: 'list' },
          booksInTestament(testament.id).map((book) => {
            const isLastRead = lastRead?.book.id === book.id;
            return el(
              'li',
              {},
              el(
                'a',
                {
                  class: `book-link${isLastRead ? ' is-last-read' : ''}`,
                  // A one-chapter book goes straight to the text.
                  href: book.chapters === 1 ? chapterHref(book, 1) : bookHref(book),
                },
                bookName(book),
                isLastRead && el('span', { class: 'visually-hidden' }, ` ${t('lastRead')}`),
              ),
            );
          }),
        ),
      ),
    ),
    // The study pages: quiet links under the books.
    el(
      'nav',
      { class: 'study-links', 'aria-label': t('page.studyLinks') },
      el('a', { class: 'study-link', href: pageHref(PAGES.timeline) }, icon(ICONS.timeline, { size: 18 }), t('timeline.title')),
      el('a', { class: 'study-link', href: mapHref() }, icon(ICONS.map, { size: 18 }), t('maps.title')),
    ),
  );
}

function continueLink({ book, chapter }) {
  return el(
    'a',
    { class: 'continue-link', href: chapterHref(book, chapter) },
    el('span', { class: 'continue-label' }, t('books.continue')),
    el('span', { class: 'visually-hidden' }, ': '),
    el('span', { class: 'continue-target' }, chapterTitle(book, chapter)),
  );
}

function studyLink(count) {
  return el(
    'a',
    { class: 'continue-link', href: pageHref(PAGES.study) },
    el('span', { class: 'continue-label' }, t('study.items', { n: count })),
    el('span', { class: 'visually-hidden' }, ': '),
    el('span', { class: 'continue-target' }, t('study.myStudy')),
  );
}

/** @param {object} book  a canon book; `lastRead` marks the chapter last opened */
export function renderChapterGrid(book, { lastRead = null } = {}) {
  const lastChapter = lastRead?.book.id === book.id ? lastRead.chapter : null;
  const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1);

  return el(
    'section',
    { class: 'picker', 'aria-labelledby': 'view-title' },
    el(
      'p',
      { class: 'back' },
      el('a', { class: 'back-link', href: '#/' }, el('span', { 'aria-hidden': 'true' }, '←'), t('chapters.allBooks')),
    ),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, bookName(book)),
    el('p', { class: 'view-subtitle', id: 'chapter-grid-label' }, t('chapters.choose', { n: book.chapters })),
    el('p', { class: 'intro-link' }, el('a', { class: 'study-link', href: introHref(book) }, icon(ICONS.info, { size: 18 }), t('intro.link', { book: bookName(book) }))),
    el(
      'ol',
      { class: 'chapter-grid', role: 'list', 'aria-labelledby': 'chapter-grid-label' },
      chapters.map((n) =>
        el(
          'li',
          {},
          el(
            'a',
            { class: `chapter-link${n === lastChapter ? ' is-last-read' : ''}`, href: chapterHref(book, n) },
            String(n),
            n === lastChapter && el('span', { class: 'visually-hidden' }, ` ${t('lastRead')}`),
          ),
        ),
      ),
    ),
  );
}
