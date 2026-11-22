# Russian translation of the commentary

The published Russian translations of these books are under copyright, so the site has its own: translated from the public-domain English text by an AI (Claude), chapter by chapter, and shown with a note saying so and a link to the official Russian edition. This folder holds the translations; `node tools/build-commentary.mjs` checks them against the English and builds `data/commentary/ru/`.

One file per chapter: `<work>/<part>.txt`, e.g. `prophets-and-kings/40.txt`, `daniel-and-the-revelation/dan-2.txt`.

## Workflow

```bash
node tools/translate-commentary.mjs export prophets-and-kings 40 > /tmp/job.txt   # the English, as a job
# translate it into tools/commentary-ru/prophets-and-kings/40.txt (same headers, same markers)
node tools/translate-commentary.mjs check prophets-and-kings 40                   # must print OK
node tools/translate-commentary.mjs verse "DAN 2:1-3"                              # Synodal text of a passage
node tools/translate-commentary.mjs status                                         # what's done
```

## The format

Keep every header line exactly as exported, in the same order, and replace only the English text under it:

- `@title …`: the chapter title, translated. `@section …` (Ellen White's books): the book section, translated.
- `@block 2.1 p DAN 2:1`: one paragraph follows, on one line. `q`: a quotation or poem, with one translated line per English line (same number of lines). `n`: a footnote.
- `@note 1`: a chapter note.

Markers inside the text must all stay, unchanged (`check` compares them):

| Marker | Meaning | In the translation |
|---|---|---|
| `⟦DAN 2:31-35⟧` | a Bible reference (the site shows it in Russian) | keep it where the reference belongs, usually after the quotation it gives |
| `⟦p492⟧` | page 492 of the printed English book starts here | keep it at about the same point of the paragraph |
| `⟦n1⟧` | the mark of note 1 | keep it after the word it belongs to |
| `<i>…</i>`, `<b>…</b>` | italics, bold (Smith's side headings) | translate the words inside |
| `<a appendix#note-5>Appendix, Note 5</a>` | a link within the book | translate the words inside ("Приложение, примечание 5") |

## Style

- **Faithful, literary Russian.** Translate everything, sentence by sentence; don't summarise, shorten, modernise the argument or add explanations. Keep the authors' solemn 19th-century tone, but write natural Russian, not word-for-word English.
- **Bible quotations: the Synodal translation.** When the text quotes the Bible, use the Synodal wording for that verse (`verse "DAN 2:31"` prints it), adapting only its grammar to the sentence. If a quotation follows the KJV where the Synodal differs in sense, still use the Synodal. Smith's verse quotations themselves aren't in the job: the site shows the Synodal text for them.
- **Pronouns for God and Christ are capitalised**, as in Russian Adventist books: Он, Его, Ему, Им, Сам, Свой.
- **Quotation marks** «…», inside them „…“. Dashes: « — » with spaces.
- **Dates:** "B.C. 538" → «538 г. до н. э.», "A.D. 1798" → «1798 г.» (or «1798 г. н. э.» where both eras are near). Smith's "the 2300 days" → «2300 дней».
- **Quotations from historians** (Gibbon, Rollin, Prideaux, Clarke…): translate them like the rest, keeping the source line ("—Gibbon, Decline and Fall, chap. 38" → «— Гиббон, «История упадка и разрушения Римской империи», гл. 38»).
- **Leave English** only for titles of English books where a Russian rendering would mislead, in «» with a translation in brackets if useful.
- **OCR slips:** Smith's text comes from scans, and a few words may be misread. Translate the evident meaning; don't reproduce garbled words.

## Names and terms

Use the Synodal forms of Bible names and these terms throughout, for consistency between chapters.

| English | Russian |
|---|---|
| Nebuchadnezzar, Belshazzar, Darius the Mede, Cyrus | Навуходоносор, Валтасар, Дарий Мидянин, Кир |
| Daniel; Hananiah, Mishael, Azariah; Shadrach, Meshach, Abed-nego | Даниил; Анания, Мисаил, Азария; Седрах, Мисах, Авденаго |
| Ashpenaz, Arioch, Melzar, Nabonidus, Nabopolassar | Асфеназ, Ариох, Амелсар, Набонид, Набопаласар |
| Chaldeans; the wise men; magicians, astrologers, sorcerers | халдеи; мудрецы; тайноведцы, гадатели, чародеи |
| Medes and Persians; Medo-Persia; Grecia; Rome | мидяне и персы; Мидо-Персия; Греция; Рим |
| Shushan, the river Ulai, Hiddekel | Сузы, река Улай, Хиддекель |
| Gabriel, Michael | Гавриил, Михаил |
| the great image; head of gold … feet of iron and clay; the stone cut out without hands | истукан; голова из золота … ноги частью железные, частью глиняные; камень, оторвавшийся от горы без содействия рук |
| the four beasts; the little horn; the ram; the he-goat | четыре зверя; малый рог; овен; козёл |
| the daily (sacrifice) | «ежедневное» (жертва) |
| the abomination of desolation; the time of the end | мерзость запустения; время конца |
| the sanctuary; the cleansing of the sanctuary; the 2300 days | святилище; очищение святилища; 2300 дней |
| the seventy weeks; the year-day principle | семьдесят седмин; принцип «день за год» |
| the investigative judgment; the Day of Atonement; high priest | следственный суд; День очищения; первосвященник |
| the king of the north / of the south | царь северный / царь южный |
| the seven churches: Ephesus, Smyrna, Pergamos, Thyatira, Sardis, Philadelphia, Laodicea | семь церквей: Ефес, Смирна, Пергам, Фиатира, Сардис, Филадельфия, Лаодикия |
| seals, trumpets, vials (plagues) | печати, трубы, чаши (язвы) |
| the dragon; the woman; the remnant | дракон; жена; остаток |
| the beast; the two-horned beast; the image of the beast; the mark of the beast | зверь; зверь с двумя рогами; образ зверя; начертание зверя |
| the seal of God; the three angels' messages; the third angel's message; the everlasting gospel | печать Божья; вести трёх ангелов; весть третьего ангела; вечное Евангелие |
| the papacy; the pope; the man of sin | папство; папа; человек греха |
| the Sabbath; Sunday; the first day of the week | суббота; воскресенье; первый день недели |
| the second advent; the advent movement; Seventh-day Adventists | второе пришествие; адвентистское движение; адвентисты седьмого дня |
| probation (close of) | время благодати (окончание) |
| the great controversy; the plan of redemption | великая борьба; план искупления |
| Antiochus Epiphanes, Ptolemy, Seleucus, Cassander, Lysimachus | Антиох Епифан, Птолемей, Селевк, Кассандр, Лисимах |
| Pompey, Julius Caesar, Augustus, Tiberius, Constantine, Justinian | Помпей, Юлий Цезарь, Август, Тиберий, Константин, Юстиниан |
| Heruli, Ostrogoths, Vandals, Lombards, Huns, Franks; Odoacer, Theodoric, Genseric, Alaric, Attila, Belisarius | герулы, остготы, вандалы, лангобарды, гунны, франки; Одоакр, Теодорих, Гензерих, Аларих, Аттила, Велизарий |
| the Saracens, Mohammed, the Ottoman (Turkish) power, the sultan | сарацины, Мухаммед, Османская (турецкая) держава, султан |
| Gibbon, Rollin, Prideaux, Dr. (Adam) Clarke, Barnes, Bishop Newton, Josephus, William Miller | Гиббон, Роллен, Придо, д-р (Адам) Кларк, Барнс, епископ Ньютон, Иосиф Флавий, Уильям Миллер |
