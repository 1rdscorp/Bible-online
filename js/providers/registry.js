/**
 * Translation provider layer.
 *
 * Every translation is served by a "provider" with the same small interface,
 * so the reader never needs to know whether text comes from a static JSON
 * file (public-domain translations, now) or a licensed API (NIV, ESV, NASB,
 * NLT, later).
 *
 * Provider interface:
 *   info                          the translation's entry from data/translations.json
 *                                 { id, abbreviation, name, language, direction, license, provider, url }
 *   load(): Promise<void>         optional warm-up (e.g. start a download early)
 *   getChapter(bookId, chapter):  Promise<{ bookId, chapter, verses: [{ number, text }] } | null>
 *                                 bookId is a USFM code ("JHN"); null = not in this translation
 *
 * To add an API source later: write providers/api-provider.js implementing
 * the same interface, register it in PROVIDER_FACTORIES under a new key (say
 * "api"), and list the translation in data/translations.json with
 * "provider": "api". Nothing else changes.
 */
import { fetchJson } from './fetch-json.js';
import { createJsonProvider } from './json-provider.js';

const MANIFEST_URL = 'data/translations.json';

/** Provider factories, keyed by the "provider" field in translations.json. */
const PROVIDER_FACTORIES = {
  json: createJsonProvider,
};

let manifestPromise = null;
const providers = new Map();

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchJson(MANIFEST_URL).then(checkManifest);
    manifestPromise.catch(() => {
      manifestPromise = null; // allow a retry after a network error
    });
  }
  return manifestPromise;
}

function checkManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.translations) || manifest.translations.length === 0) {
    throw new Error(`${MANIFEST_URL} must list at least one translation.`);
  }
  return manifest;
}

export async function listTranslations() {
  return (await loadManifest()).translations;
}

export async function getDefaultTranslationId() {
  const manifest = await loadManifest();
  const hasDefault = manifest.translations.some((t) => t.id === manifest.default);
  return hasDefault ? manifest.default : manifest.translations[0].id;
}

/** Get the provider for a translation id (created once, then cached). */
export async function getProvider(id) {
  const manifest = await loadManifest();
  const info = manifest.translations.find((t) => t.id === id);
  if (!info) throw new Error(`Unknown translation "${id}".`);

  if (!providers.has(id)) {
    const factory = PROVIDER_FACTORIES[info.provider];
    if (!factory) throw new Error(`Translation "${id}" needs a "${info.provider}" provider, which doesn't exist.`);
    providers.set(id, factory(info));
  }
  return providers.get(id);
}
