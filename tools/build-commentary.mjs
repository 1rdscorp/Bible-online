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
import { readGutenbergBook } from './lib/gutenberg.mjs';
import { parseRefList } from './lib/ref-list.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { readThml } from './lib/thml.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(ROOT, 'data', 'commentary');

export const COMMENTARY_FORMAT_VERSION = 1;

/** The KJV's verses, for whole-chapter ranges and a verse-by-verse commentary's quotations. */
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
  // The printed pages it covers, so a citation such as "DA 44" finds it.
  if (part.pages) entry.pages = part.pages;
  if (ru) entry.ru = ru;
  if (official) entry.ruEdition = official;
  return entry;
}

/**
 * A chapter's Russian translation (tools/commentary-ru/<work>/<part>.txt),
 * checked against the English and built like it; a verse-by-verse
 * commentary's quoted verses in the Synodal translation. Null if the chapter isn't translated.
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { works } = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-sources.json'), 'utf8'));
  const curated = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-passages.json'), 'utf8'));
  const kjv = JSON.parse(await readFile(join(ROOT, 'data', 'kjv.json'), 'utf8'));
  const { lastVerse } = kjvHelpers(kjv);
  const { verseText: synodal } = kjvHelpers(JSON.parse(await readFile(join(ROOT, 'data', 'rst.json'), 'utf8')));
  const officialRu = JSON.parse(await readFile(join(ROOT, 'tools', 'commentary-official-ru.json'), 'utf8'));

  await rm(OUT_DIR, { recursive: true, force: true });
  const index = { formatVersion: COMMENTARY_FORMAT_VERSION, works: [] };
  let all = '';
  let bytes = 0;
  for (const work of works) {
    console.log(`${work.author}, ${work.title}`);
    const parts = await whiteWork(work, { lastVerse, curated });
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
      // "chapters" (a chapter tells a passage); the site also reads "verses"
      // (a verse-by-verse commentary, with sections on verse ranges).
      kind: work.kind ?? 'chapters',
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
