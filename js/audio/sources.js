/**
 * Audio Bibles: which recording plays a chapter, and what comes after it.
 *
 * The data comes from tools/build-audio.mjs: data/research.json lists the
 * sources (an "audio" entry each: translation, readers, credit) and
 * data/audio/<id>.json holds one source's recorded chapters, in canon order:
 *
 *   { base, pageBase, tracks: [{ book, n, chapter, chapters?, src, page, seconds, reader? }] }
 *
 *   n         the chapter as the recording numbers it (Synodal Psalm 22)
 *   chapter   the site chapter it belongs to (KJV Psalm 23)
 *   chapters  every site chapter it covers, when that's more than one
 *
 * The files stay on the source's site and stream from there: `base + src`.
 * Another source (another reader, or a licensed API) only needs data in the
 * same shape. This module has no DOM access, so Node tests import it.
 */

/** The audio source for a translation id, or null. */
export function sourceFor(sources, translationId) {
  return sources.find((source) => source.translation === translationId) ?? null;
}

/**
 * The recordings to play for a site chapter, in order. Usually one; two
 * where the printed numbering splits it (KJV Psalm 116 is Synodal 114 and
 * 115). A chapter that is only part of a recorded one (KJV Psalm 10 is the
 * second half of Synodal Psalm 9) gets that recording, flagged `partial`.
 */
export function tracksForChapter(tracks, bookId, chapter) {
  const own = tracks.filter((track) => track.book === bookId && track.chapter === chapter);
  if (own.length) return own.map((track) => ({ track, partial: false }));
  const part = tracks.find((track) => track.book === bookId && track.chapters?.includes(chapter));
  return part ? [{ track: part, partial: true }] : [];
}

/** The recording after (delta 1) or before (delta -1) one, or null at either end. */
export function adjacentTrack(tracks, track, delta) {
  const index = tracks.indexOf(track);
  return index < 0 ? null : (tracks[index + delta] ?? null);
}

export const trackUrl = (data, track) => `${data.base}${track.src}`;
export const trackPage = (data, track) => `${data.pageBase}${track.page}`;

/** The reader's name in the interface language ("Александр Бондаренко"). */
export function readerName(source, track, language = 'ru') {
  const reader = source.readers?.[track.reader ?? source.reader];
  return reader?.[language] ?? reader?.ru ?? '';
}

/** "4:03", "1:02:03". */
export function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
