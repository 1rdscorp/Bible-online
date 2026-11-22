/**
 * The structure of Uriah Smith's Daniel and the Revelation, found in its
 * corrected OCR paragraphs (tools/lib/ocr.mjs). The book goes through
 * Daniel and the Revelation a verse or a few verses at a time:
 *
 *   VERSE 31. Thou, O king, sawest, and behold a great image. … 32. This
 *   image’s head was of fine gold, … 35. Then was the iron, the clay, …
 *   filled the whole earth.
 *
 *   Nebuchadnezzar, practicing the Chaldean religion, was an idolater. …
 *
 * Each quotation ("block") is found by its label ("VERSE 31.", however the
 * OCR read it) and confirmed by matching the KJV text that follows; the
 * verses it covers are those the KJV text runs through. The commentary is
 * everything up to the next block. A Bible chapter's own introduction is
 * whatever follows its "CHAPTER" heading before its first block.
 *
 * The verse text itself isn't kept: the site shows the KJV from its own
 * data, which is what Smith quotes (without the OCR's misreadings).
 */
import { editDistance, normWord, NOTE_MARK } from './ocr.mjs';

/** What tools/lib/ocr.mjs keeps for a chapter heading line ("CHAPTER VII."). */
export const CHAPTER_MARK = '§CHAPTER';

/** A heading line: "CHAPTER VII.", "CHAPTER XL" (OCR for XI), but not a running head "CHAPTER 2, VERSES 1-4 33". */
export function chapterHeading(line) {
  return /^\s*CHAPTER\b[\sIVXLl.]*$/.test(line) ? CHAPTER_MARK : null;
}

const words = (text) => text.split(/\s+/).filter(Boolean);

// The KJV text in /data writes some words apart that the book prints as one.
const JOINED = new Map([['for ever', 'forever'], ['for evermore', 'forevermore'], ['to day', 'today'], ['to morrow', 'tomorrow']]);

/** A verse's words, normalised, with "for ever" read as "forever". */
export function kjvWords(text) {
  const list = words(text).map(normWord).filter(Boolean);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const joined = JOINED.get(`${list[i]} ${list[i + 1]}`);
    if (joined) {
      out.push(joined);
      i += 1;
    } else {
      out.push(list[i]);
    }
  }
  return out;
}

/** Does a word look like the label "VERSE"/"VERSES" (OCR: "Vee.se", "VeRSE", "VERsE")? */
function isLabel(word) {
  const n = normWord(word.replace(/\d+.*$/, ''));
  return n.length >= 4 && n.length <= 7 && n[0] === 'v' && Math.min(editDistance(n, 'verse'), editDistance(n, 'verses')) <= 2;
}

/**
 * A paragraph's label: { number, rest } where rest is the text after it
 * ("VERSE 31. Thou, O king" → { number: 31, rest: "Thou, O king" }).
 * number is null if the OCR garbled it. Null if there's no label.
 */
export function verseLabel(paragraph) {
  const list = words(paragraph);
  if (!list.length || !isLabel(list[0])) return null;
  // "VERSE 31." / "VERSE31." / "Verses 1,2."
  const glued = /(\d+)/.exec(list[0]);
  if (glued) return { number: Number(glued[1]), skip: 1 };
  const next = /^(\d+)[.,:;]?$/.exec(list[1] ?? '');
  if (next) return { number: Number(next[1]), skip: 2 };
  // No number: only the word itself counts ("Very well" is no label).
  return ['verse', 'verses'].includes(normWord(list[0])) ? { number: null, skip: 1 } : null;
}

/**
 * Match a verse's words in `tokens` (normalised OCR words) from `start`,
 * allowing for misread, missing and extra words. Returns
 * { ratio: matched / verse words, end: index after the last match }.
 */
