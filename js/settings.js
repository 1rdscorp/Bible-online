/**
 * Reading settings (theme and text size).
 *
 * The settings are kept in memory, saved through storage.js, and applied to
 * <html>:
 *   data-theme="light|sepia|dark"  (no attribute = "auto": follow the device)
 *   --reader-scale: 1.1            (multiplies the scripture font size)
 * The CSS does the rest. Other modules can subscribe with onSettingsChange().
 */
import { storage } from './storage.js';

export const THEMES = Object.freeze(['auto', 'light', 'sepia', 'dark']);

/** Text sizes offered by the A− / A+ buttons, as % of the default reading size. */
export const FONT_SCALES = Object.freeze([80, 90, 100, 110, 120, 135, 150, 175, 200]);

// language: the interface language chosen with the RUS | ENG switch, or null
// to follow the browser (resolved by js/i18n.js).
export const DEFAULT_SETTINGS = Object.freeze({ theme: 'auto', fontScale: 100, language: null });

// Stored as "bible-online:settings". The inline script in index.html reads it
// before first paint, so keep the key and value shape in sync with that script.
const SETTINGS_KEY = 'settings';

let current = { ...DEFAULT_SETTINGS };
const listeners = new Set();

function closestScale(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.fontScale;
  return FONT_SCALES.reduce((best, scale) => (Math.abs(scale - value) < Math.abs(best - value) ? scale : best));
}

function sanitize(settings) {
  return {
    theme: THEMES.includes(settings?.theme) ? settings.theme : DEFAULT_SETTINGS.theme,
    fontScale: closestScale(settings?.fontScale),
    language: typeof settings?.language === 'string' && /^[a-z]{2}$/.test(settings.language) ? settings.language : null,
  };
}

export async function loadSettings() {
  current = sanitize(await storage.get(SETTINGS_KEY, null));
  applySettings(current);
  watchDeviceTheme();
  return current;
}

export function getSettings() {
  return current;
}

/** Merge `patch` into the settings, then apply, save and notify listeners. */
export function updateSettings(patch) {
  const next = sanitize({ ...current, ...patch });
  if (Object.keys(next).every((key) => next[key] === current[key])) return current;
  current = next;
  applySettings(current);
  storage.set(SETTINGS_KEY, current);
  for (const listener of listeners) listener(current);
  return current;
}

export function onSettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The next text size up (+1) or down (-1), clamped to the available range. */
export function stepFontScale(scale, step) {
  const index = FONT_SCALES.indexOf(closestScale(scale));
  const nextIndex = Math.min(FONT_SCALES.length - 1, Math.max(0, index + Math.sign(step)));
  return FONT_SCALES[nextIndex];
}

function applySettings({ theme, fontScale }) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  root.style.setProperty('--reader-scale', String(fontScale / 100));
  syncThemeColor();
}

// Match the mobile browser's toolbar colour to the page background.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const background = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
  if (background) meta.setAttribute('content', background);
}

let watchingDeviceTheme = false;
function watchDeviceTheme() {
  if (watchingDeviceTheme || !window.matchMedia) return;
  watchingDeviceTheme = true;
  // In "auto" mode the CSS follows the device by itself. Only the toolbar
  // colour needs updating when the device switches between light and dark.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (current.theme === 'auto') syncThemeColor();
  });
}
