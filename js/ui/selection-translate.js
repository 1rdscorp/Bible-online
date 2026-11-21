/**
 * "Translate to Russian" for selected English Bible text.
 *
 * Selecting English text in the reader (single view, or an English column
 * in compare mode) shows a small button under the selection. Clicking it
 * opens a panel with:
 *   - a machine translation of exactly the selected words, made on the
 *     device where the browser supports it;
 *   - a link to Translate.com's English→Russian translator. It can't take
 *     the text from the link, so clicking it copies the text to paste there;
 *   - the Russian Synodal text of the same verses, a real Bible translation,
 *     unless that translation is already a column on screen.
 *
 * The selection is read as soon as it changes (on phones, tapping the button
 * can clear it), and only text from one translation is used, so a drag
 * across compare columns doesn't mix KJV and ASV.
 */
import { chapterTitle, t } from '../i18n.js';
import { copyText } from '../translate/clipboard.js';
import { canTranslateOnDevice, translateComUrl, translateOnDevice } from '../translate/machine.js';
import { cleanSelection, truncate, verseRangeLabel } from '../translate/text.js';
import { el, icon, ICONS } from './dom.js';

// A verse of English text: a verse in single view, or an English cell in compare view.
const UNIT_SELECTOR = '.scripture[lang|="en"] .verse, .pcell[lang|="en"]';
// Text in those units that isn't Bible text: verse numbers, labels, hidden hints.
const SKIP_SELECTOR = '.vnum, .pnum, .pcell-label, .visually-hidden, [aria-hidden="true"]';
const FROM = 'en';
const TO = 'ru';
const MAX_CHARS = 2000;

/** The part of `unit`'s Bible text that lies inside `range`. */
function textInRange(unit, range) {
  const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest(SKIP_SELECTOR) || !range.intersectsNode(node)) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    text += node.data.slice(start, end);
  }
  return text;
}

