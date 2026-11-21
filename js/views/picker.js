/**
 * Book list (#/) and chapter grid (#/john).
 *
 * Both are built only from canon.js, so they render instantly, before any
 * translation has downloaded. Names are in the interface language (i18n.js).
 */
import { booksInTestament, TESTAMENTS } from '../canon.js';
import { bookName, chapterTitle, t, testamentName } from '../i18n.js';
import { bookHref, chapterHref } from '../router.js';
import { el } from '../ui/dom.js';

/** @param {{ lastRead?: { book, chapter } | null }} options */
export function renderBookList({ lastRead = null } = {}) {
  return el(
    'section',
    { class: 'picker', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('books.title')),
    lastRead && continueLink(lastRead),
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
  );
}

function continueLink({ book, chapter }) {
  return el(
    'p',
    { class: 'continue' },
    el(
      'a',
      { class: 'continue-link', href: chapterHref(book, chapter) },
      el('span', { class: 'continue-label' }, t('books.continue')),
      el('span', { class: 'visually-hidden' }, ': '),
      el('span', { class: 'continue-target' }, chapterTitle(book, chapter)),
    ),
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
