import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteToPlainText, parseInline, parseNote, serializeNote } from '../js/study/richtext.js';

const runs = (line) => parseInline(line).map((r) => `${r.bold ? 'B' : ''}${r.italic ? 'I' : ''}${r.href ? 'L' : ''}[${r.text}]`).join('');

test('inline markup: bold, italic, escapes, unpaired markers', () => {
  assert.equal(runs('plain'), '[plain]');
  assert.equal(runs('a **bold** and *italic* word'), '[a ]B[bold][ and ]I[italic][ word]');
  assert.equal(runs('***both***'), 'BI[both]');
  assert.equal(runs('2 \\* 3 = 6'), '[2 * 3 = 6]');
  assert.equal(runs('2 * 3 = 6'), '[2 * 3 = 6]', 'an unpaired * is literal');
  assert.equal(runs('**unclosed'), '[**unclosed]');
  assert.equal(runs('see https://example.org/a?b=1.'), '[see ]L[https://example.org/a?b=1][.]');
  assert.equal(runs('javascript:alert(1)'), '[javascript:alert(1)]', 'only http(s) links');
});

test('blocks: paragraphs and bullet lists', () => {
  assert.deepEqual(
    parseNote('Intro\n- one\n- **two**\n\nEnd').map((b) => b.type),
    ['p', 'ul', 'p', 'p'],
  );
  assert.equal(parseNote('- one\n- two')[0].items.length, 2);
  assert.deepEqual(parseNote('\n\n  \n'), [], 'blank lines at the ends are dropped');
  assert.equal(parseNote('a\n\nb').length, 3, 'a blank line inside is kept');
});

test('round trip: what is written is read back the same', () => {
  for (const text of [
    'Plain line',
    'A **bold** and *italic* and ***both*** line',
    'Stars: 2 \\* 3 and a backslash \\\\ here',
    'Intro\n- first point\n- second **point**\n\nAfter the list',
    '\\- not a bullet',
  ]) {
    assert.equal(serializeNote(parseNote(text)), text, text);
  }
  assert.equal(noteToPlainText('A **bold** start\n- item *one*'), 'A bold start\nitem one');
});
