# Bible Online

A calm, fast, distraction-free Bible reader. It is a static site: HTML, CSS and vanilla JavaScript modules with no build step and no backend. It is built to be hosted on GitHub Pages.

Six public-domain translations (KJV, ASV, WEB, YLT, Darby, BBE) can be read one at a time or 2–4 side by side, with verses aligned.

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

This runs the unit tests (canon, router, translation selection, verse alignment, the provider contract, the cache, the registry) and the data checks (every translation in `data/translations.json` is validated, version-checked and scanned for leftover markup).

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
| `#/translations` | About each translation: description, copyright, source |

A link without `?t=` opens in the translations you used last. Abbreviations redirect to the canonical URL (`#/jn/3` → `#/john/3?t=…`). Opening the site with no `#…` resumes the last chapter read.

Keyboard: **←** / **→** go to the previous/next chapter (in the same translations).

## Project layout

```
index.html            App shell: header, settings panel, <main> where views render
css/                  themes.css (colour tokens), base, layout, picker, reader, parallel
js/
  main.js             Entry point: routes → views, translation choice, keyboard, last-read
  canon.js            The 66 books: USFM ids, names, URL slugs, chapter counts
  router.js           Hash routing (#/john/3/16?t=kjv) and canonical redirects
  translations.js     Which translations to show: ?t= parsing, preferences, columns
  storage.js          The only persistence module (localStorage now; swappable)
  settings.js         Theme and text size
  providers/          Translation provider layer: contract, registry, JSON provider,
                      device cache, base for API sources (see its README)
  ui/                 DOM helper, header, settings panel, translation dropdown + Compare
  views/              Book/chapter picker, reader (single + parallel), verse alignment,
                      Translations page, messages
data/                 translations.json + one JSON file per translation (see data/README.md)
tools/                serve, build-data (download → convert → validate), converters, validator
tests/                node --test suites
```

- **[data/README.md](data/README.md):** the text format, where each translation comes from and why, rebuilding and adding translations, licensing.
- **[js/providers/README.md](js/providers/README.md):** the provider contract and how to plug in an API source such as API.Bible.

## Stages

- [x] **Stage 1:** core reader: book/chapter picker, chapter view, hash URLs, keyboard navigation, last-read memory, light/sepia/dark themes, text size
- [x] **Stage 2:** six translations, dropdown, parallel view (2–4 columns, aligned, stacks on phones), lazy loading with on-device caching, provider interface ready for API sources, copyright/licence notices and a Translations page
- [ ] Later: search, highlights/notes/bookmarks, reading plans, cross-references, Strong's word study, offline support
