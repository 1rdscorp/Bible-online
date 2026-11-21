import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBook } from '../js/canon.js';
import { chapterHref, parseHash, resolveRoute } from '../js/router.js';

const summary = (hash) => {
  const r = resolveRoute(hash);
  return {
    view: r.view,
    book: r.book?.id,
    chapter: r.chapter,
    verse: r.verse,
    redirect: r.redirect,
    reason: r.reason,
  };
};

test('no hash → start (resume last chapter); "#/" → book list', () => {
  assert.equal(resolveRoute('').view, 'start');
  assert.equal(resolveRoute('#').view, 'start');
  assert.deepEqual(summary('#/'), { view: 'books', book: undefined, chapter: undefined, verse: undefined, redirect: undefined, reason: undefined });
});

test('book, chapter and verse routes', () => {
  assert.equal(summary('#/john').view, 'chapters');
  assert.equal(summary('#/john').book, 'JHN');
  assert.deepEqual(
    { ...summary('#/john/3') },
    { view: 'reader', book: 'JHN', chapter: 3, verse: null, redirect: undefined, reason: undefined },
  );
  assert.equal(summary('#/john/3/16').verse, 16);
  assert.equal(summary('#/song-of-solomon/2').book, 'SNG');
  assert.equal(summary('#/1-john/4/8').book, '1JN');
});

test('non-canonical URLs redirect to one canonical form', () => {
  assert.equal(summary('#/jn/3').redirect, '#/john/3');
  assert.equal(summary('#/John/03').redirect, '#/john/3');
  assert.equal(summary('#/john/3/').redirect, '#/john/3');
  assert.equal(summary('#//').redirect, '#/');
  assert.equal(summary('#/1jn/1').redirect, '#/1-john/1');
  assert.equal(summary('#/song%20of%20solomon/1').redirect, '#/song-of-solomon/1');
  assert.equal(summary('#/john/3/abc').redirect, '#/john/3'); // unreadable verse dropped
  assert.equal(summary('#/john/3').redirect, undefined);
});

test('single-chapter books skip the chapter grid', () => {
  assert.equal(summary('#/jude').redirect, '#/jude/1');
  assert.equal(summary('#/philemon').redirect, '#/philemon/1');
  // "Jude 3" means verse 3
  assert.equal(summary('#/jude/3').redirect, '#/jude/1/3');
  assert.equal(summary('#/jude/1').redirect, undefined);
});

test('unknown books and out-of-range chapters are not found', () => {
  assert.deepEqual([summary('#/nope/1').view, summary('#/nope/1').reason], ['not-found', 'book']);
  assert.deepEqual([summary('#/john/22').view, summary('#/john/22').reason], ['not-found', 'chapter']);
  assert.equal(summary('#/john/0').view, 'not-found');
  assert.equal(summary('#/john/-1').view, 'not-found');
  assert.equal(summary('#/john/x').view, 'not-found');
});

test('query parameters are parsed and survive redirects', () => {
  assert.deepEqual(resolveRoute('#/john/3?t=asv').params, { t: 'asv' });
  assert.equal(resolveRoute('#/jn/3?t=asv').redirect, '#/john/3?t=asv');
  assert.equal(resolveRoute('#/?t=asv').view, 'books');
  assert.deepEqual(parseHash('#/a/b?x=1&y=2').segments, ['a', 'b']);
});

test('malformed escapes do not throw', () => {
  assert.equal(resolveRoute('#/%E0%A4%A/1').view, 'not-found');
});

test('chapterHref builds canonical links', () => {
  assert.equal(chapterHref(getBook('JHN'), 3), '#/john/3');
  assert.equal(chapterHref(getBook('JHN'), 3, 16), '#/john/3/16');
  assert.equal(chapterHref(getBook('SNG'), 1), '#/song-of-solomon/1');
});
