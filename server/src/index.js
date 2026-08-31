import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { getLibraryStatus, loadLibrary, lookup } from './library.js';

const PORT = Number(process.env.PORT || 8080);
const API_KEY = String(process.env.PERSONAL_API_KEY || '');
const PUBLIC_BASE_PATH = String(process.env.PUBLIC_BASE_PATH || '/creator-intel-api').replace(/\/$/, '');
const RATE_LIMIT_PER_MINUTE = Math.max(10, Number(process.env.RATE_LIMIT_PER_MINUTE || 120));
const attempts = new Map();

if (API_KEY.length < 32) {
  throw new Error('PERSONAL_API_KEY must contain at least 32 characters');
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'x-api-key, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  const provided = String(request.headers['x-api-key'] || '');
  const expectedDigest = createHmac('sha256', 'creator-intel-personal').update(API_KEY).digest();
  const providedDigest = createHmac('sha256', 'creator-intel-personal').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function clientAddress(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimited(request) {
  const key = clientAddress(request);
  const minute = Math.floor(Date.now() / 60_000);
  const current = attempts.get(key);
  if (!current || current.minute !== minute) {
    attempts.set(key, { minute, count: 1 });
    if (attempts.size > 10_000) attempts.delete(attempts.keys().next().value);
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_PER_MINUTE;
}

function routePath(pathname) {
  return pathname.startsWith(PUBLIC_BASE_PATH) ? pathname.slice(PUBLIC_BASE_PATH.length) || '/' : pathname;
}

export function createApp() {
  return createServer((request, response) => {
    if (request.method === 'OPTIONS') return json(response, 204, {});
    if (request.method !== 'GET') return json(response, 405, { error: 'method_not_allowed' });
    const url = new URL(request.url, 'http://localhost');
    const pathname = routePath(url.pathname);

    if (pathname === '/health') return json(response, 200, { ok: true, ...getLibraryStatus() });
    if (pathname === '/privacy') {
      return json(response, 200, {
        service: 'Creator Intel Personal',
        data: 'Public creator profile identifiers and public performance metrics only.',
        excluded: 'Company campaigns, clients, quotes, contacts, reviews, blacklists, accounts and audit logs.',
      });
    }
    if (pathname !== '/api/lookup') return json(response, 404, { error: 'not_found' });
    if (rateLimited(request)) return json(response, 429, { error: 'rate_limited' });
    if (!authorized(request)) return json(response, 401, { error: 'invalid_api_key' });

    const record = lookup(url.searchParams.get('platform'), url.searchParams.get('handle'));
    if (!record) return json(response, 404, { found: false });
    return json(response, 200, { found: true, record, source: 'personal_library' });
  });
}

if (process.env.NODE_ENV !== 'test') {
  await loadLibrary();
  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`Creator Intel Personal listening on ${PORT}; ${getLibraryStatus().count} records loaded`);
  });
}
