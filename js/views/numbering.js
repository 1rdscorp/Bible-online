/**
 * Labels for a translation's own Psalm numbering, shown in compare mode beside
 * the English numbers, e.g. for the Russian Synodal:
 *
 *   English Psalm 23   → "Псалом 22"         (the whole of Synodal Psalm 22)
 *   English Psalm 10   → "Псалом 9:22–39"    (the second half of Synodal 9)
 *   English Psalm 116  → "Псалмы 114–115"    (two Synodal Psalms)
 *
 * `spans` comes from the provider (chapter.native, see providers/interface.js)
 * and the words from the translation's `numbering` in data/translations.json.
 *
 * @param {{ chapter: number, from?: number, to?: number }[] | undefined} spans
 * @param {{ psalm?: string, psalms?: string }} [numbering]
 * @returns {string | null}  null when there's nothing to show
 */
export function nativePsalmLabel(spans, numbering = {}) {
  if (!Array.isArray(spans) || spans.length === 0) return null;
  const singular = numbering.psalm ?? 'Psalm';
  const plural = numbering.psalms ?? 'Psalms';

  const part = ({ chapter, from, to }) => {
    if (from === undefined) return String(chapter);
    return from === to ? `${chapter}:${from}` : `${chapter}:${from}–${to}`;
  };

  if (spans.length === 1) return `${singular} ${part(spans[0])}`;

  const wholeAndConsecutive = spans.every(
    (span, i) => span.from === undefined && (i === 0 || span.chapter === spans[i - 1].chapter + 1),
  );
  if (wholeAndConsecutive) return `${plural} ${spans[0].chapter}–${spans.at(-1).chapter}`;
  return `${plural} ${spans.map(part).join('; ')}`;
}
