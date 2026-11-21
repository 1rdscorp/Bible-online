import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addColumn,
  MAX_COLUMNS,
  normalizePrefs,
  parseSelection,
  prefsWithSelection,
  removeColumn,
  replaceColumn,
  selectionFromPrefs,
  selectionQuery,
  startComparing,
  stopComparing,
} from '../js/translations.js';

const KNOWN = ['kjv', 'asv', 'web', 'ylt', 'darby', 'bbe'];

test('parseSelection keeps known ids, in order, without repeats, up to 4', () => {
  assert.deepEqual(parseSelection('kjv', KNOWN), ['kjv']);
  assert.deepEqual(parseSelection('ASV, web ,kjv', KNOWN), ['asv', 'web', 'kjv']);
  assert.deepEqual(parseSelection('kjv,kjv,nope,asv', KNOWN), ['kjv', 'asv']);
  assert.deepEqual(parseSelection('kjv,asv,web,ylt,darby,bbe', KNOWN), ['kjv', 'asv', 'web', 'ylt']);
  assert.equal(MAX_COLUMNS, 4);
  assert.deepEqual(parseSelection('', KNOWN), []);
  assert.deepEqual(parseSelection(undefined, KNOWN), []);
  assert.deepEqual(parseSelection('niv', KNOWN), []);
});

test('selectionQuery builds the ?t= value', () => {
  assert.equal(selectionQuery(['kjv']), 't=kjv');
  assert.equal(selectionQuery(['kjv', 'asv']), 't=kjv,asv');
});

test('normalizePrefs repairs missing or stale preferences', () => {
  assert.deepEqual(normalizePrefs(null, KNOWN, 'kjv'), { single: 'kjv', parallel: [], mode: 'single' });
  assert.deepEqual(normalizePrefs({ single: 'gone', parallel: ['asv', 'gone', 'web'], mode: 'parallel' }, KNOWN, 'kjv'), {
    single: 'kjv',
    parallel: ['asv', 'web'],
    mode: 'parallel',
  });
  // parallel mode needs at least two columns
  assert.equal(normalizePrefs({ single: 'asv', parallel: ['web'], mode: 'parallel' }, KNOWN, 'kjv').mode, 'single');
});

test('preferences follow what is on screen', () => {
  let prefs = normalizePrefs(null, KNOWN, 'kjv');
  prefs = prefsWithSelection(prefs, ['asv']);
  assert.deepEqual(selectionFromPrefs(prefs), ['asv']);
  prefs = prefsWithSelection(prefs, ['asv', 'web', 'ylt']);
  assert.deepEqual(selectionFromPrefs(prefs), ['asv', 'web', 'ylt']);
  prefs = prefsWithSelection(prefs, ['bbe']);
  assert.deepEqual(selectionFromPrefs(prefs), ['bbe']);
  assert.deepEqual(prefs.parallel, ['asv', 'web', 'ylt'], 'the last parallel set is remembered');
});

test('Compare on: current translation first, then last parallel set or the next translation', () => {
  const fresh = normalizePrefs(null, KNOWN, 'kjv');
  assert.deepEqual(startComparing(['kjv'], fresh, KNOWN), ['kjv', 'asv']);
  assert.deepEqual(startComparing(['asv'], fresh, KNOWN), ['asv', 'kjv']);
  const used = { ...fresh, parallel: ['kjv', 'web', 'ylt'] };
  assert.deepEqual(startComparing(['web'], used, KNOWN), ['web', 'kjv', 'ylt']);
  assert.deepEqual(startComparing(['bbe'], used, KNOWN), ['bbe', 'kjv', 'web', 'ylt']);
  assert.deepEqual(stopComparing(['web', 'kjv', 'ylt']), ['web']);
});

test('adding, removing and replacing columns respects 2–4 and no duplicates', () => {
  assert.deepEqual(addColumn(['kjv', 'asv'], KNOWN), ['kjv', 'asv', 'web']);
  assert.deepEqual(addColumn(['kjv', 'asv', 'web', 'ylt'], KNOWN), ['kjv', 'asv', 'web', 'ylt']);
  assert.deepEqual(removeColumn(['kjv', 'asv', 'web'], 1), ['kjv', 'web']);
  assert.deepEqual(removeColumn(['kjv', 'asv'], 0), ['kjv', 'asv'], 'never below two');
  assert.deepEqual(replaceColumn(['kjv', 'asv'], 1, 'web'), ['kjv', 'web']);
  assert.deepEqual(replaceColumn(['kjv', 'asv'], 1, 'kjv'), ['kjv', 'asv'], 'a translation can’t fill two columns');
  assert.deepEqual(replaceColumn(['kjv'], 0, 'asv'), ['asv']);
});
