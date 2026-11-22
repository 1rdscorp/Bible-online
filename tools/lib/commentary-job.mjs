/**
 * Commentary chapters as plain text for translating, and back.
 *
 * A chapter (data/commentary/<work>/<part>.json) is written as a "job": one
 * header line per block, then its text, with everything that isn't words
 * kept as protected markers. The translation is the same file with the
 * words replaced; fromJob() checks it against the original and turns it
 * back into blocks.
 *
 *   @title The Great Image                       the chapter's title
 *   @section From Strength to Weakness            the book's section (if any)
 *   @block 2.1 p DAN 2:1                         section 2, block 1: a paragraph (Smith: on Daniel 2:1)
 *   Daniel was carried into captivity …           its text
 *   @block 2.4 q                                 a quotation: one line per line of the original
 *   @note 1                                      a chapter note
 *
 * Markers inside the text, to keep exactly as they are:
 *   ⟦DAN 2:31-35⟧    a Bible reference (shown in the reader's language)
 *   ⟦p44⟧            where page 44 of the printed book starts
 *   ⟦n1⟧             note 1's mark
 *   <i>…</i>, <b>…</b>                 italics, bold (translate the words inside)
 *   <a appendix#note-5>…</a>          a link within the book (translate the words)
 */
import { parseRef } from '../../js/research/refs.js';

const runToText = (run) => {
  if (typeof run === 'string') return run.replace(/\n/g, ' ');
  if (run.r) return `⟦${run.r}⟧`;
  if (run.pg !== undefined) return `⟦p${run.pg}⟧`;
  if (run.fn !== undefined) return `⟦n${run.fn}⟧`;
  if (run.i !== undefined) return `<i>${run.i}</i>`;
  if (run.b !== undefined) return `<b>${run.b}</b>`;
  if (run.to) return `<a ${run.to}>${run.x}</a>`;
  return '';
};

const runsToText = (runs) => runs.map(runToText).join('');

/** A chapter (and its index entry) as a job to translate. */
export function toJob(part, entry = {}) {
  const lines = [`@title ${part.title}`];
  if (entry.section) lines.push(`@section ${entry.section}`);
  part.sections.forEach((section, s) => {
    section.blocks.forEach((block, b) => {
      lines.push(`@block ${s + 1}.${b + 1} ${block.t}${section.ref ? ` ${section.ref}` : ''}`);
      if (block.t === 'q') lines.push(...block.lines.map(runsToText));
      else lines.push(runsToText(block.c));
    });
  });
  for (const note of part.notes ?? []) lines.push(`@note ${note.n}`, runsToText(note.c));
  return `${lines.join('\n')}\n`;
}

/** Text with markers → runs. Errors (unknown markers) are pushed to `errors`. */
export function textToRuns(text, errors = [], where = '') {
  const runs = [];
  let last = 0;
  const pattern = /⟦([^⟧]*)⟧|<i>([\s\S]*?)<\/i>|<b>([\s\S]*?)<\/b>|<a ([^>\s]+)>([\s\S]*?)<\/a>/g;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) runs.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const page = /^p(\d+)$/.exec(m[1]);
      const note = /^n(\d+)$/.exec(m[1]);
      if (page) runs.push({ pg: Number(page[1]) });
      else if (note) runs.push({ fn: Number(note[1]) });
      else if (parseRef(m[1])) runs.push({ r: m[1] });
      else errors.push(`${where}: unknown marker ⟦${m[1]}⟧`);
    } else if (m[2] !== undefined) runs.push({ i: m[2] });
    else if (m[3] !== undefined) runs.push({ b: m[3] });
    else runs.push({ to: m[4], x: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(text.slice(last));
  return runs.filter((run) => run !== '');
}

/** The markers of some runs, as a sorted list, to compare a translation with its original. */
function markers(runs) {
  return runs
    .flatMap((run) => {
      if (typeof run === 'string') return [];
      if (run.r) return [`r:${run.r}`];
      if (run.pg !== undefined) return [`p:${run.pg}`];
      if (run.fn !== undefined) return [`n:${run.fn}`];
      if (run.to) return [`a:${run.to}`];
      return [];
    })
    .sort();
}

const plain = (runs) => runs.map((run) => (typeof run === 'string' ? run : run.i ?? run.b ?? run.x ?? '')).join('');

/** Is this text Russian (mostly Cyrillic letters)? Short or letterless texts pass. */
function looksRussian(text) {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) ?? []).length;
  if (latin + cyrillic < 12) return true;
  return cyrillic / (latin + cyrillic) >= 0.7;
}

/** A job file → { title, section?, blocks per section, notes }, still unchecked. */
export function parseJob(text) {
  const out = { title: null, section: null, blocks: [], notes: [] };
  let current = null;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const header = /^@(title|section|block|note)\b\s*(.*)$/.exec(line);
    if (header) {
      const [, kind, rest] = header;
      if (kind === 'title') out.title = rest.trim();
      else if (kind === 'section') out.section = rest.trim();
      else if (kind === 'note') {
        current = { note: Number(rest), lines: [] };
        out.notes.push(current);
      } else {
        const m = /^(\d+)\.(\d+)\s+([pqn])\b/.exec(rest);
        current = m ? { id: `${m[1]}.${m[2]}`, s: Number(m[1]) - 1, b: Number(m[2]) - 1, t: m[3], lines: [] } : { id: rest, bad: true, lines: [] };
        out.blocks.push(current);
      }
      continue;
    }
    if (current && line.trim()) current.lines.push(line.trim());
  }
  return out;
}

