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

  const missing = BOOKS.filter((book) => !seen.has(book.id));
  if (missing.length > 0) warnings.push(`Missing ${missing.length} book(s): ${missing.map((b) => b.id).join(', ')}.`);

  return result();
}

/** Print a validation result. Returns true when there were no errors. */
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
