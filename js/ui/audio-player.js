/**
 * The audio player: chapters read aloud, in a bar at the bottom of the
 * screen that keeps playing while the reader moves around the site.
 *
 * A chapter whose translation has a recording (data/research.json "audio")
 * gets a Listen button in its header. Playing continues into the next
 * chapter by itself; if the reader is still on the chapter that just ended,
 * the page turns with it (onFollow). The place, speed, volume and chapter
 * are remembered, so Listen on the same chapter later carries on from there.
 *
 * The recordings stream unchanged from the source's site. Its terms
 * (predanie.ru, 2.2.1, 3.1.3) ask for a clearly visible link to the source and
 * to the page the recording comes from, at the beginning, in type no smaller
 * than the text around it: the credit line is the player's first line, in
 * the same size as the rest of the bar.
 */
import { adjacentTrack, formatTime, readerName, sourceFor, tracksForChapter, trackPage, trackUrl } from '../audio/sources.js';
import { getBook } from '../canon.js';
import { chapterTitle, getLanguage, t } from '../i18n.js';
import { storage } from '../storage.js';
import { el, icon, ICONS } from './dom.js';

const STORAGE_KEY = 'audio';
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SKIP_SECONDS = 15;
const SAVE_EVERY_MS = 10_000;

const PLAYER_ICONS = {
  headphones: 'M4 16v-4a8 8 0 0 1 16 0v4M4 15h3v6H5a1 1 0 0 1-1-1zM20 15h-3v6h2a1 1 0 0 0 1-1z',
  play: ICONS.play,
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  previous: 'M6 5v14M18 5l-9 7 9 7z',
  next: 'M18 5v14M6 5l9 7-9 7z',
  back: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  volumeLow: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7',
  muted: 'M4 9h4l5-4v14l-5-4H4zM16 9.5l5 5M21 9.5l-5 5',
};

const VOLUME_STEP = 0.05;
/** A volume the player can use (0–1), or the default. */
const validVolume = (value) => (typeof value === 'number' && value >= 0 && value <= 1 ? value : 1);

/**
 * @param {object} options
 * @param {{ audioSources: () => Promise<object[]>, audioTracks: (source: object) => Promise<object> }} options.data
 * @param {(move: { from: { book: object, chapter: number }, to: { book: object, chapter: number } }) => void} options.onFollow
 *        the recording moved on from the chapter the reader was on: turn the page if it's still there
 */
