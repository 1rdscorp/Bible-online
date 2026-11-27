/**
 * The Research panel: cross references for the selected verses, the
 * Adventist commentary on them, the topics that cite them (Torrey's New
 * Topical Textbook), and word study (Strong's numbers) for the words of KJV+.
 *
 * It shares the side-panel place with Notes (side-panels.js): docked on the
 * right on wide screens, so the chapter stays in view while researching; a
 * sheet from the bottom on phones. It's a non-modal dialog with four tabs
 * (WAI-ARIA tabs: ←/→ move between them). Following a reference opens that
 * passage in the reader and leaves the panel as it was, so the list stays
 * at hand.
 *
 * Opened from the verse action bar ("Research") or by tapping a word in KJV+.
 */
import { getBook } from '../canon.js';
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { errorText } from '../offline.js';
import { blocksText, partsFor, sectionsFor } from '../research/commentary.js';
import { formatRef, refChapters } from '../research/refs.js';
import { topicsForVerse } from '../research/topics.js';
import { linkStrongs, scriptRuns, strongsLanguage } from '../research/strongs.js';
import { chapterHref, commentaryHref, topicHref } from '../router.js';
import { partLabel, passageText as commentaryPassage, titleLang, workTitle } from '../views/commentary.js';
import { statementText, topicTitle } from '../views/topics.js';
import { truncate, verseRangeLabel } from '../translate/text.js';
import { el, icon, ICONS } from './dom.js';
import { registerSidePanel } from './side-panels.js';

const XREF_SHOWN = 8; // per verse, before "Show all"
const CONCORDANCE_PAGE = 25;
const RENDERINGS_SHOWN = 8;
const COMMENTARY_EXCERPT = 360; // characters of each commentary shown in the panel
const TAB_ORDER = ['xref', 'commentary', 'topics', 'words'];
const TOPIC_STATEMENTS_SHOWN = 3; // per topic, before "and N more"

/**
 * @param {object} options
 * @param {object} options.data                 js/research/data.js
 * @param {(id: string) => Promise<object>} options.getProvider
 * @param {(request: object) => Promise<object>} options.concordance  the search worker's Strong's lookup
 * @param {() => Promise<object|null>} options.strongsTranslation       KJV+'s translations.json entry
 * @param {(book, chapter, verse) => string} options.strongsHref       this passage, opened in KJV+
 */
