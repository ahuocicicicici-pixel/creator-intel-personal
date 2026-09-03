import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789';
process.env.OWNER_EMAIL = 'ahuocicicicici@gmail.com';

const { authInternals, verifySession } = await import('../src/auth.js');

test('accepts only the published Chrome extension OAuth redirect URL', () => {
  assert.equal(
    authInternals.safeExtensionRedirect('https://ogmmgjpedgjhhdpmmjiadgphenmineaa.chromiumapp.org/oauth2'),
    'https://ogmmgjpedgjhhdpmmjiadgphenmineaa.chromiumapp.org/oauth2',
  );
  assert.equal(authInternals.safeExtensionRedirect('https://example.com/oauth2'), null);
  assert.equal(authInternals.safeExtensionRedirect('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/oauth2'), null);
  assert.equal(authInternals.safeExtensionRedirect('https://ogmmgjpedgjhhdpmmjiadgphenmineaa.chromiumapp.org/other'), null);
});

test('derives owner access from the signed verified email', () => {
  const now = Math.floor(Date.now() / 1000);
  const ownerToken = authInternals.signed({
    kind: 'session', sub: 'owner-sub', email: 'ahuocicicicici@gmail.com', exp: now + 60,
  });
  const publicToken = authInternals.signed({
    kind: 'session', sub: 'public-sub', email: 'someone@example.com', exp: now + 60,
  });
  assert.equal(verifySession(ownerToken).isOwner, true);
  assert.equal(verifySession(publicToken).isOwner, false);
});

test('rejects tampered sessions', () => {
  const now = Math.floor(Date.now() / 1000);
  const token = authInternals.signed({ kind: 'session', sub: 'x', email: 'someone@example.com', exp: now + 60 });
  assert.equal(verifySession(`${token}x`), null);
});
