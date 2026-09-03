import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const REVIEWS_PATH = resolve(process.env.REVIEWS_PATH || './data/reviews/reviews.json');
const RATINGS = new Set(['推荐', '谨慎', '拉黑']);
const MAX_BODY = 600;

let records = [];
let writeQueue = Promise.resolve();

function cleanPlatform(value) {
  const platform = String(value || '').trim().toUpperCase();
  return ['IG', 'TT', 'YT', 'X'].includes(platform) ? platform : null;
}

function cleanHandle(value) {
  const handle = String(value || '').trim().replace(/^@/, '').toLowerCase();
  return handle && handle.length <= 150 && !/[\s/:?#\\\u0000-\u001f]/u.test(handle) ? handle : null;
}

function publicReview(record, session) {
  return {
    id: record.id,
    author: record.author,
    rating: record.rating,
    body: record.body,
    createdAt: record.createdAt,
    canDelete: Boolean(session && (session.isOwner || session.email === record.email)),
  };
}

async function persist() {
  const directory = dirname(REVIEWS_PATH);
  await mkdir(directory, { recursive: true });
  const temporary = `${REVIEWS_PATH}.tmp`;
  await writeFile(temporary, JSON.stringify({ schemaVersion: 1, records }, null, 2), { mode: 0o600 });
  await rename(temporary, REVIEWS_PATH);
}

function schedulePersist() {
  writeQueue = writeQueue.then(persist, persist);
  return writeQueue;
}

export async function loadReviews() {
  try {
    const parsed = JSON.parse(await readFile(REVIEWS_PATH, 'utf8'));
    records = Array.isArray(parsed.records) ? parsed.records.filter((record) => record && record.id) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    records = [];
  }
  return { count: records.length };
}

export function listReviews(platformValue, handleValue, session) {
  const platform = cleanPlatform(platformValue);
  const handle = cleanHandle(handleValue);
  if (!platform || !handle) return [];
  return records
    .filter((record) => record.platform === platform && record.handle === handle)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((record) => publicReview(record, session));
}

export async function addReview({ platform: platformValue, handle: handleValue, rating: ratingValue, body: bodyValue, session }) {
  if (!session?.email) throw Object.assign(new Error('login_required'), { statusCode: 401 });
  const platform = cleanPlatform(platformValue);
  const handle = cleanHandle(handleValue);
  const body = String(bodyValue || '').trim();
  const rating = String(ratingValue || '').trim();
  if (!platform || !handle) throw Object.assign(new Error('invalid_creator'), { statusCode: 400 });
  if (!body) throw Object.assign(new Error('评价内容不能为空'), { statusCode: 400 });
  if (body.length > MAX_BODY) throw Object.assign(new Error(`评价不能超过 ${MAX_BODY} 字`), { statusCode: 400 });
  if (rating && !RATINGS.has(rating)) throw Object.assign(new Error('评价标签无效'), { statusCode: 400 });
  const record = {
    id: randomUUID(),
    platform,
    handle,
    email: session.email,
    author: String(session.name || session.email.split('@')[0]).slice(0, 80),
    rating: rating || null,
    body,
    createdAt: new Date().toISOString(),
  };
  records.push(record);
  await schedulePersist();
  return publicReview(record, session);
}

export async function deleteReview(idValue, session) {
  if (!session?.email) throw Object.assign(new Error('login_required'), { statusCode: 401 });
  const id = String(idValue || '');
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) throw Object.assign(new Error('评价不存在'), { statusCode: 404 });
  const record = records[index];
  if (!session.isOwner && session.email !== record.email) throw Object.assign(new Error('只能删除自己的评价'), { statusCode: 403 });
  records.splice(index, 1);
  await schedulePersist();
  return { ok: true };
}

export const reviewInternals = { cleanPlatform, cleanHandle, publicReview };