/**
 * Check a translated job against the original chapter and build the
 * translated chapter: { data: { title, section?, sections: [{ blocks }], notes? }, errors }.
 * Every block must be there, in order, of the same kind (a quotation with
 * as many lines), with the same markers, and in Russian.
 */
export function fromJob(text, part, entry = {}) {
  const errors = [];
  const job = parseJob(text);
  if (!job.title) errors.push('@title is missing');
  else if (!looksRussian(job.title)) errors.push(`@title isn't Russian: ${job.title}`);
  if (entry.section && !job.section) errors.push('@section is missing');

  const expected = part.sections.flatMap((section, s) => section.blocks.map((block, b) => ({ s, b, block })));
  if (job.blocks.length !== expected.length) errors.push(`${job.blocks.length} blocks, expected ${expected.length}`);
  const sections = part.sections.map((section) => ({ ...(section.ref ? { ref: section.ref } : {}), blocks: [] }));
  expected.forEach(({ s, b, block }, index) => {
    const got = job.blocks[index];
    const id = `${s + 1}.${b + 1}`;
    if (!got) return;
    if (got.bad || got.id !== id) {
      errors.push(`block ${index + 1}: header "${got.id}", expected ${id}`);
      return;
    }
    if (got.t !== block.t) errors.push(`${id}: kind ${got.t}, expected ${block.t}`);
    const wantLines = block.t === 'q' ? block.lines.length : 1;
    if (got.lines.length !== wantLines) errors.push(`${id}: ${got.lines.length} lines, expected ${wantLines}`);
    if (!got.lines.length) return;
    let out;
    if (block.t === 'q') {
      const lines = got.lines.map((line) => textToRuns(line, errors, id));
      out = { t: 'q', lines };
      if (JSON.stringify(markers(lines.flat())) !== JSON.stringify(markers(block.lines.flat()))) errors.push(`${id}: markers differ from the original`);
      if (!looksRussian(plain(lines.flat()))) errors.push(`${id}: not Russian`);
    } else {
      const c = textToRuns(got.lines.join(' '), errors, id);
      out = { t: block.t, c };
      if (block.id) out.id = block.id;
      if (JSON.stringify(markers(c)) !== JSON.stringify(markers(block.c))) errors.push(`${id}: markers differ from the original (${markers(block.c).join(' ')} → ${markers(c).join(' ')})`);
      if (!looksRussian(plain(c))) errors.push(`${id}: not Russian`);
    }
    sections[s].blocks.push(out);
  });

  const notes = [];
  const originalNotes = part.notes ?? [];
  if (job.notes.length !== originalNotes.length) errors.push(`${job.notes.length} notes, expected ${originalNotes.length}`);
  originalNotes.forEach((note, index) => {
    const got = job.notes[index];
    if (!got || got.note !== note.n) {
      errors.push(`note ${note.n} is missing`);
      return;
    }
    const c = textToRuns(got.lines.join(' '), errors, `note ${note.n}`);
    if (JSON.stringify(markers(c)) !== JSON.stringify(markers(note.c))) errors.push(`note ${note.n}: markers differ from the original`);
    if (!looksRussian(plain(c))) errors.push(`note ${note.n}: not Russian`);
    notes.push({ n: note.n, c });
  });

  const data = { title: job.title, ...(job.section ? { section: job.section } : {}), sections };
  if (notes.length) data.notes = notes;
  return { data, errors };
}

/**
 * Compare a translated job (or a piece of one) with the English it came
 * from: the same headers in the same order, quotations with as many lines,
 * the same markers in each block, and Russian text. Returns the problems.
 */
export function compareJobs(englishText, russianText) {
  const errors = [];
  const en = parseJob(englishText);
  const ru = parseJob(russianText);
  if (en.title !== null && !ru.title) errors.push('@title is missing');
  if (ru.title && !looksRussian(ru.title)) errors.push(`@title isn't Russian: ${ru.title}`);
  if (en.section !== null && !ru.section) errors.push('@section is missing');
  const list = (job) => [...job.blocks.map((block) => ({ key: `@block ${block.id} ${block.t}`, block })), ...job.notes.map((note) => ({ key: `@note ${note.note}`, block: { t: 'p', lines: note.lines } }))];
  const a = list(en);
  const b = list(ru);
  if (a.length !== b.length) errors.push(`${b.length} blocks and notes, expected ${a.length}`);
  a.forEach(({ key, block }, index) => {
    const other = b[index];
    if (!other) return;
    if (other.key !== key) {
      errors.push(`#${index + 1}: "${other.key}", expected "${key}"`);
      return;
    }
    if (block.t === 'q' && other.block.lines.length !== block.lines.length) errors.push(`${key}: ${other.block.lines.length} lines, expected ${block.lines.length}`);
    if (block.t !== 'q' && other.block.lines.length !== 1) errors.push(`${key}: ${other.block.lines.length} lines, expected 1 (a paragraph is one line)`);
    const enRuns = textToRuns(block.lines.join(' '), errors, key);
    const ruRuns = textToRuns(other.block.lines.join(' '), errors, key);
    const want = markers(enRuns);
    const got = markers(ruRuns);
    if (JSON.stringify(want) !== JSON.stringify(got)) errors.push(`${key}: markers ${got.join(' ') || '(none)'}, expected ${want.join(' ') || '(none)'}`);
    if (!looksRussian(plain(ruRuns))) errors.push(`${key}: not Russian`);
  });
  return errors;
}
