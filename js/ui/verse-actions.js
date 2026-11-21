/**
 * Selecting verses in the reader, and the action bar for them.
 *
 * Selecting:
 *   - tap or click a verse (its text or number) to select it; again to
 *     deselect; Shift+click selects the range from the last one
 *   - drag across text: the verses it covers are selected
 *   - keyboard: the verse numbers are buttons with one Tab stop for the
 *     whole chapter; ↑/↓ (Home/End) move between them, Enter or Space
 *     selects (with Shift, a range)
 *   - Escape, or ×, clears the selection
 *
 * The bar (docked at the bottom of the window) offers: five highlight
 * colours and "remove", Note, Bookmark, Copy (text + reference, or with the
 * translation's name), Share, and Translate to Russian when the text is
 * English. Each action applies to the selected verses, then clears the
 * selection. Everything is saved by verse reference (js/study/store.js), so
 * it shows in every translation.
 *
 * The bar sits in the page right after the verses (fixed to the bottom of
 * the window by CSS), so Tab from a verse number reaches it next.
 */
import { chapterTitle, t } from '../i18n.js';
import { chapterHref } from '../router.js';
import { formatPassage } from '../study/copy.js';
import { HIGHLIGHT_COLORS, makeRef, sameRef, verseRuns } from '../study/model.js';
import { copyText } from '../translate/clipboard.js';
import { verseRangeLabel } from '../translate/text.js';
import { el, icon, ICONS } from './dom.js';

const VERSE = '[data-verse]';
const NUMBER = '.vnum, .pnum';

