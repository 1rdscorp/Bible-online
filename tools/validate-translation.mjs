#!/usr/bin/env node
/**
 * Check that translation files match the format described in data/README.md.
 *
 *   node tools/validate-translation.mjs data/kjv.json [more files…]
 *
 * Errors mean the site can't read the file. Warnings flag things worth a look
 * (missing books, chapter counts that differ from the standard versification).
 * The converter and the test suite also import validateTranslation().
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOKS, getBook } from '../js/canon.js';

export const FORMAT_VERSION = 1;

export function validateTranslation(data) {
  const errors = [];
  const warnings = [];
  const stats = { books: 0, chapters: 0, verses: 0 };
  const result = () => ({ errors, warnings, stats });

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('The file must contain a JSON object.');
    return result();
  }
  if (data.formatVersion !== FORMAT_VERSION) errors.push(`"formatVersion" must be ${FORMAT_VERSION}.`);
  for (const field of ['id', 'name', 'abbreviation', 'language']) {
    if (typeof data[field] !== 'string' || data[field] === '') errors.push(`"${field}" must be a non-empty string.`);
  }
  if (!Array.isArray(data.books)) {
    errors.push('"books" must be an array.');
    return result();
  }

  const seen = new Set();
  data.books.forEach((book, i) => {
    const canonBook = typeof book?.id === 'string' ? getBook(book.id) : null;
    if (!canonBook || canonBook.id !== book.id) {
      errors.push(`books[${i}]: "id" must be an upper-case USFM code such as "GEN" (got ${JSON.stringify(book?.id)}).`);
      return;
    }
    const id = canonBook.id;
    if (seen.has(id)) {
      errors.push(`${id}: appears more than once.`);
      return;
    }
    seen.add(id);
    if (!Array.isArray(book.chapters)) {
      errors.push(`${id}: "chapters" must be an array.`);
      return;
    }
    stats.books += 1;
    if (book.chapters.length !== canonBook.chapters) {
      warnings.push(`${id}: has ${book.chapters.length} chapters; the standard count is ${canonBook.chapters}.`);
    }
    // Optional: where chapters sit in the translation's own numbering
    // (data/README.md, "Verse numbering"). { "23": [[22]], "10": [[9, 22, 39]] }
    if (book.native !== undefined) {
      if (!book.native || typeof book.native !== 'object' || Array.isArray(book.native)) {
        errors.push(`${id}: "native" must be an object keyed by chapter number.`);
      } else {
        for (const [chapterKey, spans] of Object.entries(book.native)) {
          const chapterNumber = Number(chapterKey);
          if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > book.chapters.length) {
            errors.push(`${id}: "native" lists chapter ${chapterKey}, which the book doesn't have.`);
          }
          const valid =
            Array.isArray(spans) &&
            spans.length > 0 &&
            spans.every(
              (span) =>
                Array.isArray(span) &&
                (span.length === 1 || (span.length === 3 && span[1] <= span[2])) &&
                span.every((n) => Number.isInteger(n) && n >= 0),
            );
          if (!valid) errors.push(`${id} ${chapterKey}: "native" spans must be [chapter] or [chapter, fromVerse, toVerse].`);
        }
      }
    }
    // Optional: Strong's numbers, one string per verse, mirroring "chapters"
    // ("7.9.H7225 17.3.H430": start.length.number; data/README.md, "KJV+").
    if (book.tags !== undefined) {
      const bad = [];
      const fits = Array.isArray(book.tags) && book.tags.length === book.chapters.length;
      if (!fits) errors.push(`${id}: "tags" must have one array per chapter.`);
      else {
        book.tags.forEach((verses, c) => {
          const texts = book.chapters[c];
          if (!Array.isArray(verses) || !Array.isArray(texts) || verses.length !== texts.length) {
            bad.push(`${c + 1}`);
            return;
          }
          verses.forEach((tags, v) => {
            if (typeof tags !== 'string') return bad.push(`${c + 1}:${v + 1}`);
            if (tags === '') return;
            let previous = 0;
            for (const tag of tags.split(' ')) {
              const m = /^(\d+)\.(\d+)\.([HG]\d+(?:\+[HG]\d+)*)$/.exec(tag);
              const start = Number(m?.[1]);
              if (!m || start < previous || start + Number(m[2]) > texts[v].length || m[2] === '0') return bad.push(`${c + 1}:${v + 1}`);
              previous = start;
            }
          });
        });
        if (bad.length) errors.push(`${id}: unreadable "tags" at ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}.`);
      }
    }
    validateFormatting(book, id, errors);
    book.chapters.forEach((verses, c) => {
      if (!Array.isArray(verses)) {
        errors.push(`${id} ${c + 1}: a chapter must be an array of verse strings.`);
        return;
      }
      stats.chapters += 1;
      let present = 0;
      verses.forEach((text, v) => {
        if (typeof text !== 'string') errors.push(`${id} ${c + 1}:${v + 1}: a verse must be a string (use "" for a missing verse).`);
        else if (text !== '') present += 1;
      });
      if (present === 0) warnings.push(`${id} ${c + 1}: the chapter has no verses.`);
      stats.verses += present;
    });
  });

  // Optional: a translation of one Testament only (the Septuagint is the Old
  // Testament) says so, and isn't warned about the other one's books.
  let testaments = ['OT', 'NT'];
  if (data.testaments !== undefined) {
    const valid = Array.isArray(data.testaments) && data.testaments.length > 0 && data.testaments.every((t) => t === 'OT' || t === 'NT');
    if (valid) testaments = data.testaments;
    else errors.push('"testaments" must be a non-empty list of "OT" and/or "NT".');
  }
  const missing = BOOKS.filter((book) => testaments.includes(book.testament) && !seen.has(book.id));
  if (missing.length > 0) warnings.push(`Missing ${missing.length} book(s): ${missing.map((b) => b.id).join(', ')}.`);

  return result();
}

/** Print a validation result. Returns true when there were no errors. */
const MARK = /^(\d+)\.(p|q1|q2|t)$|^(\d+)\.(\d+)\.(i|sc|b)$/;

