/**
 * Citations of Ellen G. White's books by their standard abbreviation and
 * page, as Adventist study guides write them: "GC 603–604", "5T 751–754",
 * "4BC 1161", "DA 44.2" (page 44, paragraph 2), "COL 69, 70"; and of her
 * letters and manuscripts by number and year: "Letter 65, 1898",
 * "Lt 65, 1898", "Ms 140, 1902" (in Russian «Письмо 65, 1898»).
 *
 * Each becomes a link. A book this site has with its printed pages (The
 * Desire of Ages, Prophets and Kings, The Acts of the Apostles) opens here, at
 * that page (#/commentary/desire-of-ages?p=44). Any other opens in EGW
 * Writings, the Ellen G. White Estate's free online library, whose search
 * goes straight to the page cited.
 *
 * Only the abbreviations below count, in their exact capitals, and only
 * before a page number that isn't a chapter:verse, so "Col 1:13", "605 BC"
 * or "AD 70" are left alone. No DOM: tests/egw.test.js.
 */
import { commentaryHref } from '../router.js';

/**
 * Abbreviation → title. Every one was checked against EGW Writings: its
 * search opens that book. Left out: "Mar" (Maranatha; "Mar 12" is more often
 * a date), "Pr" (Prayer; also Proverbs), "YI" (a magazine, cited by date)
 * and "SW" (EGW Writings opens another book for it).
 */
export const EGW_BOOKS = Object.freeze({
  AA: 'The Acts of the Apostles',
  AG: 'God’s Amazing Grace',
  AH: 'The Adventist Home',
  BLJ: 'To Be Like Jesus',
  CC: 'Conflict and Courage',
  CD: 'Counsels on Diet and Foods',
  CE: 'Christian Education',
  CG: 'Child Guidance',
  CH: 'Counsels on Health',
  CL: 'Country Living',
  CM: 'Colporteur Ministry',
  COL: 'Christ’s Object Lessons',
  Con: 'Confrontation',
  CS: 'Counsels on Stewardship',
  CSW: 'Counsels on Sabbath School Work',
  CT: 'Counsels to Parents, Teachers, and Students',
  CTr: 'Christ Triumphant',
  CW: 'Counsels to Writers and Editors',
  DA: 'The Desire of Ages',
  DG: 'Daughters of God',
  Ed: 'Education',
  EW: 'Early Writings',
  Ev: 'Evangelism',
  FE: 'Fundamentals of Christian Education',
  FLB: 'The Faith I Live By',
  FW: 'Faith and Works',
  GC: 'The Great Controversy',
  GC88: 'The Great Controversy (1888)',
  GW: 'Gospel Workers',
  HP: 'In Heavenly Places',
  Hvn: 'Heaven',
  LDE: 'Last Day Events',
  LHU: 'Lift Him Up',
  LP: 'Sketches from the Life of Paul',
  LS: 'Life Sketches of Ellen G. White',
  LYL: 'Letters to Young Lovers',
  MB: 'Thoughts From the Mount of Blessing',
  MH: 'The Ministry of Healing',
  ML: 'My Life Today',
  MM: 'Medical Ministry',
  MYP: 'Messages to Young People',
  NL: 'A New Life',
  OFC: 'Our Father Cares',
  OHC: 'Our High Calling',
  PaM: 'Pastoral Ministry',
  PK: 'Prophets and Kings',
  PM: 'The Publishing Ministry',
  PP: 'Patriarchs and Prophets',
  RC: 'Reflecting Christ',
  RY: 'The Retirement Years',
  SA: 'A Solemn Appeal',
  SC: 'Steps to Christ',
  SD: 'Sons and Daughters of God',
  SJ: 'The Story of Jesus',
  SL: 'The Sanctified Life',
  SR: 'The Story of Redemption',
  TA: 'The Truth About Angels',
  TDG: 'This Day With God',
  Te: 'Temperance',
  TM: 'Testimonies to Ministers and Gospel Workers',
  TMK: 'That I May Know Him',
  TSA: 'Testimonies to Southern Africa',
  TSB: 'Testimonies on Sexual Behavior, Adultery, and Divorce',
  UL: 'The Upward Look',
  VSS: 'The Voice in Speech and Song',
  WM: 'Welfare Ministry',
  YRP: 'Ye Shall Receive Power',
  ...volumes('BC', 7, 'SDA Bible Commentary (Ellen G. White comments)'),
  ...volumes('T', 9, 'Testimonies for the Church'),
  ...volumes('SM', 3, 'Selected Messages'),
  ...volumes('MCP', 2, 'Mind, Character, and Personality'),
  ...volumes('MR', 21, 'Manuscript Releases'),
  ...volumes('SG', 3, 'Spiritual Gifts'),
  '4aSG': 'Spiritual Gifts, vol. 4a',
  ...volumes('SP', 4, 'The Spirit of Prophecy'),
  ...volumes('TT', 3, 'Testimony Treasures'),
  ...volumes('Bio', 6, 'Ellen G. White (biography)'),
});

function volumes(abbr, count, title) {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`${i + 1}${abbr}`, `${title}, vol. ${i + 1}`]));
}

