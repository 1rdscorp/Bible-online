/**
 * The topical index: the list of topics (#/topics, with a search box) and
 * one topic (#/topics/faith): Torrey's statements, each with its references
 * and a "Show verses" button that quotes them in the reader's translation.
 *
 * Titles are in the interface language (tools/topics-ru.json). In Russian,
 * Torrey's statements show in the site's AI translation (tools/topics-ru/),
 * labelled as such, with a switch to his English (?lang=en). Lookups:
 * js/research/topics.js; data: js/research/data.js.
 */
import { getBook } from '../canon.js';
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { parseRef } from '../research/refs.js';
import { nestLines, searchStatements, searchTopics, titleLetter } from '../research/topics.js';
import { chapterHref, topicHref } from '../router.js';
import { el, icon, ICONS } from '../ui/dom.js';

export const topicTitle = (topic) => (getLanguage() === 'ru' && topic.ru) || topic.en;

/** A statement in the interface language where there's a translation: { text, lang }. */
export function statementText(line, { original = false } = {}) {
  if (getLanguage() === 'ru' && line.ru && !original) return { text: line.ru, lang: 'ru' };
  return { text: line.t, lang: 'en' };
}

const collator = () => new Intl.Collator(getLanguage(), { sensitivity: 'base' });

/* ---------------------------------------------------------------------- */
/* #/topics                                                                */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {object} options.index      data/topics/index.json
 * @param {string} [options.query]    the search box's text (?q=)
 * @param {(query: string) => void} options.onQuery  remembers the text in the URL
 * @param {() => Promise<any[]>} [options.loadStatements]  data/topics/statements.json, for
 *   finding the words inside topics too (loaded on the first search)
 */
export function renderTopicsIndex({ index, query = '', onQuery, loadStatements = null }) {
  const sorted = [...index.topics].sort((a, b) => collator().compare(topicTitle(a), topicTitle(b)));
  const input = el('input', {
    type: 'search',
    id: 'topic-search',
    class: 'topic-search-input',
    value: query,
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-describedby': 'topic-count',
  });
  const count = el('p', { class: 'topic-count', id: 'topic-count', role: 'status', 'aria-live': 'polite' });
  const results = el('div', { class: 'topic-results' });

  let searchId = 0;

  function render() {
    const text = input.value.trim();
    const id = ++searchId;
    if (text) {
      const found = searchTopics(sorted, text);
      const inStatements = el('section', { class: 'topic-statement-results', 'aria-labelledby': 'topic-statements-title', hidden: true });
      count.textContent = found.length ? t('topics.found', { n: found.length }) : t('topics.none');
      results.replaceChildren(found.length ? el('ul', { class: 'topic-list', role: 'list' }, found.map(topicLink)) : '', inStatements);
      // The words inside topics too, from three letters on.
      if (loadStatements && text.length >= 3) {
        loadStatements()
          .then((entries) => {
            if (id !== searchId) return;
            const hits = searchStatements(entries, text, { limit: STATEMENT_HITS });
            if (!hits.length) return;
            inStatements.hidden = false;
            inStatements.replaceChildren(
              el('h2', { class: 'topic-statements-title', id: 'topic-statements-title' }, t('topics.inStatements', { n: hits.length })),
              el('ul', { class: 'topic-statement-list', role: 'list' }, hits.map(({ topic, line }) => statementLink(index.topics[topic], entries, topic, line))),
            );
            if (!found.length) count.textContent = t('topics.foundStatements', { n: hits.length });
          })
          .catch(() => {});
      }
      return;
    }
    count.textContent = t('topics.count', { n: sorted.length });
    // A–Z (or А–Я) groups, with a row of letters to jump to.
    const groups = new Map();
    for (const topic of sorted) {
      const letter = titleLetter(topicTitle(topic));
      if (!groups.has(letter)) groups.set(letter, []);
      groups.get(letter).push(topic);
    }
    results.replaceChildren(
      el(
        'nav',
        { class: 'topic-letters', 'aria-label': t('topics.letters') },
        [...groups.keys()].map((letter) => el('a', { href: `#topic-letter-${letter}`, class: 'topic-letter-link', 'data-jump': `topic-letter-${letter}` }, letter)),
      ),
      ...[...groups].map(([letter, list]) =>
        el(
          'section',
          { class: 'topic-group', 'aria-labelledby': `topic-letter-${letter}` },
          el('h2', { class: 'topic-letter', id: `topic-letter-${letter}`, tabindex: '-1' }, letter),
          el('ul', { class: 'topic-list', role: 'list' }, list.map(topicLink)),
        ),
      ),
    );
  }

  input.addEventListener('input', () => {
    render();
    onQuery(input.value.trim());
  });
  // The letter links move within the page (the URL's hash is the route).
  results.addEventListener('click', (event) => {
    const jump = event.target.closest?.('[data-jump]');
    if (!jump) return;
    event.preventDefault();
    const target = document.getElementById(jump.dataset.jump);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  });
  render();

  return el(
    'section',
    { class: 'topics-page', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('topics.title')),
    el('p', { class: 'view-subtitle' }, t('topics.intro')),
    el('p', { class: 'topic-search' }, el('label', { for: 'topic-search', class: 'topic-search-label' }, t('topics.search')), input),
    count,
    results,
    sourceNote(index.source),
  );
}

