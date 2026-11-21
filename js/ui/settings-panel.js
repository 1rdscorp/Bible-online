/**
 * The "Aa" reading-settings panel: theme choice and text size.
 *
 * It's a disclosure (a button with aria-expanded controlling a panel), not a
 * modal: the page stays live behind it, so text-size changes preview
 * immediately. It closes on Escape (returning focus to the button), on a
 * click outside, or when keyboard focus leaves it.
 *
 * The markup lives in index.html. This module only wires it to settings.js.
 */
import { DEFAULT_SETTINGS, FONT_SCALES, getSettings, onSettingsChange, stepFontScale, updateSettings } from '../settings.js';

export function initSettingsPanel({ button, panel }) {
  const themeInputs = [...panel.querySelectorAll('input[name="theme"]')];
  const smaller = panel.querySelector('[data-font-step="-1"]');
  const larger = panel.querySelector('[data-font-step="1"]');
  const reset = panel.querySelector('[data-font-reset]');
  const value = panel.querySelector('[data-font-value]');
  let open = false;

  // aria-disabled rather than `disabled`: a disabled button drops keyboard
  // focus, which would strand the user at the end of the range.
  function setInactive(control, inactive) {
    control.setAttribute('aria-disabled', String(inactive));
  }
  const isInactive = (control) => control.getAttribute('aria-disabled') === 'true';

  function render({ theme, fontScale }) {
    for (const input of themeInputs) input.checked = input.value === theme;
    value.textContent = `${fontScale}%`;
    setInactive(smaller, fontScale <= FONT_SCALES[0]);
    setInactive(larger, fontScale >= FONT_SCALES[FONT_SCALES.length - 1]);
    setInactive(reset, fontScale === DEFAULT_SETTINGS.fontScale);
  }

  for (const input of themeInputs) {
    input.addEventListener('change', () => {
      if (input.checked) updateSettings({ theme: input.value });
    });
  }

  for (const control of [smaller, larger]) {
    control.addEventListener('click', () => {
      if (isInactive(control)) return;
      const step = Number(control.dataset.fontStep);
      updateSettings({ fontScale: stepFontScale(getSettings().fontScale, step) });
    });
  }

  reset.addEventListener('click', () => {
    if (!isInactive(reset)) updateSettings({ fontScale: DEFAULT_SETTINGS.fontScale });
  });

  function setOpen(next, { returnFocus = false } = {}) {
    if (open === next) return;
    open = next;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      (themeInputs.find((input) => input.checked) ?? themeInputs[0])?.focus();
    } else if (returnFocus) {
      button.focus();
    }
  }

  button.addEventListener('click', () => setOpen(!open));

  document.addEventListener('keydown', (event) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, { returnFocus: true });
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (open && !panel.contains(event.target) && !button.contains(event.target)) setOpen(false);
  });

  // Close when Tab moves focus out of the panel. relatedTarget is null when
  // focus goes nowhere (e.g. clicking blank space), and pointerdown handles that.
  panel.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (open && next && !panel.contains(next) && next !== button) setOpen(false);
  });

  onSettingsChange(render);
  render(getSettings());

  return {
    isOpen: () => open,
    close: () => setOpen(false),
  };
}
