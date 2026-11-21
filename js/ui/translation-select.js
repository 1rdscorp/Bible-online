/**
 * A compact translation picker: shows "KJV ⌄" and opens the device's native
 * list of full names ("KJV — King James Version").
 *
 * It's a real <select>, stretched invisibly over the visible label, so
 * keyboard use, screen readers and the phone's native picker all work with no
 * custom widget code. The label shows only the abbreviation, because a native
 * select would display the whole long option text.
 */
import { el, icon, ICONS } from './dom.js';

/**
 * @param {object} options
 * @param {object[]} options.translations  TranslationInfo list (all options)
 * @param {string} options.value           selected id
 * @param {string[]} [options.disabledIds] ids shown greyed out (already in another column)
 * @param {string} options.label           accessible name, e.g. "Translation"
 * @param {string} [options.focusKey]      lets main.js restore focus after a re-render
 * @param {(id: string) => void} options.onChange
 */
export function createTranslationSelect({ translations, value, disabledIds = [], label, focusKey, onChange }) {
  const abbreviation = (id) => translations.find((t) => t.id === id)?.abbreviation ?? '';
  const display = el('span', { class: 'tselect-value', 'aria-hidden': 'true' }, abbreviation(value));

  const select = el(
    'select',
    { class: 'tselect-native', 'aria-label': label, 'data-focus-key': focusKey },
    translations.map((t) =>
      el('option', { value: t.id, disabled: t.id !== value && disabledIds.includes(t.id) }, `${t.abbreviation} — ${t.name}`),
    ),
  );
  select.value = value;
  select.addEventListener('change', () => {
    display.textContent = abbreviation(select.value);
    onChange(select.value);
  });

  return {
    element: el('span', { class: 'tselect' }, display, icon(ICONS.chevronDown, { size: 14, className: 'tselect-chevron' }), select),
    select,
    setValue(id) {
      select.value = id;
      display.textContent = abbreviation(id);
    },
  };
}
