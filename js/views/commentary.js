/**
 * The commentary pages:
 *
 *   #/commentary                      the library: the books, by author
 *   #/commentary/<book>               a book's contents (?book=DAN: only its chapters on Daniel)
 *   #/commentary/<book>/<chapter>     one chapter (?v=31: open at verse 31; ?note=5: at note 5)
 *
 * The text comes from data/commentary/ (tools/build-commentary.mjs) as
 * blocks of runs: { t: "p", c: runs } paragraphs, { t: "q", lines } block
 * quotations and poetry, { t: "n", c } notes; runs are strings, links to
 * Bible passages ({ r, x }), italics ({ i }), bold ({ b }), page marks of
 * the printed book ({ pg }), note marks ({ fn }) and links within the book
 * ({ to: "appendix#note-5", x }).
 *
 * Russian: chapters translated for the site (data/commentary/ru/, an AI
 * translation, said so on the page) open in Russian in the Russian
 * interface, with a switch to the English original (?lang=en / ?lang=ru).
 * Their references have no printed text ({ r } only), so they're labelled
 * with Russian book names. Each Ellen White chapter also links to the
 * official Russian edition in EGW Writings. Text is marked with its
 * language (lang="en" / "ru") for screen readers.
 */
import { getBook } from '../canon.js';
import { bookName, chapterTitle, getLanguage, t } from '../i18n.js';
import ruLocale from '../locales/ru.js';
import { neighbours, parsePassage, passageLabel, refCovers } from '../research/commentary.js';
import { chapterHref, commentaryHref } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { linkCards, studyPage } from './templates/study-page.js';

const names = { bookName, chapterTitle };
// Russian book names whatever the interface language, for Russian text.
const russianNames = {
  bookName: (book) => ruLocale.books[book.id] ?? book.name,
  chapterTitle: (book, chapter) => `${book.id === 'PSA' ? ruLocale.psalm : ruLocale.books[book.id]} ${chapter}`,
};

/** A passage label in the interface language: "Luke 2:1–20", "Genesis 39–41". */
export const passageText = (passage) => passageLabel(passage, names);

/** Is the interface in Russian? */
const russianInterface = () => getLanguage() === 'ru';

/** A chapter's title to show: our Russian title in the Russian interface, when it's translated. */
export function localTitle(part) {
  return russianInterface() && part.ru ? part.ru.title : part.title;
}

/** The language of localTitle(part). */
export const titleLang = (part) => (russianInterface() && part.ru ? 'ru' : 'en');

/** A passage as a link into the reader (verses highlighted when it's part of a chapter). */
export function passageLink(passage, { className = 'commentary-passage', label = null } = {}) {
  const ref = parsePassage(passage);
  if (!ref) return passage;
  const book = getBook(ref.book);
  const href = ref.whole ? chapterHref(book, ref.chapter) : chapterHref(book, ref.chapter, ref.verse, '', ref.endChapter === ref.chapter ? ref.endVerse : null);
  return el('a', { class: className, href }, label ?? passageText(passage));
}

/** A book's title in the interface language (the text itself stays English). */
export function workTitle(work) {
  const key = `commentary.work.${work.id}`;
  const local = t(key);
  return local === key ? work.title : local;
}

