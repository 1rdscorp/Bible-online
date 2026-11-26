/**
 * Footnotes of a formatted text (BTI). A tap on a mark in the text
 * (<sup class="fn" role="button">, built by js/ui/text-ranges.js) opens its note in a
 * small box beside it; Escape, the close button or a tap elsewhere closes
 * it, and focus goes back to the mark. In the list of a chapter's notes
 * (js/views/reader.js), a note's label scrolls to its verse.
 *
 * The notes ride along on each verse's text element (data-notes), so this
 * module needs no access to the reader's data.
 */
import { t } from '../i18n.js';
import { el } from './dom.js';
import { formatOf, verseNodes } from './text-ranges.js';

export function initFootnotes(root = document) {
  let open = null; // { button, box }

  const close = ({ focus = false } = {}) => {
    if (!open) return;
    const { button, box } = open;
    open = null;
    box.remove();
    button.setAttribute('aria-expanded', 'false');
    if (focus && button.isConnected) button.focus();
  };

  function show(button) {
    const vtext = button.closest('.vtext');
    const note = vtext && formatOf(vtext)?.notes?.[Number(button.dataset.note)];
    if (!note) return;
    const label = button.dataset.label === '*' ? '' : button.dataset.label;
    const box = el(
      'div',
      { class: 'fn-box', id: 'fn-box', role: 'dialog', tabindex: '-1', 'aria-label': t('reader.noteMark', { label }).trim(), lang: vtext.closest('[lang]')?.lang || null },
      el('p', { class: 'fn-box-text' }, el('span', { class: 'fn-box-ref' }, [label, note.ref].filter(Boolean).join(' ')), ' ', verseNodes(note.text, [], [], { marks: note.marks, notes: [] })),
      el('button', { type: 'button', class: 'fn-box-close', 'aria-label': t('reader.noteClose'), title: t('reader.noteClose'), onclick: () => close({ focus: true }) }, '×'),
    );
    document.body.append(box);
    place(box, button);
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', 'fn-box');
    open = { button, box };
    box.focus({ preventScroll: true });
  }

  // Below the mark, kept on screen; above it if there's no room below.
  function place(box, button) {
    const rect = button.getBoundingClientRect();
    const width = box.offsetWidth;
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), document.documentElement.clientWidth - width - 8);
    const below = rect.bottom + 8;
    const top = below + box.offsetHeight > innerHeight - 8 && rect.top > box.offsetHeight + 16 ? rect.top - box.offsetHeight - 8 : below;
    box.style.left = `${left + scrollX}px`;
    box.style.top = `${top + scrollY}px`;
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('.fn');
    if (button) {
      event.preventDefault();
      const again = open?.button === button;
      close();
      if (!again) show(button);
      return;
    }
    const jump = event.target.closest?.('.chapter-note-label');
    if (jump) {
      const verse = document.getElementById(`v${jump.dataset.verse}`);
      verse?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      verse?.querySelector('.vnum, .pnum')?.focus({ preventScroll: true });
      return;
    }
    if (open && !open.box.contains(event.target)) close();
  });

  // The marks act as buttons: Enter and Space open them too.
  root.addEventListener('keydown', (event) => {
    const button = event.target.closest?.('.fn');
    if (!button || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    button.click();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close({ focus: true });
    }
  });
  // Leaving the box with Tab closes it.
  document.addEventListener('focusin', (event) => {
    if (open && !open.box.contains(event.target) && event.target !== open.button) close();
  });
  addEventListener('resize', () => close());

  return { close };
}