const STATEMENT_HITS = 60;
const SEARCH_SUGGESTIONS = 6;

/**
 * For the Bible search page: "Topics: Prayer · Prayer, Public …", the
 * topics whose titles match the words searched for. Null if none do.
 */
export function renderTopicSuggestions(topics, query) {
  const matches = query ? searchTopics(topics, query).slice(0, SEARCH_SUGGESTIONS) : [];
  if (!matches.length) return null;
  return el(
    'p',
    { class: 'search-topics' },
    el('span', { class: 'search-topics-label' }, icon(ICONS.topics, { size: 16 }), t('search.topics')),
    ' ',
    matches.flatMap((topic, i) => [i > 0 && el('span', { class: 'search-topics-sep', 'aria-hidden': 'true' }, ' · '), el('a', { href: topicHref(topic.id) }, topicTitle(topic))]),
  );
}

/** "Вера — Дар Божий", opening the topic at that statement. */
function statementLink(topic, entries, t, l) {
  const entry = entries.byKey?.get(`${t}.${l}`) ?? entries.find((e) => e[0] === t && e[1] === l);
  const russian = getLanguage() === 'ru' && entry?.[3];
  return el(
    'li',
    {},
    el(
      'a',
      { class: 'topic-statement-link', href: topicHref(topic.id, `s=${l}`) },
      el('span', { class: 'topic-statement-topic' }, topicTitle(topic)),
      ' — ',
      el('span', { lang: russian ? 'ru' : 'en' }, russian ? entry[3] : entry?.[2] ?? ''),
    ),
  );
}

function topicLink(topic) {
  return el(
    'li',
    {},
    el('a', { class: 'topic-link', href: topicHref(topic.id) }, topicTitle(topic), el('span', { class: 'topic-link-count' }, ` ${topic.refs}`)),
  );
}

function sourceNote(source) {
  return el(
    'p',
    { class: 'topic-source' },
    t('topics.source'),
    ' ',
    el('a', { href: source.page ?? source.url, rel: 'noopener', target: '_blank', lang: 'en' }, source.name),
    ` (${source.author}, ${source.year}). ${t('topics.publicDomain')}`,
  );
}

/* ---------------------------------------------------------------------- */
/* #/topics/<id>                                                           */
/* ---------------------------------------------------------------------- */

/**
 * @param {object} options
 * @param {object} options.topic     data/topics/<id>.json
 * @param {object} options.index     data/topics/index.json (titles of "See" links)
 * @param {number | null} [options.focus]  a statement to open at (?s=)
 * @param {(ref: string) => Promise<{ text, lang } | null>} options.quote  a verse in the reader's translation
 * @param {string} options.quoteName  that translation's abbreviation ("RST")
 * @param {boolean} [options.original]  Torrey's English even in Russian (?lang=en)
 */
