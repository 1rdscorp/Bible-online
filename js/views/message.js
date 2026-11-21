/** A simple centred message page: not-found, errors. */
import { el } from '../ui/dom.js';

/**
 * @param {{ title: string, text?: string, links?: { href: string, label: string }[] }} options
 */
export function renderMessage({ title, text = '', links = [] }) {
  return el(
    'section',
    { class: 'message', 'aria-labelledby': 'view-title' },
    el('h1', { class: 'view-title', id: 'view-title', tabindex: '-1' }, title),
    text && el('p', { class: 'message-text' }, text),
    links.length > 0 &&
      el(
        'p',
        { class: 'message-links' },
        links.map((link) => el('a', { class: 'button', href: link.href }, link.label)),
      ),
  );
}
