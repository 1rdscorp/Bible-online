/**
 * Showing Strong's dictionary entries. No DOM: the panel renders the parts.
 */

/** "H7225" → { language: "hbo", label: "Hebrew" key }. */
export function strongsLanguage(number) {
  return number?.[0] === 'H' ? 'hbo' : number?.[0] === 'G' ? 'grc' : null;
}

/** Is this a Strong's number the site can look up? "H7225", "G3056". */
export const isStrongsNumber = (value) => /^[HG][1-9]\d{0,4}$/.test(String(value ?? ''));

/**
 * Split dictionary text into plain parts and links to other entries:
 * "from H7218 (רֹאשׁ);" → ["from ", { number: "H7218" }, " (רֹאשׁ);"].
 */
export function linkStrongs(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text ?? '').matchAll(/\b([HG][1-9]\d{0,4})\b/g)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ number: match[1] });
    last = match.index + match[0].length;
  }
  if (last < String(text ?? '').length) parts.push(text.slice(last));
  return parts;
}

/**
 * Split text in Hebrew or Greek script out from the rest, so each piece can
 * carry its own lang and direction: "(רֹאשׁ);" → ["(", { script: "he", text: "רֹאשׁ" }, ");"].
 */
export function scriptRuns(text) {
  const parts = [];
  let last = 0;
  for (const match of String(text ?? '').matchAll(/[\u0590-\u05FF\uFB1D-\uFB4F]+(?:[\s\u05BE][\u0590-\u05FF\uFB1D-\uFB4F]+)*|[\u0370-\u03FF\u1F00-\u1FFF]+(?:\s[\u0370-\u03FF\u1F00-\u1FFF]+)*/g)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ script: /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(match[0]) ? 'he' : 'grc', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < String(text ?? '').length) parts.push(text.slice(last));
  return parts;
}