export function matchVerse(tokens, start, verseWords) {
  const same = (token, word) => token === word || (word.length >= 4 && token?.length >= 3 && editDistance(token, word) <= Math.floor(word.length / 4));
  // A verse number ("10.") ends the words a verse can match: the next verse begins there.
  const limit = (from, length) => {
    let end = Math.min(tokens.length, from + length);
    for (let i = from; i < end; i += 1) {
      if (/^\d+$/.test(tokens[i] ?? '') && i > start) {
        end = i;
        break;
      }
    }
    return end;
  };
  let pos = start;
  let matched = 0;
  let end = start;
  let misses = 0;
  verseWords.forEach((word, w) => {
    let found = -1;
    for (let look = pos; look < limit(pos, 4); look += 1) {
      if (same(tokens[look], word)) {
        found = look;
        break;
      }
    }
    // Lost the place (two words in a row not found: noise from an engraving
    // inside the quotation)? Pick it up again further on, where this word and
    // the next two follow.
    if (found < 0 && misses >= 2 && w + 2 < verseWords.length) {
      for (let look = pos + 4; look < limit(pos, 24); look += 1) {
        if (same(tokens[look], word) && same(tokens[look + 1], verseWords[w + 1]) && same(tokens[look + 2], verseWords[w + 2])) {
          found = look;
          break;
        }
      }
    }
    if (found >= 0) {
      matched += 1;
      misses = 0;
      pos = found + 1;
      end = pos;
    } else {
      misses += 1;
    }
  });
  return { ratio: verseWords.length ? matched / verseWords.length : 0, end };
}

/**
 * Find the book's parts. `paragraphs`: strings (with CHAPTER_MARK lines).
 * `verseText(book, chapter, verse)`: the KJV verse, or undefined.
 * `markers`: phrases that open the Daniel and Revelation introductions and
 * the appendix (where the commentary ends).
 *
 * Returns [{ id, book, chapter|null, sections: [{ ref: { chapter, verse, endVerse }|null, paragraphs }] }].
 */