/** The author's name in the interface language ("Эллен Г. Уайт"). */
export function authorName(work) {
  const key = `commentary.author.${work.author.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  const local = t(key);
  return local === key ? work.author : local;
}

const workAbout = (work) => {
  const key = `commentary.about.${work.id}`;
  const text = t(key);
  return text === key ? '' : text;
};

/** "4. Unto You a Saviour" (in Russian when translated and the interface is Russian); introductions and the appendix have no number. */
export function partLabel(part) {
  const title = localTitle(part);
  return /^\d+$/.test(part.id) ? `${part.id}. ${title}` : title;
}

/** Facts about a book: "First published 1898 · The Conflict of the Ages, volume 3". */
function workFacts(work) {
  const facts = [t('commentary.published', { year: work.year })];
  if (work.series === 'conflict') facts.push(t('commentary.series', { n: work.volume }));
  if (work.edition) facts.push(t('commentary.edition', { edition: work.edition }));
  return facts.join(' · ');
}

/** The book's chapters, not counting introductions and appendices. */
const chapterCount = (work) => work.parts.filter((part) => /^\d+$/.test(part.id) || part.chapter).length;

/** How many of a book's parts are translated into Russian. */
export const translatedCount = (work) => work.parts.filter((part) => part.ru).length;

function workCard(work) {
  const linked = chapterCount(work);
  const ru = translatedCount(work);
  return {
    href: commentaryHref(work.id),
    title: workTitle(work),
    text: [workAbout(work), [work.year, t('commentary.chapterCount', { n: linked }), ru ? t('commentary.translatedCount', { n: ru, total: work.parts.length }) : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' '),
    icon: icon(ICONS.commentary, { size: 22, className: 'icon link-card-icon' }),
  };
}

/** #/commentary: the books, grouped by author, and where they come from. */
export function renderCommentaryLibrary({ index }) {
  const white = index.works.filter((work) => work.author === 'Ellen G. White');
  const others = index.works.filter((work) => work.author !== 'Ellen G. White');
  const about = [
    t('commentary.aboutPublicDomain'),
    t('commentary.aboutSdabc'),
    t('commentary.aboutLanguage'),
  ].filter(Boolean);
  return studyPage({
    kicker: t('page.study'),
    title: t('commentary.title'),
    lead: t('commentary.intro'),
    className: 'commentary-page',
    sections: [
      white.length && { id: 'commentary-white', title: t('commentary.whiteGroup'), content: linkCards(white.map(workCard)) },
      others.length && { id: 'commentary-other', title: t('commentary.otherGroup'), content: linkCards(others.map(workCard)) },
      { id: 'commentary-about', title: t('commentary.aboutTitle'), content: about.map((text) => el('p', { class: 'commentary-about-text' }, text)) },
    ],
  });
}

/** Does a part discuss this Bible book? */
const partOnBook = (part, bookId) => part.passages.some((passage) => parsePassage(passage)?.book === bookId);

/**
 * #/commentary/<book>: its chapters, grouped by the book's own sections (or,
 * for a verse-by-verse commentary, by Bible book), each with the passages it's
 * based on. `bookId` limits it to the chapters on one Bible book.
 */
export function renderCommentaryWork({ work, bookId = null }) {
  const filterBook = bookId ? getBook(bookId) : null;
  const parts = filterBook ? work.parts.filter((part) => partOnBook(part, filterBook.id)) : work.parts;
  // Groups: consecutive parts with the same section (or Bible book, for verse-by-verse books).
  const groups = [];
  for (const part of parts) {
    const local = russianInterface() && part.ru?.section;
    const name = work.kind === 'verses' ? bookName(getBook(part.book)) : (local || part.section) ?? '';
    if (!groups.length || groups.at(-1).name !== name) groups.push({ name, lang: work.kind === 'verses' ? null : local ? 'ru' : 'en', parts: [] });
    groups.at(-1).parts.push(part);
  }
  const list = (items) =>
    el(
      'ol',
      { class: 'commentary-contents', role: 'list' },
      items.map((part) =>
        el(
          'li',
          {},
          el('a', { class: 'commentary-contents-link', href: commentaryHref(work.id, part.id) }, el('span', { lang: titleLang(part) }, partLabel(part))),
          part.passages.length ? el('span', { class: 'commentary-contents-passages' }, part.passages.map(passageText).join('; ')) : '',
          // In the English interface, a quiet mark on the chapters that can be read in Russian.
          part.ru && !russianInterface() ? el('span', { class: 'commentary-ru-badge', title: t('commentary.inRussian') }, 'RU') : '',
        ),
      ),
    );
  const content = groups.map((group) =>
    group.name && groups.length > 1
      ? el('section', { class: 'commentary-group' }, el('h3', { lang: group.lang }, group.name), list(group.parts))
      : list(group.parts),
  );
  const filterNote = filterBook
    ? el('p', { class: 'commentary-filter' }, t('commentary.onBook', { book: bookName(filterBook) }), ' · ', el('a', { href: commentaryHref(work.id) }, t('commentary.showAll')))
    : '';
  const ru = translatedCount(work);
  const russian = [
    ru ? el('p', { class: 'commentary-ru-note' }, `${t('commentary.translatedCount', { n: ru, total: work.parts.length })}. ${t('commentary.aiNotice')}`) : '',
    work.ruEdition
      ? el('p', { class: 'commentary-ru-note' }, `${t('commentary.officialRu')} `, el('a', { href: work.ruEdition.url, rel: 'noopener', target: '_blank', lang: 'ru' }, `«${work.ruEdition.title}»`), ` (${work.ruEdition.source})`)
      : '',
  ];
  return studyPage({
    back: { href: commentaryHref(), label: t('commentary.back') },
    kicker: authorName(work),
    title: workTitle(work),
    lead: [workAbout(work), workFacts(work)].filter(Boolean).join(' '),
    className: 'commentary-page',
    sections: [{ id: 'commentary-contents', title: t('commentary.contents'), content: [...russian, filterNote, ...content] }],
    footer: sourceLine(work),
  });
}

function sourceLine(work) {
  return el(
    'p',
    { class: 'commentary-source' },
    `${t('commentary.publicDomain')} ${t('commentary.source')} `,
    el('a', { href: work.source.url, rel: 'noopener', target: '_blank' }, work.source.name),
    '.',
  );
}

/* ------------------------------------------------------------------ */
/* One chapter                                                         */
/* ------------------------------------------------------------------ */

/**
 * Runs as DOM nodes. `noteId(n)`: the id of the note a note mark ({ fn })
 * jumps to. `lang`: the text's language; a reference without its printed
 * text ({ r } in a translation) is labelled in it.
 */
export function renderRuns(runs, { workId, noteId = (n) => `commentary-note-${n}`, lang = 'en' } = {}) {
  return runs.map((run) => {
    if (typeof run === 'string') return run;
    if (run.r) return passageLink(run.r, { className: 'commentary-ref', label: run.x ?? passageLabel(run.r, lang === 'ru' ? russianNames : names) });
    if (run.to) {
      const [partId, anchor] = run.to.split('#');
      const note = /^note-(\d+)$/.exec(anchor ?? '')?.[1];
      return el('a', { class: 'commentary-xlink', href: commentaryHref(workId, partId, note ? `note=${note}` : '') }, run.x);
    }
    if (run.i !== undefined) return el('em', {}, run.i);
    if (run.b !== undefined) return el('strong', { class: 'commentary-side-head' }, run.b);
    if (run.pg !== undefined) {
      // The printed book's page number, for citing ("DA 44"): quiet, in the
      // margin, and not read out mid-sentence (the page range is in the heading).
      return el('span', { class: 'page-mark', 'aria-hidden': 'true', 'data-page': String(run.pg), title: t('commentary.page', { n: run.pg }) }, String(run.pg));
    }
    if (run.fn !== undefined) {
      return el('a', { class: 'note-mark', href: `#${noteId(run.fn)}`, 'data-jump': noteId(run.fn), 'aria-label': t('commentary.noteRef', { n: run.fn }) }, el('sup', {}, String(run.fn)));
    }
    return '';
  });
}

