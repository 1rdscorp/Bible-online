# Bible Online

A calm, fast, distraction-free Bible reader. It is a static site: HTML, CSS and vanilla JavaScript modules with no build step and no backend. It is built to be hosted on GitHub Pages.

Ten translations can be read one at a time or 2–4 side by side, with verses aligned:
- **English:** KJV, ASV, WEB, YLT, Darby, BBE, and KJV+ (the KJV with Strong's numbers, for word study), all public domain
- **Russian:** the Synodal translation (RST), public domain, renumbered to English verse numbers so it lines up; and the modern Russian translation of the Institute for Bible Translation named after M. P. Kulakov (BTI, 3rd edition, 2024), used by permission of the Institute, with its section headings, footnotes and printed layout
- **Greek:** the Septuagint (LXX), the ancient Greek Old Testament, in Brenton's 1851 text, renumbered the same way

Full-text search covers one translation or all of them, and typing a reference such as "Jn 3:16" opens the passage.

Highlights, notes and bookmarks are saved on the device, listed on a My Study page, and can be backed up to a file. Reading plans (the Bible in a year, the New Testament in 90 days and others) show each day's reading and tick off chapters as you read.

For research, a side panel shows each verse's cross-references, the topics that cite it, and in KJV+ the Hebrew or Greek word behind any English word, with every verse that uses it. A topical index covers 624 subjects (Torrey's New Topical Textbook), in English and Russian. Study pages introduce each book of the Bible and include a timeline and maps of Bible places.

