import assert from 'node:assert/strict';
import { test } from 'node:test';
import { libraryInternals, normalizeHandle, normalizePlatform } from '../src/library.js';

test('normalizes supported platforms and handles', () => {
  assert.equal(normalizePlatform('ig'), 'IG');
  assert.equal(normalizePlatform('facebook'), null);
  assert.equal(normalizeHandle('@Creator.Name'), 'creator.name');
  assert.equal(normalizeHandle('../secret'), null);
});

test('owner-only fields are omitted unless explicitly authorized', () => {
  const stored = {
    public: { platform: 'IG', handle: 'creator', followers: '10K' },
    private: { price: { externalQuote: '$500' }, collaboration: { count: 2 } },
  };
  assert.deepEqual(libraryInternals.recordForAccess(stored, false), stored.public);
  assert.deepEqual(libraryInternals.recordForAccess(stored, true), { ...stored.public, private: stored.private });
});
