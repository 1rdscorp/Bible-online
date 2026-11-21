/**
 * Short messages at the bottom of the screen ("Copied", "Bookmark removed
 * · Undo"). One at a time; a new message replaces the old one.
 *
 * The region is a live region, so screen readers announce each message. A
 * message with an action stays a little longer, and stays while the pointer
 * or focus is on it, so there's time to reach the button.
 */
import { el } from './dom.js';

export function createToaster({ duration = 3500 } = {}) {
  const region = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
  document.body.append(region);
  let timer = 0;
  let current = null;

  function hide() {
    clearTimeout(timer);
    current?.remove();
    current = null;
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (current && (current.matches(':hover') || current.contains(document.activeElement))) schedule(1500);
      else hide();
    }, ms);
  }

  return {
    /** show('Copied') or show('Bookmark removed', { action: { label: 'Undo', onClick } }) */
    show(message, { action = null, tone = 'info' } = {}) {
      hide();
      current = el(
        'div',
        { class: `toast toast--${tone}` },
        el('span', { class: 'toast-text' }, message),
        action &&
          el(
            'button',
            {
              type: 'button',
              class: 'toast-action',
              onclick: () => {
                hide();
                action.onClick();
              },
            },
            action.label,
          ),
      );
      region.append(current);
      schedule(action ? duration + 3000 : duration);
    },
    hide,
  };
}
