import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ALLOWED_PLATFORMS = new Set(['IG', 'TT', 'YT', 'X']);
const SNAPSHOT_PATH = resolve(process.env.SNAPSHOT_PATH || './data/snapshot.json');

let records = new Map();
let exportedAt = null;

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
      platform,
      handle,
      profileUrl: typeof record.profileUrl === 'string' ? record.profileUrl : null,
      followers: record.followers ?? null,
      avgViews: record.avgViews ?? null,
    }));
  }
  records = next;
  exportedAt = parsed.exportedAt || null;
  return getLibraryStatus();
}

export function lookup(platformValue, handleValue) {
  const platform = normalizePlatform(platformValue);
  const handle = normalizeHandle(handleValue);
  if (!platform || !handle) return null;
  return records.get(`${platform}:${handle}`) || null;
}

export function getLibraryStatus() {
  return { count: records.size, exportedAt };
}
