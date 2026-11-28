#!/usr/bin/env node
/**
 * Which of Ellen G. White's books have a Russian edition in EGW Writings
 * (the Ellen G. White Estate's free online library), and its abbreviation
 * there: GC → «ВБ» (Великая борьба), 5T → «5СЦ». Writes
 * js/research/egw-russian.js, which js/research/egw.js uses to open a
 * citation in Russian when the site is in Russian.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/fetch-egw-russian.mjs
 *
 * EGW Writings links each English paragraph to its translations. The
 * Russian editions there are numbered by the English pages ("GC 603.1" is
 * «ВБ 603.1»), so a citation's page works in Russian too. For each book this
 * opens three pages in English, reads their Russian counterparts, and keeps
 * the book if its Russian pages are the same, or the same but for a fixed
 * shift (Ye Shall Receive Power is a page earlier in Russian: `shift: -1`),
 * allowing a page's difference where a paragraph runs over a page break, and
 * EGW Writings' Russian search opens them. Title pages, which are often
 * numbered differently, count only if nothing else can be read. Reads only
 * references and titles; no text is copied.
 *
 *   NODE_USE_ENV_PROXY=1 node tools/fetch-egw-russian.mjs DA PaM   # check only these, keep the rest
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITATION_ONLY, EGW_BOOKS } from '../js/research/egw.js';
import { RUSSIAN_EDITIONS } from '../js/research/egw-russian.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://m.egwwritings.org';
const OUTPUT = join(ROOT, 'js', 'research', 'egw-russian.js');
const pause = () => new Promise((resolve) => setTimeout(resolve, 500));
const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));

/** EGW Writings' search: where it lands. Asked again, more slowly, if it doesn't answer. */
async function open(lang, query) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 2500));
    try {
      const response = await fetch(`${SITE}/${lang}/search?query=${encodeURIComponent(query)}`);
      if (!response.ok) continue;
      const html = await response.text();
      const para = new RegExp(`/${lang}/book/(\\d+\\.\\d+)`).exec(response.url)?.[1] ?? null;
      const title = decode(/<title>([^<—]*)/.exec(html)?.[1] ?? '').trim();
      // "Search for: …" is a list of results, not a page of a book.
      if (para || !/^(Search for|Поиск)/.test(title)) return { html, para, title };
      if (attempt === 2) return { html, para, title };
    } catch {
      // try again
    }
  }
  return { html: '', para: null, title: '' };
}

/** The English paragraphs on a page: [{ id, code: "GC 603.1", ru: { para_id, refcode } }]. */
function paragraphs(html) {
  return [...html.matchAll(/data-refcode="(\d+\.\d+)" data-refcode-old="([^"]*)" data-translate="([^"]*)"/g)].map((m) => ({
    id: m[1],
    code: decode(m[2]),
    ru: JSON.parse(decode(m[3])).find((t) => t.lang === 'ru') ?? null,
  }));
}

const REF = /^(.+?) (\d+)(?:\.\d+)?$/;

async function russianEdition(abbr) {
  // Pages that exist in most books; the Bible Commentary's Ellen G. White
  // comments are at the back of each volume. Page 20 only if the others fail.
  const pages = /BC$/.test(abbr) ? [1000, 1100, 950] : [40, 120, 250, 20];
  const pairs = [];
  for (const page of pages) {
    if (pairs.length === 3 || (page === 20 && pairs.length >= 2)) break;
    const english = await open('en', `${abbr} ${page}`);
    if (!english.para) continue;
    const list = paragraphs(english.html);
    const at = list.findIndex((p) => p.id === english.para);
    const pair = list.slice(Math.max(at, 0), at + 6).find((p) => p.ru && REF.test(p.code) && REF.test(p.ru.refcode));
    if (pair) pairs.push({ en: REF.exec(pair.code), ru: REF.exec(pair.ru.refcode) });
  }
  if (!pairs.length) return null; // no Russian translation
  // The body of the book decides; title pages only if there's nothing else.
  const body = pairs.filter(({ en }) => Number(en[2]) >= 30);
  const used = body.length >= 2 ? body : pairs;
  const shifts = used.map(({ en, ru }) => Number(ru[2]) - Number(en[2]));
  // The usual shift (0 if it's among the most common), within a page everywhere.
  const counts = new Map(shifts.map((shift) => [shift, shifts.filter((other) => other === shift).length]));
  const top = Math.max(...counts.values());
  const shift = [...counts].filter(([, n]) => n === top).map(([value]) => value).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
  const described = pairs.map(({ en, ru }) => `${en[0]} is ${ru[0]}`).join(', ');
  if (!shifts.every((value) => Math.abs(value - shift) <= 1) || (shift !== 0 && top < 2)) return { abbr, skipped: `numbered differently: ${described}` };
  const ruAbbr = used[0].ru[1];
  const page = Number(used[0].en[2]) + shift;
  const russian = await open('ru', `${ruAbbr} ${page}`);
  if (!russian.para) return { abbr, skipped: `the Russian search doesn't open ${ruAbbr} ${page}` };
  return { abbr, ru: ruAbbr, title: russian.title, ...(shift ? { shift } : {}) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // With abbreviations given, check only those and keep what's known of the rest.
  const only = process.argv.slice(2);
  const all = [...Object.keys(EGW_BOOKS), ...Object.keys(CITATION_ONLY)];
  const editions = only.length ? { ...RUSSIAN_EDITIONS } : {};
  const skipped = [];
  for (const abbr of only.length ? only : all) {
    if (!all.includes(abbr)) throw new Error(`Unknown abbreviation: ${abbr}`);
    delete editions[abbr];
    const found = await russianEdition(abbr);
    if (found?.ru) editions[abbr] = { ru: found.ru, title: found.title, ...(found.shift ? { shift: found.shift } : {}) };
    else if (found?.skipped) skipped.push(`${abbr}: ${found.skipped}`);
    process.stdout.write(found?.ru ? `${abbr} → ${found.ru}  ` : `${abbr} ·  `);
  }
  // In the order of the list of books, so a partial run doesn't reorder the file.
  const ordered = all.filter((abbr) => editions[abbr]);
  const lines = ordered.map((abbr) => {
    const { ru, title, shift } = editions[abbr];
    return `  ${/^[A-Za-z_]\w*$/.test(abbr) ? abbr : `'${abbr}'`}: { ru: '${ru}', title: '${title.replace(/'/g, '’')}'${shift ? `, shift: ${shift}` : ''} },`;
  });
  await writeFile(
    OUTPUT,
    `// Generated by tools/fetch-egw-russian.mjs: don't edit by hand.
// Ellen G. White's books with a Russian edition in EGW Writings, numbered by
// the English pages: English abbreviation → Russian abbreviation and title,
// and \`shift\` where the Russian pages are that many pages off.

export const RUSSIAN_EDITIONS = Object.freeze({
${lines.join('\n')}
});
`,
  );
  console.log(`\n${Object.keys(editions).length} Russian editions; skipped: ${skipped.length ? `\n  ${skipped.join('\n  ')}` : 'none'}`);
}
