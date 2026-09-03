import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
const directory = await mkdtemp(join(tmpdir(), 'creator-intel-reviews-'));
process.env.REVIEWS_PATH = join(directory, 'reviews.json');

const { addReview, deleteReview, listReviews, loadReviews } = await import('../src/reviews.js');
const author = { email: 'author@example.com', name: 'Author', isOwner: false };
const owner = { email: 'owner@example.com', name: 'Owner', isOwner: true };

before(() => loadReviews());
after(() => rm(directory, { recursive: true, force: true }));

test('review persistence stores private author email but never exposes it in list output', async () => {
  const created = await addReview({ platform: 'IG', handle: '@Creator', rating: '推荐', body: '  很专业  ', session: author });
  assert.equal(created.body, '很专业');
  assert.equal(created.canDelete, true);
  assert.equal('email' in created, false);

  const listed = listReviews('ig', 'creator', { email: 'viewer@example.com', isOwner: false });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].canDelete, false);
  assert.equal('email' in listed[0], false);

  const persisted = JSON.parse(await readFile(process.env.REVIEWS_PATH, 'utf8'));
  assert.equal(persisted.records[0].email, author.email);
});

test('owner can remove any review', async () => {
  const [review] = listReviews('IG', 'creator', owner);
  await deleteReview(review.id, owner);
  assert.equal(listReviews('IG', 'creator', owner).length, 0);
});
