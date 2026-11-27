# Russian translation of Torrey's statements

The topics' titles are translated in `tools/topics-ru.json`. This folder holds the translation of Torrey's statements: one file per topic, `<id>.txt`, with one line per statement in the same order as `data/topics/<id>.json`. The translation is by an AI (Claude), from Torrey's public-domain English, and the site says so. `node tools/build-topics.mjs` adds it to `data/topics/`.

## Workflow

```bash
node tools/translate-topics.mjs export faith prayer > /tmp/job.txt      # the English, as a job
node tools/translate-topics.mjs batches 8 /tmp/jobs                     # every untranslated topic, in 8 jobs
# translate a job: same headers, same numbers, Russian text
node tools/translate-topics.mjs import /tmp/job.ru.txt                  # checks it and writes <id>.txt
node tools/translate-topics.mjs check                                   # must print OK
node tools/build-topics.mjs                                             # rebuild data/topics/
```

## The job format

```
## faith | Faith | Вера
1	Is the substance of things hoped for
4	The objects of, are
5	  God
```

- Keep every `## …` header line exactly as it is.
- Keep every number and the tab after it. Replace only the English text.
- One line per statement, never merged or split.
- A line indented two spaces is a sub-statement of the nearest unindented line above it. Keep the indent.

## How Torrey's statements work

Each topic is a list of short index entries about the topic word (Вера, Молитва, Скиния…). An entry is usually a fragment whose subject is the topic: "Is the gift of God" means "Faith is the gift of God". "Commanded" means "Faith is commanded". "Exemplified" is followed by people in whom it is seen. A heading such as "The objects of, are" or "Through it is" has sub-statements that complete it: "Through it is: Remission of sins; Justification…".

Translate them as Russian index entries, which read naturally on their own under the topic's title:

- **Drop the copula.** "Is of God" → «От Бога». "Is by Christ" → «Через Христа». "Is the gift of God" → «Дар Божий».
- **Agree with the topic word.** Gender, number and case follow the Russian title given in the header. Under «Вера», "Commanded" is «Заповедана». Under «Крещение» it is «Заповедано», and under «Жертвы», «Заповеданы». When agreement would be awkward, an impersonal form or a noun is fine: «Заповедь о …».
- **Headings and their sub-statements read as one phrase.** "The objects of, are" → «Предметы веры:», with sub-statements «Бог», «Христос», «Писания Моисея». "Through it is" → «Через веру даруется:», with «Прощение грехов», «Оправдание». "In Christ is" → «Вера во Христа:», with «Дар Божий», «Драгоценна», «Плодотворна».
- **Translate the meaning, not the words.** Torrey's English is terse and archaic. Write natural, concise Russian. Don't add words that aren't implied, explanations or references.
- **Keep parenthetical notes and numbers** ("(Falling from the hand)", "24 courses", "120 provinces"). "&c." → «и т. д.».
- **Every line must be Russian**, including names: Давид, not David.

## Names and terms

Use Synodal forms of names and terms, as the site's Bible text does.