It works offline and installs on a phone's home screen like an app: everything already opened on the device keeps working without a connection.

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
- **Unit tests:** canon, router, translation selection, verse alignment, versification remapping, the provider contract, the cache, the registry, interface languages, search (tokenizing and queries, the index, references, search URLs), study tools (verse ranges and highlight splitting, note markup, copy formats, backups, the store), reading plans (dates, schedule, progress, the store), topic lookups (search, verse → topics), and offline support (`sw.js` lists the current files, the app manifest and icons).
- **Data checks:** every translation in `data/translations.json` is validated, version-checked and scanned for leftover markup. The research data (cross-references, Strong's dictionaries, places, basemap), the audio data (every chapter has a recording, the Psalm numbering), the reading plans (every chapter once, in order, balanced days), the topics (every reference a real verse, the reverse index, Russian titles) and the study content (introductions, timeline, maps) are checked too: every reference must exist and every outline must cover its book.

## Deploy to GitHub Pages

In the repository, go to **Settings → Pages → Build and deployment**. Set **Source: Deploy from a branch**, pick `main` and the folder `/ (root)`, then save. The site appears at `https://<user>.github.io/<repo>/`. All paths are relative and routing uses `#/…` URLs, so no further setup is needed.

## URLs

| URL | Shows |
|---|---|
| `#/` | Book list (Old/New Testament); the header's translation dropdown chooses what the books open in |
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
| `#/topics` | Topics (`?q=prayer` fills the search box); `#/topics/faith` one topic (`?s=12` opens at its 13th statement, with its verses shown) |
| `#/plans` | Reading plans; `#/plans/bible-year` one plan: start it, today's reading, progress, every day |
| `#/commentary` | Adventist commentary: the books; `#/commentary/desire-of-ages` one book's contents (`?book=daniel` only its chapters on Daniel); `#/commentary/desire-of-ages/17` a chapter (`?v=3` scrolls to where verse 3 is discussed, in a verse-by-verse commentary) |

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

Select a verse (tap its number) and choose **Research**. A panel opens on the right (on phones, from the bottom), so the chapter stays in view. It has four tabs:

- **Cross-references:** related passages for each selected verse, best first, with their text quoted. There are 340,000 references from [OpenBible.info](https://www.openbible.info/labs/cross-references/), ranked by readers' votes. Following one opens it in the reader and leaves the panel as it was.
- **Commentary:** the Adventist commentary on the selected verses (see below): Ellen G. White's chapters that tell the passage, with their opening lines. Each links to the full text.
- **Topics:** the topics whose statements cite the selected verses (see "Topics" below), each with up to three of those statements. A statement opens the topic at that point, with its verses shown.
- **Word study:** in **KJV+**, tap any word, or pick one from the selected verse's list. The panel shows the Hebrew or Greek word, its transliteration and pronunciation, Strong's definition, how the KJV renders it, and its origin, with links to related entries. Below that it shows how often the word is used, the English words it's translated by, and every verse that uses it, with the word marked. In other translations, the tab offers to open the passage in KJV+.

Word highlights work in KJV+ as elsewhere, and the words stay tappable.

## Topics

**Topics** (`#/topics`, linked under the books on the home page) is a topical index: what the Bible says on 624 subjects, from R. A. Torrey's *New Topical Textbook* (1897, public domain), as CCEL publishes it.

- **The list:** A–Z in English, А–Я in Russian, with letters to jump to and a search box. The search matches word starts in the English or the Russian title ("hol spi", "вер", "святой дух") and ignores case, accents and ё/е.
- **A topic:** Torrey's statements, each with its references written compactly as he does ("John 10:7, 9; 14:6; Romans 5:2"). Statements that head a group (Faith → "The objects of, are" → God, Christ…) have their sub-statements nested under them.
  - **Show verses** under a statement quotes its verses in the translation you read last (falling back to the KJV), naming the translation.
  - Every reference links to the passage in the reader. "See Prayer" becomes a link to that topic.
- **In the Research panel:** the Topics tab (above).
- **Russian:** the titles (`tools/topics-ru.json`) and all 23,550 of Torrey's statements (`tools/topics-ru/<id>.txt`) are translated, in Synodal wording. The statements are an AI translation (Claude) of Torrey's public-domain English, and each topic says so, with **Показать английский оригинал** to switch to his English (`?lang=en`). The verses are quoted in the Russian translation being read.
  - **How it was done:** topic by topic, so the Russian agrees with each topic word ("Commanded" is «Заповедана» under Вера, «Заповедано» under Крещение). It followed the guidelines and glossary in `tools/topics-ru/README.md` (Synodal names and terms, set phrases such as "Exemplified" → «Примеры»).
  - **Tooling:** `node tools/translate-topics.mjs` hands out the English as numbered jobs and checks the translations back in: the same number of statements, Russian text. Headings end with a colon and nothing else does.
  - **Torrey's own slips:** where a reference shows that he meant something else ("Enemies of Joab" in Job 30), the translation follows the meaning.
- **Offline:** like the other study data, each file is saved the first time it's opened.

**How it's built:** `node tools/build-topics.mjs` (`npm run build-topics`) reads CCEL's ThML file (cached in `.cache/sources/`) and writes `data/topics/`: `index.json` (titles and counts), one file per topic, and `refs.json` (which statements cite each passage, for the Research panel). It mends CCEL's mistakes where they can be told:
- references to one-chapter books are split in CCEL's markup ("Jude 1" tagged, ":20" left outside), and are read back together;
- four topics carry the wrong title ("B" is Beasts, "Arts of The" is Arts, and a second "Communion With God" and "Early Rising" are really Compassion and Sympathy, and Earth);
- one topic lost its title, Sackcloth, so its statements ran on at the end of Sabbath. The build starts it again at its first paragraph (`TOPIC_SPLITS`);
- references to verses that don't exist are left out.

`tests/topics-data.test.js` checks every reference against the KJV, the See links, the reverse index and the Russian titles; `tests/topics.test.js` checks the search and lookups.

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

  Each chapter says which Bible passages it's based on, and every Bible chapter it covers lists it under the text ("Adventist commentary: The Desire of Ages: 17. Nicodemus"). They show the printed book's page numbers in the margin, for citing. Bible references inside the text are links. The books are in English; in the Russian interface, a chapter that has no Russian translation yet says so.

  The *Seventh-day Adventist Bible Commentary* (1953–1957, revised 1976–1980) is still under copyright, so it isn't included.

  **In Russian.** The published Russian translations of these books are under copyright too, so:
  - **Official edition links:** every Ellen White chapter links to the same chapter in the official Russian edition in [EGW Writings](https://m.egwwritings.org/ru), the White Estate's free online reader («Желание веков», глава 17: «Никодим»).
  - **The site's own translation:** the 9 chapters on Daniel and the Revelation (*Prophets and Kings* 39–45 on Daniel, and *The Acts of the Apostles* 56–57 on John and the Revelation) are translated from English by AI (Claude) for the site. Bible quotations follow the Synodal translation. In the Russian interface these chapters open in Russian, with a switch to the English original (`?lang=en` / `?lang=ru`) and a note that the translation is the site's own, not an official one. Lists and the Research panel use the Russian titles and text where there are some. How to translate more chapters: `tools/commentary-ru/README.md`.

The pages are built from reusable templates (`js/views/templates/study-page.js`: page, facts, tags, outline, quotes, link cards; `era-bar.js`: periods on a time axis) and data files (`data/study/`), so new pages such as topics or reading plans follow the same pattern.

## The BTI translation (Kulakov)

The Institute for Bible Translation named after M. P. Kulakov (Zaoksky) licensed its modern Russian translation for this site. It is shown as the Institute printed it:
- **Section headings** between verses, and each verse's place in a **paragraph** or a **poetry line** (continuations indented; Psalm titles above their first lines).
- **Footnotes:** a small letter (а, б…) or * after a word. Tapping it, or pressing Enter on it, opens the note beside it; all the chapter's notes are also listed under the text, each linked to its verse.
- **Italics** for words the translators added for sense, **«Господь» in small capitals** where the Hebrew has God's name, and **bold** for Old Testament quotations in the New Testament.
- **Verses translated together** are numbered as one ("11–12").

The verse text itself stays plain, so search, copying, highlights (also of single words) and notes work as in the other translations.

**The licence's conditions** (agreement of 25 November 2026, five years): the text may not be changed or edited; the Institute is named as the author on the site's title pages (the home page credits it, and so do the Translations page and the line under every chapter); the site stays free for everyone, with no advertising of any kind; and the rights can't be passed on to anyone else. So the text in this repository may not be copied or reused elsewhere. How the text is built from the Institute's Word files: [data/README.md](data/README.md).

## Audio Bible

Chapters of the Russian Synodal can be heard read aloud. A chapter shown in the Synodal (alone or as a compare column) has a **Listen** button under its title. It opens a player at the bottom of the screen that keeps playing while you move around the site.

- **The recording:** the Synodal Bible read by Alexander Bondarenko, with four books he didn't record (2 Kings, 1 and 2 Chronicles, the Song of Songs) read by Ilya Prudovsky: 1,189 chapters, about 100 hours. The player names the reader.
- **From predanie.ru:** the files stream unchanged from [Предание.ру](https://predanie.ru/bez-avtora/bibliya-sinodalnyy-perevod-chitaet-aleksandr-bondarenko/), whose [terms](https://predanie.ru/page/tos/) (2.2.1) allow free non-commercial use with a clearly visible link to the source and to the page the recording comes from. The player's first line is that credit («Источник: Предание.ру · страница записи», linking to the site and to the chapter's own page), in the same size as the rest of the bar. **The site must stay non-commercial for this:** ads or sales would need a contract with the Предание Foundation.
- **Controls:** play/pause, previous and next chapter, back 15 seconds, a position slider, speed (0.75× to 2×), volume and mute, close. Phones and keyboards' media keys and the lock screen control it too (Media Session). Safari on iPhone and iPad doesn't let a page set the volume (the device's buttons do), so there the player shows only the mute button.
- **Remembered:** the chapter, place, speed and volume are saved on the device, so Listen on the same chapter later carries on where you stopped.
- **Continuous:** at the end of a chapter the next one plays. If you're still on the chapter that ended, the page turns with it; if you've gone elsewhere, your page stays put.
- **Numbering:** the recording follows the printed Synodal Bible, so Psalm 23 plays the Synodal Psalm 22 and the player says so ("По синодальной нумерации: Псалом 22"). Psalm 116 plays Synodal Psalms 114 and 115; Psalm 10, which is the second half of Synodal Psalm 9, plays that recording from its start, with a note.

Another recording (another reader, language or host) is an entry in `tools/audio-sources.json` plus `node tools/build-audio.mjs`; the player reads any source in the same shape (`js/audio/sources.js`).

## Reading plans

**Reading plans** (`#/plans`, linked under the books on the home page) read the Bible a little every day:

| Plan | Days | A day |
|---|---|---|
| The Bible in a year: Genesis to Revelation in book order | 365 | about 11 min |
| Old and New Testament in a year: the Old every day, the New on most days, side by side | 365 | about 11 min |
| The New Testament in 90 days | 90 | about 10 min |
| The Gospels in 30 days | 30 | about 14 min |
| Psalms and Proverbs in a month: a few Psalms and a chapter of Proverbs a day | 31 | about 9 min |

- **Starting:** **Start today**, or on another date. A date in the past joins a plan others began earlier, such as on 1 January.
- **A plan's page:** where you are ("Day 12 of 365 · 3% done · on schedule", or "2 days behind"), a progress bar, the next day's reading with a tick per passage and **Read**, and every day with its date, in fold-out groups of 30.
  - **Behind:** **Move the schedule** makes today your next day, keeping your ticks.
  - **Ticking off a day there:** the card stays on that day, ticked, with **Next day**, so it doesn't change under your finger.
  - **Stop this plan:** removes its progress, with Undo.
- **In the reader:** a chapter in your reading (the next day's, or one you're catching up on) has a bar at its end: "The Bible in a year · Day 12 [Mark as read]". Once it's read, **Next: Genesis 35 →** goes on to the plan's next chapter, and finishing a day says "Day 12 done". A chapter further ahead in the plan has no bar.
- **Home page:** "Today's reading · The Bible in a year · Day 12: Genesis 34–36", opening at the first chapter not yet read.
- **Several plans at once** are fine: each has its own progress and its own bar.
- **Saved** on the device through `js/storage.js` (key `plans`), kept in step between open tabs, included in My Study's backup file, and working offline.
- **Translation:** the links open in the translations you read last, like any link without `?t=`.

**How the plans are made:** `node tools/build-plans.mjs` (`npm run build-plans`) writes `data/plans.json` from the plan definitions in that file. Each plan reads whole chapters in order, and its days are balanced by length (the KJV's word count per chapter, read at 200 words a minute), not by number of chapters. Psalm 117 and Psalm 119 aren't each a day. Where a plan has more days than chapters (the New Testament's 260 chapters over a year), the chapters are spread evenly and some days have none. `tests/plans-data.test.js` checks that every plan reads each of its chapters once, in order, with no day twice the usual length.

**Code:**
- `js/plans/model.js`: the schedule logic (dates, today's day, the next reading, behind and ahead, which day a chapter belongs to). It's pure, and tested in `tests/plans.test.js`.
- `js/plans/store.js`: progress, one record per plan, `{ plan, started, read: { day: [chapters] }, updated }`.
- `js/views/plans.js`: the pages, the bar and the home links.

Adding a plan is a definition in `tools/build-plans.mjs`: its id, days, chapters (one or more tracks read side by side) and names in English and Russian.

## Offline and installing as an app

The site works without an internet connection, and online as usual whenever there is one.

- **What works offline:** the site itself, plus every translation, chapter, search, cross-reference, word study, study page and commentary chapter already opened on the device. A translation is saved whole the first time it's opened, so all its chapters work offline after that. Highlights, notes and bookmarks are on the device anyway.
- **What needs a connection:** anything never opened before (the page says so, and to open it once with a connection), the audio (it streams from predanie.ru; the player says listening needs a connection), and Translate links to Yandex. Nothing is downloaded in bulk.
- **Messages:** "You're offline…" when the connection drops, "Back online." when it returns.
- **Installing:** **Aa → App** explains it. In Chrome, Edge or Samsung Internet (Android, Windows, ChromeOS) an **Install app** button opens the browser's install dialog. On an iPhone or iPad, Safari's **Share → Add to Home Screen** does it. The installed app opens full-screen from its own icon.
- **Updates:** when a new version of the site is published, the app shows "A new version of the site is ready · Reload". If you ignore it, the new version starts the next time the app is closed and reopened.

**How it works:** a service worker (`sw.js`) keeps a copy of the site's own files (HTML, CSS, JavaScript, icons) and serves them first, so the app opens instantly with or without a connection. The two data lists (`data/translations.json`, `data/research.json`) come from the network when it answers within 4 seconds, and otherwise from the saved copy. The Bible text and research data are saved by `js/providers/translation-cache.js` as they're opened, under their content version, so an updated file replaces the old copy. `js/offline.js` registers the worker, shows the messages and fills the App section. Other sites (audio, Yandex) are never touched.

**After changing any HTML, CSS, JavaScript or icon file, run:**

```bash
npm run build-offline
```

It writes the list of the site's files and their version into `sw.js`, which is how installed apps learn there's a new version. `npm test` fails while `sw.js` is out of date. While developing, a browser keeps serving its saved copy until it updates. In Chrome, DevTools → Application → Service workers → **Update on reload** turns that off. The icons in `icons/` are rendered from the favicon's design by `node tools/build-icons.mjs` (needs Playwright).

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
sw.js                 Service worker: the offline copy of the site (file list by tools/build-offline.mjs)
manifest.webmanifest  The installed app's name, icons and look; icons/ holds the PNG icons
css/                  themes.css (colour tokens), base, layout, picker, reader, parallel, translate,
                      search, study, research (the Research panel), pages (study pages, maps),
                      explore (the statue), commentary, audio (the player), formatting (a formatted
                      text's headings, poetry, footnotes), plans (reading plans), topics
js/
  main.js             Entry point: routes → views, translation choice, keyboard, last-read
  offline.js          Offline support: registers sw.js, update and offline messages, Install app
  plans/              Reading plans: the schedule logic (model.js) and progress (store.js)
  i18n.js             Interface language: t('key'), book names, RUS | ENG (text in locales/)
  translate/          Translate-selection helpers: on-device machine translation, Yandex
                      Translate link, clipboard, text tidying
  search/             Full-text search: words and queries (text.js), the index (engine.js),
                      the Web Worker and its client, references ("Jn 3:16"), search URLs
  study/              Highlights, notes, bookmarks: the model (verse ranges, one colour per
                      verse), the store, note markup, copy formats, backup files
  research/           Research data: loading it (data.js), references ("ROM 5:8"),
                      Strong's helpers, the concordance (run in the search worker), commentary
                      lookups (which chapters discuss a verse), topic lookups (search, verse → topics)
  audio/              Audio Bibles: which recording plays a chapter, what comes next (sources.js)
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
                      docks them), the audio player, footnotes (a formatted text's notes), toasts
  views/              Book/chapter picker, reader (single + parallel), verse alignment,
                      search page, My Study, Translations page, book introductions, timeline,
                      maps, commentary, reading plans, topics, messages; templates/ holds the study-page building blocks;
                      explore/ holds the interactive studies (the statue of Daniel 2)
data/                 translations.json + one JSON file per translation; research.json lists the
                      research data: xref/ (cross-references), strongs/ (dictionaries), geo/
                      (places, basemap), study/ (introductions, timeline, maps), commentary/, audio/.
                      See data/README.md
tools/                serve, build-data (download → convert → validate), build-xref, build-strongs,
                      build-geo, build-study, build-commentary, build-audio, build-bti (the licensed
                      BTI text, from the Institute's Word files: lib/docx.mjs, lib/bti.mjs),
                      build-offline (sw.js's file list), build-icons (app icons), build-plans (reading
                      plans), build-topics (the topical index; Russian titles in topics-ru.json),
                      translate-topics (Russian statements in topics-ru/), converters, validator
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
  - Added later: zoomable, interactive maps; the interactive statue of Daniel 2 (`#/explore`); public-domain Adventist commentary (`#/commentary`): Ellen G. White's Conflict of the Ages, with links to the official Russian editions and the site's own Russian translation of the chapters on Daniel and the Revelation
- [x] **Licensed translation:** the modern Russian translation of the Institute for Bible Translation named after M. P. Kulakov (BTI), with its headings, footnotes, italics, small capitals and poetry lines
- [x] **Audio:** the Russian Synodal read aloud (Alexander Bondarenko, from predanie.ru), in a player that follows the reader from chapter to chapter
- [x] **Offline support:** the site opens and works without a connection (everything already opened on the device), installs as an app on phones and computers, and offers new versions with a Reload message
- [x] **Reading plans:** five plans balanced by reading time, a plan page with progress and every day, "Mark as read · Next" under each chapter of the reading, today's reading on the home page, in backups and offline
- [x] **Topics:** Torrey's New Topical Textbook (624 topics, 38,571 references) in English and Russian (titles and an AI translation of every statement), a searchable list, topic pages that quote the verses in your translation, and a Topics tab in the Research panel
- [ ] Later: cloud sync
