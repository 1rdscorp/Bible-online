/**
 * The header's translation controls (reader only): the translation dropdown
 * and the Compare toggle.
 *
 * With one translation, the dropdown picks it. With Compare on, each column
 * has its own picker in the reader (views/reader.js), so the header dropdown
 * hides and the toggle shows as pressed. The decisions about what to show
 * belong to main.js; this module only reports what the reader asked for.
 */
import { getLanguage, t } from '../i18n.js';
import { el, icon, ICONS } from './dom.js';
import { createTranslationSelect } from './translation-select.js';

/**
 * @param {HTMLElement} root
 * @param {{ onSelect: (id: string) => void, onToggleCompare: () => void }} callbacks
 */
export function initTranslationControl(root, { onSelect, onToggleCompare }) {
  const slot = el('span', { class: 'translation-select-slot' });
  const compareText = el('span', { class: 'compare-text' });
  const toggle = el(
    'button',
    {
      type: 'button',
      class: 'compare-toggle',
      'aria-pressed': 'false',
      'data-focus-key': 'compare-toggle',
      onclick: () => onToggleCompare(),
    },
    icon(ICONS.columns, { size: 20 }),
    compareText,
  );
  root.replaceChildren(slot, toggle);

  let select = null;
  let listKey = '';

  return {
    /**
     * Show the current selection (ids: 1 = single, 2–4 = comparing).
     * `translations` are already in the interface language (main.js).
     */
    update({ translations, ids }) {
      compareText.textContent = t('compare.button');
      toggle.title = t('compare.title');

      // Rebuild the options only if the list or the language changed, so a
      // focused dropdown keeps its focus while the page updates.
      const key = `${getLanguage()}:${translations.map((info) => info.id).join(',')}`;
      if (key !== listKey) {
        listKey = key;
        select = createTranslationSelect({
          translations,
          value: ids[0],
          label: t('translation.label'),
          focusKey: 'header-translation',
          onChange: onSelect,
        });
        slot.replaceChildren(select.element);
      }
      select.setValue(ids[0]);
      const comparing = ids.length > 1;
      slot.hidden = comparing;
      toggle.setAttribute('aria-pressed', String(comparing));
    },
  };
}
