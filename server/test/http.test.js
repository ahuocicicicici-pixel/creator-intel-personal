import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const apiKey = 'test-personal-api-key-0123456789abcdef';
process.env.NODE_ENV = 'test';
process.env.PERSONAL_API_KEY = apiKey;
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123456789';
process.env.OWNER_EMAIL = 'ahuocicicicici@gmail.com';

const fixtureDirectory = await mkdtemp(join(tmpdir(), 'creator-intel-http-'));
process.env.SNAPSHOT_PATH = join(fixtureDirectory, 'snapshot.json');
process.env.REVIEWS_PATH = join(fixtureDirectory, 'reviews.json');
await writeFile(process.env.SNAPSHOT_PATH, JSON.stringify({
  schemaVersion: 2,
  records: {
    'IG:creator': {
      platform: 'IG',
      handle: 'creator',
      followers: '10K',
      private: {
        price: { externalQuote: '$500' },
        collaboration: { count: 2 },
      },
    },
  },
}));

const [{ createApp }, { authInternals }, { loadLibrary }, { loadReviews }] = await Promise.all([
  import('../src/index.js'),
  import('../src/auth.js'),
  import('../src/library.js'),
  import('../src/reviews.js'),
]);

let server;
let baseUrl;

function session(email, sub) {
  return authInternals.signed({
    kind: 'session',
    sub,
    email,
    exp: Math.floor(Date.now() / 1000) + 60,
  });
}

async function lookup(headers) {
  const response = await fetch(`${baseUrl}/creator-intel-api/api/lookup?platform=IG&handle=creator`, { headers });
  return { response, body: await response.json() };
}

before(async () => {
  await Promise.all([loadLibrary(), loadReviews()]);
  server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await rm(fixtureDirectory, { recursive: true, force: true });
});

test('legacy API key can access only public creator fields', async () => {
  const { response, body } = await lookup({ 'x-api-key': apiKey });
  assert.equal(response.status, 200);
  assert.equal(body.access, 'public');
  assert.equal(body.record.followers, '10K');
  assert.equal('private' in body.record, false);
});

test('ordinary Google session can access only public creator fields', async () => {
  const token = session('viewer@example.com', 'viewer-sub');
  const { response, body } = await lookup({ authorization: `Bearer ${token}` });
  assert.equal(response.status, 200);
  assert.equal(body.access, 'public');
  assert.equal('private' in body.record, false);
});

test('only the owner Google session receives price and collaboration fields', async () => {
  const token = session('ahuocicicicici@gmail.com', 'owner-sub');
  const { response, body } = await lookup({ authorization: `Bearer ${token}` });
  assert.equal(response.status, 200);
  assert.equal(body.access, 'owner');
  assert.deepEqual(body.record.private, {
    price: { externalQuote: '$500' },
    collaboration: { count: 2 },
  });
});

test('signed-in users can create reviews while only the author or owner can delete them', async () => {
  const authorToken = session('author@example.com', 'author-sub');
  const otherToken = session('other@example.com', 'other-sub');
  const ownerToken = session('ahuocicicicici@gmail.com', 'owner-sub');
  const created = await fetch(`${baseUrl}/creator-intel-api/api/reviews`, {
    method: 'POST',
    headers: { authorization: `Bearer ${authorToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'IG', handle: 'creator', rating: '推荐', body: '合作沟通顺畅' }),
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201);
  assert.equal(createdBody.review.author, 'author@example.com');

  const context = await fetch(`${baseUrl}/creator-intel-api/api/context?platform=IG&handle=creator`, {
    headers: { authorization: `Bearer ${authorToken}` },
  });
  const contextBody = await context.json();
  assert.equal(contextBody.reviews.length, 1);
  assert.equal(contextBody.reviews[0].canDelete, true);
  assert.equal('email' in contextBody.reviews[0], false);

  const forbidden = await fetch(`${baseUrl}/creator-intel-api/api/reviews/${createdBody.review.id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${otherToken}` },
  });
  assert.equal(forbidden.status, 403);

  const removed = await fetch(`${baseUrl}/creator-intel-api/api/reviews/${createdBody.review.id}`, {
    method: 'DELETE', headers: { authorization: `Bearer ${ownerToken}` },
  });
  assert.equal(removed.status, 200);
});

test('context exposes reviews but keeps private library fields owner-only', async () => {
  const token = session('viewer@example.com', 'viewer-sub');
  const response = await fetch(`${baseUrl}/creator-intel-api/api/context?platform=IG&handle=creator`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.found, true);
  assert.equal(body.access, 'public');
  assert.equal('private' in body.record, false);
  assert.ok(Array.isArray(body.reviews));
});

test('public privacy page discloses resumable background audience jobs', async () => {
  const response = await fetch(`${baseUrl}/creator-intel-api/privacy`);
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /continue in the extension background/);
  assert.match(body, /Chrome alarms are used only to resume/);
  assert.match(body, /reserved TikHub request count/);
});