/** Marks that all fit in `text` ("0.p 12.7.i"; data/README.md, "Formatting"). */
function marksFit(marks, text) {
  if (typeof marks !== 'string') return false;
  if (marks === '') return true;
  return marks.split(' ').every((mark) => {
    const m = MARK.exec(mark);
    if (!m) return false;
    if (m[1] !== undefined) return Number(m[1]) <= text.length;
    return Number(m[4]) > 0 && Number(m[3]) + Number(m[4]) <= text.length;
  });
}

/**
 * Optional formatting, shaped like "chapters" (data/README.md, "Formatting"):
 * "marks" (one string per verse), "notes" ([verse, at, label, ref, text, marks]),
 * "headings" ([verse, text]) and "ranges" ([from, to]) per chapter.
 */
function validateFormatting(book, id, errors) {
  const perChapter = (field) => book[field] === undefined || (Array.isArray(book[field]) && book[field].length === book.chapters.length && book[field].every(Array.isArray));
  for (const field of ['marks', 'notes', 'headings', 'ranges']) {
    if (!perChapter(field)) errors.push(`${id}: "${field}" must have one array per chapter.`);
  }
  const bad = [];
  book.chapters.forEach((texts, c) => {
    if (!Array.isArray(texts)) return;
    const verse = (v) => (Number.isInteger(v) && v >= 1 && v <= texts.length ? texts[v - 1] : null);
    if (Array.isArray(book.marks?.[c])) {
      if (book.marks[c].length !== texts.length) bad.push(`marks ${c + 1}`);
      else book.marks[c].forEach((marks, v) => !marksFit(marks, texts[v]) && bad.push(`marks ${c + 1}:${v + 1}`));
    }
    for (const note of book.notes?.[c] ?? []) {
      const [v, at, label, ref, text, marks] = Array.isArray(note) ? note : [];
      const host = verse(v);
      if (host === null || !Number.isInteger(at) || at < 0 || at > host.length || typeof label !== 'string' || typeof ref !== 'string' || typeof text !== 'string' || !text || !marksFit(marks ?? '', text)) bad.push(`note ${c + 1}:${v}`);
    }
    for (const heading of book.headings?.[c] ?? []) {
      if (!Array.isArray(heading) || verse(heading[0]) === null || typeof heading[1] !== 'string' || !heading[1]) bad.push(`heading ${c + 1}:${heading?.[0]}`);
    }
    for (const range of book.ranges?.[c] ?? []) {
      if (!Array.isArray(range) || verse(range[0]) === null || verse(range[1]) === null || range[1] <= range[0]) bad.push(`range ${c + 1}:${range?.[0]}`);
    }
  });
  if (bad.length) errors.push(`${id}: formatting that doesn't fit its verses at ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}.`);
}

export function printReport(label, { errors, warnings, stats }, log = console.log) {
  const limit = 20;
  log(`${label}: ${stats.books} books, ${stats.chapters} chapters, ${stats.verses} verses`);
  for (const message of errors.slice(0, limit)) log(`  error: ${message}`);
  if (errors.length > limit) log(`  … and ${errors.length - limit} more errors`);
  for (const message of warnings.slice(0, limit)) log(`  warning: ${message}`);
  if (warnings.length > limit) log(`  … and ${warnings.length - limit} more warnings`);
  log(errors.length === 0 ? '  OK' : `  FAILED (${errors.length} errors)`);
  return errors.length === 0;
}

async function main(files) {
  if (files.length === 0) {
    console.error('Usage: node tools/validate-translation.mjs <translation.json> [more files…]');
    process.exitCode = 2;
    return;
  }
  let ok = true;
  for (const file of files) {
    let data;
    try {
      data = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      console.log(`${file}: can't read JSON: ${error.message}`);
      ok = false;
      continue;
    }
    ok = printReport(file, validateTranslation(data)) && ok;
  }
  if (!ok) process.exitCode = 1;
}

// Run as a CLI only when executed directly (not when imported).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
