/**
 * The commentary build's readers and repairs (tools/lib/: ref-list, thml,
 * gutenberg, ocr, smith, commentary-runs; tools/build-commentary.mjs), on
 * small samples written like the real sources.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { applyCorrections, compactPassage, markPoems, mergePassages, smithBlocks } from '../tools/build-commentary.mjs';
import { linkRefs, mendOcr, mergeRefs, sideHeading, tidyOcrText } from '../tools/lib/commentary-runs.mjs';
import { readGutenbergBook, titleCase } from '../tools/lib/gutenberg.mjs';
import { alignTokens, editDistance, isTextLine, joinLines, NOTE_MARK, normWord, ocrParagraphs, tokenize, voteTokens } from '../tools/lib/ocr.mjs';
import { parseRefList } from '../tools/lib/ref-list.mjs';
import { chapterHeading, CHAPTER_MARK, matchVerse, readSmithStructure, verseLabel } from '../tools/lib/smith.mjs';
import { readThml } from '../tools/lib/thml.mjs';

// Verse counts and text from the KJV in /data.
const kjv = JSON.parse(readFileSync(new URL('../data/kjv.json', import.meta.url), 'utf8'));
const chapters = new Map(kjv.books.map((book) => [book.id, book.chapters]));
const lastVerse = (book, chapter) => (chapters.get(book)?.[chapter - 1] ?? []).filter(Boolean).length;
const verseText = (book, chapter, verse) => chapters.get(book)?.[chapter - 1]?.[verse - 1] || undefined;
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

describe('OCR clean-up and correction (ocr.mjs)', () => {
  const words = new Set(['the', 'king', 'of', 'babylon', 'reason', 'god', 'gave', 'him', 'this', 'dream', 'well', 'known', 'and', 'he', 'was', 'with', 'them', 'command', 'his', 'attention', 'a', 'great', 'image', 'for']);
  const known = (n) => words.has(n);

  test('running heads, page numbers and engraving noise are not text', () => {
    assert.equal(isTextLine('CHAPTER 2, VERSES 29-35 41', known), false);
    assert.equal(isTextLine('26 PROPHECY OF DANIEL', known), false);
    assert.equal(isTextLine('CHAPTER 6, VERSES 9- ii 439°', known), false);
    assert.equal(isTextLine('ap ees pee,', known), false);
    assert.equal(isTextLine('the king of Babylon', known), true);
  });

  test('line-end hyphens: joined into a word, kept in a compound', () => {
    assert.equal(joinLines(['For this rea-', 'son God gave him'], (n) => n === 'reason' || known(n)), 'For this reason God gave him');
    assert.equal(joinLines(['the well-', 'known king'], known), 'the well-known king');
    assert.equal(joinLines(['would at once com:', 'mand his attention'], known), 'would at once command his attention');
  });

  test('paragraphs rejoin across page breaks, blank lines and footnotes', () => {
    const text = ['He was with them, and for this rea-', '', '26 PROPHECY OF DANIEL', '', 'son God gave him this dream.', '', '1 This note is at the foot of the page.', '', 'The king of Babylon was', '', 'with them.'].join('\n');
    // A footnote comes after the paragraph it interrupted (or followed).
    assert.deepEqual(ocrParagraphs(text, (n) => known(n) || ['reason', 'note', 'is', 'at', 'foot', 'page'].includes(n)), [
      'He was with them, and for this reason God gave him this dream.',
      `${NOTE_MARK}1 This note is at the foot of the page.`,
      'The king of Babylon was with them.',
    ]);
  });

  test('tokens: dashes split, lone punctuation joins the word before', () => {
    assert.deepEqual(tokenize(['Men—The king — of']).map((token) => token.w), ['Men—', 'The', 'king—', 'of']);
    assert.equal(normWord('Nebuchadnezzar’s,'), 'nebuchadnezzars');
    assert.equal(editDistance('boon', 'been'), 2);
  });

  test('voting: the other scans’ shared reading wins, unless ours is a word and theirs isn’t', () => {
    const scan = (text) => tokenize([text]);
    const ours = scan('Tue king of Babylon was with them and he gave him a great image for this reason');
    const l = scan('The king of Babylon was Avith them and he gave him a great image for this reason');
    const p = scan('The king of Babylon was Avith them and be gave him a great image for this reason');
    const others = [l, p].map((tokens) => ({ tokens, map: alignTokens(ours, tokens, { k: 3 }) }));
    const { tokens, changed } = voteTokens(ours, others, { inDictionary: known, known });
    assert.equal(tokens.map((token) => token.w).join(' '), 'The king of Babylon was with them and he gave him a great image for this reason');
    assert.equal(changed, 1);
  });
});

describe('Daniel and the Revelation’s structure (smith.mjs)', () => {
  test('labels however OCR read them, and chapter headings', () => {
    assert.deepEqual(verseLabel('VERSE 31. Thou, O king'), { number: 31, skip: 2 });
    assert.deepEqual(verseLabel('Vee.se 31. Thou'), { number: 31, skip: 2 });
    assert.deepEqual(verseLabel('VeRSE31. Thou'), { number: 31, skip: 1 });
    assert.equal(verseLabel('Very well, then'), null);
    assert.equal(chapterHeading('CHAPTER VII.'), CHAPTER_MARK);
    assert.equal(chapterHeading('CHAPTER 2, VERSES 1-4 33'), null);
  });

  test('matching a verse past misreadings and engraving noise', () => {
    const words = (text) => text.split(' ').map(normWord);
    const verse = words('Seventy weeks are determined upon thy people and upon thy holy city to finish the transgression and to make an end of sins');
    const ocr = words('Seventy weeks are determined upon thy pcople and upon thy holy city, to finish the transgression, and to make an end LIGL spua fionwasdns jodog SEL mes ee Be 4g of sins, and to');
    const { ratio } = matchVerse(ocr, 0, verse);
    assert.ok(ratio > 0.9, String(ratio));
    // Without the noise the same words match in full.
    assert.equal(matchVerse(words('Seventy weeks are determined upon thy people and upon thy holy city, to finish the transgression, and to make an end of sins'), 0, verse).ratio, 1);
  });

  test('blocks found by label and KJV text; commentary runs to the next block', () => {
    const paragraphs = [
      'That the book of Daniel was written by the person whose name it bears, there is no doubt.',
      CHAPTER_MARK,
      'VERSE 1. In the third year of the reign of Jehoiakim king of Judah came Nebuchadnezzar king of Babylon unto Jerusalem, and besieged it. 2. And the Lord gave Jehoiakim king of Judah into his hand, with part of the vessels of the house of God: which he carried into the land of Shinar to the house of his god; and he brought the vessels into the treasure house of his god. Smith’s note on the siege.',
      'More on the siege.',
      'Verse 3. And the king spake unto Ashpenaz the master of his eunuchs, that he should bring certain of the children of Israel, and of the king’s seed, and of the princes;',
      'On the princes.',
      'The Revelation, usually termed the Apocalypse.',
      'VERSE 1. The Revelation of Jesus Christ, which God gave unto him, to show unto his servants things which must shortly come to pass; and he sent and signified it by his angel unto his servant John:',
      'On the title.',
      'The appendix: an abnormal national experience known as the French Revolution.',
    ];
    const markers = { danielIntro: 'the book of Daniel was written by the person whose', revelationIntro: 'Revelation, usually termed', end: 'abnormal national experience known as' };
    const { parts } = readSmithStructure(paragraphs, { verseText, markers, chapterCounts: { DAN: 12, REV: 22 } });
    assert.deepEqual(parts.map((part) => part.id), ['dan-intro', 'dan-1', 'rev-intro', 'rev-1']);
    const [first, second] = parts[1].sections;
    assert.deepEqual(first.ref, { chapter: 1, verse: 1, endVerse: 2 });
    assert.deepEqual(first.paragraphs, ['Smith’s note on the siege.', 'More on the siege.']);
    assert.deepEqual(second.ref, { chapter: 1, verse: 3, endVerse: 3 });
    assert.deepEqual(parts[3].sections[0].paragraphs, ['On the title.']);
  });

  test('corrections must each match exactly once', () => {
    assert.deepEqual(applyCorrections(['HAT the book of Daniel'], [['HAT the book', 'That the book']]), ['That the book of Daniel']);
    assert.throws(() => applyCorrections(['a', 'a'], [['a', 'b']]), /occurs 2 times/);
  });
});

describe('commentary text repairs (commentary-runs.mjs)', () => {
  test('references in running text become links; consecutive verses one range', () => {
    assert.deepEqual(linkRefs('as (Eze. 14:19, 20) and Ps, 112: 8.', lastVerse), ['as (', { r: 'EZK 14:19-20', x: 'Eze. 14:19, 20' }, ') and ', { r: 'PSA 112:8', x: 'Ps, 112: 8' }, '.']);
    assert.equal(mergeRefs(['MAT 9:1', 'MAT 9:3'], lastVerse), 'MAT 9:1');
  });

  test('spacing, quotation marks and era abbreviations', () => {
    assert.equal(tidyOcrText('termed“ The Apocalypse,” in Daniel’ s time, B. 0. 606 and a. pv. 508 ( John 1:1 ) .'), 'termed “The Apocalypse,” in Daniel’s time, B. C. 606 and A. D. 508 (John 1:1).');
  });

  test('side headings', () => {
    assert.deepEqual(sideHeading('The First Message.— Another scene')?.[0], { b: 'The First Message.' });
    assert.deepEqual(sideHeading('Church and State— This prophecy')?.[0], { b: 'Church and State' });
    assert.equal(sideHeading('Rome— Pagan Rome was'), null);
  });

  test('broken words and noise runs mended; real words left alone', () => {
    const words = new Set(['the', 'disciples', 'disruption', 'glaring', 'appearing', 'deny', 'verse', 'how', 'well', 'known', 'portion', 'a', 'he', 'goat']);
    const isWord = (word) => words.has(word);
    assert.equal(mendOcr('his dis-- disciples, final dis disruption, so glar-ing, at his appear ing', isWord), 'his disciples, final disruption, so glaring, at his appearing');
    assert.equal(mendOcr('a portion deny Ve H 77 Oy ob ack se Verse 42.', isWord), 'a portion deny Verse 42.');
    assert.equal(mendOcr('the well- known he-goat; i.e. 7. e., this', isWord), 'the well-known he-goat; i.e. i. e., this');
  });

  test('Smith’s paragraphs as blocks: poems, footnotes, side headings', () => {
    const blocks = smithBlocks(['Church and State— This prophecy (Rev. 17:3).', 'High on a throne,', 'Lord of the East,', 'The king feasteth.', `${NOTE_MARK}1 A footnote.`], lastVerse);
    assert.deepEqual(blocks, [
      { t: 'p', c: [{ b: 'Church and State' }, ' This prophecy (', { r: 'REV 17:3', x: 'Rev. 17:3' }, ').'] },
      { t: 'q', lines: [['High on a throne,'], ['Lord of the East,'], ['The king feasteth.']] },
      { t: 'n', c: ['A footnote.'] },
    ]);
  });

  test('a poem marked in the sources is one quotation, a stanza per paragraph', () => {
    const marked = markPoems(['As Arnold writes:', 'Not by one portal, or one path alone, God’s messages are known;', 'And storms beneath herald his love.', 'A robe of purple round a form of clay.', 'So ends the chapter.'], [{ from: 'Not by one portal', to: 'form of clay.' }]);
    assert.deepEqual(smithBlocks(marked, lastVerse).map((block) => block.t), ['p', 'q', 'p']);
    assert.equal(smithBlocks(marked, lastVerse)[1].lines.length, 3);
    assert.throws(() => markPoems(['text'], [{ from: 'missing', to: 'x' }]), /not found/);
  });
});