export function renderTopicPage({ topic, index, focus = null, quote, quoteName, original = false }) {
  const titles = new Map(index.topics.map((entry) => [entry.id, entry]));
  const english = getLanguage() !== 'en';
  const translated = getLanguage() === 'ru' && topic.lines.some((line) => line.ru);

  function statement(line) {
    const refs = line.r.map(parseRef).filter(Boolean);
    const verses = el('ol', { class: 'topic-verses', id: `topic-verses-${line.index}`, hidden: true });
    let loaded = false;
    const toggle =
      refs.length > 0 &&
      el(
        'button',
        {
          type: 'button',
          class: 'text-button topic-show',
          'aria-expanded': 'false',
          'aria-controls': `topic-verses-${line.index}`,
          'data-focus-key': `show-${line.index}`,
          onclick: () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(open));
            toggle.lastChild.textContent = open ? t('topics.hideVerses') : t('topics.showVerses', { n: refs.length });
            verses.hidden = !open;
            if (open && !loaded) {
              loaded = true;
              fillVerses(verses, line.r, refs);
            }
          },
        },
        icon(ICONS.chevronDown, { size: 14, className: 'topic-show-icon' }),
        el('span', {}, t('topics.showVerses', { n: refs.length })),
      );
    const see = (line.see ?? []).filter((id) => titles.has(id));
    return el(
      'li',
      { class: `topic-line${refs.length ? '' : ' is-heading'}${focus === line.index ? ' is-focus' : ''}`, id: `s${line.index}` },
      el(
        'p',
        { class: 'topic-statement' },
        (() => {
          const { text, lang } = statementText(line, { original });
          return el('span', { class: 'topic-statement-text', lang }, text);
        })(),
        refs.length > 0 && el('span', { class: 'topic-dash' }, ' — '),
        refs.length > 0 && el('span', { class: 'topic-refs' }, refLinks(refs)),
      ),
      see.length > 0 &&
        el('p', { class: 'topic-see' }, t('topics.see'), ' ', see.flatMap((id, i) => [i > 0 && ', ', el('a', { href: topicHref(id) }, topicTitle(titles.get(id)))])),
      toggle,
      refs.length > 0 && verses,
      line.children?.length > 0 && el('ul', { class: 'topic-lines topic-lines--sub', role: 'list' }, line.children.map(statement)),
    );
  }

  async function fillVerses(list, texts, refs) {
    list.replaceChildren(el('li', { class: 'topic-verse-loading' }, t('research.loading')));
    const quotes = await Promise.all(texts.map((text) => quote(text).catch(() => null)));
    list.replaceChildren(
      ...refs.map((ref, i) =>
        el(
          'li',
          { class: 'topic-verse' },
          el('a', { class: 'topic-verse-ref', href: refHref(ref) }, refLabel(ref)),
          ' ',
          quotes[i] ? el('span', { class: 'topic-verse-text', lang: quotes[i].lang || null }, quotes[i].text) : el('span', { class: 'topic-verse-text is-missing' }, t('topics.verseMissing')),
        ),
      ),
      el('li', { class: 'topic-verse-source' }, quoteName),
    );
  }

  // In Russian: say the statements are an AI translation, with a switch to
  // Torrey's English; without a translation, that they're in English.
  function languageNote() {
    if (!translated) return el('p', { class: 'topic-language-note' }, t('topics.languageNote'));
    return el(
      'p',
      { class: 'topic-language-note' },
      original ? t('topics.originalNote') : t('topics.translatedNote'),
      ' ',
      el('a', { href: original ? topicHref(topic.id) : topicHref(topic.id, 'lang=en'), class: 'topic-language-switch', 'data-focus-key': 'topic-language' }, original ? t('topics.showTranslation') : t('topics.showOriginal')),
    );
  }

  const lines = nestLines(topic.lines);
  const page = el(
    'article',
    { class: 'topics-page topic-page', 'aria-labelledby': 'view-title' },
    el('p', { class: 'back' }, el('a', { class: 'back-link', href: topicHref() }, el('span', { 'aria-hidden': 'true' }, '←'), t('topics.all'))),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, topicTitle(topic)),
    english && el('p', { class: 'topic-english', lang: 'en' }, topic.en),
    english && languageNote(),
    el('ul', { class: 'topic-lines', role: 'list' }, lines.map(statement)),
    sourceNote(index.source),
  );

  // ?s=12: open at that statement, with its verses shown.
  if (focus !== null) {
    queueMicrotask(() => {
      const target = page.querySelector(`#s${focus}`);
      target?.querySelector(':scope > .topic-show')?.click();
    });
  }
  return page;
}

/* References, written compactly as Torrey does: "John 10:7, 9; 14:6; Romans 5:2". */

function refLabel(ref) {
  const head = `${chapterTitle(getBook(ref.book), ref.chapter)}:${ref.verse}`;
  if (ref.endChapter !== ref.chapter) return `${head}–${ref.endChapter}:${ref.endVerse}`;
  return ref.endVerse > ref.verse ? `${head}–${ref.endVerse}` : head;
}

const refHref = (ref) => chapterHref(getBook(ref.book), ref.chapter, ref.verse, '', ref.endChapter === ref.chapter && ref.endVerse > ref.verse ? ref.endVerse : null);

function refLinks(refs) {
  const nodes = [];
  let previous = null;
  for (const ref of refs) {
    let label;
    let separator = '; ';
    const tail = ref.endChapter !== ref.chapter ? `–${ref.endChapter}:${ref.endVerse}` : ref.endVerse > ref.verse ? `–${ref.endVerse}` : '';
    if (previous && previous.book === ref.book && previous.chapter === ref.chapter && previous.endChapter === previous.chapter) {
      label = `${ref.verse}${tail}`;
      separator = ', ';
    } else if (previous && previous.book === ref.book) {
      label = `${ref.chapter}:${ref.verse}${tail}`;
    } else {
      label = refLabel(ref);
    }
    if (previous) nodes.push(separator);
    nodes.push(el('a', { href: refHref(ref), 'aria-label': refLabel(ref) }, label));
    previous = ref;
  }
  return nodes;
}
