/**
 * Clean up the Internet Archive's OCR text of a printed book and correct it
 * by comparing independent scans (used for Uriah Smith's Daniel and the
 * Revelation, of which there are three: two 1907 printings and one of
 * 1904, all set from the same text).
 *
 * 1. ocrParagraphs(text): drop what isn't the book's text (running heads,
 *    page numbers, captions, the noise OCR reads into engravings), join
 *    words hyphenated across lines, and join paragraphs a page break split.
 * 2. alignTokens(a, b): match each word of one scan with the same word of
 *    another (anchored on word sequences that occur once in both, with an
 *    edit-distance alignment between anchors).
 * 3. voteTokens(primary, others, known): where the scans disagree, take the
 *    reading most of them share, or failing that a word known to be right.
 *
 * Pure functions; tools/build-commentary.mjs runs them on the downloads.
 */

/** "Here is brought" → "here", "is", …: the letters and digits of a word, lower-cased. */
export const normWord = (word) => word.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/**
 * Is this line part of the book's text? Running heads ("CHAPTER 2, VERSES
 * 29-35 41", "26 PROPHECY OF DANIEL"), page numbers and captions have no
 * lower-case letters; engraving noise ("ap ees pee,") is mostly non-words.
 * `known(word)` says whether a normalised word is a real one.
 */
export function isTextLine(line, known) {
  const text = line.trim();
  if (!text) return false;
  if (!/[a-z]/.test(text)) return false;
  // A running head the OCR read lower-case letters into: "CHAPTER 6, VERSES 9- ii 439°".
  if (/^CHAPTER\s+[\dIVXLl]+\s*[,.]\s*VERS/i.test(text)) return false;
  const words = text.match(/[A-Za-z]+/g) ?? [];
  if (!words.length) return false;
  // One or two short words with no full stop: a caption or engraving noise ("an ere").
  if (words.length <= 2 && words.join('').length < 10 && !/[.?!”"]$/.test(text)) return false;
  const real = words.filter((word) => word.length > 1 && known(normWord(word))).length;
  // Short lines need most of their words to be real; long ones are prose.
  if (words.length < 8) return real / words.length >= 0.6 && real >= 1;
  return real / words.length >= 0.4;
}

const ENDS_SENTENCE = /[.?!:”"’')\]—]\s*$/;

/**
 * The book's paragraphs, each one string. A paragraph that a page break (a
 * blank line followed by dropped lines) split in two is joined again when
 * the first part doesn't end a sentence or the second starts in lower case.
 * `known(word)` decides hyphenation too: "rea- son" → "reason", but
 * "threshing- floors" stays "threshing-floors" if "threshingfloors" isn't a word.
 */
export function ocrParagraphs(text, known, { marker = () => null } = {}) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t\u00a0]+/g, ' ')
        .trim()
        // Specks OCR reads at a line's edges: "> son God gave", "| And it is", "this -", "inter- *".
        .replace(/^[>|:;*•·]\s+/, '')
        .replace(/\s+[-|*•·>]$/, '')
        .replace(/(\p{L}-)\s*[*'‘’^•·.,]$/u, '$1'),
    );
  const paragraphs = [];
  const notes = []; // footnotes: { after: index of the paragraph they follow, text }
  let current = [];
  let currentIsNote = false;
  let brokenByPage = false; // dropped lines since the last text line
  const flush = () => {
    if (current.length) {
      const text = joinLines(current, known);
      if (currentIsNote) notes.push({ after: paragraphs.length - 1, text });
      else paragraphs.push({ text, pageBreakAfter: false });
    }
    current = [];
    currentIsNote = false;
  };
  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    const mark = marker(line);
    if (mark) {
      // A line the caller wants kept as its own paragraph (a chapter heading).
      flush();
      paragraphs.push({ text: mark, pageBreakAfter: false, marker: true });
      continue;
    }
    if (!isTextLine(line, known)) {
      flush();
      brokenByPage = true;
      if (paragraphs.length) paragraphs.at(-1).pageBreakAfter = true;
      continue;
    }
    if (!current.length) {
      // A footnote at the foot of a page: "1 Shortly after this language was penned, …".
      // It's set aside, so the text it interrupted can join up again.
      if (FOOTNOTE.test(line)) {
        currentIsNote = true;
        current.push(line);
        continue;
      }
      const previous = paragraphs.at(-1);
      if (previous && !previous.marker) {
        // A paragraph never starts in lower case or mid-word, so those continue
        // the last one (across a blank line, a page break or a footnote); so
        // does any text after a page break that cut a sentence short.
        const continues = /^[a-z]/.test(line) || /\p{L}-$/u.test(previous.text) || (brokenByPage && previous.pageBreakAfter && !ENDS_SENTENCE.test(previous.text));
        if (continues) {
          paragraphs.pop();
          current = [previous.text];
        }
      }
    }
    brokenByPage = false;
    current.push(line);
  }
  flush();
  return paragraphs.flatMap((paragraph, index) => [paragraph.text, ...notes.filter((note) => note.after === index).map((note) => NOTE_MARK + note.text)]);
}