/** Blocks as DOM nodes. */
export function renderBlocks(blocks, options) {
  return blocks.map((block) => {
    if (block.t === 'q') {
      return el('blockquote', { class: 'commentary-quote' }, block.lines.map((line) => el('p', {}, renderRuns(line, options))));
    }
    if (block.t === 'n') {
      return el('p', { class: 'commentary-footnote' }, el('span', { class: 'commentary-footnote-label' }, `${t('commentary.note')}: `), renderRuns(block.c, options));
    }
    return el('p', { id: block.id ?? null, class: block.id ? 'commentary-anchor' : null, tabindex: block.id ? '-1' : null }, renderRuns(block.c, options));
  });
}

/** "Verse 31" / "Verses 31–35" for a section's reference. */
function versesLabel(ref) {
  const parsed = parsePassage(ref);
  return parsed.endVerse > parsed.verse ? t('commentary.verses', { from: parsed.verse, to: parsed.endVerse }) : t('commentary.verse', { n: parsed.verse });
}

/** The verses a section of a verse-by-verse commentary is on: in the KJV, or the Synodal for the Russian. */
function quoteBlock(section, lang) {
  return el(
    'blockquote',
    { class: 'commentary-scripture' },
    el(
      'p',
      {},
      section.quote.flatMap(([verse, text], index) => [index ? ' ' : '', el('sup', { class: 'verse-num' }, String(verse)), ' ', text]),
    ),
    el('footer', {}, passageLink(section.ref, { label: `${passageText(section.ref)} (${t(lang === 'ru' ? 'commentary.synodal' : 'commentary.kjv')})` })),
  );
}

