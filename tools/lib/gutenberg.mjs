/**
 * Read a Project Gutenberg plain-text edition of a Conflict of the Ages book
 * (Patriarchs and Prophets, ebook 79498) into the commentary block format
 * of thml.mjs. The text looks like this:
 *
 *                               THE CREATION—2          ← a chapter (title—number), centred
 *
 *   “By the word of the Lord were the heavens made …”[16]    ← [16]: footnote 16
 *
 *           “Strong is thy hand, and high is thy right hand.   ← poetry, indented 8
 *
 *   Footnote 16:
 *
 *     Ps. 33:6, 9; 104:5.                                     ← mostly references
 *
 * Section headings ("IN THE BEGINNING") are centred capitals without a
 * number; the motto under each is left out. Illustrations' descriptions are
 * left out. Footnotes that are Bible references become inline references,
 * as in later editions ("… thy throne.” Ps. 89:13, 14); any other footnote
 * becomes a note: { n: 3, c: runs } in the chapter's `notes`, marked in the
 * text with { fn: 3 }.
 */
import { parseRefList } from './ref-list.mjs';
import { tidyRuns } from './thml.mjs';

const CHAPTER_HEADING = /^\s{8,}(\S.*?)\s*[—-](\d+)\s*$/;
const CENTRED_CAPS = /^\s{8,}([A-Z][A-Z ,’'—-]+)\s*$/;

/** "Book text" between Gutenberg's start and end markers. */
export function gutenbergBody(text) {
  const start = text.indexOf('*** START OF');
  const end = text.indexOf('*** END OF');
  return text.slice(text.indexOf('\n', start) + 1, end === -1 ? undefined : end).replace(/\r\n/g, '\n');
}

/** "THE TEMPTATION AND FALL" → "The Temptation and Fall". */
export function titleCase(text) {
  const small = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'with']);
  return text
    .toLowerCase()
    .split(/(\s+|—|-)/)
    .map((word, index) => (index > 0 && small.has(word) ? word : word.replace(/^(\p{P}*)(\p{L})/u, (all, punct, letter) => punct + letter.toUpperCase())))
    .join('');
}

/** Split off "Footnote N:" blocks: returns { text, footnotes: Map<N, text> }. */
export function takeFootnotes(body) {
  const footnotes = new Map();
  const lines = body.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^Footnote (\d+):\s*$/.exec(lines[i]);
    if (!m) {
      kept.push(lines[i]);
      continue;
    }
    // Its text: the indented lines that follow (blank lines between are allowed).
    const note = [];
    let j = i + 1;
    // (Indented 2 to 5 spaces: a centred heading after it is indented more.)
    while (j < lines.length && (lines[j].trim() === '' || /^ {2,5}\S/.test(lines[j]))) {
      if (/^Footnote \d+:/.test(lines[j].trim())) break;
      note.push(lines[j]);
      j += 1;
    }
    // Stop before the trailing blank lines (they separate the next block).
    while (note.length && note.at(-1).trim() === '') {
      note.pop();
      j -= 1;
    }
    footnotes.set(Number(m[1]), note.join(' ').replace(/\s+/g, ' ').trim());
    i = j - 1;
  }
  return { text: kept.join('\n'), footnotes };
}

/** Text with _italics_ as runs. */
function italicRuns(text) {
  const runs = [];
  let last = 0;
  for (const m of text.matchAll(/_([^_]+)_/g)) {
    runs.push(text.slice(last, m.index), { i: m[1] });
    last = m.index + m[0].length;
  }
  runs.push(text.slice(last));
  return runs;
}

/**
 * Chapters: [{ number, id, title, section, blocks, notes }] plus the
 * appendix (id "appendix") if the book has one.
 */
