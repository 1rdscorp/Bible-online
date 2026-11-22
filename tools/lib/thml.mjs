/**
 * Read a book in CCEL's Theological Markup Language (ThML, an XHTML
 * dialect: https://www.ccel.org/ThML/) into chapters of commentary blocks.
 * CCEL marks every Scripture reference (<scripRef osisRef="Bible:Luke.2.1-Luke.2.20">),
 * each page of the print edition (<pb n="44"/>), and, in the Conflict of
 * the Ages books, the passage a chapter is based on:
 *
 *   <h3>Chapter 4 <br />Unto You a Saviour</h3>
 *   <h4>[This chapter is based on <scripRef …>Luke 2:1–20</scripRef>.]</h4>
 *
 * The block format (shared with the other commentary readers):
 *   { t: "p", c: runs }          a paragraph
 *   { t: "q", lines: [runs] }    a block quotation (poetry keeps its lines)
 * where runs are strings and
 *   { r: "LUK 2:1-20", x: "Luke 2:1–20" }  a Scripture reference (link)
 *   { i: "text" }                          italics
 *   { pg: 44 }                             page 44 of the print edition starts here
 */
import { mergeRefs } from './commentary-runs.mjs';
import { osisToRefs } from './osis.mjs';
import { parseRefList } from './ref-list.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, name) => {
    if (name[0] === '#') return String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name] ?? all;
  });
}

function attributes(text) {
  const out = {};
  for (const m of text.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = decodeEntities(m[2]);
  return out;
}

/** Tags and text, in order: { tag, close, attrs, selfClosing } or { text }. */
function* tokens(xml) {
  const pattern = /<!--[\s\S]*?-->|<(\/?)([A-Za-z][\w.]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(pattern)) {
    if (m[5] !== undefined) yield { text: decodeEntities(m[5]) };
    else if (m[2]) yield { tag: m[2], close: m[1] === '/', attrs: attributes(m[3]), selfClosing: m[4] === '/' };
  }
}

/** Merge neighbouring strings, collapse white space, trim the ends. */
export function tidyRuns(runs) {
  const out = [];
  for (const run of runs) {
    if (typeof run === 'string') {
      const text = run.replace(/\s+/g, ' ');
      if (typeof out.at(-1) === 'string') out[out.length - 1] += text;
      else if (text) out.push(text);
    } else {
      out.push(run);
    }
  }
  // Trim spaces at the paragraph's edges (past any leading page markers).
  const first = out.findIndex((run) => typeof run === 'string' || run.x || run.i || run.b);
  if (typeof out[first] === 'string') out[first] = out[first].replace(/^\s+/, '');
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (typeof out[i] === 'string') {
      out[i] = out[i].replace(/\s+$/, '');
      break;
    }
    if (out[i].x || out[i].i || out[i].b) break;
  }
  return out.filter((run) => run !== '');
}

/** A <scripRef>'s target as a site reference ("LUK 2:1-20"), or null. */
export function scripRefTarget(attrs, lastVerse) {
  const osis = String(attrs.osisRef ?? '').split(/\s+/)[0]?.replace(/^Bible:/, '');
  if (!osis) return null;
  // Whole chapters: "Bible:Matt.2" or "Bible:Acts.24".
  const chapterOnly = /^([1-3]?[A-Za-z]+)\.(\d+)$/.exec(osis);
  if (chapterOnly) {
    const refs = osisToRefs(`${chapterOnly[1]}.${chapterOnly[2]}.1-${chapterOnly[1]}.${chapterOnly[2]}.999`, lastVerse);
    return refs[0] ?? null;
  }
  return osisToRefs(osis, lastVerse)[0] ?? null;
}

/**
 * Every reference a <scripRef> names ("Matt. 9:1–8, 32–34" names two),
 * leaving out any to a verse that doesn't exist (CCEL has a few typos,
 * such as Genesis 16:18).
 */
