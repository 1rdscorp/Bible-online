#!/usr/bin/env node
/**
 * Build data/commentary/: public-domain Adventist commentary, one file per
 * chapter of each book, and an index of the books, their chapters and the
 * Bible passages each chapter is based on.
 *
 *   node tools/build-commentary.mjs        (NODE_USE_ENV_PROXY=1 behind a proxy)
 *
 * Sources (tools/commentary-sources.json):
 *   - Ellen G. White's Conflict of the Ages books: Patriarchs and Prophets
 *     (Project Gutenberg's text of the 1913 edition), Prophets and Kings, The
 *     Desire of Ages, The Acts of the Apostles (CCEL's ThML editions).
 *   - Uriah Smith's Daniel and the Revelation, from the Internet Archive's
 *     OCR of three printings, compared word by word (tools/lib/ocr.mjs).
 * Which Bible passages each chapter covers: the book's own note where it
 * has one, otherwise tools/commentary-passages.json.
 *
 * Russian: chapters translated in tools/commentary-ru/<book>/<chapter>.txt
 * (see its README) are checked against the English and built into
 * data/commentary/ru/; tools/commentary-official-ru.json (from
 * tools/fetch-official-ru.mjs) links each Ellen White chapter to the
 * official Russian edition in EGW Writings.
 *
 * Output:
 *   data/commentary/index.json            the books and their chapters
 *   data/commentary/<book>/<chapter>.json one chapter's text
 *   data/commentary/ru/<book>/<chapter>.json  its Russian translation, if there is one
 * Formats: data/README.md. tests/commentary.test.js checks the output.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPinned, download } from './lib/download.mjs';
import { fromJob } from './lib/commentary-job.mjs';
import { linkRefs, mendOcr, sideHeading, tidyOcrText } from './lib/commentary-runs.mjs';
import { readGutenbergBook } from './lib/gutenberg.mjs';
import { alignTokens, normWord, NOTE_MARK, ocrParagraphs, tokenize, voteTokens } from './lib/ocr.mjs';
import { formatRange, parseRefList } from './lib/ref-list.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { chapterHeading, readSmithStructure } from './lib/smith.mjs';
import { decodeEntities, readThml, tidyRuns } from './lib/thml.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'data', 'commentary');

export const COMMENTARY_FORMAT_VERSION = 1;

/** The KJV's verses, for whole-chapter ranges and Smith's quotations. */
export function kjvHelpers(kjv) {
  const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
  const lastVerse = (book, chapter) => {
    const verses = chapters.get(book)?.[chapter - 1] ?? [];
    let last = verses.length;
    while (last > 0 && !verses[last - 1]) last -= 1;
    return last;
  };
  const verseText = (book, chapter, verse) => chapters.get(book)?.[chapter - 1]?.[verse - 1] || undefined;
  return { lastVerse, verseText };
}

/**
 * Whole chapters in short form, as the index stores them: "GEN 39:1-41:57"
 * → "GEN 39-41", "LUK 2:1-52" → "LUK 2"; part of a chapter stays as it is.
 */
export function compactPassage(ref, lastVerse) {
  const m = /^(\S+) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(ref);
  if (!m) return ref;
  const [book, chapter, verse] = [m[1], Number(m[2]), Number(m[3])];
  const endChapter = m[4] ? Number(m[4]) : chapter;
  const endVerse = m[5] ? Number(m[5]) : verse;
  if (verse !== 1 || endVerse !== lastVerse(book, endChapter)) return ref;
  return endChapter === chapter ? `${book} ${chapter}` : `${book} ${chapter}-${endChapter}`;
}

/** Whole chapters that follow each other, as one passage: ["GEN 1", "GEN 2"] → ["GEN 1-2"]. */
export function mergePassages(list) {
  const out = [];
  for (const passage of list) {
    const m = /^(\S+) (\d+)(?:-(\d+))?$/.exec(passage);
    const last = out.length ? /^(\S+) (\d+)(?:-(\d+))?$/.exec(out.at(-1)) : null;
    if (m && last && m[1] === last[1] && Number(m[2]) === Number(last[3] ?? last[2]) + 1) {
      out[out.length - 1] = `${m[1]} ${last[2]}-${m[3] ?? m[2]}`;
    } else if (!out.includes(passage)) {
      out.push(passage);
    }
  }
  return out;
}

