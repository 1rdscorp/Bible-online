/**
 * #/<book>/intro: an introduction to one book of the Bible, from
 * data/study/books/<BOOK>.json: summary, author and date, themes, an
 * outline linked into the text, key verses (quoted in the reader's
 * translation), its places on the maps, and its events on the timeline.
 * Built from the study-page templates, like the timeline and maps.
 */
import { BOOKS, getBook } from '../canon.js';
import { bookName, chapterTitle, t, testamentName } from '../i18n.js';
import { formatRef, parseRef } from '../research/refs.js';
import { bookHref, chapterHref, introHref } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { localize, refLink } from './maps.js';
import { factList, outlineList, passageQuote, studyPage, tagList } from './templates/study-page.js';
import { placeLink, timelineHref } from './timeline.js';

const refHref = (ref) => chapterHref(getBook(ref.book), ref.chapter, ref.verse, '', ref.endChapter === ref.chapter ? ref.endVerse : null);

/**
 * @param {object} options
 * @param {object} options.book        canon book
 * @param {object|null} options.intro  its introduction, or null if it has none yet
 * @param {object|null} options.timeline
 * @param {object|null} options.places
 * @param {object[]} options.maps
 * @param {{ href: string, label: string }} options.back
 * @returns {{ element: HTMLElement, quotes: { ref, fill }[] }}
 *   `quotes`: the key verses, for the caller to fill with text once loaded
 */
export function renderBookIntro({ book, intro, timeline = null, places = null, maps = [], back }) {
  const name = bookName(book);
  const index = BOOKS.indexOf(book);
  const neighbours = el(
    'nav',
    { class: 'intro-nav', 'aria-label': t('intro.otherBooks') },
    index > 0 ? el('a', { href: introHref(BOOKS[index - 1]), rel: 'prev' }, el('span', { 'aria-hidden': 'true' }, '← '), bookName(BOOKS[index - 1])) : el('span'),
    index < BOOKS.length - 1 ? el('a', { href: introHref(BOOKS[index + 1]), rel: 'next' }, bookName(BOOKS[index + 1]), el('span', { 'aria-hidden': 'true' }, ' →')) : el('span'),
  );
  const read = el('p', { class: 'intro-read' }, el('a', { class: 'button', href: book.chapters === 1 ? chapterHref(book, 1) : bookHref(book) }, icon(ICONS.chevronRight, { size: 18 }), t('intro.read', { book: name })));

  if (!intro) {
    return {
      element: studyPage({ back, kicker: t('intro.kicker'), title: name, lead: t('intro.none'), sections: [], footer: [read, neighbours] }),
      quotes: [],
    };
  }

  const quotes = intro.keyVerses.map((text) => {
    const ref = parseRef(text);
    return { ref, ...passageQuote({ href: refHref(ref), label: formatRef(ref, chapterTitle) }) };
  });

  // Timeline events told in this book.
  const events = (timeline?.events ?? []).filter((event) => event.refs.some((text) => parseRef(text)?.book === book.id));
  const placeLinks = (intro.places ?? []).map((id) => placeLink(id, places, maps, { nameOnly: true })).filter(Boolean);

  const sections = [
    {
      id: 'intro-facts',
      title: t('intro.atAGlance'),
      content: factList([
        { label: t('intro.author'), value: localize(intro.author) },
        { label: t('intro.date'), value: localize(intro.date) },
        { label: t('intro.chapters'), value: String(book.chapters) },
        { label: t('intro.testament'), value: testamentName(book.testament) },
      ]),
    },
    { id: 'intro-themes', title: t('intro.themes'), content: tagList(intro.themes.map(localize)) },
    {
      id: 'intro-outline',
      title: t('intro.outline'),
      content: outlineList(
        intro.outline.map((part) => {
          const ref = parseRef(part.ref);
          return { href: refHref(ref), label: formatRef(ref, chapterTitle), title: localize(part) };
        }),
      ),
    },
    { id: 'intro-verses', title: t('intro.keyVerses'), content: quotes.map((quote) => quote.node) },
    placeLinks.length && { id: 'intro-places', title: t('intro.places'), content: el('ul', { class: 'place-links', role: 'list' }, placeLinks.map((link) => el('li', {}, link))) },
    events.length && {
      id: 'intro-timeline',
      title: t('intro.onTimeline'),
      content: el(
        'ol',
        { class: 'intro-events' },
        events.map((event) =>
          el('li', {}, el('span', { class: 'intro-event-date' }, localize(event.date)), ' ', el('a', { href: timelineHref(event.id) }, localize(event.title)), ' ', refLink(event.refs[0], 'intro-event-ref')),
        ),
      ),
    },
  ];

  return {
    element: studyPage({ back, kicker: t('intro.kicker'), title: name, lead: localize(intro.summary), sections, footer: [read, neighbours], className: 'intro-page' }),
    quotes,
  };
}