/** What's selected, if it's English Bible text inside `root`. */
function readSelection(root) {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const units = [...root.querySelectorAll(UNIT_SELECTOR)].filter((unit) => range.intersectsNode(unit));
  const translationOf = (unit) => unit.closest('[data-translation]')?.dataset.translation;
  const translation = units.length ? translationOf(units[0]) : null;
  const parts = [];
  const verses = [];
  for (const unit of units) {
    if (translationOf(unit) !== translation) continue;
    const part = cleanSelection(textInRange(unit, range));
    if (!part) continue;
    parts.push(part);
    verses.push(Number(unit.closest('[data-verse]').dataset.verse));
  }
  if (!parts.length) return null;
  return { text: parts.join(' ').slice(0, MAX_CHARS), verses, translation, rect: range.getBoundingClientRect() };
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root  where Bible text is rendered (<main>)
 * @param {(book, chapter, verses: number[], shownIds: string[]) => Promise<{info, verses}|null>} options.getRussianVerses
 */
export function initSelectionTranslate({ root, getRussianVerses }) {
  let context = null; // { book, chapter, shownIds } while a chapter is on screen
  let pending = null; // the selection the button will translate
  let pointerOnButton = false;
  let settleTimer = 0;
  let requestId = 0;

  const buttonLabel = el('span');
  const button = el(
    'button',
    { type: 'button', class: 'translate-button', hidden: true },
    icon(ICONS.translate, { size: 16 }),
    buttonLabel,
  );

  const title = el('h2', { class: 'translate-title', id: 'translate-title', tabindex: '-1' });
  const closeButton = el('button', { type: 'button', class: 'icon-button translate-close' }, icon(ICONS.close, { size: 18 }));
  const quote = el('blockquote', { class: 'translate-quote', lang: FROM });
  const machine = el('section', { class: 'translate-section', 'aria-live': 'polite' });
  const external = el('div', { class: 'translate-external' });
  const synodal = el('section', { class: 'translate-section', 'aria-live': 'polite' });
  const panel = el(
    'div',
    { class: 'translate-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'translate-title', hidden: true },
    el('div', { class: 'translate-head' }, title, closeButton),
    quote,
    machine,
    external,
    synodal,
  );
  document.body.append(button, panel);

  function hideButton() {
    button.hidden = true;
  }

  function showButton(selection) {
    pending = selection;
    buttonLabel.textContent = t('translate.button');
    // Below the selection (phones put their own selection menu above it),
    // kept inside the window.
    const { rect } = selection;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 110), window.innerWidth - 110);
    const y = Math.min(rect.bottom + 10, window.innerHeight - 56);
    button.style.left = `${x + window.scrollX}px`;
    button.style.top = `${y + window.scrollY}px`;
    button.hidden = false;
  }

  // selectionchange fires continuously while dragging; act once it settles.
  function onSelectionChange() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!context || pointerOnButton) return;
      const selection = readSelection(root);
      if (selection) showButton(selection);
      else hideButton();
    }, 150);
  }

  // Keep the selection when the button is pressed (a mouse press would clear it).
  button.addEventListener('pointerdown', (event) => {
    pointerOnButton = true;
    event.preventDefault();
  });
  document.addEventListener('pointerup', () => {
    setTimeout(() => {
      pointerOnButton = false;
    }, 0);
  });
  button.addEventListener('click', () => open(pending));
  closeButton.addEventListener('click', () => close());
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  window.addEventListener('resize', hideButton);

  function label(text) {
    return el('p', { class: 'translate-label' }, text);
  }

  function renderMachine(state) {
    const parts = [label(t('translate.machine'))];
    if (state.result) {
      parts.push(el('p', { class: 'translate-result', lang: TO }, state.result), el('p', { class: 'translate-note' }, t('translate.machineNote')));
    } else if (state.status) {
      parts.push(el('p', { class: 'translate-status' }, state.status));
    }
    machine.replaceChildren(...parts);
  }

  /**
   * "Open Translate.com". Its translator can't be given text in a link, so
   * the click also copies the text, and the note says to paste it there.
   * Shown the whole time, also while (or after) the device translates.
   */
  function renderExternal(request, id) {
    const note = el('p', { class: 'translate-note', 'aria-live': 'polite' }, t('translate.copyHint'));
    const link = el(
      'a',
      {
        href: translateComUrl(FROM, TO),
        target: '_blank',
        rel: 'noopener noreferrer',
        // Copy without waiting: the link opens its tab as usual.
        onclick: () => {
          copyText(request.text).then((copied) => {
            if (id === requestId) note.textContent = t(copied ? 'translate.copied' : 'translate.copyFailed');
          });
        },
      },
      t('translate.openTranslateCom'),
      icon(ICONS.external, { size: 14 }),
      el('span', { class: 'visually-hidden' }, ` ${t('translate.newTab')}`),
    );
    external.replaceChildren(el('p', { class: 'translate-link' }, link), note);
  }

  async function runMachine(request, id) {
    renderMachine({ status: t('translate.translating') });
    if (!(await canTranslateOnDevice(FROM, TO))) {
      if (id === requestId) renderMachine({ status: t('translate.unavailable') });
      return;
    }
    try {
      const result = await translateOnDevice(request.text, {
        from: FROM,
        to: TO,
        onProgress: (fraction) => {
          if (id === requestId) renderMachine({ status: t('translate.downloading', { percent: Math.round(fraction * 100) }) });
        },
      });
      if (id === requestId) renderMachine({ result });
    } catch (error) {
      console.warn('On-device translation failed', error);
      if (id === requestId) renderMachine({ status: t('translate.failed') });
    }
  }

  async function runSynodal(request, id) {
    const { book, chapter, shownIds } = context;
    synodal.hidden = false;
    synodal.replaceChildren(el('p', { class: 'translate-status' }, t('translate.loadingBible')));
    try {
      const russian = await getRussianVerses(book, chapter, request.verses, shownIds);
      if (id !== requestId) return;
      if (!russian || russian.verses.length === 0) {
        synodal.hidden = true;
        return;
      }
      const reference = `${chapterTitle(book, chapter)}:${verseRangeLabel(russian.verses.map((v) => v.number))}`;
      synodal.replaceChildren(
        label(`${russian.info.name} · ${reference}`),
        el(
          'div',
          { class: 'translate-verses', lang: russian.info.language || TO },
          russian.verses.map((v) =>
            el(
              'p',
              { class: 'translate-verse' },
              russian.verses.length > 1 && el('span', { class: 'translate-vnum', 'aria-hidden': 'true' }, String(v.number)),
              v.text,
            ),
          ),
        ),
      );
    } catch (error) {
      console.warn('Could not load the Russian text', error);
      if (id === requestId) synodal.hidden = true;
    }
  }

  function open(request) {
    if (!request || !context) return;
    const id = ++requestId;
    hideButton();
    title.textContent = t('translate.title');
    closeButton.setAttribute('aria-label', t('translate.close'));
    quote.textContent = `“${truncate(request.text, 280)}”`;
    panel.hidden = false;
    title.focus({ preventScroll: true });
    renderExternal(request, id);
    runMachine(request, id);
    runSynodal(request, id);
  }

  function close() {
    if (panel.hidden) return;
    requestId += 1; // ignore results still on their way
    panel.hidden = true;
  }

  return {
    /** The chapter on screen ({ book, chapter, shownIds }), or null off the reader. */
    setContext(next) {
      context = next;
      pending = null;
      hideButton();
      close();
    },
  };
}