/** A chapter's passages from a "based on" list such as "Genesis 39-41; 1 Kings 3". */
export function passagesFromText(text, lastVerse) {
  return parseRefList(text, lastVerse).flatMap((piece) => piece.refs);
}

/**
 * The passages a chapter is based on: the curated entry if there is one
 * (an empty string: none), otherwise the book's own note.
 */
export function chapterPassages(workId, chapter, curated, lastVerse) {
  const entry = curated[workId]?.[chapter.id];
  if (entry !== undefined) return passagesFromText(entry, lastVerse);
  const refs = chapter.basedOn?.refs ?? [];
  // Keep only references to verses that exist.
  return refs.filter((ref) => {
    const m = /^(\S+) (\d+):(\d+)/.exec(ref);
    return m && lastVerse(m[1], Number(m[2])) >= Number(m[3]);
  });
}

/* ------------------------------------------------------------------ */
/* Uriah Smith                                                         */
/* ------------------------------------------------------------------ */

/** The OCR text inside an Internet Archive "stream" page's <pre>. */
export function archiveText(html) {
  const m = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(html);
  if (!m) throw new Error('No <pre> in the Internet Archive page');
  return decodeEntities(m[1]);
}

/** Is a paragraph engraving noise rather than text (few words, mostly unknown)? */
function isNoise(paragraph, known) {
  if (/^Response of History/.test(paragraph)) return true;
  const list = paragraph.match(/[A-Za-z]+/g) ?? [];
  if (list.length >= 25) return false;
  const real = list.filter((word) => word.length > 1 && known(normWord(word))).length;
  return list.length === 0 || real / list.length < 0.6;
}

/**
 * Lines of a poem: three or more short paragraphs in a row (a line or two
 * of verse each), but not prose with a side heading or a Bible reference.
 */