/** "«Желание веков», глава 4: «Вам родился Спаситель»": the chapter in the official Russian edition, as a link. */
function officialLink(work, part) {
  if (!work.ruEdition || !part.ruEdition) return null;
  const { para, title } = part.ruEdition;
  const label = /^\d+$/.test(part.id) ? t('commentary.officialChapter', { book: work.ruEdition.title, n: part.id, title }) : t('commentary.officialPart', { book: work.ruEdition.title, title });
  return el(
    'p',
    { class: 'commentary-official' },
    `${t('commentary.officialRu')} `,
    el('a', { href: `${work.ruEdition.url}.${para}`, rel: 'noopener', target: '_blank', lang: 'ru' }, label),
    ` (${work.ruEdition.source})`,
  );
}

/**
 * The language switch of a translated chapter: links to it in Russian and
 * in English (the choice is in the URL, ?lang=, and carried to the next chapter).
 */
function languageSwitch(work, part, lang) {
  const option = (code, label) =>
    el(
      'a',
      { class: 'commentary-lang-option', href: commentaryHref(work.id, part.id, `lang=${code}`), lang: code, 'aria-current': code === lang ? 'true' : null },
      label,
    );
  return el('nav', { class: 'commentary-lang', 'aria-label': t('commentary.langSwitch') }, option('ru', 'Русский'), option('en', 'English'));
}

/**
 * #/commentary/<book>/<chapter>. Returns { element, target } where target is
 * the element to scroll to for ?v=, ?note= or ?p= (a printed page), if any.
 */
