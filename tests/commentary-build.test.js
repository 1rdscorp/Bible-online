/**
 * The commentary build's readers and repairs (tools/lib/: ref-list, thml,
 * gutenberg, commentary-runs; tools/build-commentary.mjs), on
 * small samples written like the real sources.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { compactPassage, mergePassages } from '../tools/build-commentary.mjs';
import { linkRefs, mergeRefs } from '../tools/lib/commentary-runs.mjs';
import { readGutenbergBook, titleCase } from '../tools/lib/gutenberg.mjs';
import { parseRefList } from '../tools/lib/ref-list.mjs';
import { readThml } from '../tools/lib/thml.mjs';

// Verse counts and text from the KJV in /data.
const kjv = JSON.parse(readFileSync(new URL('../data/kjv.json', import.meta.url), 'utf8'));
const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
const lastVerse = (book, chapter) => (chapters.get(book)?.[chapter - 1] ?? []).filter(Boolean).length;
const refs = (text) => parseRefList(text, lastVerse).map((piece) => piece.refs);

describe('references as old books print them (ref-list.mjs)', () => {
  test('lists, continuations, chapters and verses', () => {
    assert.deepEqual(refs('Ps. 33:6, 9; 104:5.'), [['PSA 33:6', 'PSA 33:9'], ['PSA 104:5']]);
    assert.deepEqual(refs('See Ex. 3; 4:1-26.'), [['EXO 3:1-22'], ['EXO 4:1-26']]);
    assert.deepEqual(refs('See 2 Sam. 2-4; 5:1-5.'), [['2SA 2:1-4:12'], ['2SA 5:1-5']]);
    assert.deepEqual(refs('See Joshua 10:40-43; chapter 11.'), [['JOS 10:40-43'], ['JOS 11:1-23']]);
    assert.deepEqual(refs('Genesis 1 and 2'), [['GEN 1:1-31', 'GEN 2:1-25']]);
    assert.deepEqual(refs('Matt. 9:1-8, 32-34'), [['MAT 9:1-8', 'MAT 9:32-34']]);
    assert.deepEqual(refs('Jude 14, 15'), [['JUD 1:14', 'JUD 1:15']]);
    assert.deepEqual(refs('Acts 4:32-5:11'), [['ACT 4:32-5:11']]);
  });

  test('old abbreviations, and words that aren’t references', () => {
    assert.deepEqual(refs('Cant. 2:11-13, Rev. Ver.'), [['SNG 2:11-13']]);
    assert.deepEqual(refs('Eze. 1:11'), [['EZK 1:11']]);
    assert.deepEqual(refs('See Appendix, Note 5.'), [[]]);
    assert.deepEqual(refs('Ps. 151:1'), [[]], 'no such psalm');
  });

  test('whole chapters in short form, and neighbours merged', () => {
    assert.equal(compactPassage('GEN 39:1-41:57', lastVerse), 'GEN 39-41');
    assert.equal(compactPassage('LUK 2:1-52', lastVerse), 'LUK 2');
    assert.equal(compactPassage('LUK 2:1-20', lastVerse), 'LUK 2:1-20');
    assert.deepEqual(mergePassages(['GEN 1', 'GEN 2', 'GEN 4:1-15', 'GEN 4:1-15', 'EXO 3']), ['GEN 1-2', 'GEN 4:1-15', 'EXO 3']);
  });
});

describe('CCEL ThML (thml.mjs)', () => {
  const xml = `<ThML><ThML.head/><ThML.body>
<div1 title="Title Page"><p>The Desire of Ages</p></div1>
<div1 title="Section I. The Beginning">
<div2 title="Chapter 4. Unto You a Saviour">
<h3>Chapter 4 <br />Unto You a Saviour</h3>
<h4>[This chapter is based on <scripRef osisRef="Bible:Luke.2.1-Luke.2.20">Luke 2:1–20</scripRef>.]</h4>
<p class="normal">The King of glory <i>stooped</i> low &amp; took
humanity. <scripRef osisRef="Bible:Phil.2.7">Phil. 2:7</scripRef>.<pb n="44"/> He shunned display.</p>
<pb n="45"/>
<blockquote><p>“Glory to God in the highest,</p><p>And on earth peace.”</p></blockquote>
</div2>
<div2 title="Chapter 5. The Dedication">
<h4>[This chapter is based on <scripRef osisRef="Bible:Matt.2">Matthew 2</scripRef>.]</h4>
<p>About forty days after.</p>
</div2></div1>
<div1 title="Indexes"><div class="Index"><p>Genesis 1:1</p></div></div1>
</ThML.body></ThML>`;
  const read = readThml(xml, { lastVerse });

  test('chapters, sections and the passages they are based on', () => {
    assert.deepEqual(read.map((chapter) => [chapter.id, chapter.title, chapter.section]), [['4', 'Unto You a Saviour', 'The Beginning'], ['5', 'The Dedication', 'The Beginning']]);
    assert.deepEqual(read[0].basedOn.refs, ['LUK 2:1-20']);
    assert.deepEqual(read[1].basedOn.refs, ['MAT 2:1-23']);
    assert.deepEqual(read[0].pages, [44, 45]);
  });

  test('where CCEL’s markup disagrees with the printed reference, the printed one wins', () => {
    const wrong = `<ThML.body><div1 title="Chapter 43. The Unseen Watcher"><p>“The earth mourneth.” <scripRef osisRef="Bible:Isa.26.1-Isa.26.6">Isaiah 24:1–6</scripRef>; <scripRef osisRef="Bible:John.1.9">9</scripRef>.</p></div1></ThML.body>`;
    const [chapter] = readThml(wrong, { lastVerse });
    assert.deepEqual(chapter.blocks[0].c.filter((run) => run.r).map((run) => run.r), ['ISA 24:1-6', 'JHN 1:9']);
  });

  test('paragraphs with italics, references and page marks; quotations keep their lines', () => {
    assert.deepEqual(read[0].blocks[0], {
      t: 'p',
      c: ['The King of glory ', { i: 'stooped' }, ' low & took humanity. ', { r: 'PHP 2:7', x: 'Phil. 2:7' }, '.', { pg: 44 }, ' He shunned display.'],
    });
    assert.deepEqual(read[0].blocks[1], { t: 'q', lines: [[{ pg: 45 }, '“Glory to God in the highest,'], ['And on earth peace.”']] });
  });
});

describe('Project Gutenberg text (gutenberg.mjs)', () => {
  const text = `*** START OF THE PROJECT GUTENBERG EBOOK 79498 ***

                            IN THE BEGINNING

“By faith we understand.”

                        WHY WAS SIN PERMITTED?—1


“GOD is love.” His nature, his law, is love.[1]

        “Strong is thy hand,
        And high is thy right hand.”[2]

The _Sovereign_ of the universe.[3]

Footnote 1:

  1 John 4:16.

Footnote 2:

  Ps. 89:13, 14.

Footnote 3:

  See Appendix, Note 1.



                             THE CREATION—2


As the earth came forth.

                                APPENDIX


=NOTE 1.= PAGE 92.—Though not only the justice of God.

*** END OF THE PROJECT GUTENBERG EBOOK 79498 ***`;
  const read = readGutenbergBook(text, { lastVerse });

  test('chapters, sections (their mottos left out) and the appendix', () => {
    assert.deepEqual(read.map((chapter) => [chapter.id, chapter.title, chapter.section]), [['1', 'Why Was Sin Permitted?', 'In the Beginning'], ['2', 'The Creation', 'In the Beginning'], ['appendix', 'Appendix', null]]);
    assert.equal(titleCase('THE WILDERNESS-TRAINING'), 'The Wilderness-Training');
  });

  test('reference footnotes go inline; other notes become numbered notes linking to the appendix', () => {
    const [first, poem, third] = read[0].blocks;
    assert.deepEqual(first.c, ['“God is love.” His nature, his law, is love. ', { r: '1JN 4:16', x: '1 John 4:16' }, '.']);
    assert.deepEqual(poem, { t: 'q', lines: [['“Strong is thy hand,'], ['And high is thy right hand.” ', { r: 'PSA 89:13', x: 'Ps. 89:13, 14' }, '.']] });
    assert.deepEqual(third.c, ['The ', { i: 'Sovereign' }, ' of the universe.', { fn: 1 }]);
    assert.deepEqual(read[0].notes, [{ n: 1, c: ['See ', { to: 'appendix#note-1', x: 'Appendix, Note 1' }, '.'] }]);
    assert.deepEqual(read[2].blocks[0], { t: 'p', id: 'note-1', c: [{ b: 'NOTE 1.' }, ' PAGE 92.—Though not only the justice of God.'] });
  });
});

describe('commentary text repairs (commentary-runs.mjs)', () => {
  test('references in running text become links; consecutive verses one range', () => {
    assert.deepEqual(linkRefs('as (Eze. 14:19, 20) and Ps, 112: 8.', lastVerse), ['as (', { r: 'EZK 14:19-20', x: 'Eze. 14:19, 20' }, ') and ', { r: 'PSA 112:8', x: 'Ps, 112: 8' }, '.']);
    assert.equal(mergeRefs(['MAT 9:1', 'MAT 9:3'], lastVerse), 'MAT 9:1');
  });

});
