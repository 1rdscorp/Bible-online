/**
 * My Study (#/study): every highlight, note and bookmark, with filters, and
 * the backup (export/import) of everything saved on this device.
 *
 * Filters live in the URL, so Back and bookmarks keep them:
 *   #/study?type=note&color=yellow&book=JHN&tag=prayer&q=love&sort=recent
 *
 * Each item shows its verses in the translation being read (loaded through
 * the providers, filled in as they arrive), its note, and Edit/Delete.
 */
import { getBook } from '../canon.js';
import { bookName, t } from '../i18n.js';
import { chapterHref, navigate, pageHref, PAGES, replaceHash } from '../router.js';
import { backupFileName, makeBackup, readBackup } from '../study/backup.js';
import { booksWithItems, filterItems, findSpan, HIGHLIGHT_COLORS, tagCounts } from '../study/model.js';
import { noteToPlainText } from '../study/richtext.js';
import { selectionFromPrefs, selectionQuery } from '../translations.js';
import { truncate } from '../translate/text.js';
import { el, icon, ICONS } from '../ui/dom.js';
import { createNoteEditor, renderNote } from '../ui/note-editor.js';
import { markedNodes } from '../ui/text-ranges.js';
import { formatDate, refLabel } from '../ui/notes-panel.js';

// The filter's kinds; "Highlights" covers verse and word highlights alike.
const TYPES = ['highlight', 'note', 'bookmark'];
const TYPE_LABELS = { highlight: 'study.typeHighlights', note: 'study.typeNotes', bookmark: 'study.typeBookmarks' };
const isHighlight = (item) => item.type === 'highlight' || item.type === 'mark';
const PREVIEW_CHARS = 320;

/** Read the filters from the URL; unknown values are dropped. */
export function readStudyParams(params = {}) {
  return {
    type: TYPES.includes(params.type) ? params.type : '',
    color: HIGHLIGHT_COLORS.includes(params.color) ? params.color : '',
    book: getBook(params.book)?.id ?? '',
    tag: typeof params.tag === 'string' ? params.tag.trim().toLowerCase().slice(0, 40) : '',
    q: typeof params.q === 'string' ? params.q.slice(0, 200) : '',
    sort: params.sort === 'recent' ? 'recent' : 'bible',
  };
}

export function studyHref(filters = {}) {
  const query = new URLSearchParams();
  for (const key of ['type', 'color', 'book', 'tag', 'q']) if (filters[key]) query.set(key, filters[key]);
  if (filters.sort === 'recent') query.set('sort', 'recent');
  const text = query.toString();
  return pageHref(PAGES.study) + (text ? `?${text}` : '');
}

let page = null; // the page on screen: { element, update(filters) }

/**
 * Show My Study. Called by main.js's router with what the page needs.
 */
export async function showStudyPage({ route, isCurrent, rerender, mount, main, store, toaster, translationState, getProvider, showLoadFailure, backupData, applyBackupExtras }) {
  let state;
  try {
    state = await translationState();
  } catch (error) {
    if (isCurrent()) showLoadFailure(error);
    return;
  }
  if (!isCurrent()) return;
  const filters = readStudyParams(route.params);
  const canonical = studyHref(filters);
  if (window.location.hash !== canonical) replaceHash(canonical);

  if (page && main.contains(page.element) && !rerender) {
    page.update(filters);
    return;
  }
  page = createStudyPage({ filters, store, toaster, state, getProvider, isShown: () => main.contains(page?.element), backupData, applyBackupExtras });
  mount(page.element, { title: t('title.study'), preserve: rerender });
}

