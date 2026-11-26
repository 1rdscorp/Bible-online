#!/usr/bin/env node
/**
 * Build data/bti.json: the Bible in the modern Russian translation of the
 * Institute for Bible Translation named after M. P. Kulakov (Zaoksky), used
 * on this site under a licence from the Institute (data/README.md).
 *
 *   node tools/build-bti.mjs [folder]
 *
 * The Institute's Word files aren't in the repository. Put them in
 * .cache/sources/bti/ (or name another folder); .doc files are converted to
 * .docx with LibreOffice (soffice) the first time. tools/bti-sources.json
 * lists the files and the books each holds.
 *
 * The licence forbids changing the text, so the words, punctuation and dashes
 * stay exactly as the Institute wrote them (no typography fixes, unlike the
 * public-domain texts); only spacing is evened out. What the printed layout
 * shows is kept beside the text (data/README.md, "Formatting"): the words the
 * translators added (italics), «Господь» in small capitals, paragraphs and
 * poetry lines, section headings, footnotes, and verses translated together
 * ("11–12").
 *
 * Verses are renumbered to the site's English numbering, chapter by
 * chapter: a chapter whose verse count matches the English scheme keeps its
 * numbers; one that matches the Synodal is renumbered like the Synodal
 * translation; the Psalms are Synodal throughout and Daniel 3–4 Hebrew
 * (tools/bti-sources.json, "schemes").
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS } from '../js/canon.js';
import { readBooks, readFootnote, joinRich } from './lib/bti.mjs';
import { readDocx } from './lib/docx.mjs';
import { download } from './lib/download.mjs';
import { contentVersion, serialize } from './lib/translation-file.mjs';
import { validateTranslation } from './validate-translation.mjs';
import { createVersificationMapper, nativeChapterSpans } from './lib/versification.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** A book's name from its title lines ("Первая книга Моисеева" + "Бытие" → "Бытие"). */
export function bookName(title) {
  if (title.length > 1 && /книга Моисеева$/i.test(title[0])) return title.at(-1);
  return title.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Which numbering a chapter follows: "eng", "rso" (Synodal) or "org"
 * (Hebrew/Greek), from tools/bti-sources.json or its verse count.
 */
export function chapterScheme(bookId, chapter, count, { schemes = {}, eng, rso }) {
  const set = schemes[`${bookId} ${chapter}`] ?? schemes[bookId];
  if (set) return set;
  if (String(count) === eng.maxVerses[bookId]?.[chapter - 1]) return 'eng';
  if (String(count) === rso.maxVerses[bookId]?.[chapter - 1]) return 'rso';
  return null;
}

/** Compact per-verse marks: "0.p 12.7.i 40.q2" (see data/README.md). */
export function encodeMarks({ styles, breaks }) {
  return [...breaks.map(([at, kind]) => `${at}.${kind}`), ...styles.map(([start, length, kind]) => `${start}.${length}.${kind}`)].join(' ');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const config = JSON.parse(await readFile(join(ROOT, 'tools', 'bti-sources.json'), 'utf8'));
  const sourceDir = process.argv[2] ?? join(ROOT, '.cache', 'sources', 'bti');
  const dataSources = JSON.parse(await readFile(join(ROOT, 'tools', 'data-sources.json'), 'utf8'));
  const [rso, eng] = await Promise.all(['rso', 'eng'].map(async (name) => JSON.parse((await download(`${dataSources._versificationMappings}${name}.json`)).toString('utf8'))));
  const mappers = {
    eng: (bookId, chapter, verse) => ({ bookId, chapter, verse }),
    rso: createVersificationMapper({ from: rso, to: eng, corrections: config.rsoCorrections }),
    org: createVersificationMapper({ from: { mappedVerses: {} }, to: eng }),
  };

  const problems = [];
  const recovered = [];
  const byId = new Map();
  for (const [name, ids] of Object.entries(config.files)) {
    const docx = join(sourceDir, `${name}.docx`);
    if (!existsSync(docx)) {
      const doc = join(sourceDir, `${name}.doc`);
      if (!existsSync(doc)) throw new Error(`Missing ${name}.doc or .docx in ${sourceDir}`);
      execFileSync('soffice', ['--headless', '--convert-to', 'docx', '--outdir', sourceDir, doc], { stdio: 'ignore' });
    }
    const { paragraphs, footnotes } = readDocx(readFileSync(docx));
    for (const book of readBooks(paragraphs, ids, problems, recovered, config.numberFixes ?? [])) byId.set(book.id, { book, footnotes });
  }

  const books = [];
  const unmatched = [];
  for (const canonBook of BOOKS) {
    const entry = byId.get(canonBook.id);
    if (!entry) throw new Error(`No ${canonBook.id} in the files`);
    const { book, footnotes } = entry;
    // Every verse, renumbered: target "chapter:verse" → [{ rich, source, to }].
    const targets = new Map();
    const headings = [];
    const ranges = [];
    const nativeCounts = [];
    for (const [chapterNo, chapter] of book.chapters) {
      const count = Math.max(...[...chapter.verses.keys()].map((v) => chapter.ranges.get(v) ?? v));
      nativeCounts[chapterNo - 1] = String(count);
      const scheme = chapterScheme(book.id, chapterNo, count, { schemes: config.schemes, eng, rso });
      if (!scheme) unmatched.push(`${book.id} ${chapterNo} (${count} verses; English ${eng.maxVerses[book.id]?.[chapterNo - 1]}, Synodal ${rso.maxVerses[book.id]?.[chapterNo - 1]})`);
      const map = mappers[scheme ?? 'eng'];
      for (const [verseNo, rich] of [...chapter.verses].sort((a, b) => a[0] - b[0])) {
        const target = map(book.id, chapterNo, verseNo);
        const key = `${target.chapter}:${target.verse}`;
        if (!targets.has(key)) targets.set(key, []);
        // Each footnote mark with its note: label as marked in the text, reference as printed.
        rich.notes = rich.notes.map((note) => ({ ...readFootnote(footnotes.get(note.id) ?? []), at: note.at, label: note.label || '*' }));
        targets.get(key).push({ rich, source: { chapter: chapterNo, verse: verseNo } });
        const to = chapter.ranges.get(verseNo);
        if (to) {
          const end = map(book.id, chapterNo, to);
          if (end.chapter === target.chapter && end.verse > target.verse) ranges.push([target.chapter, target.verse, end.verse]);
        }
        for (const heading of chapter.headings.filter((h) => h.before === verseNo)) headings.push([target.chapter, Math.max(1, target.verse), heading.text]);
      }
    }
    // Titles mapped to verse 0 open verse 1, as in the site's other data.
    for (const [key, list] of targets) {
      const [c, v] = key.split(':').map(Number);
      if (v !== 0) continue;
      const first = `${c}:1`;
      targets.set(first, [...list, ...(targets.get(first) ?? [])]);
      targets.delete(key);
    }

    const chapterCount = Math.max(...[...targets.keys()].map((key) => Number(key.split(':')[0])));
    const chapters = Array.from({ length: chapterCount }, () => []);
    const marks = Array.from({ length: chapterCount }, () => []);
    const notes = Array.from({ length: chapterCount }, () => []);
    const remapped = [];
    for (const [key, list] of targets) {
      const [c, v] = key.split(':').map(Number);
      const rich = joinRich(list.map((item) => item.rich));
      chapters[c - 1][v - 1] = rich.text;
      marks[c - 1][v - 1] = encodeMarks(rich);
      for (const note of rich.notes) {
        notes[c - 1].push([v, note.at, note.label, note.ref, note.text, encodeMarks(note)]);
      }
      remapped.push({ bookId: book.id, chapter: c, verse: v, sources: list.map((item) => item.source) });
    }
    remapped.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse);
    // A range that ends a chapter ("40–43") still needs its last verses, empty.
    for (const [c, , to] of ranges) {
      while (chapters[c - 1].length < to) chapters[c - 1].push('');
    }
    for (let c = 0; c < chapterCount; c += 1) {
      for (let v = 0; v < chapters[c].length; v += 1) {
        chapters[c][v] ??= '';
        marks[c][v] ??= '';
      }
      notes[c].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }
    const nativeSpans = nativeChapterSpans(remapped, { [book.id]: nativeCounts })[book.id];
    const out = { id: book.id, name: bookName(book.title), chapters, marks, notes };
    out.headings = Array.from({ length: chapterCount }, (_, c) => headings.filter(([hc]) => hc === c + 1).map(([, v, text]) => [v, text]));
    out.ranges = Array.from({ length: chapterCount }, (_, c) => ranges.filter(([rc]) => rc === c + 1).map(([, from, to]) => [from, to]));
    if (nativeSpans) out.native = nativeSpans;
    books.push(out);
  }

  for (const line of problems) console.log(`  note: ${line}`);
  for (const line of recovered) console.log(`  verse number from small type: ${line}`);
  if (unmatched.length) {
    console.log(`Chapters matching no numbering scheme (add them to "schemes" in tools/bti-sources.json):\n  ${unmatched.join('\n  ')}`);
    process.exitCode = 1;
  }

  const translation = {
    id: 'bti',
    abbreviation: 'BTI',
    name: 'Библия. Современный русский перевод',
    language: 'ru',
    direction: 'ltr',
    license: '© Институт перевода Библии им. М. П. Кулакова',
    source: 'Институт перевода Библии им. М. П. Кулакова (Заокский), по лицензии для этого сайта',
    copyright: '© Институт перевода Библии им. М. П. Кулакова, 2024. Not public domain: used by permission of the Institute on this site only. Do not copy or reuse this text. / Используется с разрешения Института только на этом сайте; копирование и использование текста запрещены.',
    nativeVersification: 'bti',
    books,
  };
  const text = serialize(translation);
  const report = validateTranslation(JSON.parse(text));
  for (const error of report.errors) console.log(`  error: ${error}`);
  for (const warning of report.warnings.slice(0, 20)) console.log(`  warning: ${warning}`);
  if (report.errors.length) process.exit(1);
  await writeFile(join(ROOT, 'data', 'bti.json'), text);
  // Keep data/translations.json's content version current (the site's cache key).
  const listPath = join(ROOT, 'data', 'translations.json');
  const list = await readFile(listPath, 'utf8');
  const updated = list.replace(/("id": "bti",[\s\S]*?"version": ")[^"]*(")/, `$1${contentVersion(text)}$2`);
  if (updated !== list) await writeFile(listPath, updated);
  const notesCount = books.reduce((sum, book) => sum + book.notes.flat().length, 0);
  console.log(`bti: ${report.stats.verses} verses, ${notesCount} notes, ${Buffer.byteLength(text)} bytes, version ${contentVersion(text)}`);
}
