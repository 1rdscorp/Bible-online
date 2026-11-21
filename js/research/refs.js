/**
 * References as the research data writes them: "ROM 5:8", "1JN 4:9-10",
 * "GEN 11:32-12:1" (USFM book id, English verse numbers). No DOM access, so
 * Node tests can import it.
 */
import { getBook } from '../canon.js';

/**
 * "GEN 11:32-12:1" → { book: "GEN", chapter: 11, verse: 32, endChapter: 12, endVerse: 1 };
 * "ROM 5:8" → { …, endChapter: 5, endVerse: 8 }. Null if unreadable or the book is unknown.
 */
export function parseRef(text) {
  const m = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(?:(\d+):)?(\d+))?$/.exec(String(text ?? ''));
  if (!m || getBook(m[1])?.id !== m[1]) return null;
  const chapter = Number(m[2]);
  const verse = Number(m[3]);
  const endChapter = m[4] ? Number(m[4]) : chapter;
  const endVerse = m[5] ? Number(m[5]) : verse;
  if (chapter < 1 || verse < 1 || endChapter < chapter || (endChapter === chapter && endVerse < verse)) return null;
  return { book: m[1], chapter, verse, endChapter, endVerse };
}

/** "GEN 11:32-12:1" in words: "Genesis 11:32–12:1", using `chapterTitle(book, chapter)` for the book name. */
export function formatRef(ref, chapterTitle) {
  const head = `${chapterTitle(getBook(ref.book), ref.chapter)}:${ref.verse}`;
  if (ref.endChapter !== ref.chapter) return `${head}–${ref.endChapter}:${ref.endVerse}`;
  return ref.endVerse > ref.verse ? `${head}–${ref.endVerse}` : head;
}

/**
 * The verses a reference covers, chapter by chapter:
 * "GEN 11:32-12:1" → [{ chapter: 11, from: 32, to: Infinity }, { chapter: 12, from: 1, to: 1 }].
 */
export function refChapters(ref) {
  const parts = [];
  for (let chapter = ref.chapter; chapter <= ref.endChapter; chapter += 1) {
    parts.push({
      chapter,
      from: chapter === ref.chapter ? ref.verse : 1,
      to: chapter === ref.endChapter ? ref.endVerse : Infinity,
    });
  }
  return parts;
}
