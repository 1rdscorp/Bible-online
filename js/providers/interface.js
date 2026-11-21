/**
 * The translation provider contract.
 *
 * Every translation, wherever its text comes from, is served by an object of
 * this shape, and the rest of the app reaches text only through it. A new
 * source, such as a licensed API like API.Bible, is therefore a new provider
 * type, not a change to the reader. js/providers/README.md shows how to add
 * one; tests/provider-contract.test.js checks implementations against it.
 *
 * @typedef {object} TranslationInfo  One entry of data/translations.json
 * @property {string} id               "kjv": lower-case letters, digits and hyphens (it appears in URLs: ?t=kjv)
 * @property {string} abbreviation     "KJV"
 * @property {string} name             "King James Version"
 * @property {string} language         BCP 47 code, e.g. "en"
 * @property {string} provider         provider type that serves it: "json" now; later e.g. "api-bible"
 * @property {string} license          short label shown under the text: "Public domain"
 * @property {'ltr'|'rtl'} [direction]
 * @property {string} [year]
 * @property {string} [notice]         wording a licence requires next to the text (replaces `license` under the text)
 * @property {string} [copyright]      full statement for the Translations page
 * @property {string} [description]
 * @property {{ name: string, url: string }} [source]
 * @property {string} [url]            json provider: the data file
 * @property {string} [version]        json provider: content hash, used as the cache key
 *
 * @typedef {object} Verse
 * @property {number} number
 * @property {string} text             plain text, no markup
 *
 * @typedef {object} Chapter
 * @property {string} bookId           USFM code, e.g. "JHN"
 * @property {number} chapter
 * @property {Verse[]} verses          ascending; verses the translation lacks are left out
 * @property {string} [copyright]      notice the source sends with this passage (APIs often do); shown under it
 *
 * @typedef {object} TranslationProvider
 * @property {TranslationInfo} info
 * @property {(bookId: string, chapter: number) => Promise<Chapter|null>} getChapter
 *   Resolves null if the translation doesn't contain that book/chapter; rejects on network or data errors.
 * @property {() => Promise<string[]>} [getBooks]  USFM ids of the books it contains (omitted = all 66)
 * @property {() => Promise<void>} [load]          start downloading early (optional)
 * @property {() => boolean} [isLoaded]            true when getChapter can answer without the network (optional)
 */

const ID_PATTERN = /^[a-z0-9-]+$/;
const REQUIRED_STRINGS = ['abbreviation', 'name', 'language', 'provider', 'license'];

/** List what's wrong with a translations.json entry (empty array = fine). */
export function checkTranslationInfo(info) {
  if (!info || typeof info !== 'object') return ['not an object'];
  const problems = [];
  if (typeof info.id !== 'string' || !ID_PATTERN.test(info.id)) problems.push('"id" must use only a-z, 0-9 and "-"');
  for (const field of REQUIRED_STRINGS) {
    if (typeof info[field] !== 'string' || info[field] === '') problems.push(`"${field}" is required`);
  }
  if (info.direction !== undefined && info.direction !== 'ltr' && info.direction !== 'rtl') problems.push('"direction" must be "ltr" or "rtl"');
  return problems;
}

/** Throw a clear error if `provider` doesn't implement the contract. */
export function assertProvider(provider, label = 'provider') {
  if (!provider || typeof provider !== 'object') throw new TypeError(`${label} must be an object`);
  if (!provider.info || typeof provider.info.id !== 'string') throw new TypeError(`${label} needs an "info" object with an id`);
  if (typeof provider.getChapter !== 'function') throw new TypeError(`${label} must implement getChapter(bookId, chapter)`);
  for (const optional of ['getBooks', 'load', 'isLoaded']) {
    if (provider[optional] !== undefined && typeof provider[optional] !== 'function') {
      throw new TypeError(`${label}.${optional} must be a function if present`);
    }
  }
  return provider;
}
