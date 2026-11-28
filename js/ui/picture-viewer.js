/**
 * Pictures with numbered points, and a full-screen view of them.
 *
 * numberPins() puts numbered points on a picture (an <svg> showing it) and
 * keeps them the same size on screen however large the picture is drawn.
 * openPictureViewer() shows a picture full screen, the whole of it, with
 * its points: choosing a number brings up what's behind it in a panel
 * (beside the picture on a wide screen, under it on a narrow one). Used by
 * the statue of Daniel 2 and the animals of Revelation.
 *
 * The text beside the picture has its own size, A− / A+ in the viewer's bar
 * (the setting pictureTextScale, on the reader's steps), kept for next time.
 *
 * The viewer is a modal dialog that fills the window, and asks the browser
 * for real full screen where it can (not on iPhone, where filling the
 * window is the most a page can do). Escape, the close button or leaving
 * full screen closes it, and focus returns to where it was.
 */
import { t } from '../i18n.js';
import { getSettings, stepFontScale, updateSettings } from '../settings.js';
import { el, icon, ICONS } from './dom.js';

const SVG = 'http://www.w3.org/2000/svg';
const PIN_RADIUS = 13; // on screen, in CSS pixels

function svgNode(name, attributes = {}, ...children) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  node.append(...children);
  return node;
}

/**
 * A picture as an <svg>: `image` { src, width, height } (in its own pixels),
 * showing `view` [x, y, width, height] of it (the whole by default).
 */
