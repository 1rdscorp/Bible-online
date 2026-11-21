/**
 * The Notes panel: the notes on the chapter being read, a search across all
 * notes, and writing, editing and deleting notes.
 *
 * It docks on the right on wide screens (the text moves over to make room)
 * and slides up from the bottom on phones. It's a non-modal dialog: the
 * chapter stays usable, and Escape or × closes it, returning focus.
 *
 * Opened from the verse action bar ("Note" → a new note on the selected
 * verses), from a note marker in the text (that note), or from My Study.
 */
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { getBook } from '../canon.js';
import { chapterHref } from '../router.js';
import { filterItems } from '../study/model.js';
import { noteToPlainText } from '../study/richtext.js';
import { el, icon, ICONS } from './dom.js';
import { createNoteEditor, renderNote } from './note-editor.js';

/** "John 3:16–18" in the interface language. */
export function refLabel(ref) {
  const book = getBook(ref.book);
  return `${chapterTitle(book, ref.chapter)}:${ref.start}${ref.end > ref.start ? `–${ref.end}` : ''}`;
}

export function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat(getLanguage(), { dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * @param {object} options
 * @param {object} options.store    js/study/store.js
 * @param {object} options.toaster  js/ui/toast.js
 */
export function initNotesPanel({ store, toaster }) {
  let context = null; // { book, chapter, query }
  let composing = null; // { ref } while writing a new note
  let editingId = null;
  let returnFocus = null;
  let searchTimer = 0;

  const heading = el('h2', { class: 'notes-title', id: 'notes-title', tabindex: '-1' });
  const closeButton = el('button', { type: 'button', class: 'icon-button notes-close', onclick: () => close() }, icon(ICONS.close, { size: 18 }));
  const searchInput = el('input', { type: 'search', class: 'notes-search', id: 'notes-search', autocomplete: 'off' });
  const searchLabel = el('label', { class: 'visually-hidden', for: 'notes-search' });
  const scope = el('p', { class: 'notes-scope', 'aria-live': 'polite' });
  const composer = el('div', { class: 'notes-composer' });
  const list = el('ul', { class: 'notes-list' });
  const empty = el('p', { class: 'notes-empty' });
  const panel = el(
    'div',
    { class: 'notes-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'notes-title', hidden: true },
    el('div', { class: 'notes-head' }, heading, closeButton),
    el('div', { class: 'notes-search-row' }, searchLabel, icon(ICONS.search, { size: 18, className: 'icon notes-search-icon' }), searchInput),
    composer,
    scope,
    list,
    empty,
  );
  document.body.append(panel);

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderList, 150);
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
  store.subscribe(() => {
    if (!panel.hidden && !editingId) renderList();
  });

  /* -------- rendering -------- */

  function renderChrome() {
    heading.textContent = t('notes.title');
    closeButton.setAttribute('aria-label', t('notes.close'));
    searchInput.placeholder = t('notes.searchPlaceholder');
    searchLabel.textContent = t('notes.search');
  }

  function noteHref(ref) {
    return chapterHref(getBook(ref.book), ref.chapter, ref.start, context?.query ?? '', ref.end);
  }

  function card(item) {
    const tags = item.tags.length
      ? el('p', { class: 'note-tags' }, item.tags.map((tag) => el('span', { class: 'note-tag' }, `#${tag}`)))
      : null;
    return el(
      'li',
      { class: 'note-card', id: `note-${item.id}`, tabindex: '-1', 'data-id': item.id },
      el('a', { class: 'note-ref', href: noteHref(item.ref) }, refLabel(item.ref)),
      el('div', { class: 'note-body' }, renderNote(item.text)),
      tags,
      el(
        'div',
        { class: 'note-footer' },
        el('span', { class: 'note-date' }, t('notes.edited', { date: formatDate(item.updated) })),
        el(
          'span',
          { class: 'note-buttons' },
          el('button', { type: 'button', class: 'text-button', 'aria-label': t('notes.editNote', { ref: refLabel(item.ref) }), onclick: () => edit(item.id) }, icon(ICONS.edit, { size: 16 }), t('notes.edit')),
          el('button', { type: 'button', class: 'text-button text-button--danger', 'aria-label': t('notes.deleteNote', { ref: refLabel(item.ref) }), onclick: () => remove(item.id) }, icon(ICONS.trash, { size: 16 }), t('notes.delete')),
        ),
      ),
    );
  }

  function renderList() {
    const query = searchInput.value.trim();
    let notes;
    if (query) {
      notes = filterItems(store.all(), { type: 'note', text: query }, (item) => noteToPlainText(item.text));
      scope.textContent = t('notes.found', { n: notes.length, q: query });
    } else if (context) {
      notes = filterItems(store.inChapter(context.book.id, context.chapter), { type: 'note' });
      // While writing the chapter's first note, "0 notes" would just be noise.
      scope.textContent = notes.length || !composing ? t('notes.inChapter', { title: chapterTitle(context.book, context.chapter), n: notes.length }) : '';
    } else {
      notes = [];
      scope.textContent = '';
    }
    list.replaceChildren(...notes.map(card));
    empty.hidden = notes.length > 0 || Boolean(composing);
    empty.textContent = query ? t('notes.noneFound') : t('notes.none');
  }

  /* -------- writing and editing -------- */

  function compose(ref) {
    composing = { ref };
    const editor = createNoteEditor({
      label: t('notes.newOn', { ref: refLabel(ref) }),
      onSave: async ({ text, tags }) => {
        if (!text.trim()) {
          endCompose();
          return;
        }
        const result = await store.addNote(ref, { text, tags });
        if (result.saved === false) toaster.show(t('study.saveFailed'), { tone: 'error' });
        endCompose();
        focusCard(result.item.id);
      },
      onCancel: () => {
        endCompose();
        heading.focus();
      },
    });
    composer.replaceChildren(el('p', { class: 'notes-composer-title' }, t('notes.newOn', { ref: refLabel(ref) })), editor.element);
    composer.hidden = false;
    renderList();
    editor.focus();
  }

  function endCompose() {
    composing = null;
    composer.replaceChildren();
    composer.hidden = true;
    renderList();
  }

  function edit(id) {
    const item = store.get(id);
    const current = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!item || !current) return;
    editingId = id;
    const editor = createNoteEditor({
      text: item.text,
      tags: item.tags,
      label: t('notes.editNote', { ref: refLabel(item.ref) }),
      onSave: async ({ text, tags }) => {
        editingId = null;
        if (!text.trim()) {
          remove(id);
          return;
        }
        const result = await store.updateNote(id, { text, tags });
        if (result.saved === false) toaster.show(t('study.saveFailed'), { tone: 'error' });
        renderList();
        focusCard(id);
      },
      onCancel: () => {
        editingId = null;
        renderList();
        focusCard(id);
      },
    });
    current.replaceChildren(el('p', { class: 'note-ref' }, refLabel(item.ref)), editor.element);
    editor.focus();
  }

  async function remove(id) {
    const removed = await store.remove([id]);
    renderList();
    heading.focus({ preventScroll: true });
    toaster.show(t('notes.deleted'), { action: { label: t('study.undo'), onClick: () => store.restore(removed) } });
  }

  function focusCard(id) {
    const node = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: 'nearest' });
    node.focus({ preventScroll: true });
    node.classList.add('is-flash');
    node.addEventListener('animationend', () => node.classList.remove('is-flash'), { once: true });
  }

  /* -------- open / close -------- */

  function open() {
    if (panel.hidden) returnFocus = document.activeElement;
    renderChrome();
    panel.hidden = false;
    document.documentElement.classList.add('has-notes-panel');
  }

  function close() {
    if (panel.hidden) return;
    composing = null;
    editingId = null;
    composer.replaceChildren();
    panel.hidden = true;
    document.documentElement.classList.remove('has-notes-panel');
    if (returnFocus?.isConnected && (panel.contains(document.activeElement) || document.activeElement === document.body)) {
      returnFocus.focus({ preventScroll: true });
    } else if (panel.contains(document.activeElement)) {
      document.querySelector('main')?.focus({ preventScroll: true });
    }
  }

  return {
    /** The chapter on screen ({ book, chapter, query }), or null off the reader. */
    setContext(next) {
      context = next;
      if (!panel.hidden && !composing && !editingId) {
        renderChrome();
        renderList();
      }
    },

    /** Write a new note on `ref`. */
    newNote(ref) {
      open();
      searchInput.value = '';
      compose(ref);
    },

    /** Show the panel with this note in view and focused. */
    openNote(id) {
      open();
      if (composing) endCompose();
      searchInput.value = '';
      renderList();
      if (!list.querySelector(`[data-id="${CSS.escape(id)}"]`)) {
        // Not on this chapter (e.g. from My Study): find it by search scope.
        const item = store.get(id);
        if (item) list.prepend(card(item));
      }
      focusCard(id);
    },

    /** Show the chapter's notes (or a search). */
    show() {
      open();
      renderList();
      heading.focus();
    },

    close,
    isOpen: () => !panel.hidden,

    /** Re-render in a new interface language. */
    refresh() {
      if (panel.hidden) return;
      renderChrome();
      if (!editingId && !composing) renderList();
    },
  };
}
