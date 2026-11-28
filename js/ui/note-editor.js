/**
 * Notes on screen: renderNote() shows a note, createNoteEditor() edits one.
 *
 * The editor is a contenteditable box with Bold, Italic and List buttons
 * (and the usual Ctrl/⌘+B, Ctrl/⌘+I). What's typed is turned into the simple
 * markup of js/study/richtext.js when saved; HTML is never stored. Pasted or
 * dropped content comes in as plain text, so styles and scripts from other
 * pages can't get in.
 *
 * Both directions build or read DOM element by element (no innerHTML).
 */
import { t } from '../i18n.js';
import { normalizeTags } from '../study/model.js';
import { parseNote, serializeNote } from '../study/richtext.js';
import { el, icon, ICONS } from './dom.js';

function runNodes(runs) {
  return runs.map((run) => {
    // A link into the site (an Ellen G. White book it has) opens here; others in a new tab.
    let node = !run.href
      ? document.createTextNode(run.text)
      : run.href.startsWith('#')
        ? el('a', { href: run.href, title: run.title }, run.text)
        : el('a', { href: run.href, target: '_blank', rel: 'noopener noreferrer nofollow', title: run.title }, run.text);
    if (run.italic) node = el('em', {}, node);
    if (run.bold) node = el('strong', {}, node);
    return node;
  });
}

/** A note's markup as DOM nodes (paragraphs and lists). */
export function renderNote(text) {
  return parseNote(text).map((block) =>
    block.type === 'ul'
      ? el('ul', {}, block.items.map((runs) => el('li', {}, runNodes(runs))))
      : el('p', {}, block.runs.length ? runNodes(block.runs) : el('br')),
  );
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE']);
const LIST_TAGS = new Set(['UL', 'OL']);

/** Bold/italic for an element, on top of the marks it sits in. */
function marksFor(node, marks) {
  const tag = node.tagName;
  const style = node.style;
  return {
    bold: marks.bold || tag === 'B' || tag === 'STRONG' || Number(style?.fontWeight) >= 600 || style?.fontWeight === 'bold',
    italic: marks.italic || tag === 'I' || tag === 'EM' || style?.fontStyle === 'italic',
  };
}

/** The text of a list item as runs (a nested list is left to its own items). */
function itemRuns(li) {
  const runs = [];
  (function walk(node, marks) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.data.replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
      if (text) runs.push({ text, ...marks });
    } else if (node.nodeType === Node.ELEMENT_NODE && !LIST_TAGS.has(node.tagName)) {
      if (node.tagName === 'BR' && node.nextSibling) runs.push({ text: ' ', ...marks });
      node.childNodes.forEach((child) => walk(child, marksFor(node, marks)));
    }
  })(li, { bold: false, italic: false });
  return runs;
}

/**
 * Read the editor's DOM back into blocks (see richtext.js). Browsers write
 * contenteditable differently (bare text, <div>, <p>, <br>, a list inside a
 * <p>…), so this accepts any of them: block elements and <br> start a new
 * line, lists become lists wherever they sit, and only bold and italic are
 * kept from inline formatting.
 */