export function pictureSvg({ image, view = [0, 0, image.width, image.height], className = '', label = null }) {
  const svg = svgNode('svg', { class: className, viewBox: view.join(' '), preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
  if (label) {
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  svg.append(svgNode('image', { href: image.src, x: 0, y: 0, width: image.width, height: image.height, preserveAspectRatio: 'none' }));
  return svg;
}

/**
 * Numbered points on a picture's <svg>, 1, 2, 3…: buttons at `points`
 * ([{ at: [x, y], title }]) in the picture's units. Returns { pins, select(n),
 * destroy() }. `onChoose(n)` runs when one is clicked or pressed.
 */
export function numberPins(svg, points, { onChoose, labelFor = (n, title) => t('picture.pointLabel', { n, title }) } = {}) {
  const pins = points.map((point, index) => {
    const n = index + 1;
    const mark = svgNode('g', { class: 'pic-pin-mark' }, svgNode('circle', { class: 'pic-pin-hit', r: PIN_RADIUS * 1.7 }), svgNode('circle', { class: 'pic-pin-dot', r: PIN_RADIUS }), svgNode('text', { y: 4.6 }, String(n)));
    const pin = svgNode('g', { class: 'pic-pin', tabindex: '0', role: 'button', 'aria-pressed': 'false', 'aria-label': labelFor(n, point.title) }, mark);
    pin.addEventListener('click', () => onChoose?.(n));
    pin.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onChoose?.(n);
    });
    svg.append(pin);
    return { pin, at: point.at };
  });

  // Keep the points the same size on screen: scale each by the picture's units per pixel.
  const [, , viewWidth, viewHeight] = svg.getAttribute('viewBox').split(' ').map(Number);
  const place = () => {
    const box = svg.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const perPixel = Math.max(viewWidth / box.width, viewHeight / box.height);
    for (const { pin, at } of pins) pin.setAttribute('transform', `translate(${at[0]} ${at[1]}) scale(${perPixel.toFixed(4)})`);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
  observer?.observe(svg);
  place();

  return {
    pins: pins.map(({ pin }) => pin),
    select(n) {
      pins.forEach(({ pin }, index) => {
        pin.classList.toggle('is-selected', index + 1 === n);
        pin.setAttribute('aria-pressed', String(index + 1 === n));
      });
    },
    destroy: () => observer?.disconnect(),
  };
}

/** A small button over a picture's corner that opens it full screen. */
export function fullScreenButton(onOpen) {
  const button = el('button', { type: 'button', class: 'pic-full-button', 'aria-label': t('picture.fullScreen'), title: t('picture.fullScreen') }, icon(ICONS.expand, { size: 18 }));
  button.addEventListener('click', onOpen);
  return button;
}

let open = null; // the viewer on screen

/**
 * Show a picture full screen with its numbered points.
 * @param {object} options
 * @param {string} options.title          the dialog's title (the picture's subject)
 * @param {string} options.label          the picture's description
 * @param {{ src, width, height }} options.image
 * @param {{ at: [number, number], title: string }[]} options.points
 * @param {(n: number) => Node|Node[]} options.info  what's behind number n
 * @param {number} [options.selected]     the number to show first
 * @param {(n: number) => void} [options.onSelect]  a number was chosen (to keep the page in step)
 * @returns {{ close: () => void }}
 */
export function openPictureViewer({ title, label, image, points, info, selected = 1, onSelect = () => {} }) {
  open?.close();
  const returnFocus = document.activeElement;
  let current = Math.min(Math.max(selected, 1), points.length);
  let closed = false;

  const svg = pictureSvg({ image, className: 'pic-viewer-svg', label });
  const panelNumber = el('span', { class: 'pic-number', 'aria-hidden': 'true' });
  const panelTitle = el('h3', { class: 'pic-panel-title', id: 'pic-panel-title' });
  const panelBody = el('div', { class: 'pic-panel-body' });
  const counter = el('span', { class: 'pic-counter' });
  const prev = el('button', { type: 'button', class: 'pic-step', 'aria-label': t('picture.previous') }, '←');
  const next = el('button', { type: 'button', class: 'pic-step', 'aria-label': t('picture.next') }, '→');
  const panel = el(
    'section',
    { class: 'pic-panel', 'aria-labelledby': 'pic-panel-title', 'aria-live': 'polite' },
    el('header', { class: 'pic-panel-head' }, panelNumber, panelTitle),
    panelBody,
    el('footer', { class: 'pic-panel-foot' }, prev, counter, next),
  );
  const closeButton = el('button', { type: 'button', class: 'pic-close', 'aria-label': t('picture.close') }, icon(ICONS.close, { size: 22 }));

  // The size of the text beside the picture.
  const smaller = el('button', { type: 'button', class: 'pic-size-button', 'aria-label': t('settings.smaller'), title: t('settings.smaller') }, el('span', { class: 'pic-size-a pic-size-a--small', 'aria-hidden': 'true' }, 'A'), '−');
  const larger = el('button', { type: 'button', class: 'pic-size-button', 'aria-label': t('settings.larger'), title: t('settings.larger') }, el('span', { class: 'pic-size-a', 'aria-hidden': 'true' }, 'A'), '+');
  const sizeValue = el('span', { class: 'pic-size-value', 'aria-live': 'polite' });
  const sizeGroup = el('div', { class: 'pic-size', role: 'group', 'aria-label': t('settings.textSize') }, smaller, sizeValue, larger);

  const dialog = el(
    'div',
    { class: 'pic-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'pic-viewer-bar' }, el('h2', { class: 'pic-viewer-title' }, title), el('div', { class: 'pic-viewer-tools' }, sizeGroup, closeButton)),
    el('div', { class: 'pic-viewer-main' }, el('div', { class: 'pic-viewer-stage' }, svg), panel),
  );

  const pins = numberPins(svg, points, { onChoose: (n) => show(n) });

  function show(n) {
    current = n;
    pins.select(n);
    panelNumber.textContent = String(n);
    panelTitle.textContent = points[n - 1].title;
    const body = info(n);
    panelBody.replaceChildren(...(Array.isArray(body) ? body : [body]).filter(Boolean));
    counter.textContent = t('picture.counter', { n, total: points.length });
    prev.disabled = n === 1;
    next.disabled = n === points.length;
    dialog.classList.add('has-panel');
    onSelect(n);
  }

  function applyTextSize(scale) {
    dialog.style.setProperty('--pic-text-scale', String(scale / 100));
    sizeValue.textContent = `${scale}%`;
    smaller.disabled = stepFontScale(scale, -1) === scale;
    larger.disabled = stepFontScale(scale, 1) === scale;
    // At the smallest or largest size, focus moves to the other button rather than leaving the viewer.
    if (document.activeElement === smaller && smaller.disabled) larger.focus();
    if (document.activeElement === larger && larger.disabled) smaller.focus();
  }
  const changeTextSize = (step) => applyTextSize(updateSettings({ pictureTextScale: stepFontScale(getSettings().pictureTextScale, step) }).pictureTextScale);
  smaller.addEventListener('click', () => changeTextSize(-1));
  larger.addEventListener('click', () => changeTextSize(1));
  applyTextSize(getSettings().pictureTextScale);

  prev.addEventListener('click', () => current > 1 && show(current - 1));
  next.addEventListener('click', () => current < points.length && show(current + 1));
  closeButton.addEventListener('click', () => close());

  // Keyboard: Escape closes, ← and → step through the points, Tab stays inside.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && !event.target.closest?.('.pic-panel-body')) {
      event.preventDefault();
      const n = current + (event.key === 'ArrowRight' ? 1 : -1);
      if (n >= 1 && n <= points.length) show(n);
    } else if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Leaving the browser's full screen (Escape, a gesture) closes the viewer too.
  const onFullScreenChange = () => {
    if (!document.fullscreenElement) close();
  };

  // Following a link (a verse in the panel) leaves the viewer for the page it opens.
  const onNavigate = () => close({ restoreFocus: false });
  window.addEventListener('hashchange', onNavigate);

  function close({ restoreFocus = true } = {}) {
    if (closed) return;
    closed = true;
    open = null;
    pins.destroy();
    window.removeEventListener('hashchange', onNavigate);
    document.removeEventListener('fullscreenchange', onFullScreenChange);
    if (document.fullscreenElement === dialog) document.exitFullscreen?.().catch(() => {});
    dialog.remove();
    document.documentElement.classList.remove('has-picture-viewer');
    if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
  }

  document.body.append(dialog);
  document.documentElement.classList.add('has-picture-viewer');
  show(current);
  closeButton.focus({ preventScroll: true });
  if (dialog.requestFullscreen && document.fullscreenEnabled) {
    dialog
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => document.addEventListener('fullscreenchange', onFullScreenChange))
      .catch(() => {}); // not allowed here: the dialog still fills the window
  }

  open = { close: () => close() };
  return open;
}
