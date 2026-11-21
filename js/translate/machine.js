/**
 * Machine translation of a short passage, without a server or an API key.
 *
 * 1. On the device, with the browser's built-in Translator API (Chrome and
 *    Edge on desktop): free and private, since the text never leaves the
 *    device. The first use may download a language model (~tens of MB),
 *    which the browser does once.
 * 2. A link to Translate.com's English→Russian translator. Translate.com
 *    can't take text from a link, so clicking it also copies the text, for
 *    the reader to paste there (js/translate/clipboard.js). Nothing is sent
 *    until the reader does. Its free translator allows a limited number of
 *    characters a day without an account.
 *
 * Translate.com's API isn't used: it is paid, per word, and on a static site
 * its key would be public; the project has no backend (see CLAUDE.md).
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

// Translate.com names its translator pages after the two languages
// (https://www.translate.com/english-russian). Add a language here to offer
// its page; other pairs get the home page.
const TRANSLATE_COM_NAMES = { en: 'english', ru: 'russian' };

/** Translate.com's translator page for this pair of languages. */
export function translateComUrl(from, to) {
  const [source, target] = [TRANSLATE_COM_NAMES[from], TRANSLATE_COM_NAMES[to]];
  return source && target && source !== target ? `https://www.translate.com/${source}-${target}` : 'https://www.translate.com/';
}
