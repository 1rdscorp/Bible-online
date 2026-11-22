# Bible Online

A calm, fast, distraction-free Bible reader. It is a static site: HTML, CSS and vanilla JavaScript modules with no build step and no backend. It is built to be hosted on GitHub Pages.

Nine public-domain translations can be read one at a time or 2–4 side by side, with verses aligned:
- **English:** KJV, ASV, WEB, YLT, Darby, BBE, and KJV+ (the KJV with Strong's numbers, for word study)
- **Russian:** the Synodal translation (RST), renumbered to English verse numbers so it lines up
- **Greek:** the Septuagint (LXX), the ancient Greek Old Testament, in Brenton's 1851 text, renumbered the same way

Full-text search covers one translation or all of them, and typing a reference such as "Jn 3:16" opens the passage.

Highlights, notes and bookmarks are saved on the device, listed on a My Study page, and can be backed up to a file.

For research, a side panel shows each verse's cross-references, and in KJV+ the Hebrew or Greek word behind any English word, with every verse that uses it. Study pages introduce each book of the Bible and include a timeline and maps of Bible places.

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
- **Unit tests:** canon, router, translation selection, verse alignment, versification remapping, the provider contract, the cache, the registry, interface languages, search (tokenizing and queries, the index, references, search URLs), and study tools (verse ranges and highlight splitting, note markup, copy formats, backups, the store).
- **Data checks:** every translation in `data/translations.json` is validated, version-checked and scanned for leftover markup. The research data (cross-references, Strong's dictionaries, places, basemap) and the study content (introductions, timeline, maps) are checked too: every reference must exist and every outline must cover its book.

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
| `#/study` | My Study: highlights, notes and bookmarks (filters: `?type=note&color=yellow&book=JHN&tag=prayer&q=…&sort=recent`) |
| `#/translations` | About each translation: description, copyright, source |
| `#/john/intro` | Introduction to John: author, date, themes, outline, key verses, places, timeline events |
| `#/timeline` | The Bible timeline (`?event=crucifixion` brings one event into view) |
| `#/maps` | The maps; `#/maps/paul?place=a5feb15` opens one with a place selected |
| `#/explore` | Interactive studies; `#/explore/daniel-statue?part=legs&reading=traditional` opens the statue of Daniel 2 at a part |
| `#/commentary` | Adventist commentary: the books; `#/commentary/desire-of-ages` one book's contents (`?book=daniel` only its chapters on Daniel); `#/commentary/desire-of-ages/17` a chapter; `#/commentary/daniel-and-the-revelation/dan-2?v=31` opens Smith's Daniel 2 at verse 31 |

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
- **Matching:** whole words, ignoring case. In Russian, ё and е match each other. In Greek, accents and breathings are ignored, so `λογος` finds λόγος.
- **Options:** search one translation or all of them, the whole Bible, one Testament or one book.
- **Results:** grouped by book, with counts. The counts at the top narrow the search to that book, and matching words are highlighted. Clicking a result opens the verse, which flashes briefly. Back returns to the same place in the results.
- **Psalm numbers:** a Psalm typed with a Russian name ("Пс 22") uses Synodal numbering and opens the matching English-numbered psalm (Psalm 23).
- **Off the main thread:** the index is built in a Web Worker, so the page never freezes. The first search in a translation downloads it if needed, then indexes it (about 0.3 s each, all eight in about 2–3 s). After that, searches take milliseconds.

The URL holds the whole search, `#/search?q=…&t=<id or all>&in=<all, OT, NT or a book id>&match=<all, any or phrase>`, so a search can be bookmarked or shared.

## Highlights, notes and bookmarks

Tap or click a verse to select it (tap more to add them, or Shift+click for a range), or drag across text. An action bar appears at the bottom:

| Action | What it does |
|---|---|
| Five colours | Highlight the verses (one colour per verse; a new colour replaces the old one there). The eraser removes it, with Undo. With words selected, the colours highlight just those words (below) |
| Note | Opens the Notes panel to write a note on those verses |
| Bookmark | Bookmarks them (again to remove, with Undo) |
| Copy | "Text and reference", or "With translation name" (`… John 3:16 — King James Version`). When comparing, each translation gets a labelled line |
| Share | The phone's share sheet where there is one; otherwise copies a link to the verses (`#/john/3/16-18?t=kjv`) |
| Search | With words selected: look them up on the search page. One word is searched as a word, several as an exact phrase, in the translation they were selected from |
| Translate | Translate to Russian (English text only; see below) |

**Keyboard:** the verse numbers are buttons with one Tab stop for the chapter. **↑/↓** (Home/End) move between them, **Enter** selects, **Shift+Enter** selects a range, **Tab** reaches the bar, and **Escape** clears the selection.

**Saved by verse, not by text.** Each item is stored as book + chapter + verse range, in the English verse numbering every translation here is converted to. A highlight made in the KJV shows on the same verses in the ASV, in the Synodal, and in compare view.

**Word highlights:**
- **Making one:** select words (drag, double-click, or long-press on a phone) and pick a colour. Only those words are highlighted, not the verse. The selection snaps to whole words, and it can run across verses. The bar's title shows the words ("John 3:16 · “so loved the world”") so it's clear what the colours apply to.
- **Removing:** the eraser removes word highlights under the selection, with Undo.
- **One translation each:** the words differ between translations, so a word highlight belongs to the translation it was made in. It shows there, alone or as a compare column, but not in other translations.
- **Stored with their words:** each one keeps the words it covers, so it can't land on the wrong words if a text is ever corrected.
- **With verse highlights:** a word highlight can sit on a verse highlight; a thin underline keeps it visible.
- **In My Study:** word highlights are listed under Highlights, with the verse shown in their translation and the words marked.

**Notes:**
- **The panel** (docked on the right on wide screens, a sheet from the bottom on phones) shows the chapter's notes and searches all of them. It opens from the action bar, from a note's marker after its verse, or from "Notes" under the chapter.
- **The editor** has bold, italic and bullet lists (also Ctrl/⌘+B and Ctrl/⌘+I), plus tags. **Ctrl/⌘+Enter** saves.
- **Stored as simple markup** (`**bold**`, `*italic*`, `- item`). Notes are displayed by building the page element by element, never as raw HTML, and pasted text comes in as plain text. So a note, or an imported backup, can't inject anything into the page.

**My Study** (the bookmark icon in the header, "My Study" under each chapter, or the home page) lists everything:
- **Grouped:** by book in Bible order, or as one list of recent changes.
- **Filters:** type, colour, book, tag and words. They're kept in the URL.
- **Each item** shows its verses in the translation you're reading. Notes can be edited in place, and anything can be deleted, with Undo.

**Backup:**
- **Download:** the My Study page saves everything on the device (study items, settings, translation choices, last chapter read) as one JSON file.
- **Import:** loads a backup, either merging (for an item on both sides, the more recently changed copy wins) or replacing everything. Each item is checked first; damaged ones are skipped and counted.

Data lives in the browser's storage on this device, through `js/storage.js`, the one module that touches persistence. Items carry random ids and change times, ready for a future cloud sync. Two open tabs keep each other up to date.

## Translate a selection into Russian

Select English or Greek (Septuagint) Bible text (in single view, or in that column when comparing), or tap verses, and choose **Translate** in the action bar. The panel it opens shows:
- **Machine translation** of exactly the selected words. It's made on the device by the browser's built-in Translator API (desktop Chrome and Edge), so nothing leaves the device. A browser that doesn't answer within a few seconds says so.
- **Open in Yandex Translate:** opens Yandex Translate with the selected text already filled in, and translated straight away (no account, nothing to paste). It's offered in every browser. With the Russian interface it opens the Russian site, translate.yandex.ru. The text goes to Yandex only when you click the link.
- **The Russian Synodal text of the same verses,** a real Bible translation. It's skipped when the Synodal is already a column on screen.

No paid translation API is used: its key would be public on a static site, and the project has no backend. Translate.com, used for a while, can't receive text through a link, so readers had to paste it themselves.

**Septuagint Greek:** machine translators know Modern Greek but not ancient Greek. So the Septuagint's text is sent to them as Modern Greek, rewritten in modern spelling: breathings dropped, accents simplified (`ἘΝ ἀρχῇ` → `ΕΝ αρχή`). In tests with Yandex Translate this made the difference between nonsense and a usable rendering (Genesis 1:1: "В начале Бог сотворил небо и Землю"). The panel says it's a rough guide. The Synodal verses below it are the real translation.

## Research: cross-references and word study

Select a verse (tap its number) and choose **Research**. A panel opens on the right (on phones, from the bottom), so the chapter stays in view. It has three tabs:

- **Cross-references:** related passages for each selected verse, best first, with their text quoted. There are 340,000 references from [OpenBible.info](https://www.openbible.info/labs/cross-references/), ranked by readers' votes. Following one opens it in the reader and leaves the panel as it was.
- **Commentary:** the Adventist commentary on the selected verses (see below). Uriah Smith's sections on them are quoted in part; Ellen G. White's chapters that tell the passage show their opening lines. Each links to the full text.
- **Word study:** in **KJV+**, tap any word, or pick one from the selected verse's list. The panel shows the Hebrew or Greek word, its transliteration and pronunciation, Strong's definition, how the KJV renders it, and its origin, with links to related entries. Below that it shows how often the word is used, the English words it's translated by, and every verse that uses it, with the word marked. In other translations, the tab offers to open the passage in KJV+.

Word highlights work in KJV+ as elsewhere, and the words stay tappable.

## Study pages

- **Book introductions** (`#/<book>/intro`), for all 66 books in English and Russian: a summary, author and date (the traditional view, plus the main scholarly view where it differs), themes, an outline linked into the text, key verses quoted in the translation being read, the book's places on the maps, and its events on the timeline. They're linked from each chapter and from the chapter grid.
- **Timeline** (`#/timeline`): 50 events in 10 eras, from Abraham to Revelation. Each event has its passages and a link to its place on a map. Where dates are disputed, the usual alternatives are given.
- **Maps** (`#/maps`): the Ancient Near East, the land of Israel, the land of the Gospels, and Paul's journeys, which can be shown or hidden one by one. Choosing a place, on the map or in the list under it, shows how sure its location is and every verse that names it. The maps are SVG, drawn from the site's own data with no map service or tiles, and follow the theme.
  - **Zoom and pan:**

    | Input | Pan | Zoom |
    |---|---|---|
    | Mouse | drag (the map follows the pointer exactly; a quick drag glides on and slows to a stop) | Ctrl/⌘ + scroll (or a trackpad pinch); double-click zooms in, Shift + double-click out |
    | Touch | two fingers (one in full screen) | pinch |
    | Keyboard (map focused) | arrow keys | **+** / **−**; **0** shows the whole map |

    Pointing at a place with the mouse rings it, shows its name and turns the cursor into a pointer, since a click selects it. Outside full screen, plain scrolling and one-finger swipes still scroll the page, and a hint says how to move the map. Buttons zoom in and out, show the whole map, and switch to full screen. Text and dots keep their size, more names appear as you zoom in, and zooming out shows the lands around the map.
  - **Show all places** adds every place OpenBible.info locates (about 1,300), each selectable.
  - **Full screen** gives the map the whole window, with the selected place's details underneath; Escape leaves it.

- **Interactive studies** (`#/explore`). The first is **the statue of Nebuchadnezzar's dream** (Daniel 2), linked from Daniel 2 and 7, the Daniel introduction and the book list.
  - **The figure:** choose a part, on the figure or in the list: head of gold, chest and arms of silver, belly and thighs of bronze, legs of iron, feet of iron and clay, or the stone. You see its verses (quoted in your translation), the kingdom it stands for, its dates and history, and related passages in Daniel 7, 8 and 11.
  - **Two readings:** a switch compares the traditional reading (Babylon, Medo-Persia, Greece, Rome) with the one many modern scholars hold (Babylon, Media, Persia, Greece).
  - **Time and place:** a time bar shows the kingdoms and key events. A zoomable map flies to each kingdom and shades its approximate extent, clipped to the coast, with its cities and historical sites such as Persepolis, Gaugamela and Constantinople.
  - **Play the dream:** the stone strikes, the statue turns to dust, and the stone grows into a mountain (Daniel 2:34–35).

- **Adventist commentary** (`#/commentary`), linked next to Interactive studies on the book list. It holds classic Seventh-day Adventist books that are now in the public domain:
  - Ellen G. White's **Conflict of the Ages**, which retells the Bible story chapter by chapter: *Patriarchs and Prophets* (1890; the 1913 edition), *Prophets and Kings* (1917), *The Desire of Ages* (1898) and *The Acts of the Apostles* (1911).
  - Uriah Smith's **Daniel and the Revelation** (1897), a verse-by-verse commentary on both books.

  Each chapter says which Bible passages it's based on, and every Bible chapter it covers lists it under the text ("Adventist commentary: The Desire of Ages: 17. Nicodemus"). Smith's chapters quote the KJV verses each section is on. Ellen White's show the printed book's page numbers in the margin, for citing. Bible references inside the text are links. The books are in English, also in the Russian interface, which says so.

  The *Seventh-day Adventist Bible Commentary* (1953–1957, revised 1976–1980) is still under copyright, so it isn't included.

The pages are built from reusable templates (`js/views/templates/study-page.js`: page, facts, tags, outline, quotes, link cards; `era-bar.js`: periods on a time axis) and data files (`data/study/`), so new pages such as topics or reading plans follow the same pattern.

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
css/                  themes.css (colour tokens), base, layout, picker, reader, parallel, translate,
                      search, study, research (the Research panel), pages (study pages, maps),
                      explore (the statue), commentary
js/
  main.js             Entry point: routes → views, translation choice, keyboard, last-read
  i18n.js             Interface language: t('key'), book names, RUS | ENG (text in locales/)
  translate/          Translate-selection helpers: on-device machine translation, Yandex
                      Translate link, clipboard, text tidying
  search/             Full-text search: words and queries (text.js), the index (engine.js),
                      the Web Worker and its client, references ("Jn 3:16"), search URLs
  study/              Highlights, notes, bookmarks: the model (verse ranges, one colour per
                      verse), the store, note markup, copy formats, backup files
  research/           Research data: loading it (data.js), references ("ROM 5:8"),
                      Strong's helpers, the concordance (run in the search worker), commentary
                      lookups (which chapters discuss a verse)
  geo/                Maps: projection and label placement (projection.js), zoom and pan (view.js),
                      the SVG map (map.js)
  canon.js            The 66 books: USFM ids, names, URL slugs, chapter counts
  router.js           Hash routing (#/john/3/16?t=kjv) and canonical redirects
  translations.js     Which translations to show: ?t= parsing, preferences, columns
  storage.js          The only persistence module (localStorage now; swappable)
  settings.js         Theme and text size
  providers/          Translation provider layer: contract, registry, JSON provider,
                      device cache, base for API sources (see its README)
  ui/                 DOM helper, header, settings panel, translation dropdown + Compare,
                      verse actions bar, study marks, Notes and Research panels (side-panels.js
                      docks them), toasts
  views/              Book/chapter picker, reader (single + parallel), verse alignment,
                      search page, My Study, Translations page, book introductions, timeline,
                      maps, commentary, messages; templates/ holds the study-page building blocks;
                      explore/ holds the interactive studies (the statue of Daniel 2)
data/                 translations.json + one JSON file per translation; research.json lists the
                      research data: xref/ (cross-references), strongs/ (dictionaries), geo/
                      (places, basemap), study/ (introductions, timeline, maps), commentary/.
                      See data/README.md
tools/                serve, build-data (download → convert → validate), build-xref, build-strongs,
                      build-geo, build-study, build-commentary, converters, validator
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
  - Translate selected English text into Russian (on-device machine translation, a Yandex Translate link with the text filled in, Synodal verses)
  - The Septuagint (LXX), in Greek, with a polytonic Greek font stack and accent-insensitive search; its text can be translated into Russian too
- [x] **Stage 3:** full-text search in one or all translations (all words, any word, exact phrase, word starts), book/Testament filters, results grouped by book with counts and highlights, jump-and-flash to the verse, reference entry ("Jn 3:16", "Ps 23:1-4", Russian names too), and indexing in a Web Worker
- [x] **Stage 4:** personal study tools: tap or select verses for an action bar (5 highlight colours, notes, bookmarks, two copy formats, share), a Notes panel with a rich-ish editor, tags and search, a My Study page with filters, highlights kept by verse reference across translations, and JSON backup export/import
  - Added later: word-level highlights (in the translation they were made in), and searching for selected words
- [x] **Stage 5:** research and study pages: a Research side panel with cross-references (OpenBible.info) and Strong's word study in KJV+ (Hebrew/Greek word, transliteration, definition, every verse using it); book introductions for all 66 books, a timeline and SVG maps of key places, built as reusable page templates; English and Russian
  - Added later: zoomable, interactive maps; the interactive statue of Daniel 2 (`#/explore`); public-domain Adventist commentary (`#/commentary`): Ellen G. White's Conflict of the Ages and Uriah Smith's Daniel and the Revelation
- [ ] Later: reading plans, topical lookups, offline support, cloud sync