export function readSmithStructure(input, { verseText, markers, chapterCounts = { DAN: 12, REV: 22 } }) {
  const verseWords = (book, chapter, verse) => {
    const text = verseText(book, chapter, verse);
    return text ? kjvWords(text) : null;
  };
  const paragraphs = splitAtLabels(input, verseWords, chapterCounts);
  const find = (phrase, from = 0) => {
    const at = paragraphs.findIndex((paragraph, index) => index >= from && paragraph.replace(/\s+/g, ' ').includes(phrase));
    if (at < 0) throw new Error(`Smith: can't find "${phrase}"`);
    return at;
  };
  const danielStart = find(markers.danielIntro);
  const revelationStart = find(markers.revelationIntro, danielStart);
  const end = find(markers.end, revelationStart);

  // Every block, in order: { index (paragraph), book, chapter, verse, endVerse, rest: { index, token } }.
  const blocks = [];
  const scan = (book, from, to) => {
    let chapter = 1;
    let lastVerse = 0;
    for (let index = from; index < to; index += 1) {
      const paragraph = paragraphs[index];
      if (paragraph === CHAPTER_MARK) continue;
      const label = verseLabel(paragraph);
      const list = words(paragraph);
      const offset = label ? label.skip : 0;
      // The block's words, running on into the next paragraphs (a page break may split a quotation).
      const run = [];
      if (paragraph.startsWith(NOTE_MARK)) continue;
      for (let k = index; k < Math.min(to, index + 4); k += 1) {
        if (paragraphs[k] === CHAPTER_MARK) break;
        if (paragraphs[k].startsWith(NOTE_MARK)) continue; // a footnote inside a quotation
        if (k > index && verseLabel(paragraphs[k])) break; // the next quotation
        const piece = words(paragraphs[k]);
        (k === index ? piece.slice(offset) : piece).forEach((word, position) => run.push({ n: normWord(word), index: k, position: k === index ? position + offset : position }));
      }
      const tokens = run.map((token) => token.n);
      // The quotation must start in this paragraph, at its start.
      const own = run.filter((token) => token.index === index).map((token) => token.n);
      if (own.length < 4) continue;
      // Which verse does it start with? The label's number in this chapter or the next,
      // or (no label) the verse expected next, which needs a closer match.
      const candidates = [];
      if (label?.number) candidates.push([chapter, label.number], [chapter + 1, label.number]);
      if (label) for (let v = lastVerse + 1; v <= lastVerse + 3; v += 1) candidates.push([chapter, v]);
      if (label || index > from) candidates.push([chapter, lastVerse + 1], [chapter + 1, 1]);
      let best = null;
      for (const [c, v] of candidates) {
        if (c > chapterCounts[book] || (c === chapter && v <= lastVerse && v !== 1)) continue;
        const target = verseWords(book, c, v);
        if (!target) continue;
        const head = target.slice(0, 14);
        const skipNumber = /^\d+$/.test(own[0] ?? '') ? 1 : 0;
        if (!head.slice(0, 3).some((word) => own.slice(skipNumber, skipNumber + 4).includes(word))) continue;
        const { ratio } = matchVerse(own.length >= head.length ? own : tokens, skipNumber, head);
        if (ratio >= (label ? 0.6 : 0.85) && (!best || ratio > best.ratio)) best = { chapter: c, verse: v, ratio };
      }
      if (!best) continue;
      // Through which verse does the quotation run?
      let pos = /^\d+$/.test(tokens[0] ?? '') ? 1 : 0;
      let endVerse = best.verse - 1;
      for (let v = best.verse; ; v += 1) {
        const target = verseWords(book, best.chapter, v);
        if (!target) break;
        // The verse number ("32."), past up to three words of the last verse the OCR misread.
        if (v > best.verse) {
          const number = tokens.slice(pos, pos + 4).findIndex((token) => /^\d+$/.test(token ?? ''));
          if (number > 0) pos += number;
        }
        while (/^\d+$/.test(tokens[pos] ?? '')) pos += 1;
        // The next verse must begin right here (after its number), not somewhere further on.
        const begins = matchVerse(tokens.slice(pos, pos + 8), 0, target.slice(0, 4)).ratio >= 0.75;
        if (v > best.verse && !begins) break;
        const { ratio, end: after } = matchVerse(tokens, pos, target);
        // A verse whose end an engraving or a lost line cut off still counts if it clearly begins.
        if (ratio < 0.6 && !(v > best.verse && begins && ratio >= 0.3)) break;
        endVerse = v;
        pos = after;
      }
      if (endVerse < best.verse) continue;
      chapter = best.chapter;
      lastVerse = endVerse;
      const restToken = run[pos] ?? null;
      blocks.push({ index, book, chapter, verse: best.verse, endVerse, rest: restToken ? { index: restToken.index, position: restToken.position } : null });
      // Paragraphs the quotation used up entirely are skipped.
      if (restToken && restToken.index > index) index = restToken.index - 1;
      else if (!restToken) index = run.at(-1)?.index ?? index;
    }
  };
  scan('DAN', danielStart, revelationStart);
  scan('REV', revelationStart, end);

  // Text of paragraphs [from, to), starting mid-paragraph at `start` if given.
  const slice = (from, to, start = null) => {
    const out = [];
    for (let index = from; index < to; index += 1) {
      if (paragraphs[index] === CHAPTER_MARK) continue;
      if (start && index === start.index) out.push(words(paragraphs[index]).slice(start.position).join(' '));
      else if (!start || index > start.index) out.push(paragraphs[index]);
    }
    return out.filter((text) => text.trim());
  };
  // The paragraph after the last CHAPTER heading between two points (or null).
  const lastHeading = (from, to) => {
    for (let index = to - 1; index >= from; index -= 1) if (paragraphs[index] === CHAPTER_MARK) return index + 1;
    return null;
  };

  const parts = [];
  for (const [book, start, stop, introId] of [
    ['DAN', danielStart, revelationStart, 'dan-intro'],
    ['REV', revelationStart, end, 'rev-intro'],
  ]) {
    const bookBlocks = blocks.filter((block) => block.book === book);
    let chapterPart = null;
    // The book's introduction runs to its first chapter heading (or first block).
    const firstBlock = bookBlocks[0];
    const firstHeading = lastHeading(start, firstBlock.index);
    const introEnd = firstHeading !== null ? firstHeading - 1 : firstBlock.index;
    parts.push({ id: introId, book, chapter: null, sections: [{ ref: null, paragraphs: slice(start, introEnd) }] });
    let pendingIntro = firstHeading !== null ? slice(firstHeading, firstBlock.index) : [];
    bookBlocks.forEach((block, i) => {
      const next = bookBlocks[i + 1];
      if (!chapterPart || chapterPart.chapter !== block.chapter) {
        chapterPart = { id: `${book.toLowerCase()}-${block.chapter}`, book, chapter: block.chapter, sections: [] };
        if (pendingIntro.length) chapterPart.sections.push({ ref: null, paragraphs: pendingIntro });
        parts.push(chapterPart);
      }
      // Its commentary runs to the next block; a CHAPTER heading before a block of
      // the next chapter starts that chapter's introduction.
      const limit = next ? next.index : stop;
      const heading = next && next.chapter !== block.chapter ? lastHeading(block.index + 1, next.index) : null;
      const commentaryEnd = heading !== null ? heading - 1 : limit;
      const from = block.rest ? block.rest.index : limit;
      chapterPart.sections.push({
        ref: { chapter: block.chapter, verse: block.verse, endVerse: block.endVerse },
        paragraphs: block.rest ? slice(from, Math.max(commentaryEnd, from + 1), block.rest) : [],
      });
      pendingIntro = heading !== null ? slice(heading, limit) : [];
    });
  }
  return { parts, blocks, paragraphs };
}

