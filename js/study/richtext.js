/**
 * Note text: a small, safe markup, so notes can be "rich-ish" without ever
 * storing or inserting HTML (an imported backup could otherwise inject
 * script into the page).
 *
 *   **bold**   *italic*   - a bullet line   https://… (becomes a link)
 *   \* \\ \-   a literal *, \ or leading "-"
 *
 * Each line is a paragraph; consecutive "- " lines form a list. The editor
 * (js/ui/note-editor.js) writes this markup from what is typed, and the same
 * file renders it back as DOM, element by element.
 *
 * parseNote(text) → blocks:
 *   { type: 'p', runs }  or  { type: 'ul', items: [runs, …] }
 * where runs = [{ text, bold, italic, href? }].
 *
 * No DOM here: unit-tested in tests/study-richtext.test.js.
 */

const BULLET = /^[-•]\s+/;
const URL = /https?:\/\/[^\s<>"'`]+/g;

/** Split a line into text and ** / * markers, honouring backslash escapes. */
function tokenize(line) {
  const tokens = [];
  let text = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && i + 1 < line.length && '*\\-'.includes(line[i + 1])) {
      text += line[i + 1];
      i += 1;
    } else if (char === '*') {
      if (text) tokens.push({ text });
      text = '';
      if (line[i + 1] === '*') {
        tokens.push({ marker: 'bold' });
        i += 1;
      } else {
        tokens.push({ marker: 'italic' });
      }
    } else {
      text += char;
    }
  }
  if (text) tokens.push({ text });
  return tokens;
}

/** Split text runs at URLs, so they become links. */
function linkify(runs) {
  const out = [];
  for (const run of runs) {
    let at = 0;
    for (const match of run.text.matchAll(URL)) {
      // Leave closing punctuation out of the link: "(see https://x.org)."
      const href = match[0].replace(/[.,;:!?)\]]+$/, '');
      if (match.index > at) out.push({ ...run, text: run.text.slice(at, match.index) });
      out.push({ ...run, text: href, href });
      at = match.index + href.length;
    }
    if (at < run.text.length) out.push({ ...run, text: run.text.slice(at) });
  }
  return out;
}

/** One line → runs of { text, bold, italic, href? }. */
export function parseInline(line) {
  const tokens = tokenize(line);
  // A marker with no partner later on the line is just a literal character.
  const counts = { bold: 0, italic: 0 };
  for (const token of tokens) if (token.marker) counts[token.marker] += 1;
  const literalLast = { bold: counts.bold % 2 === 1, italic: counts.italic % 2 === 1 };
  const seen = { bold: 0, italic: 0 };

  const runs = [];
  const state = { bold: false, italic: false };
  const push = (text) => {
    const last = runs[runs.length - 1];
    if (last && last.bold === state.bold && last.italic === state.italic) last.text += text;
    else runs.push({ text, bold: state.bold, italic: state.italic });
  };
  for (const token of tokens) {
    if (token.text !== undefined) {
      push(token.text);
      continue;
    }
    seen[token.marker] += 1;
    if (literalLast[token.marker] && seen[token.marker] === counts[token.marker]) push(token.marker === 'bold' ? '**' : '*');
    else state[token.marker] = !state[token.marker];
  }
  return linkify(runs.filter((run) => run.text !== ''));
}

/** Note text → blocks (paragraphs and bullet lists). Empty lines are kept as empty paragraphs. */
export function parseNote(text) {
  const blocks = [];
  for (const line of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (BULLET.test(line)) {
      const runs = parseInline(line.replace(BULLET, ''));
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(runs);
      else blocks.push({ type: 'ul', items: [runs] });
    } else {
      blocks.push({ type: 'p', runs: parseInline(line) });
    }
  }
  // Trim empty paragraphs at the start and end.
  const empty = (block) => block.type === 'p' && block.runs.every((run) => run.text.trim() === '');
  while (blocks.length && empty(blocks[0])) blocks.shift();
  while (blocks.length && empty(blocks[blocks.length - 1])) blocks.pop();
  return blocks;
}

function escapeText(text) {
  return text.replace(/[\\*]/g, (char) => `\\${char}`);
}

/** Runs → one line of markup. */
export function serializeRuns(runs) {
  let line = '';
  let bold = false;
  let italic = false;
  for (const run of runs) {
    if (!run.text) continue;
    // Close in reverse order of opening, then open what's needed.
    if (italic && !run.italic) {
      line += '*';
      italic = false;
    }
    if (bold && !run.bold) {
      line += '**';
      bold = false;
    }
    if (run.bold && !bold) {
      line += '**';
      bold = true;
    }
    if (run.italic && !italic) {
      line += '*';
      italic = true;
    }
    line += escapeText(run.text);
  }
  if (italic) line += '*';
  if (bold) line += '**';
  return line;
}

/** Blocks → note text. */
export function serializeNote(blocks) {
  const lines = [];
  for (const block of blocks) {
    if (block.type === 'ul') {
      for (const runs of block.items) lines.push(`- ${serializeRuns(runs)}`);
    } else {
      const line = serializeRuns(block.runs);
      // A paragraph that starts like a bullet must not turn into one.
      lines.push(BULLET.test(line) ? `\\${line}` : line);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The words of a note without markup, for search and previews. */
export function noteToPlainText(text) {
  return parseNote(text)
    .map((block) => (block.type === 'ul' ? block.items.map((runs) => runs.map((r) => r.text).join('')).join('\n') : block.runs.map((r) => r.text).join('')))
    .join('\n');
}
