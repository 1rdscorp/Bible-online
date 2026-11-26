/**
 * The Bible in the Institute for Bible Translation's (Zaoksky, M. P. Kulakov)
 * modern Russian translation, from the Institute's Word files, read with
 * ./docx.mjs. The text is kept exactly as written: words, punctuation and
 * dashes untouched; only the spacing between runs is evened out. What the
 * print layout shows is kept alongside it:
 *
 *   styles     words the translators added (italics), «Господь» (small capitals),
 *              Old Testament quotations in the New (bold)
 *   breaks     where a prose paragraph or a poetry line starts (and its indent)
 *   notes      footnote marks: where, with which label (а, б, *), and the note
 *   headings   section headings, before the verse they introduce
 *   intro      the book's introduction (paragraphs) and outline
 *
 * Verses come out in the translation's own numbering, which follows the
 * Synodal (Psalm titles are verse 1, Psalm 23 is "Господня земля"); the build
 * renumbers them to the site's English numbering.
 *
 * How the files are laid out (checked across all 39 files):
 *   - a chapter starts with its number in large bold type at the start of a
 *     paragraph; a verse with its number in superscript;
 *   - Psalms start with a "ПСАЛОМ 12" line; their titles come before the
 *     first numbered verse (verse 2 when the title is verse 1);
 *   - a footnote reference is a superscript "*" followed by its label letter;
 *   - section headings use styles named "Подзаг…"; introductions
 *     "Предисловие" (Old Testament) or "Вступление" (New); poetry "Поэт".
 *     Styles are otherwise not reliable (some Psalms are set in "Heading"),
 *     so structure comes from the numbers.
 */

const PSALM_TITLE_STYLES = new Set(['Заглавие псалма', 'Дата']);
const TITLE_STYLES = new Set(['Heading', 'Название', 'Heading 1', 'заголовок 1']);
const INTRO_STYLES = new Set(['Предисловие', 'Вступление', 'Style1', 'Стиль1', 'Body Text Indent', 'Основной текст с отступом 2', 'List Paragraph']);
const isHeadingStyle = (style) => /^(Подз|Стиль Подзаг)/.test(style) || style === 'Heading 3';

const paragraphText = (paragraph) => paragraph.runs.map((run) => run.text).join('').replace(/\s+/g, ' ').trim();
const isLabel = (run) => run.sup && !run.footnote && /^[\s*]*[а-яёa-z]{0,2}[\s*]*$/i.test(run.text) && /[^\s]/.test(run.text) && !/\d/.test(run.text);
/** A verse number in superscript: { from, to } ("11–12" is two verses translated as one), or null. */
const verseNumber = (run) => {
  // Superscript, or (where the file lost the superscript) set in small type.
  if (!(run.sup || run.size <= 10) || run.footnote) return null;
  const m = /^\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*$/.exec(run.text);
  return m ? { from: Number(m[1]), to: Number(m[2] ?? m[1]) } : null;
};
const chapterNumber = (run) => (run.b && !run.sup && run.size >= 13 && /^\s*\d+\s*$/.test(run.text) ? Number(run.text.trim()) : null);
/** A book's title: in a title style, or set all in large bold type (and not a chapter number). */
const isTitle = (paragraph) => {
  const runs = paragraph.runs.filter((run) => run.text.trim());
  if (!runs.length || runs.some((run) => verseNumber(run)) || !/\p{L}/u.test(paragraphText(paragraph))) return false;
  return TITLE_STYLES.has(paragraph.style) || runs.every((run) => run.b && run.size >= 16);
};
const psalmNumber = (paragraph) => /^ПСАЛОМ\s+(\d+)\b/.exec(paragraphText(paragraph))?.[1];

/**
 * Builds one piece of rich text: plain `text`, with `styles` [[start, length, "i"|"sc"]],
 * `breaks` [[offset, kind]] and `notes` [{ at, label, id }]. Whitespace is
 * collapsed to single spaces; nothing else in the text changes.
 */
export class RichText {
  constructor() {
    this.text = '';
    this.styles = [];
    this.breaks = [];
    this.notes = [];
  }