export function renderCommentaryPart({ work, part, data, verse = null, note = null, page = null, keepLang = null }) {
  const lang = data.lang ?? 'en';
  const options = { workId: work.id, lang };
  let target = null;
  const sections = data.sections.map((section, index) => {
    const body = renderBlocks(section.blocks, options);
    if (!section.ref) return el('div', { class: 'commentary-section' }, body);
    const id = `commentary-section-${index}`;
    const node = el(
      'section',
      { class: 'commentary-section commentary-verses', 'aria-labelledby': id },
      el('h2', { class: 'commentary-verses-title', id, tabindex: '-1' }, versesLabel(section.ref)),
      quoteBlock(section, lang),
      body,
    );
    const ref = parsePassage(section.ref);
    if (verse !== null && !target && refCovers(ref, ref.book, ref.chapter, verse)) target = node.querySelector('h2');
    return node;
  });
  const notes = data.notes?.length
    ? el(
        'aside',
        { class: 'commentary-notes', 'aria-labelledby': 'commentary-notes-title' },
        el('h2', { id: 'commentary-notes-title' }, t('commentary.notes')),
        el('ol', {}, data.notes.map((item) => el('li', { id: `commentary-note-${item.n}`, tabindex: '-1', lang }, renderRuns(item.c, options)))),
      )
    : '';
  const { prev, next } = neighbours(work, part.id);
  // A language chosen on the switch carries on to the next chapter.
  const query = keepLang ? `lang=${keepLang}` : '';
  const nav = el(
    'nav',
    { class: 'commentary-nav', 'aria-label': t('commentary.contents') },
    prev ? el('a', { class: 'commentary-nav-prev', href: commentaryHref(work.id, prev.id, query), rel: 'prev' }, el('span', { class: 'commentary-nav-label' }, `← ${t('commentary.prev')}`), el('span', { lang: titleLang(prev) }, partLabel(prev))) : el('span'),
    next ? el('a', { class: 'commentary-nav-next', href: commentaryHref(work.id, next.id, query), rel: 'next' }, el('span', { class: 'commentary-nav-label' }, `${t('commentary.next')} →`), el('span', { lang: titleLang(next) }, partLabel(next))) : el('span'),
  );
  const meta = [];
  if (part.passages.length) meta.push(el('span', {}, `${t('commentary.basedOn')} `, part.passages.flatMap((passage, i) => [i ? '; ' : '', passageLink(passage)])));
  if (data.pages) meta.push(el('span', {}, t('commentary.pageRange', { from: data.pages[0], to: data.pages[1] })));
  // About the language: the AI translation note, or (Russian interface, English
  // text) that it's English; and the official Russian edition, where there is one.
  const languageNote = lang === 'ru' ? t('commentary.aiNotice') : part.ru ? '' : t('commentary.englishOnly');
  const element = el(
    'article',
    { class: 'page commentary-reading', 'aria-labelledby': 'view-title' },
    el('p', { class: 'back' }, el('a', { class: 'back-link', href: commentaryHref(work.id) }, el('span', { 'aria-hidden': 'true' }, '←'), workTitle(work))),
    el('p', { class: 'study-kicker' }, /^\d+$/.test(part.id) ? `${authorName(work)} · ${t('commentary.chapterN', { n: part.id })}` : authorName(work)),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1', lang }, data.title),
    meta.length ? el('p', { class: 'commentary-meta' }, meta.flatMap((item, i) => [i ? ' · ' : '', item])) : '',
    part.ru ? languageSwitch(work, part, lang) : '',
    languageNote ? el('p', { class: 'commentary-language' }, languageNote) : '',
    officialLink(work, part) ?? '',
    el('div', { class: 'commentary-text', lang }, sections),
    notes,
    nav,
    el('footer', { class: 'study-footer' }, sourceLine(work)),
  );
  if (note !== null) target = element.querySelector(`#note-${CSS.escape(String(note))}`) ?? target;
  // A printed page: the paragraph where it begins, or where the last page
  // before it does (a page of pictures has no mark). The chapter's first
  // page has none either: that stays at the top.
  const mark =
    page === null
      ? null
      : [...element.querySelectorAll('.page-mark[data-page]')].filter((node) => Number(node.dataset.page) <= page).at(-1) ?? null;
  const block = mark?.closest('p, li, blockquote');
  if (block) {
    block.classList.add('commentary-page-target');
    block.tabIndex = -1;
    target = block;
  }
  return { element, target };
}

/**
 * Under a Bible chapter: links to the commentary on it, a line per book
 * ("The Desire of Ages: 4. Unto You a Saviour · 5. The Dedication").
 * `found`: partsFor(index, book, chapter).
 */
export function chapterCommentaryLinks(found, { book, chapter }) {
  if (!found.length) return null;
  const byWork = new Map();
  for (const { work, part } of found) {
    if (!byWork.has(work.id)) byWork.set(work.id, { work, parts: [] });
    byWork.get(work.id).parts.push(part);
  }
  return el(
    'nav',
    { class: 'chapter-commentary', 'aria-label': t('commentary.onChapterLabel', { chapter: chapterTitle(book, chapter) }) },
    el('h2', { class: 'chapter-commentary-title' }, icon(ICONS.commentary, { size: 16 }), t('commentary.onChapter')),
    el(
      'ul',
      { role: 'list' },
      [...byWork.values()].map(({ work, parts }) =>
        el(
          'li',
          {},
          el('span', { class: 'chapter-commentary-work' }, `${workTitle(work)}: `),
          parts.flatMap((part, i) => [
            i ? el('span', { class: 'chapter-commentary-sep', 'aria-hidden': 'true' }, ' · ') : '',
            el('a', { class: 'chapter-commentary-link', href: commentaryHref(work.id, part.id), lang: titleLang(part) }, partLabel(part)),
          ]),
        ),
      ),
    ),
  );
}