/**
 * Start a new paragraph wherever a quotation begins inside one: a page break
 * can glue "Verse 10. Now the queen …" onto the end of the paragraph before
 * it, or leave engraving noise in front of it ("sN\\ N Verse 1. And there
 * came …"). A label counts only if the KJV text of that verse (in some
 * chapter of Daniel or the Revelation) follows it. Noise left in front of a
 * label at a paragraph's start (three words or fewer) is dropped.
 */
export function splitAtLabels(paragraphs, verseWords, chapterCounts) {
  const out = [];
  for (const paragraph of paragraphs) {
    if (paragraph === CHAPTER_MARK || paragraph.startsWith(NOTE_MARK)) {
      out.push(paragraph);
      continue;
    }
    // "chap-VersE 11." → "chap- VersE 11."
    const list = words(paragraph.replace(/(?<=\S)(?=V[eE][rR][sS][eE][sS]?\s+\d)/g, ' '));
    const cuts = [];
    for (let i = 1; i < list.length - 2; i += 1) {
      if (!/^V/.test(list[i]) || !isLabel(list[i])) continue;
      const number = /(\d+)/.exec(list[i])?.[1] ?? /^(\d+)[.,:;]?$/.exec(list[i + 1])?.[1];
      if (!number) continue;
      const tokens = list.slice(i + (/\d/.test(list[i]) ? 1 : 2), i + 18).map(normWord);
      let confirmed = false;
      for (const book of Object.keys(chapterCounts)) {
        for (let c = 1; c <= chapterCounts[book] && !confirmed; c += 1) {
          const target = verseWords(book, c, Number(number));
          if (target && matchVerse(tokens, 0, target.slice(0, 12)).ratio >= 0.75) confirmed = true;
        }
      }
      if (confirmed) cuts.push(i);
    }
    let from = 0;
    for (const cut of cuts) {
      const head = list.slice(from, cut);
      // A few words in front of the first label are noise ("CHAPTER:L ei"); more is text.
      if (!(from === 0 && head.length <= 3)) out.push(head.join(' '));
      from = cut;
    }
    out.push(list.slice(from).join(' '));
  }
  return out.filter((text) => text.trim());
}
