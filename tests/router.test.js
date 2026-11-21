import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBook, getBook } from '../js/canon.js';
import { chapterHref, introHref, mapHref, PAGES, parseHash, resolveRoute } from '../js/router.js';

// The fields of a route that matter for these pages.
const pick = ({ view, book, mapId, pageId }) => ({ view, ...(book ? { book } : {}), ...(mapId ? { mapId } : {}), ...(pageId ? { pageId } : {}) });

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
  assert.equal(chapterHref(getBook('JHN'), 3, null, 't=kjv,asv'), '#/john/3?t=kjv,asv');
  assert.equal(chapterHref(getBook('JHN'), 3, 16, 't=web'), '#/john/3/16?t=web');
});

test('translation lists in ?t= survive canonical redirects', () => {
  assert.equal(resolveRoute('#/john/3?t=kjv,asv').redirect, undefined);
  assert.equal(resolveRoute('#/john/3?t=kjv,asv').params.t, 'kjv,asv');
  assert.equal(resolveRoute('#/jn/3?t=kjv,asv').redirect, '#/john/3?t=kjv,asv');
  assert.equal(resolveRoute('#/john/3?t=kjv%2Casv').params.t, 'kjv,asv'); // encoded comma
});

test('#/translations is a page, not a book', () => {
  assert.equal(resolveRoute('#/translations').view, 'translations');
  assert.equal(resolveRoute('#/translations').redirect, undefined);
  assert.equal(resolveRoute('#/Translations/').redirect, '#/translations');
});

test('page names are not used by any book alias', () => {
  for (const name of Object.keys(PAGES)) assert.equal(findBook(name), null, `"${name}" must not match a book`);
});

test('verse ranges: #/psalms/23/1-4', () => {
  const range = resolveRoute('#/psalms/23/1-4');
  assert.deepEqual([range.view, range.chapter, range.verse, range.verseEnd, range.redirect], ['reader', 23, 1, 4, undefined]);
  assert.equal(resolveRoute('#/ps/23/1–4').redirect, '#/psalms/23/1-4'); // en dash, alias
  assert.equal(resolveRoute('#/john/3/16-12').redirect, '#/john/3/16'); // backwards: just the first verse
  assert.equal(resolveRoute('#/john/3/16-16').redirect, '#/john/3/16');
  assert.equal(resolveRoute('#/john/3/16-x').redirect, '#/john/3/16');
  assert.equal(resolveRoute('#/john/3/16').verseEnd, null);
  assert.equal(chapterHref(getBook('PSA'), 23, 1, 't=kjv', 4), '#/psalms/23/1-4?t=kjv');
  assert.equal(chapterHref(getBook('PSA'), 23, 1, '', 1), '#/psalms/23/1');
  assert.equal(chapterHref(getBook('PSA'), 23, null, '', 4), '#/psalms/23');
});

test('the search page keeps its query', () => {
  const route = resolveRoute('#/search?q=in+the+beginning&t=kjv');
  assert.equal(route.view, 'search');
  assert.equal(route.params.q, 'in the beginning');
  assert.equal(resolveRoute('#/Search?q=x').redirect, '#/search?q=x');
});

test('study pages: book introductions, the timeline and maps', () => {
  const john = findBook('john');
  assert.deepEqual(pick(resolveRoute('#/john/intro')), { view: 'intro', book: john });
  assert.equal(resolveRoute('#/jn/Intro').redirect, '#/john/intro');
  assert.equal(resolveRoute('#/jude/intro').view, 'intro', 'a one-chapter book’s introduction is not its chapter');
  assert.equal(introHref(john), '#/john/intro');
  assert.equal(resolveRoute('#/timeline').view, 'timeline');
  assert.deepEqual(pick(resolveRoute('#/maps')), { view: 'maps' });
  assert.deepEqual(pick(resolveRoute('#/maps/paul?place=a15257a')), { view: 'maps', mapId: 'paul' });
  assert.equal(resolveRoute('#/maps/Paul').redirect, '#/maps/paul');
  assert.equal(resolveRoute('#/maps/<x>').view, 'not-found');
  assert.equal(mapHref('paul', 'place=a1'), '#/maps/paul?place=a1');
  assert.equal(mapHref(), '#/maps');
});

test('interactive studies: #/explore and #/explore/<id>', () => {
  assert.deepEqual(pick(resolveRoute('#/explore')), { view: 'explore' });
  assert.deepEqual(pick(resolveRoute('#/explore/daniel-statue?part=legs')), { view: 'explore', pageId: 'daniel-statue' });
  assert.equal(resolveRoute('#/Explore/Daniel-Statue').redirect, '#/explore/daniel-statue');
  assert.equal(resolveRoute('#/explore/a%20b').view, 'not-found');
});
