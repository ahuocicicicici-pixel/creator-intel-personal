import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ALLOWED_PLATFORMS = new Set(['IG', 'TT', 'YT', 'X']);
const SNAPSHOT_PATH = resolve(process.env.SNAPSHOT_PATH || './data/snapshot.json');

let records = new Map();
let exportedAt = null;

function publicRecord(record, platform, handle) {
  return {
    platform,
    handle,
    profileUrl: typeof record.profileUrl === 'string' ? record.profileUrl : null,
    followers: record.followers ?? null,
    avgViews: record.avgViews ?? null,
  };
}

function ownerRecord(record) {
  const value = record.private;
  if (!value || typeof value !== 'object') return null;
  return {
    price: value.price && typeof value.price === 'object' ? value.price : null,
    collaboration: value.collaboration && typeof value.collaboration === 'object' ? value.collaboration : null,
  };
}

function recordForAccess(record, includePrivate) {
  return includePrivate && record.private
    ? { ...record.public, private: record.private }
    : { ...record.public };
}

export function normalizePlatform(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ALLOWED_PLATFORMS.has(normalized) ? normalized : null;
}

export function normalizeHandle(value) {
  const normalized = String(value || '').trim().replace(/^@/, '').toLowerCase();
  if (!normalized || normalized.length > 150 || /[\s/:?#\\\u0000-\u001f]/u.test(normalized)) return null;
  return normalized;
}

export async function loadLibrary() {
  const raw = await readFile(SNAPSHOT_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  const next = new Map();
  for (const [key, record] of Object.entries(parsed.records || {})) {
    if (!record || typeof record !== 'object') continue;
    const platform = normalizePlatform(record.platform);
    const handle = normalizeHandle(record.handle);
    if (!platform || !handle || key !== `${platform}:${handle}`) continue;
    next.set(key, Object.freeze({
      public: Object.freeze(publicRecord(record, platform, handle)),
      private: ownerRecord(record),
    }));
  }
  records = next;
  exportedAt = parsed.exportedAt || null;
  return getLibraryStatus();
}

export function lookup(platformValue, handleValue, { includePrivate = false } = {}) {
  const platform = normalizePlatform(platformValue);
  const handle = normalizeHandle(handleValue);
  if (!platform || !handle) return null;
  const record = records.get(`${platform}:${handle}`);
  if (!record) return null;
  return recordForAccess(record, includePrivate);
}

export function getLibraryStatus() {
  return { count: records.size, exportedAt };
}

export const libraryInternals = { publicRecord, ownerRecord, recordForAccess };
