# Bible Online

A calm, fast, distraction-free Bible reader. It is a static site: HTML, CSS and vanilla JavaScript modules with no build step and no backend. It is built to be hosted on GitHub Pages.

Seven public-domain translations can be read one at a time or 2–4 side by side, with verses aligned:
- **English:** KJV, ASV, WEB, YLT, Darby, BBE
- **Russian:** the Synodal translation (RST), renumbered to English verse numbers so it lines up

Full-text search covers one translation or all of them, and typing a reference such as "Jn 3:16" opens the passage.

## Run it locally

Browsers block JavaScript modules and data loading on `file://` pages, so serve the folder instead of opening `index.html` directly:

```bash
npm start
```

That uses Node 20+ (no dependencies to install) and serves http://localhost:8000. Without Node, run this from the project folder:

```bash
python3 -m http.server 8000
```

To try the site on a phone on the same Wi-Fi, run `HOST=0.0.0.0 npm start` and open `http://<your-computer's-IP>:8000`.

## Test

```bash
npm test
```

This runs two groups of tests:
- **Unit tests:** canon, router, translation selection, verse alignment, versification remapping, the provider contract, the cache, the registry, interface languages, and search (tokenizing and queries, the index, references, search URLs).
- **Data checks:** every translation in `data/translations.json` is validated, version-checked and scanned for leftover markup.

## Deploy to GitHub Pages

In the repository, go to **Settings → Pages → Build and deployment**. Set **Source: Deploy from a branch**, pick `main` and the folder `/ (root)`, then save. The site appears at `https://<user>.github.io/<repo>/`. All paths are relative and routing uses `#/…` URLs, so no further setup is needed.

## URLs

| URL | Shows |
|---|---|
| `#/` | Book list (Old/New Testament) |
| `#/john` | Chapter grid for John |
| `#/john/3?t=kjv` | John 3 in the KJV |
| `#/john/3?t=kjv,asv,web` | John 3 in three translations side by side (2–4) |
| `#/john/3/16?t=web` | John 3, scrolled to and highlighted at verse 16 |
| `#/psalms/23/1-4?t=kjv` | Psalm 23 with verses 1–4 highlighted |
| `#/search?q=faith&t=kjv` | Search results (see below for the other options) |
| `#/translations` | About each translation: description, copyright, source |

A link without `?t=` opens in the translations you used last. Abbreviations redirect to the canonical URL (`#/jn/3` → `#/john/3?t=…`). Opening the site with no `#…` resumes the last chapter read.

Keyboard: **←** / **→** go to the previous/next chapter (in the same translations). **/** opens search.

## Search

Open it with the magnifier in the header, or press **/**. Type words and press Enter.

| Type | Finds |
|---|---|
| `faith hope love` | verses with all of these words (choose **Any word** for any of them) |
| `"in the beginning"` | the exact phrase (or choose **Exact phrase** and leave out the quotes) |
| `lov*` | words starting with "lov": love, loved, lovely… |
| `Jn 3:16`, `Romans 8`, `Ps 23:1-4`, `1 Cor 13:4–7` | opens the passage instead of searching |
| `Ин 3:16`, `Рим 8`, `1 Кор 13` | the same with Russian book names |

How it works:
- **Matching:** whole words, ignoring case. In Russian, ё and е match each other.
- **Options:** search one translation or all of them, the whole Bible, one Testament or one book.
- **Results:** grouped by book, with counts. The counts at the top narrow the search to that book, and matching words are highlighted. Clicking a result opens the verse, which flashes briefly. Back returns to the same place in the results.
- **Psalm numbers:** a Psalm typed with a Russian name ("Пс 22") uses Synodal numbering and opens the matching English-numbered psalm (Psalm 23).
- **Off the main thread:** the index is built in a Web Worker, so the page never freezes. The first search in a translation downloads it if needed, then indexes it (about 0.3 s each, all seven in about 2 s). After that, searches take milliseconds.

The URL holds the whole search, `#/search?q=…&t=<id or all>&in=<all, OT, NT or a book id>&match=<all, any or phrase>`, so a search can be bookmarked or shared.

## Translate a selection into Russian