  /** Add words, italic or in small capitals as marked. */
  add(text, { i = false, sc = false, b = false } = {}) {
    let piece = text.replace(/[\s\u00a0]+/g, (spaces) => (/^\u00a0+$/.test(spaces) ? '\u00a0' : ' '));
    // A space typed before a footnote mark: kept between words, dropped before punctuation.
    if (this.spaceBeforeNote) {
      this.spaceBeforeNote = false;
      if (/^[^\s,.;:?!)»“”…]/.test(piece)) piece = ` ${piece}`;
    }
    if (!this.text || this.text.endsWith(' ')) piece = piece.replace(/^ +/, '');
    // A stray space before punctuation ("ужас .") goes; nothing else changes.
    piece = piece.replace(/ +(?=[,.;:?!])/g, '');
    if (/^[,.;:?!]/.test(piece) && this.text.endsWith(' ')) this.text = this.text.trimEnd();
    if (!piece) return;
    const start = this.text.length;
    this.text += piece;
    for (const [flag, kind] of [[i, 'i'], [sc, 'sc'], [b, 'b']]) {
      if (!flag) continue;
      // Styled ranges cover the words, not the spaces around them.
      const lead = piece.length - piece.trimStart().length;
      const length = piece.trim().length;
      if (!length) continue;
      const from = start + lead;
      const last = this.styles.at(-1);
      if (last && last[2] === kind && this.text.slice(last[0] + last[1], from).trim() === '') last[1] = from + length - last[0];
      else this.styles.push([from, length, kind]);
    }
  }

  /** A new paragraph or poetry line starts here. */
  lineBreak(kind) {
    if (this.text && !this.text.endsWith(' ')) this.text += ' ';
    const at = this.text.length;
    const last = this.breaks.at(-1);
    if (last && last[0] === at) last[1] = kind;
    else this.breaks.push([at, kind]);
  }

  note(id, label) {
    if (this.text.endsWith(' ')) {
      this.text = this.text.trimEnd();
      this.spaceBeforeNote = true;
    }
    this.notes.push({ at: this.text.length, label, id });
  }

  /** Trim the trailing space; clamp anything that pointed past the end. */
  finish() {
    this.text = this.text.trimEnd();
    const end = this.text.length;
    this.styles = this.styles.filter(([start]) => start < end).map(([start, length, kind]) => [start, Math.min(length, end - start), kind]);
    this.breaks = this.breaks.filter(([at]) => at < end);
    for (const note of this.notes) note.at = Math.min(note.at, end);
    return this;
  }
}

/**
 * A footnote's paragraphs → { label, ref, text, styles, breaks }: "*а 1:1 Букв.: судили." →
 * label "а", ref "1:1", text "Букв.: судили." (with "судили" italic). The
 * reference is read from the text, whatever its formatting ("4:2" in bold
 * and "6" not is still 4:26).
 */
export function readFootnote(paragraphs) {
  let label = '';
  const runs = [];
  paragraphs.forEach((paragraph, p) => {
    for (const run of paragraph.runs) {
      if (!runs.length && p === 0 && (run.sup || /^\s*\*?\s*$/.test(run.text))) {
        label += run.text.replace(/[\s*]/g, '');
        continue;
      }
      runs.push({ ...run, paragraph: p });
    }
  });
  const plain = runs.map((run) => run.text).join('');
  const ref = /^\s*(\d+(?:[:.]\d+)?(?:\s*[–-]\s*\d+)?(?:\s*,\s*\d+)*)(?=\s|$)\s*/.exec(plain);
  let skip = ref ? ref[0].length : 0;
  const rich = new RichText();
  let paragraph = 0;
  for (const run of runs) {
    if (run.paragraph !== paragraph) {
      rich.lineBreak('p');
      paragraph = run.paragraph;
    }
    let text = run.text;
    if (skip) {
      const cut = Math.min(skip, text.length);
      text = text.slice(cut);
      skip -= cut;
    }
    if (text) rich.add(text, { i: run.ownItalic, sc: run.sc });
  }
  return { label: label || '*', ref: ref ? ref[1].replace(/\s+/g, '') : '', ...rich.finish() };
}

/**
 * One file's paragraphs → books, in the file's order. `bookIds` are the books
 * the file holds, in order (from its name); a new one starts at a title that
 * is followed by an introduction or by chapter 1.
 *
 * Returns [{ id, title, intro: [{ style, rich }], chapters: Map(n → { verses: Map(v → RichText), headings: [{ before, text }] }) }].
 */
