/**
 * English interface text. Keys are shared with ru.js (tests/i18n.test.js
 * checks both have the same keys and placeholders).
 *
 * {name} placeholders are filled by t(key, { name }). An object value holds
 * plural forms, chosen by the `n` parameter with Intl.PluralRules.
 * Book names come from js/canon.js.
 */
export default {
  psalm: 'Psalm',
  books: {},
  strings: {
    'app.name': 'Bible Online',
    'app.description': 'A calm, fast, distraction-free Bible reader.',
    'skip': 'Skip to content',
    'boot.loading': 'Loading…',

    'lang.group': 'Language',

    'settings.open': 'Reading settings',
    'settings.title': 'Reading settings',
    'settings.theme': 'Theme',
    'theme.auto': 'Auto',
    'theme.light': 'Light',
    'theme.sepia': 'Sepia',
    'theme.dark': 'Dark',
    'settings.textSize': 'Text size',
    'settings.smaller': 'Smaller text',
    'settings.larger': 'Larger text',
    'settings.reset': 'Reset',
    'settings.tipPress': 'Tip: press',
    'settings.tipAnd': 'and',
    'settings.tipChange': 'to change chapter.',

    'location.choose': '{title}: choose another chapter',
    'translation.label': 'Translation',
    'compare.button': 'Compare',
    'compare.title': 'Compare translations side by side',

    'books.title': 'Books of the Bible',
    'testament.OT': 'Old Testament',
    'testament.NT': 'New Testament',
    'books.continue': 'Continue reading',
    'lastRead': '(last read)',
    'chapters.allBooks': 'All books',
    'chapters.choose': 'Choose a chapter ({n})',

    'reader.loadingOne': 'Loading the {name}…',
    'reader.loadingMany': 'Loading {n} translations…',
    'reader.addTranslation': 'Add translation',
    'reader.columnsGroup': 'Translations in columns',
    'reader.columnLabel': 'Column {n} translation',
    'reader.removeColumn': 'Remove {abbr} column',
    'reader.loadFailed': 'Sorry, {title} couldn’t be loaded.',
    'reader.notIncluded': '{title} isn’t included in the {name}.',
    'reader.columnFailed': 'The {name} couldn’t be loaded.',
    'reader.missingVerse': 'not in this translation',
    'reader.about': 'About these translations',
    'reader.chapterNav': 'Chapter',
    'reader.previous': 'Previous',
    'reader.next': 'Next',
    'reader.navJoin': ' chapter: ',
    'reader.previousTitle': 'Previous chapter: {title}',
    'reader.nextTitle': 'Next chapter: {title}',
    'numbering.fallback': '{abbr} numbering',
    'action.retry': 'Try again',

    'notFound.chapterTitle': 'Chapter not found',
    'notFound.chapterText': { one: '{book} has {n} chapter.', other: '{book} has {n} chapters.' },
    'notFound.chooseIn': 'Choose a chapter in {book}',
    'notFound.bookTitle': 'Book not found',
    'notFound.bookText': 'There’s no book called “{query}”.',
    'notFound.browse': 'Browse all books',
    'error.translations': 'Couldn’t load the translations',

    'title.notFound': 'Not found',
    'title.error': 'Error',
    'title.translations': 'Translations',
    'status.loading': 'Loading {names}…',

    'translations.back': 'Back to {title}',
    'translations.title': 'Translations',
    'translations.intro':
      'Every translation here is in the public domain. Each one downloads the first time you open it (1.2–1.4 MB) and is then kept on this device, so it opens instantly next time.',
    'translations.copyright': 'Copyright',
    'translations.source': 'Text source',
    'translations.device': 'On this device',
    'translations.downloaded': 'Downloaded',
    'translations.notDownloaded': 'Not downloaded yet',
    'translations.read': 'Read {title} in {abbr}',
  },
};
