import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeHandle, normalizePlatform } from '../src/library.js';

test('normalizes supported platforms and handles', () => {
  assert.equal(normalizePlatform('ig'), 'IG');
  assert.equal(normalizePlatform('facebook'), null);
  assert.equal(normalizeHandle('@Creator.Name'), 'creator.name');
  assert.equal(normalizeHandle('../secret'), null);
});
