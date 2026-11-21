/**
 * Building blocks for the study pages (book introductions, the timeline,
 * maps, and pages added later such as topics or reading plans). Each
 * returns plain DOM; a page is a studyPage() with sections. Styles:
 * css/pages.css.
 */
import { t } from '../../i18n.js';
import { el } from '../../ui/dom.js';

/**
 * A study page: back link, kicker, title, lead, an "On this page" list when
 * there are several sections, the sections, and a footer (sources).
 *
 * @param {object} options
 * @param {{ href: string, label: string }|null} [options.back]
 * @param {string} [options.kicker]   small label above the title ("Introduction")
 * @param {string} options.title
 * @param {string|Node} [options.lead]
 * @param {{ id: string, title: string, content: Node|Node[] }[]} options.sections
 * @param {Node|Node[]} [options.footer]
 * @param {string} [options.className]
 */
export function studyPage({ back = null, kicker = '', title, lead = null, sections = [], footer = null, className = '' }) {
  const shown = sections.filter(Boolean);
  return el(
    'article',
    { class: `page study-page ${className}`.trim(), 'aria-labelledby': 'view-title' },
    back && el('p', { class: 'back' }, el('a', { class: 'back-link', href: back.href }, el('span', { 'aria-hidden': 'true' }, '←'), back.label)),
    kicker && el('p', { class: 'study-kicker' }, kicker),
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, title),
    lead && el('p', { class: 'study-lead' }, lead),
    shown.length >= 4 &&
      el(
        'nav',
        { class: 'study-toc', 'aria-label': t('page.onThisPage') },
        el('ul', {}, shown.map((section) => el('li', {}, el('a', { href: `#${section.id}`, 'data-jump': section.id }, section.title)))),
      ),
    shown.map((section) =>
      el('section', { class: 'study-section', 'aria-labelledby': section.id }, el('h2', { id: section.id, tabindex: '-1' }, section.title), section.content),
    ),
    footer && el('footer', { class: 'study-footer' }, footer),
  );
}

/**
 * In-page jump links ("On this page") can't use real #anchors: the hash is
 * the router's. They scroll and move focus instead.
 */
export function enableJumpLinks(root) {
  root.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-jump]');
    if (!link) return;
    event.preventDefault();
    const target = root.querySelector(`#${CSS.escape(link.dataset.jump)}`);
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    target?.focus({ preventScroll: true });
  });
}

/** Label/value pairs: Author, Date… */
export function factList(facts) {
  return el(
    'dl',
    { class: 'fact-list' },
    facts.filter((fact) => fact?.value).map((fact) => el('div', { class: 'fact' }, el('dt', {}, fact.label), el('dd', {}, fact.value))),
  );
}

/** Short phrases as quiet chips (themes). */
export function tagList(texts) {
  return el('ul', { class: 'tag-list', role: 'list' }, texts.map((text) => el('li', {}, text)));
}

/** An outline: each part's reference (a link into the reader) and title. */
export function outlineList(items) {
  return el(
    'ol',
    { class: 'outline-list' },
    items.map((item) => el('li', {}, el('a', { class: 'outline-ref', href: item.href }, item.label), el('span', { class: 'outline-title' }, item.title))),
  );
}

/** Cards that lead to other pages: [{ href, title, text, icon }]. */
export function linkCards(cards) {
  return el(
    'ul',
    { class: 'link-cards', role: 'list' },
    cards.map((card) =>
      el(
        'li',
        {},
        el('a', { class: 'link-card', href: card.href }, card.icon ?? '', el('span', { class: 'link-card-title' }, card.title), card.text && el('span', { class: 'link-card-text' }, card.text)),
      ),
    ),
  );
}

/** A quoted passage with its reference link; the text fills in when loaded. */
export function passageQuote({ href, label }) {
  const text = el('p', { class: 'passage-text' });
  const node = el('blockquote', { class: 'passage-quote' }, text, el('footer', {}, el('a', { href }, label)));
  return {
    node,
    /** Show the passage's text (in `lang`), once it has loaded. */
    fill(passage, lang = null) {
      text.textContent = passage;
      if (lang) text.lang = lang;
    },
  };
}
