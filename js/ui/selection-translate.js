/**
 * "Translate to Russian" for selected English or Greek (Septuagint) Bible text.
 *
 * The verse action bar (js/ui/verse-actions.js) offers it when English text
 * is selected, by dragging across words or by tapping verses. It opens a
 * panel with:
 *   - a machine translation of exactly the selected words, made on the
 *     device where the browser supports it;
 *   - a link that opens Yandex Translate with the text filled in (and
 *     translated as soon as it opens);
 *   - the Russian Synodal text of the same verses, a real Bible translation,
 *     unless that translation is already a column on screen.
 *
 * For dragged text, readTextSelection() gives exactly the selected words, and
 * only from one translation, so a drag across compare columns doesn't mix
 * KJV and ASV.
 */
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { canTranslateOnDevice, TRANSLATABLE, translatableLanguage, translateOnDevice, yandexTranslateUrl } from '../translate/machine.js';
import { cleanSelection, toMonotonic, truncate, verseRangeLabel } from '../translate/text.js';
import { el, icon, ICONS } from './dom.js';

// A verse of English or Greek text: a verse in single view, or a cell in compare view.
const UNIT_SELECTOR = ['en', 'grc'].map((lang) => `.scripture[lang|="${lang}"] .verse, .pcell[lang|="${lang}"]`).join(', ');
// Text in those units that isn't Bible text: verse numbers, labels, hidden hints.
const SKIP_SELECTOR = '.vnum, .pnum, .pcell-label, .study-marks, .visually-hidden, [aria-hidden="true"]';
const TO = 'ru';

/** How a machine translator gets a request's text: { from, text, greek }. */
function machineInput(request) {
  const language = translatableLanguage(request.language) ?? 'en';
  const { machineLanguage, modernSpelling } = TRANSLATABLE[language];
  return { from: machineLanguage, text: modernSpelling ? toMonotonic(request.text) : request.text, greek: language === 'grc' };
}
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
  const language = units.find((unit) => translationOf(unit) === translation)?.closest('[lang]')?.lang ?? 'en';
  return { text: parts.join(' ').slice(0, MAX_CHARS), verses, translation, language, rect: range.getBoundingClientRect() };
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root  where Bible text is rendered (<main>)
 * @param {(book, chapter, verses: number[], shownIds: string[]) => Promise<{info, verses}|null>} options.getRussianVerses
 */
export function initSelectionTranslate({ root, getRussianVerses }) {
  let context = null; // { book, chapter, shownIds } while a chapter is on screen
  let requestId = 0;
  let returnFocus = null;

  const title = el('h2', { class: 'translate-title', id: 'translate-title', tabindex: '-1' });
  const closeButton = el('button', { type: 'button', class: 'icon-button translate-close' }, icon(ICONS.close, { size: 18 }));
  const quote = el('blockquote', { class: 'translate-quote' });
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
  document.body.append(panel);

  closeButton.addEventListener('click', () => close());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });

  function label(text) {
    return el('p', { class: 'translate-label' }, text);
  }

  function renderMachine(state) {
    const parts = [label(t('translate.machine'))];
    if (state.result) {
      parts.push(el('p', { class: 'translate-result', lang: TO }, state.result), el('p', { class: 'translate-note' }, t(state.greek ? 'translate.greekNote' : 'translate.machineNote')));
    } else if (state.status) {
      parts.push(el('p', { class: 'translate-status' }, state.status));
    }
    machine.replaceChildren(...parts);
  }

  /**
   * "Open in Yandex Translate": the selected text goes in the link, so the
   * page opens with it filled in and translated. Shown the whole time, also
   * while (or after) the device translates.
   */
  function renderExternal(request) {
    const link = el(
      'a',
      { href: yandexTranslateUrl(machineInput(request).text, machineInput(request).from, TO, { interfaceLanguage: getLanguage() }), target: '_blank', rel: 'noopener noreferrer' },
      t('translate.openYandex'),
      icon(ICONS.external, { size: 14 }),
      el('span', { class: 'visually-hidden' }, ` ${t('translate.newTab')}`),
    );
    external.replaceChildren(
      el('p', { class: 'translate-link' }, link),
      el('p', { class: 'translate-note' }, t(machineInput(request).greek ? 'translate.yandexNoteGreek' : 'translate.yandexNote')),
    );
  }

  async function runMachine(request, id) {
    renderMachine({ status: t('translate.translating') });
    const { from, text, greek } = machineInput(request);
    if (!(await canTranslateOnDevice(from, TO))) {
      if (id === requestId) renderMachine({ status: t(greek ? 'translate.unavailableGreek' : 'translate.unavailable') });
      return;
    }
    try {
      const result = await translateOnDevice(text, {
        from,
        to: TO,
        onProgress: (fraction) => {
          if (id === requestId) renderMachine({ status: t('translate.downloading', { percent: Math.round(fraction * 100) }) });
        },
      });
      if (id === requestId) renderMachine({ result, greek });
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
    returnFocus = document.activeElement;
    title.textContent = t('translate.title');
    closeButton.setAttribute('aria-label', t('translate.close'));
    quote.lang = request.language ?? 'en';
    quote.textContent = `“${truncate(request.text, 280)}”`;
    panel.hidden = false;
    title.focus({ preventScroll: true });
    renderExternal(request);
    runMachine(request, id);
    runSynodal(request, id);
  }

  function close() {
    if (panel.hidden) return;
    requestId += 1; // ignore results still on their way
    panel.hidden = true;
    // Back to where the reader was (a verse number), if focus was in the panel.
    if (panel.contains(document.activeElement) || document.activeElement === document.body) {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
  }

  return {
    /** The chapter on screen ({ book, chapter, shownIds }), or null off the reader. */
    setContext(next) {
      context = next;
      close();
    },

    /** Open the panel for { text, verses, translation }. */
    open,

    /** The exact English words selected in the chapter, as a request for open(), or null. */
    readTextSelection: () => (context ? readSelection(root) : null),
  };
}