export function editorToBlocks(root) {
  const blocks = [];
  let runs = null; // the paragraph being filled, if any
  const current = () => {
    if (!runs) {
      runs = [];
      blocks.push({ type: 'p', runs });
    }
    return runs;
  };
  const breakLine = () => {
    runs = null;
  };

  function walk(node, marks) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.data.replace(/\u00a0/g, ' ').replace(/\n/g, ' ');
      if (text) current().push({ text, ...marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (LIST_TAGS.has(tag)) {
      breakLine();
      const items = [...node.querySelectorAll('li')].map(itemRuns);
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(...items);
      else blocks.push({ type: 'ul', items });
      return;
    }
    if (tag === 'BR') {
      // A <br> ending a block is the browser's placeholder, not a new line.
      if (node.nextSibling) breakLine();
      return;
    }
    if (BLOCK_TAGS.has(tag) || tag === 'LI') {
      breakLine();
      const before = blocks.length;
      node.childNodes.forEach((child) => walk(child, marksFor(node, marks)));
      // An empty line (<p><br></p>) is kept as an empty paragraph.
      if (blocks.length === before) blocks.push({ type: 'p', runs: [] });
      breakLine();
      return;
    }
    node.childNodes.forEach((child) => walk(child, marksFor(node, marks)));
  }

  root.childNodes.forEach((child) => walk(child, { bold: false, italic: false }));
  // Drop list items left empty, and lists left with none.
  return blocks
    .map((block) => (block.type === 'ul' ? { ...block, items: block.items.filter((item) => item.some((run) => run.text.trim())) } : block))
    .filter((block) => block.type !== 'ul' || block.items.length);
}

/**
 * @param {object} options
 * @param {string} [options.text]   the note's markup
 * @param {string[]} [options.tags]
 * @param {string} options.label    accessible name of the text box ("Note on John 3:16")
 * @param {({ text, tags }) => void} options.onSave
 * @param {() => void} options.onCancel
 */
export function createNoteEditor({ text = '', tags = [], label, onSave, onCancel }) {
  const input = el('div', {
    class: 'note-input',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    'data-placeholder': t('notes.placeholder'),
    spellcheck: 'true',
  });
  input.append(...renderNote(text));

  const format = (command, iconPath, labelKey, shortcut) =>
    el(
      'button',
      {
        type: 'button',
        class: 'note-format',
        'data-command': command,
        'aria-label': t(labelKey),
        title: shortcut ? `${t(labelKey)} (${shortcut})` : t(labelKey),
        'aria-pressed': 'false',
        // Keep the text selection in the box while pressing the button.
        onmousedown: (event) => event.preventDefault(),
        onclick: () => {
          input.focus();
          document.execCommand(command);
          updateFormatState();
        },
      },
      icon(iconPath, { size: 18 }),
    );
  const mac = /Mac|iPhone|iPad/.test(navigator.platform ?? '');
  const formatButtons = [
    format('bold', ICONS.bold, 'notes.bold', mac ? '⌘B' : 'Ctrl+B'),
    format('italic', ICONS.italic, 'notes.italic', mac ? '⌘I' : 'Ctrl+I'),
    format('insertUnorderedList', ICONS.list, 'notes.list'),
  ];

  const tagsId = `note-tags-${Math.random().toString(36).slice(2, 8)}`;
  const tagsInput = el('input', { type: 'text', id: tagsId, class: 'note-tags-input', value: tags.join(', '), placeholder: t('notes.tagsPlaceholder'), autocomplete: 'off' });

  const save = () => onSave({ text: serializeNote(editorToBlocks(input)), tags: normalizeTags(tagsInput.value) });
  const element = el(
    'div',
    { class: 'note-editor' },
    el('div', { class: 'note-toolbar', role: 'group', 'aria-label': t('notes.formatting') }, formatButtons),
    input,
    el('div', { class: 'note-tags-field' }, el('label', { for: tagsId }, t('notes.tags')), tagsInput),
    el(
      'div',
      { class: 'note-editor-actions' },
      el('button', { type: 'button', class: 'button button--primary', onclick: save }, t('notes.save')),
      el('button', { type: 'button', class: 'button', onclick: () => onCancel() }, t('notes.cancel')),
    ),
  );

  function updateFormatState() {
    for (const button of formatButtons) {
      let on = false;
      try {
        on = document.queryCommandState(button.dataset.command);
      } catch {
        on = false;
      }
      button.setAttribute('aria-pressed', String(on));
    }
  }

  // Plain text only, from paste and drop.
  const insertPlain = (event, data) => {
    event.preventDefault();
    const plain = data?.getData('text/plain') ?? '';
    if (plain) document.execCommand('insertText', false, plain);
  };
  input.addEventListener('paste', (event) => insertPlain(event, event.clipboardData));
  input.addEventListener('drop', (event) => insertPlain(event, event.dataTransfer));
  input.addEventListener('keyup', updateFormatState);
  input.addEventListener('mouseup', updateFormatState);
  input.addEventListener('focus', () => {
    // New paragraphs as <p>, the same in every browser.
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      // Not supported: editorToBlocks reads <div> and <br> too.
    }
  });
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // don't also close the panel
      onCancel();
    }
  });

  return {
    element,
    focus() {
      input.focus();
      // Caret at the end.
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    },
  };
}
