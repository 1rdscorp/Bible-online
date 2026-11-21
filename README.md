# Bible Online

A calm, fast, distraction-free Bible reader. It is a static site: HTML, CSS and vanilla JavaScript modules with no build step and no backend. It is built to be hosted on GitHub Pages.

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

This runs the unit tests (canon, router, translation provider) and the data checks (every translation in `data/translations.json` is validated).

## Deploy to GitHub Pages

In the repository, go to **Settings → Pages → Build and deployment**. Set **Source: Deploy from a branch**, pick the branch (e.g. `main`) and the folder `/ (root)`, then save. The site appears at `https://<user>.github.io/<repo>/`. All paths are relative and routing uses `#/…` URLs, so no further setup is needed. `.nojekyll` stops GitHub from running Jekyll over the files.

## URLs

| URL | Shows |
|---|---|
| `#/` | Book list (Old/New Testament) |
| `#/john` | Chapter grid for John |
| `#/john/3` | John 3 |
| `#/john/3/16` | John 3, scrolled to and highlighted at verse 16 |

Abbreviations redirect to the canonical URL (`#/jn/3` → `#/john/3`). Opening the site with no `#…` resumes the last chapter read.

Keyboard: **←** / **→** go to the previous/next chapter.

## Project layout

```
index.html            App shell: header, settings panel, <main> where views render
css/                  themes.css (colour tokens), base, layout, picker, reader
js/
  main.js             Entry point: routes → views, keyboard, last-read
  canon.js            The 66 books: USFM ids, names, URL slugs, chapter counts
  router.js           Hash routing (#/john/3/16) and canonical redirects
  storage.js          The only persistence module (localStorage now; swappable)
  settings.js         Theme and text size
  providers/          Translation provider layer: registry + JSON-file provider
  ui/                 DOM helper, header, settings panel
  views/              Book/chapter picker, chapter reader, messages
data/                 translations.json + one JSON file per translation (see data/README.md)
tools/                serve.mjs, convert-scrollmapper.mjs, validate-translation.mjs
tests/                node --test suites
```

The text format, where to get public-domain Bible text, and how to add a translation are covered in **[data/README.md](data/README.md)**.

## Stages

- [x] **Stage 1:** core reader: book/chapter picker, chapter view, hash URLs, keyboard navigation, last-read memory, light/sepia/dark themes, text size
- [ ] Later: more translations and side-by-side comparison, search, highlights/notes/bookmarks, reading plans, cross-references, Strong's word study, offline support
