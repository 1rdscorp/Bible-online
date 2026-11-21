/**
 * The RUS | ENG switch in the header's top-right corner. The markup is in
 * index.html; this marks the current language (aria-pressed) and reports
 * clicks. main.js saves the choice and re-renders the page.
 */
export function initLanguageSwitch(root, { onChange }) {
  const buttons = [...root.querySelectorAll('[data-lang]')];
  for (const button of buttons) {
    button.addEventListener('click', () => onChange(button.dataset.lang));
  }
  return {
    /** Show `id` as the current language. */
    update(id) {
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.lang === id));
    },
  };
}
