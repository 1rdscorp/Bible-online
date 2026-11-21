# Bible data

| File | What it is |
|---|---|
| `translations.json` | The list of translations the site offers (the registry) |
| `kjv.json` | King James Version text, generated from the source below |

## Translation file format (`formatVersion` 1)

One JSON file per translation, structured book → chapter → verse:

```json
{
  "formatVersion": 1,
  "id": "kjv",
  "abbreviation": "KJV",
  "name": "King James Version",
  "language": "en",
  "direction": "ltr",
  "license": "Public domain",
  "source": "https://github.com/scrollmapper/bible_databases/tree/2024/json",
  "books": [
    {
      "id": "GEN",
      "name": "Genesis",
      "chapters": [
        ["In the beginning God created the heaven and the earth.", "And the earth was without form, and void; …"],
        ["Thus the heavens and the earth were finished, and all the host of them.", "…"]
      ]
    },
    { "id": "EXO", "name": "Exodus", "chapters": [["…"]] }
  ]
}
```

Rules:

- **`books[].id`** is the upper-case [USFM book code](https://ubsicap.github.io/usfm/identification/books.html): `GEN EXO LEV … MAT MRK LUK JHN ACT … REV`. The full list, in canonical order, is in `js/canon.js`. The site orders books by the canon, not by their order in the file.
- **`chapters[i]`** is chapter *i + 1*. **`chapters[i][j]`** is verse *j + 1*, as plain UTF-8 text: no HTML or markup.
- **Missing verse:** use `""` so later verse numbers stay aligned. (Some translations omit verses such as Matthew 17:21.) Don't pad the end of a chapter.
- **`name`** is the book name in the translation's language. The site uses the English names from `js/canon.js` for now.
- **`language`** is a BCP 47 code (`en`, `es`, …). **`direction`** is `ltr` or `rtl`.
- Later features (Strong's numbers, headings, paragraph breaks) will go in separate files, so this format won't need to change.

Check a file with:

```bash
node tools/validate-translation.mjs data/kjv.json
```

## `translations.json`

```json
{
  "default": "kjv",
  "translations": [
    {
      "id": "kjv",
      "abbreviation": "KJV",
      "name": "King James Version",
      "language": "en",
      "direction": "ltr",
      "license": "Public domain",
      "provider": "json",
      "url": "data/kjv.json"
    }
  ]
}
```

`provider` chooses how the text is fetched. `"json"` means a static file at `url`. A licensed API (NIV, ESV, NASB, NLT) will be a new provider type registered in `js/providers/registry.js`, with its own fields (for example an API base URL instead of `url`).

## Where to get public-domain text

**Recommended: [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases)**, using the **`2024` branch** JSON files. These are the ones checked for this project:

| Translation | File | Notes |
|---|---|---|
| KJV | [`json/t_kjv.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_kjv.json) | Used for `kjv.json`. 31,102 verses. Keeps the small-caps "LORD". |
| ASV | [`json/t_asv.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_asv.json) | |
| BBE | [`json/t_bbe.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_bbe.json) | |
| WEB | [`json/t_web.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_web.json) | 117 verses contain HTML entities (`&gt;`) that need cleaning. |
| YLT | [`json/t_ylt.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/2024/json/t_ylt.json) | |
| Darby | [`formats/json/Darby.json`](https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/Darby.json) (current branch only) | About 3,200 verses have missing spaces ("ForGod"). Needs cleaning or another source. |

Why not the newer `master` branch for KJV? Its `KJV.json` lost the small-caps divine name ("The Lord is my shepherd" instead of "The LORD…") and some punctuation. Its `KJVPCE.json` capitalises the first word of every chapter ("IN the beginning").

For WEB, the authoritative source is the publisher, **[eBible.org](https://ebible.org/)** (translation id `eng-web`). It's free and public domain, but distributed as USFM/USX/VPL rather than JSON, so it needs a different converter. Consider it if WEB fidelity matters more than convenience.

Always spot-check a new source: Psalm 23:1, John 3:16, a chapter with a missing verse (Matthew 17), and the verse count.

## Adding another translation

1. Download the source file (see the table above).
2. Convert it:
   ```bash
   node tools/convert-scrollmapper.mjs t_asv.json data/asv.json --id asv --name "American Standard Version"
   ```
   This also validates the result and prints the entry for step 3.
3. Add that entry to `translations.json`.
4. Run `npm test`. The data tests check every translation listed in `translations.json`.

(The site shows only the default translation until the translation picker arrives in a later stage.)

## Licensing

- KJV (1769), ASV (1901), YLT (1898), Darby (1890) and BBE (1949/1964) are public domain in the United States. WEB is dedicated to the public domain by its publisher, but "World English Bible" is a trademark, so use that name only for unaltered text.
- **United Kingdom:** the KJV is under perpetual Crown copyright, administered by Cambridge University Press. Hosting it for a UK audience technically needs permission. Elsewhere it's public domain.
- NIV, ESV, NASB, NLT and other modern translations are copyrighted. Don't add their text here; they need a license or a licensed API key (see "provider" above).

## Known issues in `kjv.json`

These come from the source and could be fixed in a later data pass:

- Psalm titles ("A Psalm of David.") and the Psalm 119 Hebrew-letter headings are not included.
- Some hyphenated names lost their hyphen ("Beersheba" for "Beer-sheba", "EleloheIsrael").
- There are occasional small-caps errors, such as Psalm 3:1 "Lord, how…" where the 1769 text has "LORD".
- Italics (words added by the translators) and paragraph marks (¶) are not included.
