/**
 * Read a Word document (.docx) into paragraphs and runs, with the formatting
 * a Bible text carries: italics, bold, small capitals, superscript (verse
 * numbers), font size (chapter numbers), indentation (poetry lines), and
 * footnote references with their footnotes. No dependency: the archive is
 * read with ./zip.mjs and the XML with regular expressions, which is enough
 * for the flat structure of WordprocessingML paragraphs.
 *
 * Old .doc files are converted first with LibreOffice:
 *   soffice --headless --convert-to docx --outdir <dir> <files…>
 *
 * Formatting is resolved the way Word does it: the paragraph style (and the
 * styles it's based on), then the run's character styles, then the run's
 * own settings. Each run also says whether its italics are its own or the
 * style's (`ownItalic`), since a heading style may be italic as a whole while
 * italics inside verse text mark words the translators added.
 */
import { readZipEntry } from './zip.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (text) =>
  text.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi, (m, dec, hex, name) => (dec ? String.fromCodePoint(Number(dec)) : hex ? String.fromCodePoint(parseInt(hex, 16)) : (ENTITIES[name] ?? m)));

const attr = (xml, name) => new RegExp(`\\bw:${name}="([^"]*)"`).exec(xml)?.[1];

/** A toggle property (<w:i/>, <w:i w:val="false"/>): true, false, or undefined if not set. */
function toggle(rPr, name) {
  const m = new RegExp(`<w:${name}(?:\\s+w:val="([^"]*)")?\\s*/>`).exec(rPr);
  if (!m) return undefined;
  return !['false', '0', 'off', 'none'].includes((m[1] ?? 'true').toLowerCase());
}

/** The run properties a Bible text needs, from an <w:rPr> block. */
function runProps(rPr = '') {
  const props = {};
  for (const [key, tag] of [['i', 'i'], ['b', 'b'], ['sc', 'smallCaps'], ['caps', 'caps']]) {
    const value = toggle(rPr, tag);
    if (value !== undefined) props[key] = value;
  }
  const vertAlign = /<w:vertAlign\s+w:val="(\w+)"/.exec(rPr)?.[1];
  if (vertAlign) props.vertAlign = vertAlign;
  const size = /<w:sz\s+w:val="(\d+)"/.exec(rPr)?.[1];
  if (size) props.size = Number(size) / 2;
  return props;
}

function indent(pPr = '') {
  const ind = /<w:ind\b[^>]*\/>/.exec(pPr)?.[0];
  if (!ind) return {};
  const out = {};
  for (const [key, names] of [['start', ['start', 'left']], ['firstLine', ['firstLine']], ['hanging', ['hanging']]]) {
    for (const name of names) {
      const value = attr(ind, name);
      if (value !== undefined) {
        out[key] = Number(value);
        break;
      }
    }
  }
  return out;
}

/** styles.xml → Map(styleId → { name, type, props, indent }), with basedOn resolved. */
export function readStyles(xml = '') {
  const raw = new Map();
  for (const m of xml.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)) {
    const id = attr(m[1], 'styleId');
    const body = m[2];
    raw.set(id, {
      name: decode(attr(/<w:name\b[^>]*\/>/.exec(body)?.[0] ?? '', 'val') ?? id),
      type: attr(m[1], 'type'),
      basedOn: attr(/<w:basedOn\b[^>]*\/>/.exec(body)?.[0] ?? '', 'val'),
      props: runProps(/<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(body)?.[1]),
      indent: indent(/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(body)?.[1]),
      align: /<w:jc\s+w:val="(\w+)"/.exec(/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(body)?.[1] ?? '')?.[1],
    });
  }
  const resolved = new Map();
  const resolve = (id, depth = 0) => {
    if (resolved.has(id)) return resolved.get(id);
    const style = raw.get(id);
    if (!style) return { name: id, props: {}, indent: {} };
    const parent = style.basedOn && depth < 20 ? resolve(style.basedOn, depth + 1) : { props: {}, indent: {} };
    const out = { name: style.name, type: style.type, props: { ...parent.props, ...style.props }, indent: { ...parent.indent, ...style.indent }, align: style.align ?? parent.align };
    resolved.set(id, out);
    return out;
  };
  for (const id of raw.keys()) resolve(id);
  return resolved;
}

/**
 * Paragraphs of a WordprocessingML fragment:
 * [{ style, indent: { start, firstLine, hanging }, runs: [{ text, i, ownItalic, b, sc, caps, sup, size, footnote, charStyles }] }].
 * A footnote reference is a run with `footnote` (the footnote's id) and the
 * reference mark as its text.
 */
export function readParagraphs(xml, styles) {
  const paragraphs = [];
  for (const m of xml.matchAll(/<w:p(?=[\s>/])([^>]*?)(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const body = m[2] ?? '';
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(body)?.[1] ?? '';
    const styleId = attr(/<w:pStyle\b[^>]*\/>/.exec(pPr)?.[0] ?? '', 'val') ?? 'Normal';
    const style = styles.get(styleId) ?? { name: styleId, props: {}, indent: {} };
    const runs = [];
    const content = body.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
    for (const r of content.matchAll(/<w:r(?=[\s>/])[^>]*?(?:\/>|>([\s\S]*?)<\/w:r>)/g)) {
      const run = r[1] ?? '';
      const rPr = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '';
      const charStyles = [...rPr.matchAll(/<w:rStyle\s+w:val="([^"]*)"/g)].map((s) => styles.get(s[1]) ?? { name: s[1], props: {} });
      const own = runProps(rPr);
      const props = { ...style.props };
      for (const charStyle of charStyles) Object.assign(props, charStyle.props);
      Object.assign(props, own);
      const footnote = /<w:footnoteReference\b[^>]*w:id="(-?\d+)"/.exec(run)?.[1];
      let text = '';
      for (const piece of run.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/, '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t\s*\/>|<w:(tab|br|cr|noBreakHyphen|softHyphen)\b[^>]*\/>/g)) {
        if (piece[1] !== undefined) text += decode(piece[1]);
        else if (piece[2] === 'tab') text += '\t';
        else if (piece[2] === 'br' || piece[2] === 'cr') text += '\n';
        else if (piece[2] === 'noBreakHyphen') text += '‑';
      }
      if (!text && !footnote) continue;
      runs.push({
        text,
        i: Boolean(props.i),
        ownItalic: own.i ?? charStyles.some((s) => s.props.i) ?? false,
        b: Boolean(props.b),
        sc: Boolean(props.sc),
        caps: Boolean(props.caps),
        sup: props.vertAlign === 'superscript',
        size: props.size,
        ...(footnote ? { footnote } : {}),
        charStyles: charStyles.map((s) => s.name),
      });
    }
    const align = /<w:jc\s+w:val="(\w+)"/.exec(pPr)?.[1] ?? style.align;
    paragraphs.push({ style: style.name, indent: { ...style.indent, ...indent(pPr) }, ...(align ? { align } : {}), runs });
  }
  return paragraphs;
}

/** A .docx file's bytes → { paragraphs, footnotes: Map(id → paragraphs) }. */
export function readDocx(bytes) {
  const entry = (name) => {
    try {
      return readZipEntry(bytes, name).toString('utf8');
    } catch {
      return '';
    }
  };
  const styles = readStyles(entry('word/styles.xml'));
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(entry('word/document.xml'))?.[1] ?? '';
  const footnotes = new Map();
  for (const m of entry('word/footnotes.xml').matchAll(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g)) {
    footnotes.set(attr(m[1], 'id'), readParagraphs(m[2], styles));
  }
  return { paragraphs: readParagraphs(body, styles), footnotes };
}