/** Footnotes come out as paragraphs starting with this. */
export const NOTE_MARK = '§NOTE ';

const FOOTNOTE = /^[1-9*†‡]\s+[A-Z“"‘'(]/;

/** Join a paragraph's lines, mending words hyphenated at line ends. */
export function joinLines(lines, known) {
  let text = '';
  for (const line of lines) {
    if (!text) {
      text = line;
      continue;
    }
    const hyphen = /(\p{L}+)[-—]\s*$/u.exec(text);
    const next = /^(\p{L}+)/u.exec(line);
    // A hyphen misread as a colon ("com: mand"): mend it only if that makes a word.
    const colon = /(\p{L}+):$/u.exec(text);
    if (colon && next && /^\p{Ll}/u.test(next[1]) && known(normWord(colon[1] + next[1]))) {
      text = text.slice(0, -1) + line;
      continue;
    }
    if (hyphen && next && !/—\s*$/.test(text)) {
      const joined = hyphen[1] + next[1];
      // Keep the hyphen if the joined word isn't known but both halves are ("well-favored").
      const keep = !known(normWord(joined)) && known(normWord(hyphen[1])) && known(normWord(next[1]));
      text = text.replace(/[-—]\s*$/, keep ? '-' : '') + line;
    } else {
      text += ` ${line}`;
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Words of paragraphs: [{ w: "Nebuchadnezzar’s", n: "nebuchadnezzars", p: paragraph index }].
 * A dash between words starts a new word ("Men—The" → "Men—", "The"), and
 * punctuation standing alone (" — ") joins the word before it, so scans
 * that space their dashes differently still line up word for word.
 */
export function tokenize(paragraphs) {
  const tokens = [];
  paragraphs.forEach((paragraph, p) => {
    for (const piece of paragraph.split(' ')) {
      for (const w of piece.split(/(?<=—)(?=[\p{L}“‘"'(])/u)) {
        if (!w) continue;
        const n = normWord(w);
        if (!n && tokens.length && tokens.at(-1).p === p) tokens.at(-1).w += w;
        else tokens.push({ w, n, p });
      }
    }
  });
  return tokens;
}

/** Edit distance between two short strings (for comparing OCR readings). */
export function editDistance(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

/** Longest increasing subsequence of pairs by their second element (pairs sorted by the first). */
function increasingChain(pairs) {
  const tails = [];
  const tailIndex = [];
  const parent = new Array(pairs.length).fill(-1);
  pairs.forEach(([, y], i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < y) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = y;
    tailIndex[lo] = i;
    parent[i] = lo > 0 ? tailIndex[lo - 1] : -1;
  });
  const chain = [];
  for (let i = tailIndex[tails.length - 1] ?? -1; i !== -1; i = parent[i]) chain.push(pairs[i]);
  return chain.reverse();
}

/**
 * For each token of `a`, the index of the same word in `b`, or -1.
 * Anchors: runs of `k` words that occur exactly once in each text, kept in
 * order. Between anchors, a Levenshtein alignment on words (substituting
 * similar-looking readings is cheap) matches the rest.
 */
export function alignTokens(a, b, { k = 4, maxGap = 400 } = {}) {
  const key = (tokens, i) => tokens.slice(i, i + k).map((token) => token.n).join(' ');
  const counts = (tokens) => {
    const map = new Map();
    for (let i = 0; i + k <= tokens.length; i += 1) {
      const name = key(tokens, i);
      const entry = map.get(name);
      if (entry) entry.count += 1;
      else map.set(name, { count: 1, at: i });
    }
    return map;
  };
  const inA = counts(a);
  const inB = counts(b);
  const pairs = [];
  for (const [name, entry] of inA) {
    if (entry.count !== 1) continue;
    const other = inB.get(name);
    if (other?.count === 1 && name.length > k * 2) pairs.push([entry.at, other.at]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const chain = increasingChain(pairs);

  const map = new Int32Array(a.length).fill(-1);
  const mark = (i, j) => {
    for (let d = 0; d < k; d += 1) map[i + d] = j + d;
  };
  let lastA = 0;
  let lastB = 0;
  for (const [i, j] of chain) {
    if (i < lastA || j < lastB) continue; // overlapping anchors
    alignGap(a, b, lastA, i, lastB, j, map, maxGap);
    mark(i, j);
    lastA = i + k;
    lastB = j + k;
  }
  alignGap(a, b, lastA, a.length, lastB, b.length, map, maxGap);
  return map;
}

/** Word-level edit-distance alignment of a[a0..a1) with b[b0..b1). */
function alignGap(a, b, a0, a1, b0, b1, map, maxGap) {
  const n = a1 - a0;
  const m = b1 - b0;
  if (!n || !m || n > maxGap || m > maxGap) return;
  const cost = (x, y) => {
    if (x.n === y.n) return 0;
    const longest = Math.max(x.n.length, y.n.length, 1);
    return editDistance(x.n, y.n) / longest <= 0.5 ? 0.6 : 1.4;
  };
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i += 1) dp[i][0] = i;
  for (let j = 0; j <= m; j += 1) dp[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost(a[a0 + i - 1], b[b0 + j - 1]));
    }
  }
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const here = dp[i][j];
    const diagonal = dp[i - 1][j - 1] + cost(a[a0 + i - 1], b[b0 + j - 1]);
    if (Math.abs(here - diagonal) < 1e-9 && cost(a[a0 + i - 1], b[b0 + j - 1]) < 1) {
      map[a0 + i - 1] = b0 + j - 1;
      i -= 1;
      j -= 1;
    } else if (Math.abs(here - (dp[i - 1][j] + 1)) < 1e-9) i -= 1;
    else if (Math.abs(here - (dp[i][j - 1] + 1)) < 1e-9) j -= 1;
    else {
      i -= 1;
      j -= 1;
    }
  }
}

/** A word without the punctuation around it. */
const core = (word) => word.replace(/^[^\p{L}\p{N}]*/u, '').replace(/[^\p{L}\p{N}]*$/u, '');

/** Put a corrected reading in place of a token's letters, keeping its punctuation. */
function replaceCore(token, reading) {
  const lead = /^[^\p{L}\p{N}]*/u.exec(token.w)[0];
  const trail = /[^\p{L}\p{N}]*$/u.exec(token.w)[0];
  return lead + core(reading.w) + trail;
}

/**
 * Correct the primary scan's words. `others`: [{ tokens, map }] for each
 * other scan, where map comes from alignTokens(primary, tokens).
 * `inDictionary(n)`: the normalised word is in a trusted word list (the KJV,
 * the clean Ellen White texts); `known(n)`: it's in the dictionary or read
 * the same way in more than one scan (so names like "Seleucus" count).
 *
 * Where the other scans agree on a different reading, theirs wins, unless
 * ours is a dictionary word and theirs isn't (both misread "with" as
 * "Avith"). Where they disagree, a reading that's a known word and looks
 * like ours replaces ours if ours isn't one.
 * Returns { tokens, changed } with each token's `w` corrected.
 */
export function voteTokens(primary, others, { inDictionary, known }) {
  let changed = 0;
  // Only words are voted on: numbers ("13:16") and words run together
  // ("ninth.chapter") split differently in each scan, so their readings
  // don't line up one for one.
  const plain = (token) => /^[\p{L}][\p{L}'’-]*$/u.test(core(token.w));
  // Chapter and verse ("8:20,") are voted on only where the other scans read
  // the same numbers, in the same form, differing by digits OCR confuses
  // (8 for 3, 7 for 1…): "Dan. 8:20" where both others read "3:20".
  const CONFUSED = new Set(['38', '83', '17', '71', '56', '65', '09', '90', '35', '53', '68', '86']);
  const verseNumber = (word) => /^\d+:\d+[.,;:)]?$/.test(word);
  const misread = (ours, theirs) =>
    ours.length === theirs.length && [...ours].every((ch, k) => ch === theirs[k] || CONFUSED.has(ch + theirs[k]));
  const out = primary.map((token, i) => {
    if (verseNumber(token.w)) {
      const readings = others.map(({ tokens, map }) => (map[i] >= 0 ? tokens[map[i]] : null)).filter(Boolean);
      if (readings.length >= 2 && readings.every((reading) => reading.w === readings[0].w) && verseNumber(readings[0].w) && readings[0].w !== token.w && misread(token.w, readings[0].w)) {
        changed += 1;
        return { ...token, w: readings[0].w, n: readings[0].n };
      }
      return token;
    }
    if (!plain(token)) return token;
    const readings = others
      .map(({ tokens, map }) => (map[i] >= 0 ? tokens[map[i]] : null))
      .filter((reading) => reading && plain(reading))
      // A hyphenated word ("which-these") only lines up with a hyphenated reading.
      .filter((reading) => !/\p{L}-\p{L}/u.test(token.w) || /\p{L}-\p{L}/u.test(reading.w) || reading.n.length >= token.n.length - 2);
    if (!readings.length || readings.some((reading) => reading.n === token.n)) return token;
    const agreed = readings.length >= 2 && readings.every((reading) => reading.n === readings[0].n) ? readings[0] : null;
    if (agreed) {
      const keepOurs = inDictionary(token.n) && !inDictionary(agreed.n);
      if (!keepOurs && (known(agreed.n) || !known(token.n))) {
        changed += 1;
        return { ...token, w: replaceCore(token, agreed), n: agreed.n };
      }
      return token;
    }
    if (!known(token.n)) {
      const better = readings.find((reading) => known(reading.n) && editDistance(reading.n, token.n) <= Math.max(2, token.n.length / 3));
      if (better) {
        changed += 1;
        return { ...token, w: replaceCore(token, better), n: better.n };
      }
    }
    return token;
  });
  return { tokens: out, changed };
}
