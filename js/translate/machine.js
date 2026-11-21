/**
 * Machine translation of a short passage, without a server or an API key.
 *
 * 1. On the device, with the browser's built-in Translator API (Chrome and
 *    Edge on desktop): free and private, since the text never leaves the
 *    device. The first use may download a language model (~tens of MB),
 *    which the browser does once.
 * 2. A link that opens Yandex Translate with the text already filled in;
 *    it translates as soon as the page opens. Nothing is sent until the
 *    reader clicks it.
 *
 * A paid translation API isn't used: on a static site its key would be
 * public, and the project has no backend (see CLAUDE.md). (Translate.com,
 * tried before, can't receive text through a link at all.)
 *
 * The built-in API can stall (e.g. when the model download is blocked), so
 * every step has a time limit; the caller then falls back to the link.
 */

const translators = new Map(); // "en>ru" → Promise<Translator>

export const TIMEOUTS = { availability: 3000, stalledDownload: 20000, translate: 15000 };

class TimeoutError extends Error {
  constructor(step) {
    super(`On-device translation timed out (${step})`);
    this.name = 'TimeoutError';
  }
}

function withTimeout(promise, ms, step) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(step)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** True if this browser can translate from → to on the device (maybe after a download). */
export async function canTranslateOnDevice(from, to) {
  const api = globalThis.Translator;
  if (!api?.availability) return false;
  try {
    const availability = await withTimeout(api.availability({ sourceLanguage: from, targetLanguage: to }), TIMEOUTS.availability, 'availability');
    return availability !== 'unavailable';
  } catch {
    return false;
  }
}

/**
 * Create the translator. A first use may download the model: that can take a
 * while, so the time limit only applies while no progress is being reported.
 */
function createTranslator(from, to, onProgress) {
  return new Promise((resolve, reject) => {
    let timer;
    const stall = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new TimeoutError('download')), TIMEOUTS.stalledDownload);
    };
    stall();
    globalThis.Translator.create({
      sourceLanguage: from,
      targetLanguage: to,
      monitor(monitor) {
        monitor.addEventListener('downloadprogress', (event) => {
          stall();
          onProgress?.(event.loaded);
        });
      },
    }).then(
      (translator) => {
        clearTimeout(timer);
        resolve(translator);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Translate on the device. `onProgress(fraction)` reports a first-time model
 * download. Must start from a user action (a click), because the browser may
 * need to download the model.
 */
export async function translateOnDevice(text, { from, to, onProgress } = {}) {
  const key = `${from}>${to}`;
  if (!translators.has(key)) {
    const created = createTranslator(from, to, onProgress);
    created.catch(() => translators.delete(key)); // allow a retry
    translators.set(key, created);
  }
  const translator = await translators.get(key);
  return withTimeout(translator.translate(text), TIMEOUTS.translate, 'translate');
}

/**
 * The Bible languages that can be translated into Russian here, and how a
 * machine translator should read them. Ancient Greek (the Septuagint) is
 * offered as Modern Greek, in modern spelling: translators know no ancient
 * Greek, and read it far better that way (see toMonotonic).
 */
export const TRANSLATABLE = Object.freeze({
  en: Object.freeze({ machineLanguage: 'en' }),
  grc: Object.freeze({ machineLanguage: 'el', modernSpelling: true }),
});

/** "en-GB" → "en", "grc" → "grc", anything else → null. */
export function translatableLanguage(language) {
  const base = String(language ?? '').toLowerCase().split('-')[0];
  return TRANSLATABLE[base] ? base : null;
}

// Yandex Translate's page accepts up to 10,000 characters; a link that long
// is still fine for browsers, but keep it well inside common URL limits.
const URL_TEXT_LIMIT = 2000;

/**
 * A link that opens Yandex Translate with `text` filled in, translating
 * from → to. With a Russian interface it opens the Russian site
 * (translate.yandex.ru), otherwise the international one.
 */
export function yandexTranslateUrl(text, from, to, { interfaceLanguage = 'en' } = {}) {
  const host = interfaceLanguage === 'ru' ? 'translate.yandex.ru' : 'translate.yandex.com';
  // encodeURIComponent (not URLSearchParams): spaces as %20, which the page reads reliably.
  const query = [['source_lang', from], ['target_lang', to], ['text', String(text ?? '').slice(0, URL_TEXT_LIMIT)]]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `https://${host}/?${query}`;
}
