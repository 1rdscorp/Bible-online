#!/usr/bin/env node
/**
 * Renders the app icons in icons/ from the favicon's design, for the
 * installed app (manifest.webmanifest) and the iPhone home screen.
 *
 *   node tools/build-icons.mjs
 *
 * Needs Playwright with Chromium (a development tool only; the site itself
 * has no dependencies). The PNGs are committed, so this only runs again if
 * the design changes.
 *
 * - icon-192.png, icon-512.png: the favicon as it is (rounded square).
 * - icon-maskable-512.png, apple-touch-icon.png: full-bleed blue square, the
 *   book within the middle 60%, since phones cut their own shape (circle,
 *   squircle) out of these.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));

const BLUE = '#275a8c';
const BOOK = 'M16 10c-2-1.7-5-2.6-9-2.6H6v15h1c4 0 7 .9 9 2.6m0-15c2-1.7 5-2.6 9-2.6h1v15h-1c-4 0-7 .9-9 2.6m0-15v15';

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${BLUE}"/><path d="${BOOK}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// The book spans x 6–26, y 7.4–24.6 (centre 16, 16); scaled to 60% about the centre.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="${BLUE}"/><g transform="translate(16 16) scale(0.62) translate(-16 -16)"><path d="${BOOK}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;

const icons = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', fullBleed, 512],
  ['apple-touch-icon.png', fullBleed, 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg, size] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `${root}icons/${name}`, omitBackground: true });
  console.log(`icons/${name}`);
}
await browser.close();