export function scripRefTargets(attrs, lastVerse, shown = '') {
  const exists = (ref) => {
    const m = /^(\S+) (\d+):(\d+)/.exec(ref);
    return Boolean(m) && lastVerse(m[1], Number(m[2])) >= Number(m[3]);
  };
  const marked = String(attrs.osisRef ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((part) => scripRefTarget({ osisRef: part }, lastVerse) ?? [])
    .filter(exists);
  // The printed reference wins where CCEL's markup disagrees with it
  // ("Isaiah 24:1–6" marked up as Isaiah 26:1-6). A partial one ("14:1–11",
  // after "Matt. 11:1–11;") is read in the marked-up reference's book.
  const book = /^(\S+) /.exec(marked[0] ?? '')?.[1];
  // (Only a printed chapter and verse counts: a bare "9" is too little to go on.)
  const [piece] = book && /\d:\s?\d/.test(shown) ? parseRefList(String(shown).replace(/–/g, '-'), lastVerse, { book }) : [];
  const printed = piece?.refs.length ? mergeRefs(piece.refs, lastVerse) : null;
  if (printed && exists(printed) && printed.split(' ')[0] === book) {
    const chapterOf = (ref) => ref.split(' ')[1].split(':')[0];
    if (chapterOf(printed) !== chapterOf(marked[0])) return [printed, ...marked.slice(1)];
  }
  return marked;
}

const CHAPTER_TITLE = /^\s*Chapter\s+(\d+)\.?\s*(.*)$/i;

/**
 * Chapters of a ThML book: [{ number, id, title, section, basedOn: { text, refs }, blocks, pages: [first, last] }].
 * `id` is the chapter number, or "introduction" for an untitled opening
 * chapter such as Prophets and Kings' "The Vineyard of the Lord".
 * Front matter (title page, preface) and the indexes are left out.
 */
export function readThml(xml, { lastVerse, introductions = [] } = {}) {
  const body = xml.slice(xml.indexOf('<ThML.body>'));
  const chapters = [];
  let section = null;
  let chapter = null;
  let page = null;
  // The block being built: { t, c } or { t: "q", lines }; runs collect into `runs`.
  let block = null;
  let runs = null;
  let heading = null; // { level, runs } while inside <h2>/<h3>/<h4>
  let ref = null; // the <scripRef> being read: { r, text }
  let italic = null;
  let inQuote = false;
  let skipping = 0; // inside the Index divs

  const push = (run) => {
    if (ref && typeof run === 'string') ref.text += run;
    else if (italic !== null && typeof run === 'string') italic += run;
    else (heading?.runs ?? runs)?.push(run);
  };

  const endBlock = () => {
    if (!chapter || !block || !runs) return;
    const c = tidyRuns(runs);
    if (block.t === 'q') {
      if (c.length) block.lines.push(c);
    } else if (c.some((run) => typeof run !== 'object' || !('pg' in run))) {
      chapter.blocks.push({ t: 'p', c });
    } else if (c.length) {
      // A paragraph that's only a page marker: keep the marker on the next block.
      chapter.pendingPages.push(...c);
    }
    block = block.t === 'q' && inQuote ? block : null;
    runs = null;
  };

  const startChapter = (attrsTitle) => {
    const match = CHAPTER_TITLE.exec(attrsTitle);
    const intro = !match && introductions.some((prefix) => attrsTitle.startsWith(prefix));
    if (!match && !intro) return false;
    chapter = {
      number: match ? Number(match[1]) : 0,
      id: match ? String(Number(match[1])) : 'introduction',
      title: match ? match[2].trim() : attrsTitle.replace(/^[^—]*—/, '').trim(),
      section,
      basedOn: null,
      blocks: [],
      pendingPages: [],
      pages: page ? [page] : [],
    };
    chapters.push(chapter);
    return true;
  };

  for (const token of tokens(body)) {
    if (token.tag) {
      const { tag, close, attrs } = token;
      if (/^div\d?$/.test(tag) && !close) {
        if (attrs.class === 'Index' || /^Ind(ex|exes)\b/.test(attrs.title ?? '')) skipping += 1;
        if (skipping) continue;
        const title = attrs.title?.trim() ?? '';
        if (/^Section\s+[IVX]+\./i.test(title)) {
          section = title.replace(/^Section\s+[IVX]+\.\s*/i, '').trim();
          chapter = null;
        } else if (title && !startChapter(title)) {
          chapter = null; // front matter
        }
        continue;
      }
      if (skipping) {
        if (/^div\d?$/.test(tag) && close) skipping = Math.max(0, skipping - 1);
        continue;
      }
      if (tag === 'pb') {
        page = Number(attrs.n) || page;
        if (chapter) {
          if (!chapter.pages.length) chapter.pages.push(page);
          chapter.pages[1] = page;
          if (runs) push({ pg: page });
          else chapter.pendingPages.push({ pg: page });
        }
        continue;
      }
      if (!chapter) continue;
      if (/^h[2-4]$/.test(tag)) {
        if (!close) heading = { level: Number(tag[1]), runs: [] };
        else if (heading) {
          const text = tidyRuns(heading.runs).map((run) => (typeof run === 'string' ? run : run.x ?? run.i ?? '')).join('');
          if (heading.level === 3) {
            // "Chapter 4 <br/>Unto You a Saviour": the title after the number (the
            // headings are better proof-read than the div titles).
            const title = text.replace(/^\s*Chapter\s+\d+\s*/i, '').trim();
            if (title) chapter.title = title;
          } else if (heading.level === 4 && /This chapter is based on/i.test(text)) {
            const refs = heading.runs.filter((run) => typeof run === 'object' && run.r).flatMap((run) => run.all);
            chapter.basedOn = { text: text.replace(/^\[\s*This chapter is based on\s*/i, '').replace(/\.?\s*\]?\s*$/, ''), refs };
          }
          heading = null;
        }
        continue;
      }
      if (tag === 'br') {
        if (heading) heading.runs.push(' ');
        else if (runs) push(' ');
        continue;
      }
      if (tag === 'blockquote') {
        if (!close) {
          endBlock();
          inQuote = true;
          // (A page mark waiting goes on the quotation's first line.)
          block = { t: 'q', lines: [] };
        } else {
          endBlock();
          inQuote = false;
          if (block?.lines.length) chapter.blocks.push(block);
          block = null;
        }
        continue;
      }
      if (tag === 'p') {
        if (!close) {
          if (!inQuote) {
            endBlock();
            block = { t: 'p' };
          }
          runs = chapter.pendingPages.splice(0);
        } else {
          endBlock();
        }
        continue;
      }
      if (tag === 'scripRef') {
        if (!close) ref = { attrs, text: '' };
        else if (ref) {
          const text = ref.text.replace(/\s+/g, ' ');
          const all = scripRefTargets(ref.attrs, lastVerse, text);
          ref = null;
          // A reference to a verse that doesn't exist stays plain text.
          push(all.length ? { r: all[0], x: text, all } : text);
        }
        continue;
      }
      if (tag === 'i') {
        if (!close) italic = '';
        else if (italic !== null) {
          const text = italic.replace(/\s+/g, ' ');
          italic = null;
          if (text.trim()) push({ i: text });
          else push(text);
        }
      }
      continue;
    }
    if (skipping || !chapter) continue;
    if (!runs && !heading && !ref) {
      if (!token.text.trim()) continue;
      // Text outside any paragraph: start one.
      block = { t: 'p' };
      runs = chapter.pendingPages.splice(0);
    }
    push(token.text);
  }
  endBlock();

  // Keep only the first reference of each link in the output (`all` was for basedOn).
  for (const item of chapters) {
    delete item.pendingPages;
    for (const blockItem of item.blocks) {
      for (const line of blockItem.t === 'q' ? blockItem.lines : [blockItem.c]) {
        for (const run of line) if (run && typeof run === 'object') delete run.all;
      }
    }
  }
  return chapters;
}
