import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeScope, readSearchParams, searchHref } from '../js/search/params.js';

test('search URLs leave out defaults and round-trip', () => {
  assert.equal(searchHref({}), '#/search');
  assert.equal(searchHref({ q: 'in the beginning', t: 'kjv' }), '#/search?q=in+the+beginning&t=kjv');
  assert.equal(searchHref({ q: 'faith', t: 'all', in: 'NT', match: 'any' }), '#/search?q=faith&t=all&in=NT&match=any');
  const params = Object.fromEntries(new URLSearchParams('q=%22in+the+beginning%22&t=web&in=GEN&match=phrase'));
  assert.deepEqual(readSearchParams(params, ['kjv', 'web']), { q: '"in the beginning"', t: 'web', in: 'GEN', match: 'phrase' });
});

test('unknown values fall back to defaults', () => {
  assert.deepEqual(readSearchParams({ q: '  x ', t: 'niv', in: 'nowhere', match: 'fuzzy' }, ['kjv']), { q: 'x', t: null, in: 'all', match: 'all' });
  assert.equal(readSearchParams({ t: 'all' }, ['kjv']).t, 'all');
  assert.equal(normalizeScope('rom'), 'ROM');
  assert.equal(normalizeScope('OT'), 'OT');
});