export function readGutenbergBook(text, { lastVerse }) {
  const { text: body, footnotes } = takeFootnotes(gutenbergBody(text));
  // Illustrations: "[Illustration: …]" over one or more lines.
  const cleaned = body.replace(/\[Illustration:[^\]]*\]/g, '');
  const lines = cleaned.split('\n');

  const chapters = [];
  let chapter = null;
  let section = null;
  let inMotto = false;
  let paragraph = [];

  // A footnote as runs: references inline (" Ps. 33:6, 9; 104:5") or a numbered note.
  const footnoteRuns = (number, owner) => {
    const note = footnotes.get(number);
    if (!note) return [];
    const pieces = parseRefList(note, lastVerse);
    const words = note.replace(/\b(Rev\. Ver|R\. V|margin|See|and|chapters?)\b\.?/gi, '');
    const allRefs = pieces.length > 0 && pieces.every((piece) => piece.refs.length > 0) && !/[a-z]{4,}/.test(words.replace(/[A-Z][a-z]+\.?/g, ''));
    if (allRefs) {
      const runs = [' '];
      pieces.forEach((piece, index) => {
        if (index > 0) runs.push('; ');
        runs.push({ r: piece.refs[0], x: piece.text });
      });
      runs.push('.');
      return runs;
    }
    const n = owner.notes.length + 1;
    owner.notes.push({ n, c: tidyRuns(refRuns(note, lastVerse)) });
    return [{ fn: n }];
  };

  const flush = () => {
    const raw = paragraph;
    paragraph = [];
    if (!chapter || !raw.length) return;
    const indents = raw.map((line) => /^ */.exec(line)[0].length);
    const poetry = indents.every((n) => n >= 6);
    const quote = !poetry && indents.every((n) => n >= 3);
    const toRuns = (line) => {
      const runs = [];
      let last = 0;
      for (const m of line.matchAll(/\[(\d+)\]/g)) {
        runs.push(...italicRuns(line.slice(last, m.index)), ...footnoteRuns(Number(m[1]), chapter));
        last = m.index + m[0].length;
      }
      runs.push(...italicRuns(line.slice(last)));
      return tidyRuns(runs);
    };
    if (poetry) {
      chapter.blocks.push({ t: 'q', lines: raw.map((line) => toRuns(line.trim())) });
    } else {
      const joined = raw.map((line) => line.trim()).join(' ');
      chapter.blocks.push(quote ? { t: 'q', lines: [toRuns(joined)] } : { t: 'p', c: toRuns(joined) });
    }
  };

  for (const line of lines) {
    const heading = CHAPTER_HEADING.exec(line);
    if (heading && /[A-Z]{3}/.test(heading[1])) {
      flush();
      inMotto = false;
      chapter = { number: Number(heading[2]), id: heading[2], title: titleCase(heading[1]), section, blocks: [], notes: [] };
      chapters.push(chapter);
      continue;
    }
    const caps = CENTRED_CAPS.exec(line);
    if (caps && !paragraph.length) {
      flush();
      const name = caps[1].trim();
      if (name === 'APPENDIX') {
        chapter = { number: 0, id: 'appendix', title: 'Appendix', section: null, blocks: [], notes: [] };
        chapters.push(chapter);
        inMotto = false;
      } else if (/^Index of Scripture/i.test(name)) {
        chapter = null;
      } else {
        section = titleCase(name);
        chapter = null;
        inMotto = true; // the quotation under a section heading
      }
      continue;
    }
    if (/^\s*Index of Scripture References\s*$/.test(line)) {
      flush();
      chapter = null;
      continue;
    }
    if (inMotto) continue;
    if (line.trim() === '') flush();
    else paragraph.push(line);
  }
  flush();

  for (const item of chapters) {
    // The opening word is set in capitals ("“GOD is love.”"): write it normally.
    const first = item.blocks.find((block) => block.t === 'p');
    if (first && typeof first.c[0] === 'string') {
      first.c[0] = first.c[0].replace(/^(\W*)([A-Z])([A-Z]+)\b/, (all, punct, head, rest) => (rest.length && head + rest !== 'I' ? punct + head + rest.toLowerCase() : all));
    }
    // Appendix notes: "=NOTE 1.= PAGE 92.—…": the heading in bold, and an
    // anchor ("note-1") that the chapters' "See Appendix, Note 1" links to.
    for (const block of item.blocks) {
      if (block.t !== 'p' || typeof block.c[0] !== 'string') continue;
      const m = /^=(NOTE (\d+)\.)=\s*/i.exec(block.c[0]);
      if (!m) continue;
      block.id = `note-${m[2]}`;
      block.c.splice(0, 1, { b: m[1].toUpperCase() }, ` ${block.c[0].slice(m[0].length)}`);
    }
  }
  return chapters;
}

/**
 * Plain text with its Bible references as links (for notes), and "Appendix,
 * Note 5" as a link to that note: { to: "appendix#note-5", x: "Appendix, Note 5" }.
 */
export function refRuns(text, lastVerse) {
  const runs = [];
  let last = 0;
  const appendix = /Appendix, Note (\d+)/.exec(text);
  if (appendix) {
    const before = refRuns(text.slice(0, appendix.index), lastVerse);
    const after = refRuns(text.slice(appendix.index + appendix[0].length), lastVerse);
    return [...before, { to: `appendix#note-${appendix[1]}`, x: appendix[0] }, ...after];
  }
  // "Gen. 4:16", "2 Sam. 1:2-16", "Numbers 22-24": a book name then numbers.
  const pattern = /\b((?:[1-3]\s)?[A-Z][a-z]+\.?)\s(\d+(?::\d+)?(?:[-–]\d+(?::\d+)?)?(?:,\s?\d+(?:[-–]\d+)?)*)/g;
  for (const m of text.matchAll(pattern)) {
    const [piece] = parseRefList(`${m[1]} ${m[2]}`, lastVerse);
    if (!piece?.refs.length) continue;
    runs.push(text.slice(last, m.index), { r: piece.refs[0], x: m[0] });
    last = m.index + m[0].length;
  }
  runs.push(text.slice(last));
  return runs;
}