export function initAudioPlayer({ data, onFollow = () => {} }) {
  const audio = new Audio();
  audio.preload = 'metadata';
  // Some browsers (Safari on iPhone and iPad) leave the volume to the device's
  // buttons: setting it does nothing. They get the mute button only.
  const canSetVolume = (() => {
    audio.volume = 0.5;
    const settable = audio.volume === 0.5;
    audio.volume = 1;
    return settable;
  })();

  let source = null; // the audio source of the track playing
  let tracks = null; // its data: { base, pageBase, tracks }
  let track = null;
  let partial = false; // the chapter asked for is only part of this recording
  let asked = null; // { bookId, chapter }: the site chapter Listen was pressed on, followed as playing moves on
  let rate = 1;
  let volume = 1;
  let muted = false;
  let resumeAt = 0;
  let lastSave = 0;
  let saved = null;
  let chapterButton = null; // the Listen button on the chapter on screen, and its chapter
  let buttonChapter = null;

  const ready = storage.get(STORAGE_KEY, null).then((value) => {
    saved = value;
    if (RATES.includes(value?.rate)) rate = value.rate;
    volume = canSetVolume ? validVolume(value?.volume) : 1;
    muted = value?.muted === true;
    audio.volume = volume;
    audio.muted = muted;
  });

  /* -------- the bar -------- */

  const creditSource = el('a', { class: 'audio-credit-link', rel: 'noopener', target: '_blank' });
  const creditPage = el('a', { class: 'audio-credit-link', rel: 'noopener', target: '_blank' });
  const creditLabel = el('span');
  const closeButton = el('button', { type: 'button', class: 'audio-icon-button audio-close', onclick: close }, icon(ICONS.close, { size: 18 }));
  const credit = el('p', { class: 'audio-credit' }, creditLabel, ' ', creditSource, el('span', { 'aria-hidden': 'true' }, ' · '), creditPage);

  const title = el('strong', { class: 'audio-title' });
  const byline = el('span', { class: 'audio-byline' });
  const numbering = el('span', { class: 'audio-numbering', hidden: true });

  const previousButton = el('button', { type: 'button', class: 'audio-icon-button', onclick: () => step(-1) }, icon(PLAYER_ICONS.previous, { size: 20 }));
  const backButton = el('button', { type: 'button', class: 'audio-icon-button', onclick: () => seekBy(-SKIP_SECONDS) }, icon(PLAYER_ICONS.back, { size: 20 }));
  const playButton = el('button', { type: 'button', class: 'audio-icon-button audio-play', onclick: toggle });
  const nextButton = el('button', { type: 'button', class: 'audio-icon-button', onclick: () => step(1) }, icon(PLAYER_ICONS.next, { size: 20 }));
  const seek = el('input', { type: 'range', class: 'audio-seek', min: 0, max: 0, step: 1, value: 0 });
  const time = el('span', { class: 'audio-time', 'aria-hidden': 'true' }, '0:00 / 0:00');
  const rateButton = el('button', { type: 'button', class: 'audio-rate', onclick: nextRate });
  const muteButton = el('button', { type: 'button', class: 'audio-icon-button audio-mute', onclick: toggleMute });
  const volumeSlider = el('input', { type: 'range', class: 'audio-volume-slider', min: 0, max: 100, step: VOLUME_STEP * 100, value: 100, hidden: !canSetVolume });
  const message = el('p', { class: 'audio-message', role: 'alert', hidden: true });
  const live = el('span', { class: 'visually-hidden', 'aria-live': 'polite' });

  const root = el(
    'section',
    { class: 'audio-player', hidden: true },
    el('div', { class: 'audio-inner' },
      el('div', { class: 'audio-head' }, credit, closeButton),
      el('p', { class: 'audio-now' }, title, byline, numbering),
      el(
        'div',
        { class: 'audio-controls' },
        previousButton,
        backButton,
        playButton,
        nextButton,
        el('div', { class: 'audio-progress' }, seek, time),
        el('div', { class: 'audio-volume' }, muteButton, volumeSlider),
        rateButton,
      ),
      message,
      live,
    ),
  );
  document.body.append(root);

  // Room under the page for the bar, so it never covers the last lines or
  // the verse action bar (css/audio.css reads --audio-player-height).
  const resize = new ResizeObserver(() => document.documentElement.style.setProperty('--audio-player-height', `${root.offsetHeight}px`));
  resize.observe(root);

  /* -------- what's playing -------- */

  async function loadSource(translationId) {
    const sources = await data.audioSources();
    const found = sourceFor(sources, translationId);
    if (!found) return null;
    return { source: found, tracks: await data.audioTracks(found) };
  }

  function setTrack(next, { isPartial = false, resume = false } = {}) {
    track = next;
    partial = isPartial;
    const same = resume && saved?.source === source.id && saved.book === track.book && saved.n === track.n;
    resumeAt = same && saved.position > 5 ? saved.position : 0;
    message.hidden = true;
    audio.src = trackUrl(tracks, track);
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    render();
    updateMediaSession();
    save(true);
  }

  async function play() {
    try {
      await audio.play();
    } catch (error) {
      // Autoplay refused (no gesture) or the file failed: show the play button.
      if (error?.name !== 'AbortError') renderPlaying();
    }
  }

  function toggle() {
    if (!track) return;
    if (audio.paused) play();
    else audio.pause();
  }

  function seekBy(delta) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + delta), audio.duration);
  }

  /** The previous or next recording; the page follows if it showed the one playing. */
  function step(delta) {
    const next = track && adjacentTrack(tracks.tracks, track, delta);
    if (!next) return;
    follow(next);
    setTrack(next);
    play();
    live.textContent = t('audio.nowPlaying', { title: trackTitle(next) });
  }

  function follow(next) {
    if (!asked) return;
    const from = { book: getBook(asked.bookId), chapter: asked.chapter };
    const stays = next.book === asked.bookId && (next.chapter === asked.chapter || next.chapters?.includes(asked.chapter));
    if (stays) return;
    asked = { bookId: next.book, chapter: next.chapter };
    onFollow({ from, to: { book: getBook(next.book), chapter: next.chapter } });
  }

  function nextRate() {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    renderRate();
    save(true);
  }

  /** Mute, or unmute to the volume before (half volume if the slider was down to 0). */
  function toggleMute() {
    muted = !(muted || volume === 0);
    if (!muted && volume === 0) volume = 0.5;
    applyVolume();
  }

  function setVolume(value) {
    volume = validVolume(value);
    muted = volume === 0;
    applyVolume();
  }

  function applyVolume() {
    audio.volume = volume;
    audio.muted = muted;
    renderVolume();
    save(true);
  }

  function close() {
    audio.pause();
    save(true);
    root.hidden = true;
    document.body.classList.remove('has-audio-player');
    renderButton();
    chapterButton?.focus();
  }

  function open() {
    root.hidden = false;
    document.body.classList.add('has-audio-player');
  }

  /** Remember the place: on pause, on a new chapter, and every few seconds while playing. */
  function save(now = false) {
    if (!track || !source) return;
    if (!now && Date.now() - lastSave < SAVE_EVERY_MS) return;
    lastSave = Date.now();
    saved = { source: source.id, book: track.book, n: track.n, position: Math.floor(audio.currentTime || resumeAt || 0), rate, volume, muted };
    storage.set(STORAGE_KEY, saved);
  }

  /* -------- the audio element -------- */

  audio.addEventListener('loadedmetadata', () => {
    if (resumeAt && resumeAt < audio.duration - 5) audio.currentTime = resumeAt;
    resumeAt = 0;
    renderTime();
  });
  audio.addEventListener('timeupdate', () => {
    renderTime();
    if (!audio.paused) save();
  });
  audio.addEventListener('durationchange', renderTime);
  audio.addEventListener('play', renderPlaying);
  audio.addEventListener('pause', () => {
    renderPlaying();
    save(true);
  });
  audio.addEventListener('ended', () => {
    const next = adjacentTrack(tracks.tracks, track, 1);
    if (!next) {
      renderPlaying();
      return;
    }
    follow(next);
    setTrack(next);
    play();
    live.textContent = t('audio.nowPlaying', { title: trackTitle(next) });
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    message.replaceChildren(t('audio.error'), ' ', el('button', { type: 'button', class: 'text-button', onclick: retry }, t('audio.retry')));
    message.hidden = false;
    renderPlaying();
  });

  function retry() {
    const position = audio.currentTime;
    message.hidden = true;
    resumeAt = position;
    audio.load();
    play();
  }

  seek.addEventListener('input', () => {
    audio.currentTime = Number(seek.value);
    renderTime();
  });
  volumeSlider.addEventListener('input', () => setVolume(Number(volumeSlider.value) / 100));

  /* -------- rendering -------- */

  function trackTitle(entry) {
    return chapterTitle(getBook(entry.book), entry.chapter);
  }

  function render() {
    if (!track) return;
    const book = getBook(track.book);
    const language = getLanguage();
    root.setAttribute('aria-label', t('audio.region'));
    root.lang = language;
    creditLabel.textContent = t('audio.source');
    creditSource.textContent = source.credit.name;
    creditSource.href = source.credit.url;
    creditSource.lang = 'ru';
    creditPage.textContent = t('audio.trackPage');
    creditPage.href = trackPage(tracks, track);
    closeButton.setAttribute('aria-label', t('audio.close'));
    closeButton.title = t('audio.close');

    title.textContent = chapterTitle(book, track.chapter);
    byline.textContent = t('audio.byline', { title: t(`audio.title.${source.id}`), reader: readerName(source, track, language) });
    // The recording's own chapter, where its numbering differs (Synodal Psalm 22 for Psalm 23).
    const native = chapterTitle(book, track.n);
    const note = partial ? t('audio.partOf', { title: native }) : track.n !== track.chapter ? t('audio.nativeNumbering', { title: native }) : '';
    numbering.textContent = note;
    numbering.hidden = !note;

    previousButton.setAttribute('aria-label', t('audio.previous'));
    previousButton.title = t('audio.previous');
    previousButton.disabled = !adjacentTrack(tracks.tracks, track, -1);
    nextButton.setAttribute('aria-label', t('audio.next'));
    nextButton.title = t('audio.next');
    nextButton.disabled = !adjacentTrack(tracks.tracks, track, 1);
    backButton.setAttribute('aria-label', t('audio.back', { n: SKIP_SECONDS }));
    backButton.title = t('audio.back', { n: SKIP_SECONDS });
    seek.setAttribute('aria-label', t('audio.seek'));
    renderPlaying();
    renderTime();
    renderRate();
    renderVolume();
    renderButton();
  }

  /** The mute button's icon and label, and the slider (at 0 while muted). */
  function renderVolume() {
    const silent = muted || volume === 0;
    muteButton.replaceChildren(icon(silent ? PLAYER_ICONS.muted : volume < 0.5 ? PLAYER_ICONS.volumeLow : PLAYER_ICONS.volume, { size: 20 }));
    const label = silent ? t('audio.unmute') : t('audio.mute');
    muteButton.setAttribute('aria-label', label);
    muteButton.title = label;
    muteButton.setAttribute('aria-pressed', silent ? 'true' : 'false');
    const shown = silent ? 0 : volume;
    volumeSlider.value = String(Math.round(shown * 100));
    volumeSlider.setAttribute('aria-label', t('audio.volume'));
    volumeSlider.setAttribute('aria-valuetext', new Intl.NumberFormat(getLanguage(), { style: 'percent' }).format(shown));
  }

  function renderPlaying() {
    const playing = !audio.paused && !audio.ended;
    playButton.replaceChildren(icon(playing ? PLAYER_ICONS.pause : PLAYER_ICONS.play, { size: 22 }));
    playButton.setAttribute('aria-label', playing ? t('audio.pause') : t('audio.play'));
    playButton.title = playing ? t('audio.pause') : t('audio.play');
    renderButton();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  function renderTime() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : (track?.seconds ?? 0);
    const current = audio.currentTime || resumeAt || 0;
    seek.max = String(Math.floor(duration));
    seek.value = String(Math.floor(current));
    const text = t('audio.time', { current: formatTime(current), total: formatTime(duration) });
    seek.setAttribute('aria-valuetext', text);
    time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  function renderRate() {
    const label = `${new Intl.NumberFormat(getLanguage()).format(rate)}×`;
    rateButton.textContent = label;
    rateButton.setAttribute('aria-label', t('audio.rate', { rate: label }));
    rateButton.title = t('audio.rate', { rate: label });
  }

  /** The Listen button on the chapter on screen: "Pause" while its chapter plays. */
  function renderButton() {
    if (!chapterButton || !buttonChapter) return;
    const mine = track && !root.hidden && asked?.bookId === buttonChapter.bookId && asked.chapter === buttonChapter.chapter;
    const playing = mine && !audio.paused && !audio.ended;
    chapterButton.replaceChildren(icon(playing ? PLAYER_ICONS.pause : PLAYER_ICONS.headphones, { size: 16 }), playing ? t('audio.pause') : t('audio.listen'));
    chapterButton.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: chapterTitle(getBook(track.book), track.chapter),
      artist: readerName(source, track, getLanguage()),
      album: t(`audio.title.${source.id}`),
    });
    const handlers = {
      play: () => play(),
      pause: () => audio.pause(),
      previoustrack: () => step(-1),
      nexttrack: () => step(1),
      seekbackward: () => seekBy(-SKIP_SECONDS),
      seekforward: () => seekBy(SKIP_SECONDS),
      seekto: (details) => {
        if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
      },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // an action this browser doesn't support
      }
    }
  }

  /* -------- the reader's side -------- */

  /** Play a site chapter from the start of its recording (or where it was left). */
  async function playChapter(book, chapter, translationId) {
    await ready;
    const found = await loadSource(translationId);
    const entries = found ? tracksForChapter(found.tracks.tracks, book.id, chapter) : [];
    if (!entries.length) return;
    ({ source, tracks } = found);
    asked = { bookId: book.id, chapter };
    open();
    setTrack(entries[0].track, { isPartial: entries[0].partial, resume: true });
    await play();
  }

  return {
    /**
     * A chapter is on screen: give its header a Listen button if one of the
     * translations shown (`ids`) has a recording of it.
     */
    async setChapter({ view, book, chapter, ids }) {
      chapterButton = buttonChapter = null;
      let sources;
      try {
        sources = await data.audioSources();
      } catch {
        return; // offline before the list was stored: no button
      }
      const translationId = ids.find((id) => sourceFor(sources, id));
      if (!translationId) return;
      let found;
      try {
        found = await loadSource(translationId);
      } catch {
        return;
      }
      const header = view.element.querySelector('.chapter-header');
      if (!header || !header.isConnected || !tracksForChapter(found.tracks.tracks, book.id, chapter).length) return;
      header.querySelector('.audio-listen')?.remove();
      const button = el('button', {
        type: 'button',
        class: 'text-button audio-listen',
        'data-focus-key': 'audio-listen',
        onclick: () => {
          const mine = track && !root.hidden && asked?.bookId === book.id && asked.chapter === chapter;
          if (mine) toggle();
          else playChapter(book, chapter, translationId);
        },
      });
      header.querySelector('.chapter-title').after(button);
      chapterButton = button;
      buttonChapter = { bookId: book.id, chapter };
      renderButton();
    },

    /** The interface language changed. */
    refresh() {
      render();
      if (!track) renderButton();
      updateMediaSession();
    },

    /** For tests and the console: what's loaded. */
    state: () => ({ track, partial, asked, rate, paused: audio.paused, src: audio.currentSrc }),
    element: root,
    audio,
  };
}