const isVerseLine = (text) =>
  text.length < 100 && !text.startsWith(NOTE_MARK) && /^[A-Z“‘"'(]/.test(text) && !sideHeading(text) && !/\d:\s?\d/.test(text);

/** Paragraphs of a poem marked in the sources' `poems` list start with this. */
export const POEM_MARK = '§POEM ';

/** Mark the paragraphs of each poem (from the one containing `from` to the one containing `to`). */
export function markPoems(paragraphs, poems = []) {
  const out = [...paragraphs];
  for (const { from, to } of poems) {
    const start = out.findIndex((text) => text.includes(from));
    const end = out.findIndex((text, index) => index >= start && text.includes(to));
    if (start < 0 || end < 0) throw new Error(`Smith: poem "${from}" … "${to}" not found`);
    for (let i = start; i <= end; i += 1) if (!out[i].startsWith(NOTE_MARK)) out[i] = POEM_MARK + out[i];
  }
  return out;
}

/**
 * Smith's paragraphs as commentary blocks; footnotes become { t: "n" } blocks.
 * `isWord(lower-case word)` guides the last OCR repairs (mendOcr).
 */
export function smithBlocks(paragraphs, lastVerse, isWord = () => true) {
  const tidy = (text) => mendOcr(tidyOcrText(text), isWord);
  const blocks = [];
  const hasNotes = paragraphs.some((text) => text.startsWith(NOTE_MARK));
  for (let i = 0; i < paragraphs.length; ) {
    const paragraph = paragraphs[i];
    if (paragraph.startsWith(POEM_MARK)) {
      // A marked poem: one quotation, a stanza (or line) per paragraph.
      let j = i;
      while (j < paragraphs.length && paragraphs[j].startsWith(POEM_MARK)) j += 1;
      blocks.push({ t: 'q', lines: paragraphs.slice(i, j).map((line) => tidyRuns(linkRefs(tidy(line.slice(POEM_MARK.length)), lastVerse))) });
      i = j;
      continue;
    }
    if (paragraph.startsWith(NOTE_MARK)) {
      const text = tidy(paragraph.slice(NOTE_MARK.length).replace(/^[1-9*†‡]\s+/, ''));
      blocks.push({ t: 'n', c: tidyRuns(linkRefs(text, lastVerse)) });
      i += 1;
      continue;
    }
    let j = i;
    while (j < paragraphs.length && isVerseLine(paragraphs[j])) j += 1;
    if (j - i >= 3) {
      blocks.push({ t: 'q', lines: paragraphs.slice(i, j).map((line) => tidyRuns(linkRefs(tidy(line), lastVerse))) });
      i = j;
      continue;
    }
    let text = tidy(paragraph);
    // A footnote's mark in the text ("expectation.1"): the note follows as its own block.
    if (hasNotes) text = text.replace(/([.,;:!?”’"])[1-3*](?=\s|$)/g, '$1');
    const head = sideHeading(text);
    blocks.push({ t: 'p', c: tidyRuns(head ? [head[0], ' ', ...linkRefs(head[2], lastVerse)] : linkRefs(text, lastVerse)) });
    i += 1;
  }
  return blocks;
}

/** Correct the first scan against the others; returns its paragraphs. */
export function correctScans(texts, dictionary) {
  const inScan = texts.map((text) => new Set((text.match(/[A-Za-z]+/g) ?? []).map(normWord)));
  const inDictionary = (n) => dictionary.has(n);
  // Real words: in the dictionary, or read the same way in the first scan and another.
  const known = (n) => dictionary.has(n) || (inScan[0].has(n) && inScan.slice(1).some((set) => set.has(n))) || /^\d+$/.test(n);
  const paragraphs = texts.map((text) => ocrParagraphs(text, known, { marker: chapterHeading }));
  const tokens = paragraphs.map(tokenize);
  const others = tokens.slice(1).map((list) => ({ tokens: list, map: alignTokens(tokens[0], list) }));
  const { tokens: voted, changed } = voteTokens(tokens[0], others, { inDictionary, known });
  const out = paragraphs[0].map(() => []);
  for (const token of voted) out[token.p].push(token.w);
  const corrected = out.map((list, index) => (paragraphs[0][index].startsWith('§') && !paragraphs[0][index].startsWith(NOTE_MARK) ? paragraphs[0][index] : list.join(' ')));
  return { paragraphs: corrected, changed, known };
}

/** Apply the corrections list: each `from` must occur exactly once. */
export function applyCorrections(paragraphs, corrections) {
  const out = [...paragraphs];
  for (const [from, to] of corrections) {
    const hits = out.flatMap((text, index) => (text.includes(from) ? [index] : []));
    const count = hits.reduce((sum, index) => sum + out[index].split(from).length - 1, 0);
    if (count !== 1) throw new Error(`Smith correction "${from}" occurs ${count} times (expected once)`);
    out[hits[0]] = out[hits[0]].replace(from, to);
  }
  return out;
}

async function smithWork(work, { dictionary, lastVerse, verseText }) {
  const texts = [];
  for (const scan of work.scans) {
    const text = archiveText((await download(scan.url)).toString('utf8'));
    checkPinned(scan.url, scan.sha256, Buffer.from(text));
    texts.push(text);
  }
  const { paragraphs, changed, known } = correctScans(texts, dictionary);
  console.log(`  ${changed} words corrected from the other scans`);
  const fixed = markPoems(applyCorrections(paragraphs, work.corrections), work.poems);
  // For the last repairs: a short word must be a dictionary word (OCR noise
  // such as "ee" or "ob" turns up in more than one scan); a longer one may
  // also be one the scans agree on.
  const isWord = (word) => {
    const n = normWord(word);
    return n.length <= 3 ? dictionary.has(n) : known(n);
  };
  const { parts } = readSmithStructure(fixed, { verseText, markers: work.markers });
  return parts.map((part) => {
    const title = work.titles[part.id];
    if (!title) throw new Error(`Smith: no title for ${part.id}`);
    const passages = part.chapter ? [`${part.book} ${part.chapter}`] : [];
    const sections = part.sections
      .map((section) => {
        const kept = section.paragraphs.filter((text) => !isNoise(text, known));
        const out = {};
        if (section.ref) {
          const { chapter, verse, endVerse } = section.ref;
          out.ref = formatRange(part.book, [chapter, verse, chapter, endVerse], lastVerse);
          // The verses Smith quotes, in the KJV he quotes them from.
          out.quote = [];
          for (let v = verse; v <= endVerse; v += 1) out.quote.push([v, verseText(part.book, chapter, v)]);
        }
        out.blocks = smithBlocks(kept, lastVerse, isWord);
        return out;
      })
      .filter((section) => section.ref || section.blocks.length);
    return { id: part.id, title, book: part.book, chapter: part.chapter, passages, sections };
  });
}

/* ------------------------------------------------------------------ */
/* Ellen G. White                                                      */
/* ------------------------------------------------------------------ */

async function whiteWork(work, { lastVerse, curated }) {
  const bytes = await download(work.url);
  checkPinned(work.url, work.sha256, bytes);
  const text = bytes.toString('utf8');
  const chapters = work.reader === 'gutenberg' ? readGutenbergBook(text, { lastVerse }) : readThml(text, { lastVerse, introductions: work.introductions ?? [] });
  return chapters.map((chapter) => {
    const out = { id: chapter.id, title: chapter.title };
    if (chapter.section) out.section = chapter.section;
    out.passages = mergePassages(chapterPassages(work.id, chapter, curated, lastVerse).map((ref) => compactPassage(ref, lastVerse)));
    if (chapter.pages?.length) out.pages = [chapter.pages[0], chapter.pages.at(-1)];
    out.sections = [{ blocks: chapter.blocks }];
    if (chapter.notes?.length) out.notes = chapter.notes;
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

/** One chapter's file: a block per line, so rebuild diffs stay readable. */
export function partFile(workId, part) {
  const { sections, notes, ...head } = part;
  const lines = sections.map((section) => {
    const { blocks, ...meta } = section;
    const inner = blocks.map((block) => JSON.stringify(block)).join(',\n');
    const metaText = Object.keys(meta).length ? `${JSON.stringify(meta).slice(0, -1)},` : '{';
    return `${metaText}"blocks":[\n${inner}\n]}`;
  });
  const headText = JSON.stringify({ formatVersion: COMMENTARY_FORMAT_VERSION, work: workId, ...head }).slice(0, -1);
  const notesText = notes?.length ? `,"notes":${JSON.stringify(notes)}` : '';
  return `${headText},"sections":[\n${lines.join(',\n')}\n]${notesText}}\n`;
}

/**
 * What the index lists about a chapter. `official`: where it is in the
 * official Russian edition ({ para, title }); `ru`: our translation's title
 * (and section).
 */
function indexEntry(part, { official = null, ru = null } = {}) {
  const entry = { id: part.id, title: part.title };
  if (part.section) entry.section = part.section;
  if (part.book) entry.book = part.book;
  if (part.chapter) entry.chapter = part.chapter;
  entry.passages = part.passages;
  if (ru) entry.ru = ru;
  if (official) entry.ruEdition = official;
  return entry;
}

/**
 * A chapter's Russian translation (tools/commentary-ru/<work>/<part>.txt),
 * checked against the English and built like it; Smith's verses quoted in
 * the Synodal translation. Null if the chapter isn't translated.
 */
export async function russianPart(workId, part, { synodal }) {
  const file = join(ROOT, 'tools', 'commentary-ru', workId, `${part.id}.txt`);
  if (!existsSync(file)) return null;
  const { data, errors } = fromJob(await readFile(file, 'utf8'), part, { section: part.section });
  if (errors.length) throw new Error(`Russian translation of ${workId}/${part.id}:\n  ${errors.slice(0, 10).join('\n  ')}`);
  const sections = data.sections.map((section, index) => {
    const original = part.sections[index];
    if (!original.quote) return section;
    const ref = /^(\S+) (\d+):/.exec(original.ref);
    return { ref: original.ref, quote: original.quote.map(([verse]) => [verse, synodal(ref[1], Number(ref[2]), verse) ?? '']), blocks: section.blocks };
  });
  return {
    id: part.id,
    lang: 'ru',
    title: data.title,
    ...(data.section ? { section: data.section } : {}),
    ...(part.book ? { book: part.book, chapter: part.chapter } : {}),
    passages: part.passages,
    ...(part.pages ? { pages: part.pages } : {}),
    sections,
    ...(data.notes ? { notes: data.notes } : {}),
  };
}

/** The words of the clean texts and the KJV: what the OCR is checked against. */
function dictionaryOf(texts) {
  const words = new Set();
  for (const text of texts) for (const word of text.match(/[A-Za-z]+/g) ?? []) words.add(normWord(word));
  return words;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { works } = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-sources.json'), 'utf8'));
  const curated = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-passages.json'), 'utf8'));
  const kjv = JSON.parse(await readFile(join(ROOT, 'data', 'kjv.json'), 'utf8'));
  const { lastVerse, verseText } = kjvHelpers(kjv);
  const { verseText: synodal } = kjvHelpers(JSON.parse(await readFile(join(ROOT, 'data', 'rst.json'), 'utf8')));
  const officialRu = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-official-ru.json'), 'utf8'));

  await rm(OUT_DIR, { recursive: true, force: true });
  const index = { formatVersion: COMMENTARY_FORMAT_VERSION, works: [] };
  const cleanTexts = kjv.books.flatMap((book) => book.chapters.flat().filter(Boolean));
  let all = '';
  let bytes = 0;
  for (const work of works) {
    console.log(`${work.author}, ${work.title}`);
    const parts = work.reader === 'smith' ? await smithWork(work, { dictionary: dictionaryOf(cleanTexts), lastVerse, verseText }) : await whiteWork(work, { lastVerse, curated });
    if (work.reader !== 'smith') {
      // Ellen White's text, for checking Smith's OCR (built after her books).
      for (const part of parts) cleanTexts.push(JSON.stringify(part.sections));
    }
    await mkdir(join(OUT_DIR, work.id), { recursive: true });
    const official = officialRu.works[work.id] ?? null;
    const entries = [];
    let translated = 0;
    for (const part of parts) {
      const file = partFile(work.id, part);
      await writeFile(join(OUT_DIR, work.id, `${part.id}.json`), file);
      all += file;
      bytes += Buffer.byteLength(file);
      const ru = await russianPart(work.id, part, { synodal });
      if (ru) {
        const ruFile = partFile(work.id, ru);
        await mkdir(join(OUT_DIR, 'ru', work.id), { recursive: true });
        await writeFile(join(OUT_DIR, 'ru', work.id, `${part.id}.json`), ruFile);
        all += ruFile;
        bytes += Buffer.byteLength(ruFile);
        translated += 1;
      }
      entries.push(indexEntry(part, { official: official?.chapters[part.id] ?? null, ru: ru ? { title: ru.title, ...(ru.section ? { section: ru.section } : {}) } : null }));
    }
    const { id, title, author, year, edition, abbr, series, volume, source } = work;
    index.works.push({
      id,
      title,
      author,
      year,
      ...(edition ? { edition } : {}),
      abbr,
      ...(series ? { series, volume } : {}),
      kind: work.reader === 'smith' ? 'verses' : 'chapters',
      tradition: 'adventist',
      license: 'Public domain',
      source,
      ...(official ? { ruEdition: { title: official.title, url: `${officialRu.source.url}/book/${official.book}`, source: officialRu.source.name } } : {}),
      parts: entries,
    });
    const linked = parts.filter((part) => part.passages.length).length;
    console.log(`  ${parts.length} chapters (${linked} linked to Bible passages${translated ? `, ${translated} in Russian` : ''})`);
  }
  const indexText = `${JSON.stringify(index)}\n`;
  await writeFile(join(OUT_DIR, 'index.json'), indexText);
  const version = contentVersion(indexText + all);
  await updateResearchManifest('commentary', {
    url: 'data/commentary/',
    version,
    works: index.works.length,
    license: 'Public domain',
  });
  console.log(`  ${(bytes / 1e6).toFixed(1)} MB in ${index.works.reduce((n, w) => n + w.parts.length, 0)} files, version ${version}`);
}