**Pronouns for God and Christ** are capitalised: Он, Его, Ему, Им, Свой. «Господь», «Бог», «Христос», «Святой Дух», «Церковь» (Christ's), «Царство Божие», «Писание» are capitalised as in the Synodal. Otherwise lower case: суббота, скиния, жертвенник, ангел, сатана, диавол, фараон.

**Spelling:** use ё where it belongs, as the topic titles do (Пётр, ещё).

| English | Russian |
|---|---|
| Exemplified | Примеры |
| Illustrative / Illustrative of … | В переносном смысле / Образ … |
| Illustrated | Притчи и образы |
| Described as | Описывается как |
| Typified / A type of Christ | Прообразы / Прообраз Христа |
| Fulfilled | Исполнилось |
| Foretold / Predictions respecting / Prophecies respecting | Предсказано / Предсказания о … / Пророчества о … |
| Mentioned in scripture | Упоминается в Писании |
| Called / Called the … | Называется / Называется … |
| Commanded / Forbidden | Заповедано / Запрещено (agreeing with the topic word) |
| Exhortation(s) to | Призыв(ы) к … |
| Warnings against | Предостережения от … |
| Motives to | Побуждения к … |
| Necessity for | Необходимость … |
| Blessedness of | Блаженство … |
| Punishment of / Punishment for | Наказание … / Наказание за … |
| Promises to / Promises connected with | Обетования … / Обетования, связанные с … |
| Christ set an example of | Пример Христа |
| A characteristic of saints / of the wicked | Черта святых / Черта нечестивых |
| Saints should / Ministers should | Святые должны / Служители должны |
| Pray for | Молиться о … |
| Hateful to God | Ненавистно Богу (agreeing) |
| Excludes from heaven | Лишает Царства Небесного |
| Miracles connected with | Чудеса, связанные с … |
| Different kinds of | Различные виды … |
| Antiquity of | Древность … |
| Saints, the wicked, sinners, the ungodly | святые, нечестивые, грешники, нечестивые |
| The Jews, Israelites, Israel, Gentiles, heathen | иудеи, израильтяне, Израиль, язычники, язычники |
| Ministers, apostles, disciples, prophets, priests, Levites | служители, апостолы, ученики, пророки, священники, левиты |
| the Lord, God, Christ, the Holy Spirit, the Comforter | Господь, Бог, Христос, Святой Дух, Утешитель |
| heaven / the kingdom of God | небо, Царство Небесное / Царство Божие |
| gospel, grace, faith, repentance, justification, sanctification, redemption, atonement, righteousness | Евангелие, благодать, вера, покаяние, оправдание, освящение, искупление, искупление (умилостивление), праведность |
| covenant, law, Sabbath, Passover, feast of tabernacles, circumcision | завет, закон, суббота, Пасха, праздник кущей, обрезание |
| tabernacle, ark of the covenant, mercy seat, altar, laver, candlestick, shewbread, veil | скиния, ковчег завета, крышка ковчега, жертвенник, умывальник, светильник, хлебы предложения, завеса |
| high priest, burnt offering, sin offering, trespass offering, peace offering, meat offering, drink offering, heave/wave offering | первосвященник, всесожжение, жертва за грех, жертва повинности, мирная жертва, хлебное приношение, возлияние, возношение / приношение потрясания |
| idolatry, idols, high places, groves | идолопоклонство, идолы, высоты, рощи |
| leprosy, unclean, clean | проказа, нечистый, чистый |

**People:**
- David Давид, Paul Павел, Jacob Иаков, Moses Моисей, Saul Саул, Peter Пётр, Joseph Иосиф, Job Иов, Daniel Даниил, Solomon Соломон.
- Hezekiah Езекия, Nehemiah Неемия, Josiah Иосия, Manasseh Манассия, Ahab Ахав, Cain Каин, Joshua Иисус Навин, Haman Аман, Isaac Исаак, Samuel Самуил, Gideon Гедеон, Jonah Иона, Elijah Илия, Elisha Елисей.
- Jehoshaphat Иосафат, Stephen Стефан, Jeroboam Иеровоам, Absalom Авессалом, Esau Исав, Asa Аса, Herod Ирод, Aaron Аарон, Samson Самсон, Noah Ной, Cornelius Корнилий, Lot Лот, Jeremiah Иеремия, Abimelech Авимелех.
- Belshazzar Валтасар, Judas Иуда, Jezebel Иезавель, Pharaoh фараон, Anna/Hannah Анна, Esther Есфирь, Gehazi Гиезий, Uzziah Озия, Sennacherib Сеннахирим, Nebuchadnezzar Навуходоносор, Barnabas Варнава, Abraham Авраам, Ezra Ездра, Rahab Раав, Nathan Нафан, Balaam Валаам, Ahaz Ахаз, Achan Ахан, Jehu Ииуй.
- Mordecai Мардохей, Zacchaeus Закхей, Timothy Тимофей, Lydia Лидия, Ananias Анания, Sapphira Сапфира, Pilate Пилат, Caiaphas Каиафа, Nicodemus Никодим, Lazarus Лазарь, Martha Марфа, Mary Мария, John the Baptist Иоанн Креститель, Isaiah Исаия, Ezekiel Иезекииль, Hosea Осия, Jehoiakim Иоаким, Zedekiah Седекия, Rehoboam Ровоам, Jonathan Ионафан, Eli Илий, Korah Корей, Miriam Мариам, Ruth Руфь.

**Places and peoples:**
- Canaan Ханаан, Egypt Египет, Babylon Вавилон, Jerusalem Иерусалим, Zion Сион, Samaria Самария, Galilee Галилея, Judah/Judea Иуда/Иудея, Jordan Иордан, Sinai Синай, Lebanon Ливан, Nineveh Ниневия, Tyre Тир, Sidon Сидон, Damascus Дамаск, Bethel Вефиль, Gilgal Галгал, Shiloh Силом.
- Philistines филистимляне, Amalekites амаликитяне, Moabites моавитяне, Ammonites аммонитяне, Edomites идумеяне, Assyrians ассирияне, Chaldeans халдеи, Midianites мадианитяне.

For a name not listed, use its form in the Synodal translation.

## Worked example

```
## faith | Faith | Вера
1	Есть осуществление ожидаемого
2	Есть уверенность в невидимом
3	Заповедана
4	Предметы веры:
5	  Бог
6	  Христос
7	  Писания Моисея
8	  Писания пророков
9	  Евангелие
10	  Обетования Божии
11	Вера во Христа:
12	  Дар Божий
13	  Дело Божие
14	  Драгоценна
15	  Святейшая
16	  Плодотворна
17	  Сопровождается покаянием
18	  Ведёт к обращению
19	Христос — Начальник и Совершитель веры
20	Дар Святого Духа
21	Писание дано, чтобы рождать веру
22	Проповедь призвана рождать веру
23	Через веру даруется:
24	  Прощение грехов
25	  Оправдание
```

Lines 1–2 keep the Synodal wording of Hebrews 11:1 («осуществление ожидаемого и уверенность в невидимом»), because Torrey quotes the verse. Do the same wherever a statement is plainly a quotation.
