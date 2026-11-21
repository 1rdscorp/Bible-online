# Translation providers

Every translation is served by a **provider**. The reader asks a provider for a chapter and gets the same shape back whatever the source. A licensed API (for NIV, ESV, NASB, NLT…) is therefore a new provider type; nothing in the reader changes.

| File | Role |
|---|---|
| `interface.js` | The contract (JSDoc types) and runtime checks |
| `registry.js` | Reads `data/translations.json` and creates one provider per translation, on first use |
| `json-provider.js` | Static JSON files in `/data` (all six public-domain translations) |
| `translation-cache.js` | Stores downloaded JSON files on the device (Cache Storage), keyed by content version |
| `chapter-provider.js` | Base for per-chapter sources such as web APIs: memory cache, de-duplication, retry |

## The contract

```js
provider.info                          // the translations.json entry
await provider.getChapter('JHN', 3)    // → { bookId, chapter, verses: [{ number, text }], copyright? } or null
await provider.getBooks?.()            // optional: USFM ids it contains
await provider.load?.()                // optional: start downloading early
provider.isLoaded?.()                  // optional: true if getChapter needs no network
```

- `getChapter` resolves `null` when the translation doesn't contain that book or chapter, and rejects on network or data errors. The reader shows those as "isn't included" and "couldn't be loaded, Try again".
- `verses` are plain text in ascending order. Leave out verses the translation doesn't have.
- A verse may also carry `words`: `[{ start, end, strongs: ["H7225"] }]`, the words tagged with Strong's numbers (offsets into `text`). A translation that has them sets `"strongs": true` in its entry, and its words can then be tapped for word study. The JSON provider reads them from the file's `tags` (see data/README.md). An API source with original-language tagging could supply them the same way.
- `copyright` is optional per-passage wording. When present it is shown under the text, replacing the translation's `license`/`notice`. Use it when an API sends copyright text that must accompany each passage.

`tests/provider-contract.test.js` runs every provider type through the same checks. Add a new type to its list.

## Adding an API source (example: API.Bible)

> This is a sketch, not tested against the live API. Check API.Bible's current documentation and terms before relying on it.

**1. Get access.** Register at API.Bible for an API key. Many translations there (NIV, ESV…) need the publisher's permission on top of the key.

**2. Write the provider**, `js/providers/api-bible-provider.js`, on top of `createChapterProvider`. API.Bible's chapter ids use the same USFM book codes as this site (`JHN.3`):

```js
import { createChapterProvider } from './chapter-provider.js';

const API = 'https://api.scripture.api.bible/v1';
const API_KEY = '…'; // see "The key is public" below

export function createApiBibleProvider(info) {
  return createChapterProvider({
    info,
    async fetchChapter(bookId, chapter) {
      const url = `${API}/bibles/${info.bibleId}/chapters/${bookId}.${chapter}` +
        '?content-type=json&include-notes=false&include-titles=false&include-verse-numbers=false';
      const response = await fetch(url, { headers: { 'api-key': API_KEY } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`API.Bible: HTTP ${response.status}`);
      const { data } = await response.json();
      return { verses: versesFrom(data.content), copyright: data.copyright };
    },
  });
}

// The JSON content is a tree of nodes; text nodes carry attrs.verseId such as
// "JHN.3.16". Collect text per verse.
function versesFrom(nodes, byVerse = new Map()) {
  for (const node of nodes ?? []) {
    const id = node.attrs?.verseId;
    if (node.type === 'text' && id) byVerse.set(id, `${byVerse.get(id) ?? ''}${node.text}`);
    if (node.items) versesFrom(node.items, byVerse);
  }
  return [...byVerse].map(([id, text]) => ({ number: Number(id.split('.')[2]), text: text.replace(/\s+/g, ' ').trim() }));
}
```

**3. Register the type** in `registry.js`:

```js
const PROVIDER_FACTORIES = { json: createJsonProvider, 'api-bible': createApiBibleProvider };
```

**4. List the translation** in `data/translations.json`. Extra fields such as `bibleId` are passed through to the provider:

```json
{
  "id": "niv", "abbreviation": "NIV", "name": "New International Version", "year": "2011",
  "language": "en", "provider": "api-bible", "bibleId": "<id from API.Bible>",
  "license": "Used by permission",
  "notice": "<the exact credit line the publisher requires>",
  "copyright": "<full copyright statement>"
}
```

It then appears in the dropdown, works in parallel view, and its notice shows under the text.

### Things to settle first

- **The key is public.** On a static site, any key the browser uses can be read from the page. Prefer a tiny proxy (for example a free serverless function) that adds the key server-side, or use domain restrictions if the API offers them.
- **Licence terms.** Licensed text usually may not be stored on the device or shown beyond a set number of verses. `createChapterProvider` keeps chapters in memory only for that reason. Don't route API text through `translation-cache.js`.
- **Usage reporting.** API.Bible has asked integrators to report what's displayed (its "FUMS" scripts). Check the current terms.
- **Required wording.** Most publishers require a specific credit line next to the text; put it in `notice`.
- **Search.** Full-text search (`js/search/`) builds its index from whole translation files, so it covers `json` translations only (`isSearchable()` in `js/search/client.js`). An API translation isn't offered on the search page. To search one, use the API's own search endpoint (API.Bible has one): add an optional `search(query)` method to the provider contract and merge its results with the worker's on the search page.