/**
 * Abbreviations that count only where the text is known to be a citation
 * (a study page's citation labels), not in free text such as a note.
 */
export const CITATION_ONLY = Object.freeze({ Mar: 'Maranatha' });

/** Books on this site with their printed page numbers: abbreviation → id in data/commentary/. */
export const SITE_WORKS = Object.freeze({ DA: 'desire-of-ages', PK: 'prophets-and-kings', AA: 'acts-of-the-apostles' });

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alternatives = (abbrs) =>
  abbrs
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
// "GC 603", "GC 603.1", "5T 751–754", then ", 613" or ", 613–615" for more pages
// of the same book. Not a chapter:verse, and not part of a longer word or number.
const PAGES = String.raw`(\d{1,4})(?:\.(\d{1,3}))?(?:\s?[–-]\s?(\d{1,4}))?`;
const END = String.raw`(?![\p{L}\p{N}]|[:.]\d)`;
const citationPattern = (abbrs) => new RegExp(String.raw`(?<![\p{L}\p{N}])(${alternatives(abbrs)}) ${PAGES}${END}((?:, ${PAGES}${END})*)`, 'gu');
const CITATION = citationPattern(Object.keys(EGW_BOOKS));
const CITATION_ALL = citationPattern([...Object.keys(EGW_BOOKS), ...Object.keys(CITATION_ONLY)]);
const MORE = new RegExp(String.raw`, ${PAGES}${END}`, 'gu');
// A letter or a manuscript: "Letter 65, 1898", "Lt 65, 1898", "Ms 140, 1902", «Письмо 65, 1898».
const LETTER_WORDS = { Letter: 'Lt', Lt: 'Lt', 'Письмо': 'Lt', Manuscript: 'Ms', Ms: 'Ms', 'Рукопись': 'Ms' };
const LETTER = new RegExp(String.raw`(?<![\p{L}\p{N}])(${alternatives(Object.keys(LETTER_WORDS))}) (\d{1,4}[a-z]?), (1[89]\d\d)(?![\p{L}\p{N}])`, 'gu');

/**
 * The citations in a text, in order: [{ index, length, abbr, page, para?,
 * endPage? }], one per page or range ("COL 69, 70" gives two: "COL 69" and
 * "70"); a letter or manuscript is { index, length, abbr: 'Lt' | 'Ms',
 * number, year }. `labels`: the text is a citation label, where "Mar"
 * (Maranatha) counts too.
 */
export function findEgwCitations(text, { labels = false } = {}) {
  const found = [];
  for (const match of String(text ?? '').matchAll(labels ? CITATION_ALL : CITATION)) {
    const [whole, abbr, page, para, endPage, more] = match;
    const head = whole.length - more.length;
    found.push(citation(match.index, head, abbr, page, para, endPage));
    for (const extra of more.matchAll(MORE)) {
      // Skip ", " so the link is just the number.
      found.push(citation(match.index + head + extra.index + 2, extra[0].length - 2, abbr, extra[1], extra[2], extra[3]));
    }
  }
  for (const match of String(text ?? '').matchAll(LETTER)) {
    found.push({ index: match.index, length: match[0].length, abbr: LETTER_WORDS[match[1]], number: match[2], year: Number(match[3]) });
  }
  return found.sort((a, b) => a.index - b.index);
}

function citation(index, length, abbr, page, para, endPage) {
  const out = { index, length, abbr, page: Number(page) };
  if (para) out.para = Number(para);
  if (endPage) {
    // "751–54" means 751–754.
    let end = Number(endPage);
    if (end < out.page) end = Number(String(out.page).slice(0, String(out.page).length - endPage.length) + endPage);
    if (end > out.page) out.endPage = end;
  }
  return out;
}

/** Where a citation opens: this site's own copy, or EGW Writings. */
export function egwHref({ abbr, page, para, number, year }) {
  const work = SITE_WORKS[abbr];
  if (work) return commentaryHref(work, null, `p=${page}`);
  const query = number ? `${abbr} ${number}, ${year}` : `${abbr} ${page}${para ? `.${para}` : ''}`;
  return `https://m.egwwritings.org/en/search?query=${encodeURIComponent(query)}`;
}

/** "The Great Controversy, p. 603" (or pp. 603–604), for a link's tooltip. */
export function egwTitle({ abbr, page, endPage, number, year }) {
  if (number) return `${abbr === 'Lt' ? 'Letter' : 'Manuscript'} ${number}, ${year}`;
  return `${EGW_BOOKS[abbr] ?? CITATION_ONLY[abbr]}, ${endPage ? `pp. ${page}–${endPage}` : `p. ${page}`}`;
}

/**
 * The chapter of a work (data/commentary/index.json) that has a printed
 * page, or null. A page between chapters (a section's title page, which the
 * printed book leaves without text) opens the chapter after it.
 */
export function partForPage(work, page) {
  const parts = (work?.parts ?? []).filter((part) => part.pages);
  const within = parts.find((part) => part.pages[0] <= page && page <= part.pages[1]);
  if (within) return within;
  const next = parts.filter((part) => part.pages[0] > page).sort((a, b) => a.pages[0] - b.pages[0])[0];
  return next && next.pages[0] - page <= 3 ? next : null;
}
