/**
 * Search worker: downloads translations, indexes them and answers searches,
 * all off the main thread, so typing and scrolling never stutter. (Indexing
 * one translation takes a few hundred milliseconds; a search, a few.)
 *
 * Started as a module worker by js/search/client.js. Messages in:
 *
 *   { type: 'prepare', translations }   index these ahead of time (no reply)
 *   { type: 'search', requestId, translations, text, match, scope, offset, limit }
 *
 * where translations = [{ id, abbreviation, url (absolute), version }].
 * Messages out, tagged with the requestId:
 *
 *   { type: 'progress', phase: 'loading'|'indexing', id, step, steps }
 *   { type: 'results', total, books: [[bookId, count]], offset,
 *     hits: [{ bookId, chapter, verse, matches: [{ translationId, text }] }] }
 *   { type: 'superseded' }   a newer search arrived first; this one stopped
 *   { type: 'error', message }
 *
 * Files come through the same device cache as the reader's
 * (providers/translation-cache.js), so a translation already read downloads
 * nothing. Indexes stay in memory until the page is closed.
 */
import { createTranslationCache } from '../providers/translation-cache.js';
import { buildIndex, keyToPosition, runSearch } from './engine.js';
import { parseQuery } from './text.js';

const cache = createTranslationCache();
const indexes = new Map(); // "id@version" → Promise<index>
let latestRequest = 0;
let lastSearch = null; // { key, sources, result }: reused by "Show more"

const post = (message) => self.postMessage(message);

// Let queued messages in, so a newer search can tell an older one to stop.
const yieldToMessages = () => new Promise((resolve) => setTimeout(resolve, 0));

const ready = new Set(); // keys whose index is built

function getIndex(info, report) {
  const key = `${info.id}@${info.version ?? ''}`;
  if (!indexes.has(key)) {
    const promise = (async () => {
      report?.('loading');
      const data = await cache.fetchJson(info.url, info.version);
      report?.('indexing');
      await yieldToMessages(); // the progress message goes out first
      const index = buildIndex(data);
      ready.add(key);
      return index;
    })();
    promise.catch(() => indexes.delete(key)); // try again next time
    indexes.set(key, promise);
  } else if (!ready.has(key)) {
    report?.('indexing'); // already on its way (started by 'prepare')
  }
  return indexes.get(key);
}

async function search({ requestId, translations, text, match, scope, offset = 0, limit = 100 }) {
  latestRequest = Math.max(latestRequest, requestId);
  const key = JSON.stringify([translations.map((info) => `${info.id}@${info.version ?? ''}`), text, match, scope]);

  if (lastSearch?.key !== key) {
    const sources = [];
    for (const [step, info] of translations.entries()) {
      const report = (phase) => post({ type: 'progress', requestId, phase, id: info.id, step: step + 1, steps: translations.length });
      sources.push({ id: info.id, index: await getIndex(info, report) });
      await yieldToMessages();
      if (requestId < latestRequest) {
        post({ type: 'superseded', requestId });
        return;
      }
    }
    lastSearch = { key, sources, result: runSearch(sources, parseQuery(text, match), scope) };
  }

  const { sources, result } = lastSearch;
  const hits = result.keys.slice(offset, offset + limit).map((position) => {
    const { book, chapter, verse } = keyToPosition(position);
    return {
      bookId: book.id,
      chapter,
      verse,
      matches: result.matches.get(position).map(({ source, id }) => ({ translationId: sources[source].id, text: sources[source].index.texts[id] })),
    };
  });
  post({ type: 'results', requestId, total: result.keys.length, books: result.books, offset, hits });
}

self.addEventListener('message', ({ data }) => {
  if (data?.type === 'search') {
    search(data).catch((error) => post({ type: 'error', requestId: data.requestId, message: error?.message ?? String(error) }));
  } else if (data?.type === 'prepare') {
    // One at a time, in order; failures surface when a search needs them.
    (data.translations ?? []).reduce((chain, info) => chain.then(() => getIndex(info)).catch(() => {}), Promise.resolve());
  }
});
