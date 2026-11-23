/**
 * Audio Bibles: the build's reading of predanie.ru, the chapter matching,
 * the data files, and the source layer the player uses.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { adjacentTrack, formatTime, readerName, sourceFor, tracksForChapter, trackPage, trackUrl } from '../js/audio/sources.js';
import { BOOKS } from '../js/canon.js';
import { audioFile, chapterNumber, nativeCoverage, primaryChapter, readPredaniePage, seconds } from '../tools/build-audio.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const manifest = readJson('data/research.json');
const sources = manifest.audio.sources;

describe('reading predanie.ru (tools/build-audio.mjs)', () => {
  test('lengths, chapter numbers', () => {
    assert.equal(seconds('8:03'), 483);
    assert.equal(seconds('1:02:03'), 3723);
    assert.equal(chapterNumber('Ветхий Завет, Бытие, Глава 1'), 1);
    assert.equal(chapterNumber('Книга Притчей, Глава 01'), 1);
    assert.equal(chapterNumber('Ветхий Завет, Псалтирь, Псалом 150'), 150);
    assert.equal(chapterNumber('Вторая книга Паралипоменон, 12'), 12);
    assert.equal(chapterNumber('Молитва Манассии'), null);
  });

  test('a page: sections, rows, the playlist', () => {
    const playlist = JSON.stringify([{ id: 7, src: '/uploads/x/01.mp3', duration: '4:14' }]).replace(/"/g, '&quot;');
    const html = `<div data-playlist="${playlist}"></div><div class="collapsible-section" id="audio-section-1"><h4 class="section-title">Бытие</h4>
      <div class="file-row" id="audio-7" data-track-id="7"><h5 class="file-title">Глава 1</h5><a href="/audio/7-glava-1/">x</a></div></div>`;
    assert.deepEqual(readPredaniePage(html), [{ title: 'Бытие', rows: [{ id: 7, title: 'Глава 1', page: '/audio/7-glava-1/', src: '/uploads/x/01.mp3', seconds: 254 }] }]);
  });

  test('a recorded chapter belongs to the first site chapter holding a quarter of it', () => {
    // Synodal Psalm 9 is KJV 9 (21 verses) and KJV 10 (18): it belongs to 9.
    const psalms = nativeCoverage(11, { 9: [[9, 1, 21]], 10: [[9, 22, 39]], 11: [[10]] }, () => 20);
    assert.deepEqual(psalms.get(9).map((part) => part.chapter), [9, 10]);
    assert.equal(primaryChapter(psalms.get(9)), 9);
    assert.equal(primaryChapter(psalms.get(10)), 11);
    // Numbers 13 (Synodal) starts with the KJV's 12:16: one verse doesn't count.
    assert.equal(primaryChapter([{ chapter: 12, verses: 1 }, { chapter: 13, verses: 33 }]), 13);
  });

  test('data files: one track per line', () => {
    assert.equal(audioFile({ source: 'x', tracks: [{ a: 1 }, { a: 2 }] }), '{"source":"x","tracks":[\n{"a":1},\n{"a":2}\n]}\n');
  });
});

describe('audio data (data/audio/)', () => {
  for (const source of sources) {
    const data = readJson(source.url);

    test(`${source.id}: "version" matches the file (run \`node tools/build-audio.mjs\` after editing)`, () => {
      const text = readFileSync(new URL(`../${source.url}`, import.meta.url), 'utf8');
      assert.equal(source.version, createHash('sha256').update(text).digest('hex').slice(0, 12));
      assert.equal(source.tracks, data.tracks.length);
    });

    test(`${source.id}: every chapter of the 66 books has a recording; tracks in canon order`, () => {
      for (const book of BOOKS) {
        for (let chapter = 1; chapter <= book.chapters; chapter += 1) {
          assert.ok(tracksForChapter(data.tracks, book.id, chapter).length, `${book.id} ${chapter}`);
        }
      }
      const order = new Map(BOOKS.map((book, index) => [book.id, index]));
      data.tracks.forEach((track, i) => {
        if (i === 0) return;
        const before = data.tracks[i - 1];
        assert.ok(order.get(before.book) < order.get(track.book) || (before.book === track.book && before.n < track.n), `${track.book} ${track.n}`);
      });
    });

    test(`${source.id}: well-formed tracks; the credit the source's terms ask for`, () => {
      assert.match(data.base, /^https:\/\//);
      assert.match(data.pageBase, /^https:\/\//);
      for (const track of data.tracks) {
        assert.match(track.src, /\.mp3$/);
        assert.ok(track.page.endsWith('/'), track.page);
        assert.ok(track.seconds > 0);
        if (track.reader) assert.ok(source.readers[track.reader]);
      }
      assert.ok(source.readers[source.reader]);
      assert.ok(source.credit.name && source.credit.url && source.page);
    });
  }

  test('the Synodal recording: Psalms in the Greek numbering, mapped to the KJV', () => {
    const data = readJson(sourceFor(sources, 'rst').url);
    const psalm = (chapter) => tracksForChapter(data.tracks, 'PSA', chapter).map(({ track, partial }) => `${track.n}${partial ? '*' : ''}`);
    assert.deepEqual(psalm(23), ['22']);
    assert.deepEqual(psalm(119), ['118']);
    assert.deepEqual(psalm(116), ['114', '115']); // two Synodal Psalms
    assert.deepEqual(psalm(9), ['9']);
    assert.deepEqual(psalm(10), ['9*']); // the second half of Synodal Psalm 9
    assert.deepEqual(psalm(147), ['146', '147']);
    assert.deepEqual(tracksForChapter(data.tracks, 'JHN', 3).map(({ track }) => track.n), [3]);
    // Read by Ilya Prudovsky, where Bondarenko didn't record the book.
    const kings = tracksForChapter(data.tracks, '2KI', 1)[0].track;
    const source = sourceFor(sources, 'rst');
    assert.equal(readerName(source, kings, 'ru'), 'Илья Прудовский');
    assert.equal(readerName(source, tracksForChapter(data.tracks, 'GEN', 1)[0].track, 'en'), 'Alexander Bondarenko');
  });
});

describe('the source layer (js/audio/sources.js)', () => {
  const data = { base: 'https://a.example/files/', pageBase: 'https://a.example/audio/', tracks: [{ book: 'GEN', n: 50, chapter: 50, src: 'g50.mp3', page: '1-g50/' }, { book: 'EXO', n: 1, chapter: 1, src: 'e1.mp3', page: '2-e1/' }] };

  test('next and previous run across books and stop at the ends', () => {
    assert.equal(adjacentTrack(data.tracks, data.tracks[0], 1), data.tracks[1]);
    assert.equal(adjacentTrack(data.tracks, data.tracks[1], 1), null);
    assert.equal(adjacentTrack(data.tracks, data.tracks[0], -1), null);
  });

  test('file and page URLs, times', () => {
    assert.equal(trackUrl(data, data.tracks[1]), 'https://a.example/files/e1.mp3');
    assert.equal(trackPage(data, data.tracks[1]), 'https://a.example/audio/2-e1/');
    assert.equal(formatTime(254), '4:14');
    assert.equal(formatTime(3723), '1:02:03');
    assert.equal(formatTime(Number.NaN), '0:00');
  });

  test('a translation without audio has no source', () => {
    assert.equal(sourceFor(sources, 'kjv'), null);
  });
});