export function readBooks(paragraphs, bookIds, problems = [], recovered = [], numberFixes = []) {
  const books = [];
  let book = null;
  let chapter = null;
  let verse = null; // the RichText being written
  let verseNo = 0;
  let pendingHeadings = [];
  let lastRunWasNote = false;
  const isPsalms = bookIds.length === 1 && bookIds[0] === 'PSA';

  const startBook = () => {
    const id = bookIds[books.length];
    if (!id) {
      problems.push(`more books than expected (${bookIds.join(', ')})`);
      return;
    }
    book = { id, title: [], intro: [], chapters: new Map() };
    pendingHeadings = [];
    books.push(book);
    chapter = verse = null;
    verseNo = 0;
  };
  const startChapter = (n) => {
    if (book.chapters.has(n)) problems.push(`${book.id} ${n}: chapter starts twice`);
    chapter = { verses: new Map(), headings: [], ranges: new Map() };
    book.chapters.set(n, chapter);
    verse = null;
    verseNo = 0;
  };
  const startVerse = (n, to = n) => {
    if (!chapter) startChapter(1);
    // A misprinted verse number, listed in tools/bti-sources.json.
    const chapterNo = [...book.chapters.keys()].at(-1);
    const fix = numberFixes.find((f) => f.book === book.id && f.chapter === chapterNo && f.after === verseNo && f.number === n);
    if (fix) {
      n = fix.is;
      to = Math.max(to === fix.number ? fix.is : to, n);
    }
    // "1" (or "1–3") after a chapter number or a Psalm's title: verse 1 goes on.
    if (n === 1 && verseNo === 1 && verse && chapter.verses.get(1) === verse) {
      if (to > 1) chapter.ranges.set(1, to);
      verseNo = to;
      return;
    }
    if (n !== verseNo + 1 && !(verseNo === 0 && n === 2)) problems.push(`${book.id} ${[...book.chapters.keys()].at(-1)}:${n} follows verse ${verseNo}`);
    if (chapter.verses.has(n)) problems.push(`${book.id} ${[...book.chapters.keys()].at(-1)}:${n} appears twice`);
    verseNo = to;
    verse = new RichText();
    chapter.verses.set(n, verse);
    if (to > n) chapter.ranges.set(n, to);
    for (const text of pendingHeadings) chapter.headings.push({ before: n, text });
    pendingHeadings = [];
  };
  // Text before a chapter's first numbered verse (a Psalm's title, or the
  // first verse of a chapter whose "1" is the chapter number) is verse 1.
  const ensureVerse = () => {
    if (!chapter) startChapter(1);
    if (!verse) startVerse(1);
  };
  const lookahead = (index) => {
    for (let k = index + 1; k < Math.min(paragraphs.length, index + 8); k += 1) {
      const next = paragraphs[k];
      if (!paragraphText(next)) continue;
      if (isTitle(next)) continue;
      if (INTRO_STYLES.has(next.style)) return 'intro';
      const first = next.runs.find((run) => run.text.trim());
      if (first && (chapterNumber(first) === 1 || verseNumber(first)?.from === 1)) return 'intro';
      return 'text';
    }
    return 'text';
  };

  paragraphs.forEach((paragraph, index) => {
    const text = paragraphText(paragraph);
    if (!text) return;
    const hasNumbers = paragraph.runs.some((run) => verseNumber(run) !== null || chapterNumber(run) !== null);

    // A book's title: at the start of a file, or a new book within it.
    if (isTitle(paragraph) && (!book || (book.chapters.size && lookahead(index) === 'intro'))) {
      if (!book || book.chapters.size) startBook();
      if (book) book.title.push(text);
      return;
    }
    if (!book) startBook();
    if (!book) return;

    if (isPsalms && psalmNumber(paragraph)) {
      startChapter(Number(psalmNumber(paragraph)));
      return;
    }
    // Before the first chapter: the introduction, and headings over chapter 1.
    if (!book.chapters.size && !hasNumbers && !(isPsalms && /ПСАЛОМ/.test(text))) {
      if (isHeadingStyle(paragraph.style)) pendingHeadings.push(text);
      else if (TITLE_STYLES.has(paragraph.style) && !book.intro.length) book.title.push(text);
      else book.intro.push({ style: paragraph.style, rich: richFrom(paragraph.runs) });
      return;
    }
    // A heading (a paragraph in a heading style with a verse number in it is text set in the wrong style).
    if ((isHeadingStyle(paragraph.style) && !hasNumbers) || (isPsalms && /^(КНИГА\s+\S+|\(Псалмы\s.*\))$/i.test(text))) {
      pendingHeadings.push(text);
      return;
    }

    // Verse text. A paragraph starts a new line in whatever verse is open.
    const poetry = /^Поэт/.test(paragraph.style) || isPsalms;
    // A Psalm's title: the lines before its first numbered verse, set as a title.
    // (centred, in small type, above the first lines; part of verse 1, sometimes 2, as in the Synodal).
    const psalmTitle = isPsalms && verseNo <= 2 && (paragraph.align === 'center' || PSALM_TITLE_STYLES.has(paragraph.style)) && !/^ПСАЛОМ/.test(text);
    const kind = psalmTitle ? 't' : poetry ? `q${indentLevel(paragraph)}` : 'p';
    let started = false;
    lastRunWasNote = false;
    for (const run of joinNumberRuns(paragraph.runs)) {
      const chapterNo = !started ? chapterNumber(run) : null;
      if (chapterNo !== null) {
        // Chapter 1 again, with no title between: the file's next book.
        if (chapterNo === 1 && book.chapters.has(1) && bookIds.length > 1) startBook();
        if (!book) return;
        startChapter(chapterNo);
        startVerse(1);
        verse.lineBreak(kind);
        started = true;
        continue;
      }
      const number = verseNumber(run);
      if (number !== null) {
        startVerse(number.from, number.to);
        if (!started) verse.lineBreak(kind);
        started = true;
        lastRunWasNote = false;
        continue;
      }
      if (run.footnote) {
        ensureVerse();
        verse.note(run.footnote, run.text.replace(/[\s*]/g, ''));
        lastRunWasNote = true;
        continue;
      }
      if (lastRunWasNote && isLabel(run)) {
        verse.notes.at(-1).label += run.text.replace(/[\s*]/g, '');
        continue;
      }
      if (!run.text.trim() && !verse) continue;
      if (!started) {
        ensureVerse();
        if (pendingHeadings.length) {
          for (const heading of pendingHeadings) chapter.headings.push({ before: verseNo, text: heading, inside: true });
          pendingHeadings = [];
        }
        verse.lineBreak(kind);
        started = true;
      }
      lastRunWasNote = false;
      // A verse number the file left out of superscript ("…непорочен, 2а Я силу…"):
      // accepted only when it is exactly the next verse, at a word boundary.
      let rest = run.text;
      for (;;) {
        const plain = /(^|[\s(«„])(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?(?=[\s\p{L}«„(])/u.exec(rest);
        if (!plain || Number(plain[2]) !== verseNo + 1 || run.sup) break;
        const cut = plain.index + plain[1].length;
        verse.add(rest.slice(0, cut), { i: run.ownItalic, sc: run.sc, b: run.b });
        const to = Number(plain[3] ?? plain[2]);
        recovered.push(`${book.id} ${[...book.chapters.keys()].at(-1)}:${plain[2]}${to > Number(plain[2]) ? `–${to}` : ''} «${rest.slice(Math.max(0, cut - 12), cut + 16).trim()}»`);
        startVerse(Number(plain[2]), to);
        rest = rest.slice(cut + plain[0].length - plain[1].length);
      }
      verse.add(rest, { i: run.ownItalic, sc: run.sc, b: run.b });
    }
  });
  for (const b of books) for (const c of b.chapters.values()) for (const v of c.verses.values()) v.finish();
  return books;
}

/** Runs of one number split in two ("1" + "7" in bold for chapter 17) joined again. */
function joinNumberRuns(runs) {
  const out = [];
  for (const run of runs) {
    const last = out.at(-1);
    const digits = (r) => /^[\d–-]+$/.test(r.text.trim()) && r.text.trim();
    if (last && !last.footnote && !run.footnote && digits(last) && digits(run) && last.b === run.b && last.sup === run.sup && last.size === run.size && !/\s$/.test(last.text)) {
      out[out.length - 1] = { ...last, text: last.text + run.text };
    } else out.push(run);
  }
  return out;
}

/**
 * Join pieces of rich text (verses renumbered into one) with a space,
 * shifting their styles, breaks and notes.
 */
export function joinRich(pieces) {
  const out = { text: '', styles: [], breaks: [], notes: [] };
  for (const piece of pieces) {
    const shift = out.text ? out.text.length + 1 : 0;
    out.text = out.text ? `${out.text} ${piece.text}` : piece.text;
    out.styles.push(...piece.styles.map(([start, length, kind]) => [start + shift, length, kind]));
    out.breaks.push(...piece.breaks.filter(([at]) => at + shift > 0 || !shift).map(([at, kind]) => [at + shift, kind]));
    out.notes.push(...piece.notes.map((note) => ({ ...note, at: note.at + shift })));
  }
  return out;
}

/** A paragraph's runs as RichText (introductions). */
function richFrom(runs) {
  const rich = new RichText();
  for (const run of runs) {
    if (run.footnote || isLabel(run)) continue;
    rich.add(run.text, { i: run.ownItalic, sc: run.sc });
  }
  return rich.finish();
}

/**
 * Poetry lines: 1 for a line's first line, 2 for an indented continuation.
 * The Psalms indent with tabs (one or two); other books with margins.
 */
function indentLevel(paragraph) {
  const tabs = /^\t*/.exec(paragraph.runs.map((run) => run.text).join(''))[0].length;
  if (tabs) return Math.min(tabs, 2);
  const { start = 0, firstLine = 0, hanging = 0 } = paragraph.indent ?? {};
  return start + firstLine - hanging > 1100 ? 2 : 1;
}