/** Does the selection range cover some of this node's text (not just touch its edge)? */
function coversText(range, node) {
  if (!range.intersectsNode(node)) return false;
  const inner = document.createRange();
  inner.selectNodeContents(node);
  return range.compareBoundaryPoints(Range.END_TO_START, inner) < 0 && range.compareBoundaryPoints(Range.START_TO_END, inner) > 0;
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root  <main>, where chapters are shown
 * @param {object} options.store      js/study/store.js
 * @param {object} options.toaster    js/ui/toast.js
 * @param {(ref) => void} options.onNote          open the Notes panel to write a note on `ref`
 * @param {(request) => void} options.onTranslate  open "Translate to Russian" for { text, verses, translation }
 * @param {() => object|null} options.readTextSelection  the exact selected words, as a translate request
 */
export function initVerseActions({ root, store, toaster, onNote, onTranslate, readTextSelection }) {
  let context = null; // { book, chapter, view, columns, query }
  const selected = new Set();
  let anchor = null; // the last verse tapped, for Shift+click ranges
  let source = null; // 'tap' | 'text'
  let settleTimer = 0;

  const title = el('p', { class: 'va-title', id: 'va-title' });
  const closeButton = el('button', { type: 'button', class: 'icon-button va-close', onclick: () => clear() }, icon(ICONS.close, { size: 18 }));
  const swatches = HIGHLIGHT_COLORS.map((color) =>
    el('button', { type: 'button', class: `va-swatch va-swatch--${color}`, 'data-color': color, onclick: () => highlight(color) }),
  );
  const clearHighlight = el('button', { type: 'button', class: 'va-swatch va-swatch--none', onclick: () => highlight(null) }, icon(ICONS.eraser, { size: 18 }));
  const colorsGroup = el('div', { class: 'va-colors', role: 'group' }, swatches, clearHighlight);

  const action = (iconPath, onclick, extra = {}) => {
    const label = el('span', { class: 'va-label' });
    const button = el('button', { type: 'button', class: 'va-action', onclick, ...extra }, icon(iconPath, { size: 20 }), label);
    return { button, label };
  };
  const note = action(ICONS.note, () => addNote());
  const bookmark = action(ICONS.bookmark, () => toggleBookmark(), { 'aria-pressed': 'false' });
  const copy = action(ICONS.copy, () => toggleCopyMenu(), { 'aria-expanded': 'false', 'aria-controls': 'va-copy-menu' });
  const share = action(ICONS.share, () => sharePassage());
  const translate = action(ICONS.translate, () => translateSelection(), { 'data-action': 'translate' });

  const copyPlain = el('button', { type: 'button', class: 'text-button', onclick: () => copyPassage(false) });
  const copyNamed = el('button', { type: 'button', class: 'text-button', onclick: () => copyPassage(true) });
  const copyMenu = el('div', { class: 'va-copy-menu', id: 'va-copy-menu', hidden: true }, copyPlain, copyNamed);

  const bar = el(
    'section',
    { class: 'verse-actions', 'aria-labelledby': 'va-title', hidden: true },
    el('div', { class: 'va-head' }, title, closeButton),
    el('div', { class: 'va-row' }, colorsGroup, el('div', { class: 'va-actions' }, note.button, bookmark.button, copy.button, share.button, translate.button)),
    copyMenu,
  );
  // A press on the bar must not clear a text selection (it would deselect).
  bar.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button')) event.preventDefault();
  });

  /* -------- what is selected -------- */

  const verses = () => [...selected].sort((a, b) => a - b);
  const verseElement = (verse) => context?.view.textRoot.querySelector(`[data-verse="${verse}"]`);
  const reference = () => `${chapterTitle(context.book, context.chapter)}:${verseRangeLabel(verses())}`;
  /** The whole selection as one range (first to last verse), for notes, bookmarks and links. */
  const spanRef = () => {
    const list = verses();
    return makeRef(context.book.id, context.chapter, list[0], list[list.length - 1]);
  };

  /** Each translation's text of the selected verses, read from the page. */
  function columnsText() {
    return context.columns.map((info, index) => ({
      name: info.name,
      abbreviation: info.abbreviation,
      language: info.language,
      id: info.id,
      verses: verses().flatMap((number) => {
        const verseEl = verseElement(number);
        const textEl = verseEl?.classList.contains('prow') ? verseEl.querySelectorAll('.pcell')[index]?.querySelector('.vtext') : verseEl?.querySelector('.vtext');
        return textEl ? [{ number, text: textEl.textContent }] : [];
      }),
    }));
  }

  function render() {
    for (const verseEl of context?.view.textRoot.querySelectorAll(VERSE) ?? []) {
      const on = selected.has(Number(verseEl.dataset.verse));
      verseEl.classList.toggle('is-selected', on);
      verseEl.querySelector(NUMBER)?.setAttribute('aria-pressed', String(on));
    }
    if (!context || selected.size === 0) {
      bar.hidden = true;
      closeCopyMenu();
      return;
    }
    const chapterItems = context.store.inChapter(context.book.id, context.chapter);
    const colorsHere = new Set(
      verses().map((verse) => chapterItems.find((item) => item.type === 'highlight' && item.ref.start <= verse && verse <= item.ref.end)?.color ?? null),
    );
    const ref = spanRef();
    const bookmarked = chapterItems.some((item) => item.type === 'bookmark' && sameRef(item.ref, ref));

    title.textContent = reference();
    bar.setAttribute('aria-label', t('study.actionsFor', { ref: reference() }));
    closeButton.setAttribute('aria-label', t('study.clearSelection'));
    colorsGroup.setAttribute('aria-label', t('study.highlight'));
    swatches.forEach((swatch) => {
      const color = swatch.dataset.color;
      swatch.setAttribute('aria-label', t('study.highlightIn', { color: t(`study.colorIn.${color}`) }));
      swatch.title = t(`study.color.${color}`);
      swatch.setAttribute('aria-pressed', String(colorsHere.size === 1 && colorsHere.has(color)));
    });
    clearHighlight.hidden = colorsHere.size === 1 && colorsHere.has(null);
    clearHighlight.setAttribute('aria-label', t('study.removeHighlight'));
    clearHighlight.title = t('study.removeHighlight');
    note.label.textContent = t('study.note');
    bookmark.label.textContent = bookmarked ? t('study.bookmarkedShort') : t('study.bookmark');
    bookmark.button.setAttribute('aria-pressed', String(bookmarked));
    copy.label.textContent = t('study.copy');
    share.label.textContent = t('study.share');
    translate.label.textContent = t('study.translate');
    translate.button.hidden = !context.columns.some((info) => /^en\b/.test(info.language ?? ''));
    translate.button.setAttribute('aria-label', t('translate.button'));
    copyPlain.textContent = t('study.copyPlain');
    copyNamed.textContent = t('study.copyNamed');
    bar.hidden = false;
  }

  function select(verse, { range = false } = {}) {
    if (source === 'text') {
      selected.clear();
      document.getSelection()?.removeAllRanges();
    }
    source = 'tap';
    if (range && anchor !== null) {
      const [from, to] = anchor < verse ? [anchor, verse] : [verse, anchor];
      for (let v = from; v <= to; v += 1) if (verseElement(v)) selected.add(v);
    } else if (selected.has(verse)) {
      selected.delete(verse);
    } else {
      selected.add(verse);
    }
    anchor = verse;
    setRoving(verse);
    render();
  }

  function clear({ keepText = false } = {}) {
    clearTimeout(settleTimer); // a pending text-selection check would re-select
    selected.clear();
    anchor = null;
    source = null;
    if (!keepText && textSelectionInChapter()) document.getSelection().removeAllRanges();
    render();
  }

  function textSelectionInChapter() {
    const selection = document.getSelection();
    if (!context || !selection || selection.isCollapsed || selection.rangeCount === 0) return false;
    return selection.getRangeAt(0).intersectsNode(context.view.textRoot);
  }

  /* -------- input -------- */

  // Shift+click extends the verse selection; stop the browser from also
  // extending a text selection from the caret.
  root.addEventListener('mousedown', (event) => {
    if (event.shiftKey && anchor !== null && context?.view.textRoot.contains(event.target) && event.target.closest(VERSE)) event.preventDefault();
  });

  root.addEventListener('click', (event) => {
    if (!context || !context.view.textRoot.contains(event.target)) return;
    const verseEl = event.target.closest(VERSE);
    if (!verseEl || event.target.closest('a, .study-marks')) return;
    const onNumber = Boolean(event.target.closest(NUMBER));
    const extend = event.shiftKey && anchor !== null;
    // A click on the words that ends a drag, or the 2nd click of a
    // double-click (selecting a word), is text selection, not a tap.
    if (!onNumber && !extend && (event.detail > 1 || !document.getSelection()?.isCollapsed)) return;
    select(Number(verseEl.dataset.verse), { range: event.shiftKey });
  });

  // Dragging across text selects the verses it covers.
  document.addEventListener('selectionchange', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (!context) return;
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        if (source === 'text' && !bar.contains(document.activeElement)) clear({ keepText: true });
        return;
      }
      const range = selection.getRangeAt(0);
      if (!context.view.textRoot.contains(range.commonAncestorContainer) && !range.intersectsNode(context.view.textRoot)) return;
      const covered = [...context.view.textRoot.querySelectorAll(VERSE)]
        .filter((verseEl) => [...verseEl.querySelectorAll('.vtext')].some((text) => coversText(range, text)))
        .map((verseEl) => Number(verseEl.dataset.verse));
      if (covered.length === 0) return;
      selected.clear();
      covered.forEach((verse) => selected.add(verse));
      source = 'text';
      anchor = covered[covered.length - 1];
      render();
    }, 150);
  });

  // ↑/↓/Home/End move between verse numbers (one Tab stop for the chapter).
  root.addEventListener('keydown', (event) => {
    const button = event.target.closest?.(NUMBER);
    if (!button || !context?.view.textRoot.contains(button)) return;
    const buttons = [...context.view.textRoot.querySelectorAll(`${VERSE} > :is(${NUMBER})`)];
    const index = buttons.indexOf(button);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const target = buttons[Math.max(0, Math.min(buttons.length - 1, next))];
    setRoving(Number(target.closest(VERSE).dataset.verse));
    target.focus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || selected.size === 0) return;
    if (!copyMenu.hidden) {
      closeCopyMenu();
      copy.button.focus();
      return;
    }
    const focusInBar = bar.contains(document.activeElement);
    const verse = anchorOrFirst(); // before clear() forgets it
    clear();
    if (focusInBar) focusVerse(verse);
  });

  function anchorOrFirst() {
    return anchor ?? Number(context?.view.textRoot.querySelector(VERSE)?.dataset.verse);
  }

  /** Make this verse's number the chapter's one Tab stop. */
  function setRoving(verse) {
    if (!context) return;
    for (const button of context.view.textRoot.querySelectorAll(`${VERSE} > :is(${NUMBER})`)) {
      button.tabIndex = Number(button.closest(VERSE).dataset.verse) === verse ? 0 : -1;
    }
  }

  function focusVerse(verse) {
    verseElement(verse)?.querySelector(NUMBER)?.focus({ preventScroll: true });
  }

  /* -------- actions -------- */

  function saved(result) {
    if (result?.saved === false) toaster.show(t('study.saveFailed'), { tone: 'error' });
  }

  async function highlight(color) {
    const before = context.store.inChapter(context.book.id, context.chapter).filter((item) => item.type === 'highlight');
    const runs = verseRuns(verses());
    let result;
    for (const [from, to] of runs) result = await context.store.highlight(makeRef(context.book.id, context.chapter, from, to), color);
    saved(result);
    const { book, chapter } = context;
    const verseAfter = anchorOrFirst();
    clear();
    focusIfInBar(verseAfter);
    if (!color) {
      toaster.show(t('study.highlightRemoved'), {
        action: {
          label: t('study.undo'),
          onClick: async () => {
            const now = context.store.inChapter(book.id, chapter).filter((item) => item.type === 'highlight');
            await context.store.remove(now.map((item) => item.id));
            await context.store.restore(before);
          },
        },
      });
    }
  }

  async function toggleBookmark() {
    const ref = spanRef();
    const verseAfter = anchorOrFirst();
    const result = await context.store.toggleBookmark(ref);
    const label = reference();
    clear();
    focusIfInBar(verseAfter);
    if (result.bookmarked) toaster.show(t('study.bookmarkAdded', { ref: label }));
    else toaster.show(t('study.bookmarkRemoved'), { action: { label: t('study.undo'), onClick: () => context.store.restore([result.removed]) } });
  }

  function addNote() {
    const ref = spanRef();
    clear();
    onNote(ref);
  }

  function toggleCopyMenu() {
    const open = copyMenu.hidden;
    copyMenu.hidden = !open;
    copy.button.setAttribute('aria-expanded', String(open));
    if (open) copyPlain.focus();
  }

  function closeCopyMenu() {
    copyMenu.hidden = true;
    copy.button.setAttribute('aria-expanded', 'false');
  }

  async function copyPassage(withName) {
    const text = formatPassage(reference(), columnsText(), { withName });
    const verseAfter = anchorOrFirst();
    const copied = await copyText(text);
    clear();
    focusIfInBar(verseAfter, true);
    toaster.show(copied ? t('study.copied') : t('study.copyFailed'), { tone: copied ? 'info' : 'error' });
  }

  async function sharePassage() {
    const ref = spanRef();
    const text = formatPassage(reference(), columnsText(), { withName: true });
    const url = new URL(chapterHref(context.book, context.chapter, ref.start, context.query, ref.end), window.location.href).href;
    const verseAfter = anchorOrFirst();
    const label = reference();
    clear();
    focusIfInBar(verseAfter, true);
    if (navigator.share) {
      try {
        await navigator.share({ title: label, text, url });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // the reader closed the share sheet
      }
    }
    // No share sheet (most desktop browsers): copy the link instead.
    const copied = await copyText(url);
    toaster.show(copied ? t('study.linkCopied') : t('study.copyFailed'), { tone: copied ? 'info' : 'error' });
  }

  function translateSelection() {
    // Dragged text: exactly those words. Tapped verses: their whole text,
    // from the first English translation shown.
    let request = source === 'text' ? readTextSelection() : null;
    if (!request) {
      const english = columnsText().find((column) => /^en\b/.test(column.language ?? '') && column.verses.length);
      if (!english) return;
      request = { text: english.verses.map((verse) => verse.text).join(' '), verses: english.verses.map((verse) => verse.number), translation: english.id };
    }
    clear({ keepText: true });
    onTranslate(request);
  }

  // After an action from the bar, the bar disappears. Keep keyboard focus
  // in the text rather than letting it fall to the page.
  function focusIfInBar(verse, always = false) {
    if (always || document.activeElement === document.body || !document.activeElement || bar.contains(document.activeElement)) {
      if (bar.hidden && verse) focusVerse(verse);
    }
  }

  return {
    /**
     * The chapter on screen (or null). `view` is the reader view (textRoot,
     * actionsSlot); `columns` its translations; `query` its "t=…" for links.
     */
    setContext(next) {
      clearTimeout(settleTimer);
      selected.clear();
      anchor = null;
      source = null;
      context = next ? { ...next, store } : null;
      if (context) {
        context.view.textRoot.after(bar);
        const target = context.view.textRoot.querySelector('.is-target') ?? context.view.textRoot.querySelector(VERSE);
        if (target) setRoving(Number(target.dataset.verse));
      } else {
        bar.remove();
      }
      render();
    },

    /** Refresh the bar (study items or the language changed). */
    refresh: render,

    clear,
  };
}