function createStudyPage({ filters: initial, store, toaster, state, getProvider, isShown, backupData, applyBackupExtras }) {
  let filters = initial;
  // The translation the reader uses, for the verse previews and links.
  const ids = selectionFromPrefs(state.prefs);
  const previewInfo = state.translations.find((info) => info.id === ids[0]) ?? state.translations[0];
  const linkQuery = selectionQuery(ids);
  let editingId = null;

  const heading = el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, t('study.myStudy'));
  const summary = el('p', { class: 'page-intro' });
  const controls = el('div', { class: 'study-filters' });
  const count = el('p', { class: 'study-count', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { class: 'study-list' });
  const backup = backupSection();
  const element = el('div', { class: 'page study-page' }, heading, summary, controls, count, list, backup);

  const unsubscribe = store.subscribe(() => {
    if (!isShown()) {
      unsubscribe();
      return;
    }
    if (!editingId) renderAll();
  });

  /* -------- filters -------- */

  function setFilter(patch, { replace = true } = {}) {
    navigate(studyHref({ ...filters, ...patch }), { replace });
  }

  function select(id, labelText, options, value, onchange) {
    return el(
      'div',
      { class: 'search-option' },
      el('label', { class: 'search-option-label', for: id }, labelText),
      el('select', { id, class: 'search-select', onchange: (event) => onchange(event.target.value) }, options.map(([optionValue, text]) => el('option', { value: optionValue, selected: optionValue === value }, text))),
    );
  }

  function renderControls() {
    const items = store.all();
    const typeGroup = el(
      'fieldset',
      { class: 'search-match' },
      el('legend', { class: 'search-option-label' }, t('study.show')),
      el(
        'div',
        { class: 'segmented' },
        ['', ...TYPES].map((type) =>
          el(
            'label',
            { class: 'segment' },
            el('input', { type: 'radio', name: 'study-type', value: type, checked: filters.type === type, onchange: () => setFilter({ type, color: type === 'highlight' || !type ? filters.color : '' }) }),
            el('span', {}, type ? t(TYPE_LABELS[type]) : t('study.typeAll')),
          ),
        ),
      ),
    );

    // Colour filter: only meaningful for highlights.
    const colorGroup =
      !filters.type || filters.type === 'highlight'
        ? el(
            'fieldset',
            { class: 'study-colors' },
            el('legend', { class: 'search-option-label' }, t('study.colour')),
            el(
              'div',
              { class: 'study-color-options' },
              ['', ...HIGHLIGHT_COLORS].map((color) =>
                el(
                  'label',
                  { class: `study-color-option${color ? ` study-color-option--${color}` : ''}`, title: color ? t(`study.color.${color}`) : t('study.anyColour') },
                  el('input', { type: 'radio', name: 'study-color', value: color, checked: filters.color === color, onchange: () => setFilter({ color, type: color ? 'highlight' : filters.type }) }),
                  el('span', { class: 'study-color-swatch', 'aria-hidden': 'true' }),
                  el('span', { class: 'visually-hidden' }, color ? t(`study.color.${color}`) : t('study.anyColour')),
                ),
              ),
            ),
          )
        : null;

    const books = booksWithItems(items);
    const tags = tagCounts(items);
    const textId = 'study-text';
    const textInput = el('input', { type: 'search', id: textId, class: 'search-select study-text', value: filters.q, placeholder: t('study.searchPlaceholder'), autocomplete: 'off' });
    let timer = 0;
    textInput.addEventListener('input', () => {
      clearTimeout(timer);
      // Filter as you type; the URL follows without adding history entries.
      timer = setTimeout(() => {
        filters = { ...filters, q: textInput.value.trim() };
        replaceHash(studyHref(filters));
        renderList();
      }, 200);
    });

    controls.replaceChildren(
      typeGroup,
      colorGroup,
      el(
        'div',
        { class: 'study-selects' },
        select('study-book', t('search.books'), [['', t('study.allBooks')], ...books.map((book) => [book.id, bookName(book)])], filters.book, (book) => setFilter({ book })),
        tags.length > 0 || filters.tag
          ? select('study-tag', t('notes.tags'), [['', t('study.allTags')], ...tags.map(([tag, n]) => [tag, `#${tag} (${n})`])], filters.tag, (tag) => setFilter({ tag }))
          : null,
        select('study-sort', t('study.sort'), [['bible', t('study.sortBible')], ['recent', t('study.sortRecent')]], filters.sort, (sort) => setFilter({ sort })),
        el('div', { class: 'search-option study-text-field' }, el('label', { class: 'search-option-label', for: textId }, t('study.search')), textInput),
      ),
    );
  }

  /* -------- the list -------- */

  const infoFor = (id) => state.translations.find((info) => info.id === id) ?? previewInfo;

  /**
   * The verses' text, in the translation being read, or for a word
   * highlight in its own translation, with its words marked.
   */
  async function loadPreview(item, target) {
    const info = item.type === 'mark' ? infoFor(item.translation) : previewInfo;
    const { ref } = item;
    try {
      const data = await (await getProvider(info.id)).getChapter(ref.book, ref.chapter);
      const verses = (data?.verses ?? []).filter((verse) => verse.number >= ref.start && verse.number <= ref.end);
      if (item.type !== 'mark') {
        const text = verses.map((verse) => (ref.end > ref.start ? `${verse.number} ${verse.text}` : verse.text)).join(' ');
        target.textContent = truncate(text, PREVIEW_CHARS);
        return;
      }
      // Each verse with its marked words (not shortened, so they stay visible).
      target.replaceChildren(
        ...verses.flatMap((verse, i) => {
          const ranges = item.spans.filter((span) => span.verse === verse.number).flatMap((span) => {
            const found = findSpan(verse.text, span);
            return found ? [{ ...found, color: item.color }] : [];
          });
          return [i ? ' ' : '', ref.end > ref.start ? `${verse.number} ` : '', ...markedNodes(verse.text, ranges)];
        }),
      );
    } catch {
      target.remove();
    }
  }

  function kindLabel(item) {
    if (item.type === 'mark') {
      return el(
        'span',
        { class: `study-kind study-kind--${item.color}` },
        el('span', { class: 'study-dot', 'aria-hidden': 'true' }),
        t('study.markKind', { color: t(`study.colorIn.${item.color}`), abbr: infoFor(item.translation).abbreviation }),
      );
    }
    if (item.type === 'highlight') {
      return el('span', { class: `study-kind study-kind--${item.color}` }, el('span', { class: 'study-dot', 'aria-hidden': 'true' }), t('study.highlightedKind', { color: t(`study.colorIn.${item.color}`) }));
    }
    if (item.type === 'note') return el('span', { class: 'study-kind' }, icon(ICONS.note, { size: 16 }), t('study.noteKind'));
    return el('span', { class: 'study-kind' }, icon(ICONS.bookmark, { size: 16 }), t('study.bookmarkKind'));
  }

  function itemRow(item) {
    const book = getBook(item.ref.book);
    const label = refLabel(item.ref);
    const previewLanguage = (item.type === 'mark' ? infoFor(item.translation) : previewInfo).language;
    const preview = el('blockquote', { class: 'study-verse', lang: previewLanguage || null }, '…');
    loadPreview(item, preview);
    // A word highlight opens in its own translation.
    const query = item.type === 'mark' ? `t=${item.translation}` : linkQuery;
    const body = item.type === 'note' ? el('div', { class: 'note-body' }, renderNote(item.text)) : null;
    const tags = item.tags?.length
      ? el('p', { class: 'note-tags' }, item.tags.map((tag) => el('a', { class: 'note-tag', href: studyHref({ ...filters, tag }) }, `#${tag}`)))
      : null;
    const row = el(
      'li',
      { class: `study-item study-item--${item.type}`, 'data-id': item.id, tabindex: '-1' },
      el(
        'div',
        { class: 'study-item-head' },
        el('a', { class: 'study-ref', href: chapterHref(book, item.ref.chapter, item.ref.start, query, item.ref.end) }, label),
        kindLabel(item),
      ),
      preview,
      body,
      tags,
      el(
        'div',
        { class: 'note-footer' },
        el('span', { class: 'note-date' }, formatDate(item.updated)),
        el(
          'span',
          { class: 'note-buttons' },
          item.type === 'note' &&
            el('button', { type: 'button', class: 'text-button', 'aria-label': t('notes.editNote', { ref: label }), onclick: () => edit(item, row) }, icon(ICONS.edit, { size: 16 }), t('notes.edit')),
          el(
            'button',
            { type: 'button', class: 'text-button text-button--danger', 'aria-label': t('study.deleteItem', { kind: kindText(item), ref: label }), onclick: () => remove(item, row) },
            icon(ICONS.trash, { size: 16 }),
            t('notes.delete'),
          ),
        ),
      ),
    );
    return row;
  }

  function kindText(item) {
    if (item.type === 'mark') return t('study.markKindShort');
    return item.type === 'highlight' ? t('study.highlightKind') : item.type === 'note' ? t('study.noteKind') : t('study.bookmarkKind');
  }

  function renderList() {
    const all = store.all();
    const shown = filterItems(all, { type: filters.type, color: filters.color, book: filters.book, tag: filters.tag, text: filters.q, sort: filters.sort }, (item) => noteToPlainText(item.text));
    count.textContent = all.length === 0 ? '' : t('study.shownCount', { n: shown.length, total: all.length });

    if (all.length === 0) {
      list.replaceChildren(
        el(
          'div',
          { class: 'study-empty' },
          el('p', {}, t('study.emptyTitle')),
          el('p', { class: 'page-intro' }, t('study.emptyHow')),
          el('p', {}, el('a', { class: 'button', href: '#/' }, t('notFound.browse'))),
        ),
      );
      return;
    }
    if (shown.length === 0) {
      list.replaceChildren(el('div', { class: 'study-empty' }, el('p', {}, t('study.noMatches')), el('p', {}, el('a', { href: studyHref({}) }, t('study.clearFilters')))));
      return;
    }

    if (filters.sort === 'recent') {
      list.replaceChildren(el('ul', { class: 'study-items' }, shown.map(itemRow)));
      return;
    }
    // Bible order: grouped by book, like search results.
    const groups = [];
    for (const item of shown) {
      const last = groups[groups.length - 1];
      if (last?.book === item.ref.book) last.items.push(item);
      else groups.push({ book: item.ref.book, items: [item] });
    }
    list.replaceChildren(
      ...groups.map(({ book, items }) => {
        const id = `study-book-${book}`;
        return el(
          'section',
          { class: 'search-group', 'aria-labelledby': id },
          el('h2', { class: 'search-group-title', id }, bookName(getBook(book)), ' ', el('span', { class: 'search-group-count' }, t('study.items', { n: items.length }))),
          el('ul', { class: 'study-items' }, items.map(itemRow)),
        );
      }),
    );
  }

  function renderSummary() {
    const items = store.all();
    const n = (type) => items.filter((item) => (type === 'highlight' ? isHighlight(item) : item.type === type)).length;
    summary.textContent = items.length
      ? [t('study.countHighlights', { n: n('highlight') }), t('study.countNotes', { n: n('note') }), t('study.countBookmarks', { n: n('bookmark') })].join(' · ')
      : t('study.intro');
  }

  function renderAll() {
    renderSummary();
    renderControls();
    renderList();
  }

  /* -------- editing -------- */

  function edit(item, row) {
    editingId = item.id;
    const editor = createNoteEditor({
      text: item.text,
      tags: item.tags,
      label: t('notes.editNote', { ref: refLabel(item.ref) }),
      onSave: async ({ text, tags }) => {
        editingId = null;
        const result = text.trim() ? await store.updateNote(item.id, { text, tags }) : null;
        if (result?.saved === false) toaster.show(t('study.saveFailed'), { tone: 'error' });
        if (!text.trim()) await remove(item, row);
        else {
          renderAll();
          list.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.focus();
        }
      },
      onCancel: () => {
        editingId = null;
        renderAll();
        list.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.focus();
      },
    });
    row.querySelector('.note-body')?.replaceWith(editor.element);
    row.querySelector('.note-tags')?.remove();
    row.querySelector('.note-footer')?.remove();
    editor.focus();
  }

  async function remove(item, row) {
    // Focus moves to the next item (or the count), as the row disappears.
    const next = row.nextElementSibling ?? row.closest('section')?.nextElementSibling?.querySelector('.study-item');
    const removed = await store.remove([item.id]);
    const target = next?.dataset.id ? list.querySelector(`[data-id="${CSS.escape(next.dataset.id)}"]`) : null;
    (target ?? heading).focus({ preventScroll: Boolean(target) });
    toaster.show(t('study.deleted', { kind: kindText(item) }), { action: { label: t('study.undo'), onClick: () => store.restore(removed) } });
  }

  /* -------- backup -------- */

  function backupSection() {
    const status = el('p', { class: 'study-backup-status', role: 'status', 'aria-live': 'polite' });
    // Opened by the "Import a backup…" button; hidden, but still labelled.
    const fileInput = el('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'backup-file', tabindex: '-1', 'aria-label': t('backup.chooseFile') });
    const confirm = el('div', { class: 'study-backup-confirm', hidden: true });

    async function exportBackup() {
      const file = makeBackup({ items: store.all(), ...(await backupData()) });
      const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = el('a', { href: url, download: backupFileName() });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      status.textContent = t('backup.exported', { n: file.data.study.items.length });
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      const result = readBackup(await file.text().catch(() => ''));
      if (!result.ok) {
        confirm.hidden = true;
        status.textContent = t(`backup.error.${result.error}`);
        return;
      }
      showConfirm(result);
    });

    function showConfirm(result) {
      const n = (type) => result.items.filter((item) => (type === 'highlight' ? isHighlight(item) : item.type === type)).length;
      const mode = el('fieldset', { class: 'study-backup-mode' },
        el('legend', { class: 'search-option-label' }, t('backup.how')),
        el('label', {}, el('input', { type: 'radio', name: 'backup-mode', value: 'merge', checked: true }), ' ', t('backup.merge')),
        el('label', {}, el('input', { type: 'radio', name: 'backup-mode', value: 'replace' }), ' ', t('backup.replace')),
      );
      const importButton = el('button', { type: 'button', class: 'button button--primary' }, t('backup.import'));
      const cancel = el('button', { type: 'button', class: 'button', onclick: () => { confirm.hidden = true; status.textContent = ''; } }, t('notes.cancel'));
      importButton.addEventListener('click', async () => {
        const how = mode.querySelector('input:checked').value;
        const outcome = await store.importItems(result.items, how);
        await applyBackupExtras({ ...result, mode: how });
        confirm.hidden = true;
        status.textContent = t('backup.done', { added: outcome.added, updated: outcome.updated });
        if (outcome.saved === false) toaster.show(t('study.saveFailed'), { tone: 'error' });
        renderAll();
      });
      confirm.replaceChildren(
        el('p', {}, t('backup.found', { date: result.exported ? formatDate(result.exported) : '—' })),
        el('p', {}, [t('study.countHighlights', { n: n('highlight') }), t('study.countNotes', { n: n('note') }), t('study.countBookmarks', { n: n('bookmark') })].join(' · ')),
        result.skipped > 0 && el('p', { class: 'study-backup-warning' }, t('backup.skipped', { n: result.skipped })),
        mode,
        el('p', { class: 'study-backup-note' }, t('backup.settingsNote')),
        el('div', { class: 'note-editor-actions' }, importButton, cancel),
      );
      confirm.hidden = false;
      status.textContent = '';
      confirm.querySelector('input')?.focus();
    }

    return el(
      'section',
      { class: 'study-backup', 'aria-labelledby': 'backup-title' },
      el('h2', { class: 'study-backup-title', id: 'backup-title' }, t('backup.title')),
      el('p', { class: 'page-intro' }, t('backup.intro')),
      el(
        'div',
        { class: 'study-backup-buttons' },
        el('button', { type: 'button', class: 'button', onclick: exportBackup }, icon(ICONS.download, { size: 18 }), t('backup.export')),
        el('button', { type: 'button', class: 'button', onclick: () => fileInput.click() }, icon(ICONS.upload, { size: 18 }), t('backup.chooseFile')),
        fileInput,
      ),
      confirm,
      status,
    );
  }

  renderAll();

  return {
    element,
    update(next) {
      const typing = document.activeElement?.id === 'study-text';
      filters = next;
      if (typing) {
        renderList();
        return;
      }
      const focusedName = document.activeElement?.name || document.activeElement?.id;
      renderAll();
      // Keep focus on the filter that was just used.
      if (focusedName) {
        (controls.querySelector(`input[name="${focusedName}"]:checked`) ?? controls.querySelector(`#${CSS.escape(focusedName)}`))?.focus();
      }
    },
  };
}
