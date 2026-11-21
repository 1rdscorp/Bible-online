/**
 * Translation registry: reads data/translations.json and hands out one
 * provider per translation (created on first use, then reused).
 *
 * The provider contract is in interface.js. To add a new kind of source (a
 * licensed API such as API.Bible): implement it, add its factory to
 * PROVIDER_FACTORIES under a new key, and list translations in
 * translations.json with that "provider" value. js/providers/README.md walks
 * through it.
 */
import { fetchJson } from './fetch-json.js';
import { assertProvider, checkTranslationInfo } from './interface.js';
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

/** Drop (and log) bad entries rather than breaking the whole site. */
export function checkManifest(manifest, factories = PROVIDER_FACTORIES) {
  if (!manifest || !Array.isArray(manifest.translations)) {
    throw new Error(`${MANIFEST_URL} must contain a "translations" list.`);
  }
  const seen = new Set();
  const translations = [];
  for (const info of manifest.translations) {
    const problems = checkTranslationInfo(info);
    if (!problems.length && !factories[info.provider]) problems.push(`unknown provider "${info.provider}"`);
    if (!problems.length && seen.has(info.id)) problems.push('duplicate id');
    if (problems.length) {
      console.warn(`${MANIFEST_URL}: skipping ${info?.id ?? 'an entry'}: ${problems.join('; ')}`);
      continue;
    }
    seen.add(info.id);
    translations.push(Object.freeze({ direction: 'ltr', ...info }));
  }
  if (translations.length === 0) throw new Error(`${MANIFEST_URL} has no usable translations.`);
  const defaultId = seen.has(manifest.default) ? manifest.default : translations[0].id;
  return { default: defaultId, translations };
}

/** All translations, in the order of translations.json. */
export async function listTranslations() {
  return (await loadManifest()).translations;
}

export async function getDefaultTranslationId() {
  return (await loadManifest()).default;
}

/** Get the provider for a translation id (created once, then cached). */
export async function getProvider(id) {
  const { translations } = await loadManifest();
  const info = translations.find((t) => t.id === id);
  if (!info) throw new Error(`Unknown translation "${id}".`);
  if (!providers.has(id)) {
    providers.set(id, assertProvider(PROVIDER_FACTORIES[info.provider](info), `${info.provider} provider for ${id}`));
  }
  return providers.get(id);
}
