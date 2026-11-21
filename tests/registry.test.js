import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkManifest } from '../js/providers/registry.js';

const entry = (id, extra = {}) => ({
  id,
  abbreviation: id.toUpperCase(),
  name: id,
  language: 'en',
  provider: 'json',
  license: 'Public domain',
  url: `data/${id}.json`,
  ...extra,
});

test('valid entries pass through in order, with defaults filled in', () => {
  const result = checkManifest({ default: 'asv', translations: [entry('kjv'), entry('asv')] });
  assert.equal(result.default, 'asv');
  assert.deepEqual(
    result.translations.map((t) => t.id),
    ['kjv', 'asv'],
  );
  assert.equal(result.translations[0].direction, 'ltr');
});

test('bad entries are skipped (with a warning), not fatal', (t) => {
  const warn = t.mock.method(console, 'warn', () => {});
  const result = checkManifest({
    default: 'gone',
    translations: [entry('kjv'), entry('Bad Id'), entry('api', { provider: 'api-bible' }), entry('kjv'), { id: 'x' }],
  });
  assert.deepEqual(
    result.translations.map((t) => t.id),
    ['kjv'],
  );
  assert.equal(result.default, 'kjv', 'falls back to the first usable translation');
  assert.equal(warn.mock.callCount(), 4);
});

test('a manifest with nothing usable is an error', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.throws(() => checkManifest({ translations: [] }), /no usable translations/);
  assert.throws(() => checkManifest({}), /"translations" list/);
});

test('an extra provider type is accepted once registered', () => {
  const factories = { json: () => {}, 'api-bible': () => {} };
  const result = checkManifest({ translations: [entry('niv', { provider: 'api-bible' })] }, factories);
  assert.equal(result.translations[0].id, 'niv');
});