Select English Bible text (in single view, or in an English column when comparing) and a **Translate to Russian** button appears under it. The panel it opens shows:
- **Machine translation** of exactly the selected words. It's made on the device by the browser's built-in Translator API (desktop Chrome and Edge), so nothing leaves the device. Where that isn't available, or while it's still working, an **Open in Google Translate** link has the text filled in. A browser that doesn't answer within a few seconds falls back to the link.
- **The Russian Synodal text of the same verses,** a real Bible translation. It's skipped when the Synodal is already a column on screen.

No translation service with an API key is used. On a static site the key would be public, and the project has no backend.

## Interface language

The whole interface is in **English** or **Russian**, switched with the **RUS | ENG** buttons in the top-right corner:
- **Covered:** menus, settings, book names (Synodal style: 1–4 Царств, От Иоанна…), page titles, messages, screen-reader labels, and the descriptions and licences on the Translations page.
- **Remembered:** the choice is saved on the device. A first visit follows the browser's language.
- **Not affected:** the Bible text stays in its translation's own language, and URLs and verse numbers don't change.

To add another interface language:
1. Copy `js/locales/en.js` to `js/locales/<code>.js` and translate it. `npm test` checks that every key and placeholder matches.
2. Register it in `LANGUAGES` in `js/i18n.js` and in the language check of the inline script in `index.html`.
3. Optionally add `i18n.<code>` blocks to the entries in `data/translations.json`.

## Project layout

```
index.html            App shell: header, settings panel, <main> where views render
css/                  themes.css (colour tokens), base, layout, picker, reader, parallel, translate, search
js/
  main.js             Entry point: routes → views, translation choice, keyboard, last-read
  i18n.js             Interface language: t('key'), book names, RUS | ENG (text in locales/)
  translate/          Translate-selection helpers: on-device machine translation, text tidying
  search/             Full-text search: words and queries (text.js), the index (engine.js),
                      the Web Worker and its client, references ("Jn 3:16"), search URLs
  canon.js            The 66 books: USFM ids, names, URL slugs, chapter counts
  router.js           Hash routing (#/john/3/16?t=kjv) and canonical redirects
  translations.js     Which translations to show: ?t= parsing, preferences, columns
  storage.js          The only persistence module (localStorage now; swappable)
  settings.js         Theme and text size
  providers/          Translation provider layer: contract, registry, JSON provider,
                      device cache, base for API sources (see its README)
  ui/                 DOM helper, header, settings panel, translation dropdown + Compare
  views/              Book/chapter picker, reader (single + parallel), verse alignment,
                      search page, Translations page, messages
data/                 translations.json + one JSON file per translation (see data/README.md)
tools/                serve, build-data (download → convert → validate), converters, validator
tests/                node --test suites
```

- **[data/README.md](data/README.md):** the text format, where each translation comes from and why, rebuilding and adding translations, licensing.
- **[js/providers/README.md](js/providers/README.md):** the provider contract and how to plug in an API source such as API.Bible.

## Stages

- [x] **Stage 1:** core reader: book/chapter picker, chapter view, hash URLs, keyboard navigation, last-read memory, light/sepia/dark themes, text size
- [x] **Stage 2:** six translations, dropdown, parallel view (2–4 columns, aligned, stacks on phones), lazy loading with on-device caching, provider interface ready for API sources, copyright/licence notices and a Translations page
  - Added later: the Russian Synodal translation, with build-time verse renumbering (versification) and a Cyrillic font stack
  - In compare mode, a translation's own Psalm numbers appear under its column picker ("Псалом 22" beside English Psalm 23)
  - Russian interface with a RUS | ENG switch
  - Translate selected English text into Russian (on-device machine translation, Google Translate link, Synodal verses)
- [x] **Stage 3:** full-text search in one or all translations (all words, any word, exact phrase, word starts), book/Testament filters, results grouped by book with counts and highlights, jump-and-flash to the verse, reference entry ("Jn 3:16", "Ps 23:1-4", Russian names too), and indexing in a Web Worker
- [ ] Later: highlights/notes/bookmarks, reading plans, cross-references, Strong's word study, offline support
