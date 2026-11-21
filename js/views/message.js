/** A simple centred message page: not found, errors. */
import { el } from '../ui/dom.js';

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.text]
 * @param {{ href: string, label: string }[]} [options.links]
 * @param {{ label: string, onClick: () => void }[]} [options.actions]  buttons (e.g. "Try again")
 */
export function renderMessage({ title, text = '', links = [], actions = [] }) {
  return el(
    'section',
    { class: 'message', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, title),
    text && el('p', { class: 'message-text' }, text),
    (links.length > 0 || actions.length > 0) &&
      el(
        'p',
        { class: 'message-links' },
        actions.map((action) => el('button', { type: 'button', class: 'button', onclick: action.onClick }, action.label)),
        links.map((link) => el('a', { class: 'button', href: link.href }, link.label)),
      ),
  );
}
