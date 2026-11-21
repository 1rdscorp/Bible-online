/**
 * Paints the reader's study items onto the chapter on screen:
 *   - highlights: data-highlight="yellow" on the verse (css/study.css colours its words)
 *   - word highlights: <mark class="word-mark"> around the words, in the
 *     translation they were made in only (text-ranges.js)
 *   - bookmarks: a small ribbon after the verse (the last verse of the range)
 *   - notes: a note button after the verse, which opens the Notes panel
 * and tells screen readers through each verse number's label
 * ("Verse 16, highlighted yellow, bookmarked, 1 note").
 *
 * It only adds and removes its own marks, so it can run again whenever the
 * items change, without rebuilding the chapter.
 */
import { t } from '../i18n.js';
import { highlightsByVerse } from '../study/model.js';
import { el, icon, ICONS } from './dom.js';
import { paintWordMarks } from './text-ranges.js';

const MARKS = 'study-marks';

/**
 * @param {HTMLElement} textRoot  the view's verses (.scripture or .parallel-rows)
 * @param {object[]} items        the study items on this chapter
 * @param {{ book, chapter, onOpenNote: (noteId: string) => void }} options
 */
export function paintStudyMarks(textRoot, items, { book, chapter, onOpenNote }) {
  const colors = highlightsByVerse(items, book.id, chapter);
  const endingAt = (type) => {
    const map = new Map();
    for (const item of items) {
      if (item.type !== type) continue;
      const list = map.get(item.ref.end) ?? [];
      list.push(item);
      map.set(item.ref.end, list);
    }
    return map;
  };
  const bookmarks = endingAt('bookmark');
  const notes = endingAt('note');
  // A verse inside a note's or bookmark's range (not only its last verse).
  const covered = (type, verse) => items.some((item) => item.type === type && item.ref.start <= verse && verse <= item.ref.end);

  for (const verseEl of textRoot.querySelectorAll('[data-verse]')) {
    const verse = Number(verseEl.dataset.verse);
    const color = colors.get(verse);
    if (color) verseEl.dataset.highlight = color;
    else delete verseEl.dataset.highlight;

    // Marks go after the text: in single view at the end of the verse, in
    // compare view at the end of its first cell with text.
    const host = verseEl.classList.contains('prow') ? verseEl.querySelector('.pcell:not(.is-missing)') ?? verseEl.querySelector('.pcell') : verseEl;
    verseEl.querySelectorAll(`.${MARKS}`).forEach((node) => node.remove());
    const here = { bookmarks: bookmarks.get(verse) ?? [], notes: notes.get(verse) ?? [] };
    if (host && (here.bookmarks.length || here.notes.length)) {
      host.append(
        el(
          'span',
          { class: MARKS },
          here.bookmarks.length > 0 && el('span', { class: 'study-bookmark', title: t('study.bookmarkKind') }, icon(ICONS.bookmark, { size: 14 })),
          here.notes.length > 0 &&
            el(
              'button',
              {
                type: 'button',
                class: 'study-note-button',
                'aria-label': t('study.openNotes', { n: here.notes.length }),
                title: t('study.openNotes', { n: here.notes.length }),
                onclick: () => onOpenNote(here.notes[0].id),
              },
              icon(ICONS.note, { size: 15 }),
              here.notes.length > 1 && el('span', { class: 'study-note-count' }, String(here.notes.length)),
            ),
        ),
      );
    }

    // The verse number's accessible name carries the state.
    const button = verseEl.querySelector(':scope > .vnum, :scope > .pnum');
    if (button) {
      const parts = [t('study.verse', { n: verse })];
      if (color) parts.push(t('study.highlightedIn', { color: t(`study.colorIn.${color}`) }));
      if (covered('bookmark', verse)) parts.push(t('study.bookmarked'));
      const noteCount = items.filter((item) => item.type === 'note' && item.ref.start <= verse && verse <= item.ref.end).length;
      if (noteCount) parts.push(t('study.noteCount', { n: noteCount }));
      button.setAttribute('aria-label', parts.join(', '));
    }
  }

  paintWordMarks(textRoot, items.filter((item) => item.type === 'mark'));
}