export function initResearchPanel({ data, getProvider, concordance, strongsTranslation, strongsHref }) {
  let context = null; // the chapter on screen: { book, chapter, columns, query }
  let tab = 'xref';
  let subject = null; // cross references for: { book, chapter, verses: number[] }
  let wordVerse = null; // word study for: { book, chapter, verse, words: [{ text, strongs }] }
  let entry = null; // the Strong's entry shown: { number, word, numbers }
  const history = []; // entries visited before this one (Back)
  let returnFocus = null;
  let renderId = 0; // async renders check it, so a newer one wins

  const heading = el('h2', { class: 'research-title', id: 'research-title', tabindex: '-1' });
  const closeButton = el('button', { type: 'button', class: 'icon-button research-close', onclick: () => close() }, icon(ICONS.close, { size: 18 }));
  const tabButton = (name) => el('button', { type: 'button', role: 'tab', id: `research-tab-${name}`, 'aria-controls': `research-${name}`, class: 'research-tab' });
  const tabPane = (name) => el('div', { class: 'research-pane', role: 'tabpanel', id: `research-${name}`, 'aria-labelledby': `research-tab-${name}`, tabindex: '0' });
  const tabs = Object.fromEntries(TAB_ORDER.map((name) => [name, tabButton(name)]));
  const tabList = el('div', { class: 'research-tabs', role: 'tablist' }, TAB_ORDER.map((name) => tabs[name]));
  const panes = Object.fromEntries(TAB_ORDER.map((name) => [name, tabPane(name)]));
  const panel = el(
    'div',
    { class: 'side-panel research-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'research-title', hidden: true },
    el('div', { class: 'research-head' }, heading, closeButton),
    tabList,
    TAB_ORDER.map((name) => panes[name]),
  );
  document.body.append(panel);
  const dock = registerSidePanel({ isOpen: () => !panel.hidden, close: (options) => close(options) });

  for (const [name, button] of Object.entries(tabs)) button.addEventListener('click', () => selectTab(name));
  tabList.addEventListener('keydown', (event) => {
    // From the tab that has focus (normally the selected one).
    const focused = TAB_ORDER.find((name) => tabs[name] === document.activeElement) ?? tab;
    const index = TAB_ORDER.indexOf(focused);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TAB_ORDER.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(TAB_ORDER[(next + TAB_ORDER.length) % TAB_ORDER.length]);
    tabs[tab].focus();
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  /* -------- chrome -------- */

  function renderChrome() {
    heading.textContent = t('research.title');
    closeButton.setAttribute('aria-label', t('research.close'));
    tabs.xref.textContent = t('research.xrefTab');
    tabs.commentary.textContent = t('research.commentaryTab');
    tabs.topics.textContent = t('research.topicsTab');
    tabs.words.textContent = t('research.wordsTab');
    for (const [name, button] of Object.entries(tabs)) {
      const on = name === tab;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      panes[name].hidden = !on;
    }
  }

  function selectTab(name) {
    tab = name;
    renderChrome();
    render();
  }

  function render() {
    if (tab === 'xref') renderXref();
    else if (tab === 'commentary') renderCommentary();
    else if (tab === 'topics') renderTopics();
    else renderWords();
  }

  const refLabel = (ref) => formatRef(ref, chapterTitle);
  const passageHref = (ref) =>
    chapterHref(getBook(ref.book), ref.chapter, ref.verse, context?.query ?? '', ref.endChapter === ref.chapter ? ref.endVerse : null);
  const note = (text) => el('p', { class: 'research-note' }, text);
  const attribution = (key, name, url, license) =>
    el('p', { class: 'research-source' }, t(key), ' ', el('a', { href: url, rel: 'noopener', target: '_blank' }, name), `, ${license}.`);

  /* -------- cross references -------- */

  /** Translations to quote the referenced verses from: the first one on screen, then the KJV. */
  function previewSources() {
    const ids = [context?.columns?.[0]?.id, 'kjv'].filter(Boolean);
    return [...new Set(ids)];
  }

  /** The text of a reference, from the first translation that has it. */
  async function passageText(ref) {
    for (const id of previewSources()) {
      try {
        const provider = await getProvider(id);
        const parts = [];
        for (const { chapter, from, to } of refChapters(ref)) {
          const data = await provider.getChapter(ref.book, chapter);
          if (!data) break;
          for (const verse of data.verses) if (verse.number >= from && verse.number <= to) parts.push(verse.text);
        }
        if (parts.length) return { text: parts.join(' '), info: provider.info };
      } catch {
        // try the next translation
      }
    }
    return null;
  }

  function xrefItem({ target }) {
    const text = el('p', { class: 'xref-text' });
    passageText(target).then((found) => {
      if (!found) return;
      text.textContent = truncate(found.text, 220);
      if (found.info.language) text.lang = found.info.language;
    });
    return el('li', { class: 'xref-item' }, el('a', { class: 'xref-ref', href: passageHref(target) }, refLabel(target)), text);
  }

  async function renderXref() {
    const id = ++renderId;
    if (!subject) {
      panes.xref.replaceChildren(note(t('research.xrefHint')));
      return;
    }
    const { book, chapter, verses } = subject;
    const title = el('h3', { class: 'research-subject' }, t('research.xrefFor', { ref: `${chapterTitle(book, chapter)}:${verseRangeLabel(verses)}` }));
    panes.xref.replaceChildren(title, note(t('research.loading')));
    let lists;
    try {
      lists = await Promise.all(verses.map((verse) => data.crossReferences(book.id, chapter, verse)));
    } catch (error) {
      if (id === renderId) panes.xref.replaceChildren(title, failure(error, renderXref));
      return;
    }
    if (id !== renderId) return;

    const groups = verses.map((verse, index) => {
      const refs = lists[index];
      const group = el('section', { class: 'xref-group' });
      if (verses.length > 1) group.append(el('h4', { class: 'xref-verse' }, t('study.verse', { n: verse })));
      if (refs.length === 0) {
        group.append(note(t('research.xrefNone')));
        return group;
      }
      const list = el('ol', { class: 'xref-list' }, refs.slice(0, XREF_SHOWN).map(xrefItem));
      group.append(list);
      if (refs.length > XREF_SHOWN) {
        const more = el('button', { type: 'button', class: 'text-button research-more' }, t('research.showAll', { n: refs.length }));
        more.addEventListener('click', () => {
          list.append(...refs.slice(XREF_SHOWN).map(xrefItem));
          more.remove();
          list.children[XREF_SHOWN]?.querySelector('a')?.focus();
        });
        group.append(more);
      }
      return group;
    });
    panes.xref.replaceChildren(
      title,
      ...groups,
      attribution('research.xrefSource', 'OpenBible.info', 'https://www.openbible.info/labs/cross-references/', 'CC BY'),
    );
  }

  /* -------- topics -------- */

  /** The topics whose statements cite the selected verses, each with those statements. */
  async function renderTopics() {
    const id = ++renderId;
    if (!subject) {
      panes.topics.replaceChildren(note(t('research.topicsHint')));
      return;
    }
    const { book, chapter, verses } = subject;
    const title = el('h3', { class: 'research-subject' }, t('research.topicsFor', { ref: `${chapterTitle(book, chapter)}:${verseRangeLabel(verses)}` }));
    panes.topics.replaceChildren(title, note(t('research.loading')));
    let index;
    let byTopic;
    try {
      const [topicIndex, refs] = await Promise.all([data.topicsIndex(), data.topicRefs()]);
      index = topicIndex;
      // Statements on any of the verses, grouped by topic.
      byTopic = new Map();
      for (const verse of verses) {
        for (const { topic, line } of topicsForVerse(refs, book.id, chapter, verse)) {
          if (!byTopic.has(topic)) byTopic.set(topic, new Set());
          byTopic.get(topic).add(line);
        }
      }
    } catch (error) {
      if (id === renderId) panes.topics.replaceChildren(title, failure(error, renderTopics));
      return;
    }
    if (id !== renderId) return;
    const footer = el('p', { class: 'research-source' }, `${t('research.topicsSource')} `, el('a', { href: topicHref() }, t('topics.title')), '.');
    if (!byTopic.size) {
      panes.topics.replaceChildren(title, note(t('research.topicsNone')), footer);
      return;
    }
    const items = [...byTopic].map(([topicIndex, lines]) => topicItem(index.topics[topicIndex], [...lines].sort((a, b) => a - b), id));
    panes.topics.replaceChildren(title, el('ul', { class: 'topic-results', role: 'list' }, items), footer);
  }

  function topicItem(entry, lines, id) {
    const statements = el('ul', { class: 'topic-result-lines', role: 'list' });
    // The statements' words come from the topic's own file.
    data.topic(entry.id).then((topic) => {
      if (id !== renderId) return;
      const shown = lines.slice(0, TOPIC_STATEMENTS_SHOWN);
      const items = shown.map((line) => {
        const { text, lang } = topic.lines[line] ? statementText(topic.lines[line]) : { text: '', lang: null };
        return el('li', {}, el('a', { href: topicHref(entry.id, `s=${line}`), lang }, text));
      });
      if (lines.length > shown.length) items.push(el('li', { class: 'topic-result-more' }, t('research.topicsMore', { n: lines.length - shown.length })));
      statements.replaceChildren(...items);
    }, () => {});
    return el('li', { class: 'topic-result' }, el('a', { class: 'topic-result-title', href: topicHref(entry.id, `s=${lines[0]}`) }, topicTitle(entry)), statements);
  }

  /* -------- commentary -------- */

  /**
   * The commentary on the selected verses: for a verse-by-verse book
   * (a verse-by-verse commentary), the sections on them, quoted in part; for the chapter-by-chapter
   * books (Ellen White), the chapters that tell the passage, with their
   * opening lines.
   */
  async function renderCommentary() {
    const id = ++renderId;
    if (!subject) {
      panes.commentary.replaceChildren(note(t('research.commentaryHint')));
      return;
    }
    const { book, chapter, verses } = subject;
    const title = el('h3', { class: 'research-subject' }, t('research.commentaryFor', { ref: `${chapterTitle(book, chapter)}:${verseRangeLabel(verses)}` }));
    panes.commentary.replaceChildren(title, note(t('research.loading')));
    let index;
    try {
      index = await data.commentary();
    } catch (error) {
      if (id === renderId) panes.commentary.replaceChildren(title, failure(error, renderCommentary));
      return;
    }
    if (id !== renderId) return;
    // Every part on any of the verses, once each.
    const seen = new Set();
    const found = verses.flatMap((verse) => partsFor(index, book.id, chapter, verse)).filter(({ work, part }) => {
      const key = `${work.id}/${part.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const footer = el(
      'p',
      { class: 'research-source' },
      `${t('research.commentarySource')} `,
      el('a', { href: commentaryHref() }, t('research.commentaryLibrary')),
    );
    if (!found.length) {
      panes.commentary.replaceChildren(title, note(t('research.commentaryNone')), footer);
      return;
    }
    panes.commentary.replaceChildren(title, el('ul', { class: 'commentary-results', role: 'list' }, found.map(({ work, part }) => commentaryItem(work, part, verses, id))), footer);
  }

  function commentaryItem(work, part, verses, id) {
    const { book, chapter } = subject;
    // In the Russian interface, a translated chapter is quoted in Russian.
    const lang = getLanguage() === 'ru' && part.ru ? 'ru' : 'en';
    const excerpt = el('div', { class: 'commentary-result-text', lang });
    const verse = verses[0];
    const href = commentaryHref(work.id, part.id, work.kind === 'verses' ? `v=${verse}` : '');
    const item = el(
      'li',
      { class: 'commentary-result' },
      el('p', { class: 'commentary-result-work' }, workTitle(work), part.passages.length ? ` · ${part.passages.map(commentaryPassage).join('; ')}` : ''),
      el('a', { class: 'commentary-result-title', href }, el('span', { lang: titleLang(part) }, partLabel(part))),
      excerpt,
    );
    data
      .commentaryPart(work.id, part.id, lang)
      .then((partData) => {
        if (id !== renderId || !partData) return;
        if (work.kind === 'verses') {
          // The sections on the chosen verses, each with its opening lines.
          const sections = [...new Set(verses.flatMap((v) => sectionsFor(partData, book.id, chapter, v)))];
          excerpt.replaceChildren(
            ...sections.map((section, i) =>
              el(
                'div',
                { class: 'commentary-result-section' },
                el('p', { class: 'commentary-result-verses' }, commentaryPassage(section.ref)),
                el('p', {}, blocksText(section.blocks, COMMENTARY_EXCERPT)),
                i === sections.length - 1
                  ? el('a', { class: 'text-button research-more', href: commentaryHref(work.id, part.id, `v=${parseVerse(section.ref)}`) }, t('research.commentaryRead'))
                  : '',
              ),
            ),
          );
        } else {
          const first = partData.sections[0]?.blocks ?? [];
          excerpt.replaceChildren(el('p', {}, blocksText(first.slice(0, 2), COMMENTARY_EXCERPT)), el('a', { class: 'text-button research-more', href }, t('research.commentaryChapter')));
        }
      })
      .catch(() => {
        // The excerpt is extra: without it the link to the chapter still works.
      });
    return item;
  }

  /** The first verse of a reference ("DAN 2:31-35" → 31). */
  const parseVerse = (ref) => Number(/:(\d+)/.exec(ref)?.[1] ?? 1);

  /* -------- word study -------- */

  function failure(error, retry) {
    return el(
      'div',
      { class: 'research-error', role: 'alert' },
      el('p', {}, t('research.loadFailed')),
      el('p', { class: 'research-error-detail' }, errorText(error)),
      el('button', { type: 'button', class: 'button', onclick: () => retry() }, t('action.retry')),
    );
  }

  const strongsShown = () => (context?.columns ?? []).some((info) => info.strongs);

  function renderWords() {
    if (entry) {
      renderEntry();
      return;
    }
    ++renderId;
    if (wordVerse?.words.length) {
      const { book, chapter, verse, words } = wordVerse;
      panes.words.replaceChildren(
        el('h3', { class: 'research-subject' }, t('research.wordsIn', { ref: `${chapterTitle(book, chapter)}:${verse}` })),
        note(t('research.pickWord')),
        el(
          'ul',
          { class: 'word-list' },
          words.map((word) =>
            el(
              'li',
              {},
              el(
                'button',
                { type: 'button', class: 'word-pick', onclick: () => openEntry({ number: word.strongs[0], word: word.text, numbers: word.strongs }, { fromList: true }) },
                el('span', { class: 'word-pick-text' }, word.text),
                el('span', { class: 'word-pick-number' }, word.strongs.join(' + ')),
              ),
            ),
          ),
        ),
      );
      return;
    }
    // No word chosen: say how to choose one, or how to get KJV+.
    const children = [];
    if (strongsShown()) {
      children.push(note(t('research.wordsHint')));
    } else {
      children.push(note(t('research.needStrongs')));
      if (context) {
        const verse = subject?.book === context.book && subject?.chapter === context.chapter ? subject.verses[0] : null;
        children.push(el('a', { class: 'button research-open-strongs', href: strongsHref(context.book, context.chapter, verse) }, t('research.openStrongs')));
      }
    }
    panes.words.replaceChildren(...children);
  }

  /** Dictionary text, with Strong's numbers as links and Hebrew/Greek marked up. */
  function richText(text) {
    return linkStrongs(text).flatMap((part) => {
      if (typeof part !== 'string') {
        return [el('button', { type: 'button', class: 'strongs-link', onclick: () => openEntry({ number: part.number }) }, part.number)];
      }
      return scriptRuns(part).map((run) =>
        typeof run === 'string' ? run : el('span', { lang: run.script, dir: run.script === 'he' ? 'rtl' : null, class: 'word-original' }, run.text),
      );
    });
  }

  function openEntry(next, { fromList = false } = {}) {
    if (entry && !fromList) history.push(entry);
    if (fromList) history.length = 0;
    entry = { numbers: [next.number], ...next };
    selectTab('words');
    panes.words.focus({ preventScroll: true });
  }

  /** Switch between the numbers of a word tagged with two. */
  function showNumber(number) {
    entry = { ...entry, number };
    render();
  }

  function back() {
    entry = history.pop() ?? null;
    render();
    panes.words.focus({ preventScroll: true });
  }

  async function renderEntry() {
    const id = ++renderId;
    const { number, word, numbers } = entry;
    const top = [];
    if (history.length || wordVerse?.words.length) {
      top.push(el('button', { type: 'button', class: 'text-button research-back', onclick: back }, icon(ICONS.chevronLeft, { size: 16 }), t('research.back')));
    }
    if (numbers.length > 1) {
      top.push(
        el(
          'p',
          { class: 'word-numbers' },
          t('research.taggedWith'),
          ' ',
          numbers.map((n) =>
            el('button', { type: 'button', class: 'strongs-link', 'aria-pressed': String(n === number), onclick: () => showNumber(n) }, n),
          ),
        ),
      );
    }
    panes.words.replaceChildren(...top, note(t('research.loading')));

    let found;
    try {
      found = await data.strongs(number);
    } catch (error) {
      if (id === renderId) panes.words.replaceChildren(...top, failure(error, renderEntry));
      return;
    }
    if (id !== renderId) return;
    if (!found) {
      panes.words.replaceChildren(...top, note(t('research.noEntry', { number })));
      return;
    }

    const language = strongsLanguage(number);
    const head = el(
      'div',
      { class: 'word-head' },
      el('p', { class: 'word-lemma', lang: language === 'hbo' ? 'he' : 'grc', dir: language === 'hbo' ? 'rtl' : 'ltr' }, found.lemma),
      el('p', { class: 'word-xlit' }, el('span', { lang: language === 'hbo' ? 'he-Latn' : 'grc-Latn' }, found.xlit), found.pron ? ` · ${found.pron}` : ''),
      el('p', { class: 'word-number' }, `${t(language === 'hbo' ? 'research.hebrew' : 'research.greek')} · ${t('research.strongs')} ${number}`),
    );
    const details = el('dl', { class: 'word-details' });
    const row = (label, value) => details.append(el('dt', {}, label), el('dd', { lang: 'en' }, value));
    if (word) row(t('research.here'), `“${word}”`);
    if (found.def) row(t('research.meaning'), richText(found.def));
    if (found.kjv) row(t('research.kjvRenders'), richText(found.kjv));
    if (found.deriv) row(t('research.origin'), richText(found.deriv));
    const uses = el('section', { class: 'word-uses', 'aria-labelledby': 'word-uses-title' }, el('h4', { id: 'word-uses-title' }, t('research.usesTitle')), note(t('research.loading')));

    panes.words.replaceChildren(
      ...top,
      el('h3', { class: 'visually-hidden' }, `${found.lemma} ${number}`),
      head,
      languageNote(),
      details,
      uses,
      attribution('research.strongsSource', 'Open Scriptures', 'https://github.com/openscriptures/strongs', 'CC BY-SA'),
    );
    renderUses(uses, number, id);
  }

  // The dictionaries are in English; say so in other interface languages.
  function languageNote() {
    const text = t('research.englishOnly');
    return text ? note(text) : '';
  }

  /** "Used 50 times in 48 verses", the English words used, and the verses (paged). */
  async function renderUses(section, number, id) {
    const translation = await strongsTranslation();
    if (!translation) {
      section.lastChild.replaceWith(note(t('research.loadFailed')));
      return;
    }
    let page;
    try {
      page = await concordance({ translation, number, offset: 0, limit: CONCORDANCE_PAGE });
    } catch (error) {
      if (id === renderId) section.lastChild.replaceWith(failure(error, () => renderUses(section, number, id)));
      return;
    }
    if (id !== renderId || !page) return;
    const list = el('ol', { class: 'concordance-list' }, page.hits.map((hit) => concordanceItem(hit, translation)));
    const renderings = page.renderings.slice(0, RENDERINGS_SHOWN).map(([text, count]) => `${text} (${count})`).join(', ');
    section.replaceChildren(
      section.firstChild,
      el('p', { class: 'word-count' }, t('research.usedIn', { n: page.occurrences, verses: t('research.verseCount', { n: page.verses }) })),
      renderings ? el('p', { class: 'word-renderings' }, `${t('research.renderedAs')} `, el('span', { lang: 'en' }, `${renderings}${page.renderings.length > RENDERINGS_SHOWN ? ', …' : ''}`)) : '',
      list,
    );
    let shown = page.hits.length;
    if (shown < page.verses) {
      const more = el('button', { type: 'button', class: 'text-button research-more' }, t('research.showMore', { n: page.verses - shown }));
      more.addEventListener('click', async () => {
        more.disabled = true;
        try {
          const next = await concordance({ translation, number, offset: shown, limit: CONCORDANCE_PAGE });
          if (id !== renderId || !next) return;
          list.append(...next.hits.map((hit) => concordanceItem(hit, translation)));
          list.children[shown]?.querySelector('a')?.focus();
          shown += next.hits.length;
          if (shown >= page.verses) more.remove();
          else more.textContent = t('research.showMore', { n: page.verses - shown });
        } finally {
          more.disabled = false;
        }
      });
      section.append(more);
    }
  }

  function concordanceItem(hit, translation) {
    const book = getBook(hit.bookId);
    const nodes = [];
    let at = 0;
    for (const [start, end] of hit.spans) {
      if (start > at) nodes.push(hit.text.slice(at, start));
      nodes.push(el('mark', { class: 'word-hit' }, hit.text.slice(start, end)));
      at = end;
    }
    nodes.push(hit.text.slice(at));
    return el(
      'li',
      { class: 'xref-item' },
      el('a', { class: 'xref-ref', href: chapterHref(book, hit.chapter, hit.verse, `t=${translation.id}`) }, `${chapterTitle(book, hit.chapter)}:${hit.verse}`),
      el('p', { class: 'xref-text', lang: 'en' }, nodes),
    );
  }

  /* -------- open / close -------- */

  function open() {
    if (panel.hidden) returnFocus = document.activeElement;
    dock.opened();
    panel.hidden = false;
    renderChrome();
  }

  function close({ handOff = false } = {}) {
    if (panel.hidden) return;
    ++renderId;
    panel.hidden = true;
    dock.closed();
    if (handOff) return;
    if (returnFocus?.isConnected && (panel.contains(document.activeElement) || document.activeElement === document.body)) {
      returnFocus.focus({ preventScroll: true });
    } else if (panel.contains(document.activeElement)) {
      document.querySelector('main')?.focus({ preventScroll: true });
    }
  }

  return {
    /** The chapter on screen ({ book, chapter, columns, query }), or null off the reader. */
    setContext(next) {
      context = next;
      if (!panel.hidden && tab === 'words' && !entry) renderWords();
    },

    /**
     * Research the selected verses: their cross references and, in KJV+,
     * the words of the first one.
     * @param {{ book, chapter, verses: number[], words: { text, strongs }[]|null }} selection
     */
    showVerses({ book, chapter, verses, words }) {
      subject = { book, chapter, verses: verses.slice(0, 20) };
      wordVerse = words?.length ? { book, chapter, verse: verses[0], words } : null;
      entry = null;
      history.length = 0;
      open();
      render();
      heading.focus({ preventScroll: true });
    },

    /** Word study for a tapped word in KJV+: { strongs: ["H7225"], word, book, chapter, verse, words }. */
    showWord({ strongs, word, book, chapter, verse, words }) {
      wordVerse = { book, chapter, verse, words: words ?? [] };
      history.length = 0;
      entry = { number: strongs[0], word, numbers: strongs };
      tab = 'words';
      open();
      render();
      panes.words.focus({ preventScroll: true });
    },

    close,
    isOpen: () => !panel.hidden,

    /** Re-render in a new interface language. */
    refresh() {
      if (panel.hidden) return;
      renderChrome();
      render();
    },
  };
}
