import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import {
  authConfig,
  completeGoogleLogin,
  exchangeOneTimeCode,
  googleAuthorizationUrl,
  verifySession,
} from './auth.js';
import { getLibraryStatus, loadLibrary, lookup } from './library.js';
import { addReview, deleteReview, listReviews, loadReviews } from './reviews.js';

const PORT = Number(process.env.PORT || 8080);
const API_KEY = String(process.env.PERSONAL_API_KEY || '');
const PUBLIC_BASE_PATH = String(process.env.PUBLIC_BASE_PATH || '/creator-intel-api').replace(/\/$/, '');
const RATE_LIMIT_PER_MINUTE = Math.max(10, Number(process.env.RATE_LIMIT_PER_MINUTE || 120));
const attempts = new Map();

if (API_KEY.length < 32) throw new Error('PERSONAL_API_KEY must contain at least 32 characters');

function commonHeaders(contentType) {
  return {
    'content-type': contentType,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, x-api-key, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

function json(response, statusCode, body) {
  response.writeHead(statusCode, commonHeaders('application/json; charset=utf-8'));
  response.end(statusCode === 204 ? undefined : JSON.stringify(body));
}

function html(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...commonHeaders('text/html; charset=utf-8'),
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(302, { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
  response.end();
}

function legacyAuthorized(request) {
  const provided = String(request.headers['x-api-key'] || '');
  const expectedDigest = createHmac('sha256', 'creator-intel-personal').update(API_KEY).digest();
  const providedDigest = createHmac('sha256', 'creator-intel-personal').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function requestSession(request) {
  const authorization = String(request.headers.authorization || '');
  return verifySession(authorization.startsWith('Bearer ') ? authorization.slice(7) : '');
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

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('request_too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function privacyPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>COCO Creator Intel Privacy</title><style>body{max-width:760px;margin:48px auto;padding:0 22px;font:16px/1.65 system-ui;color:#24262b}h1,h2{line-height:1.2}code{background:#f2f3f5;padding:2px 5px;border-radius:4px}</style></head><body>
<h1>COCO Creator Intel Privacy Policy</h1>
<p>Last updated: September 3, 2026.</p>
<p>The extension reads public creator profile identifiers and public metrics already loaded on supported TikTok, Instagram, YouTube and X pages. It sends only the public platform and handle to the COCO Creator Intel service for an exact lookup and review retrieval.</p>
<h2>Google sign-in</h2>
<p>Any Google account may sign in. The service processes the verified Google subject identifier, email, display name and profile image to issue a session, attribute user-submitted reviews and enforce access. It requests only <code>openid</code>, <code>email</code> and <code>profile</code>; it does not request or read Gmail, Drive, Calendar, contacts or passwords.</p>
<h2>Creator reviews</h2>
<p>Signed-in users may voluntarily submit a rating label and review text for a creator. Reviews are stored by the COCO service with the author's verified email and display name. Other signed-in users see the display name, rating, review text and date, but not the author's email address. Authors may delete their own reviews; the service owner may remove any review for moderation.</p>
<h2>Private owner data</h2>
<p>Historical prices and past collaboration records are returned only when the verified email exactly matches the configured owner account. Other accounts receive public creator fields only. This check is enforced by the server.</p>
<h2>Local X velocity radar</h2>
<p>On X, the extension may locally calculate public-post average exposure velocity and a current-tab leaderboard from public views and timestamps already loaded by the page. It does not call the X API or upload post content, post metrics, velocity results or leaderboard data.</p>
<h2>Optional TikHub use</h2>
<p>A user may supply their own TikHub API key. It remains in local extension storage and is sent only to TikHub after the user requests enhanced public profile information or an Instagram audience-country analysis. Audience analysis requests recent public Reels, public liker identifiers/usernames and public account-location fields, then locally caches the aggregate analysis and a bounded identifier-to-country lookup cache so repeated analyses do not repay for the same public result. One analysis is capped at 313 TikHub requests.</p>
<p>After the user explicitly starts audience analysis, the bounded job may continue in the extension background after its Instagram tab is refreshed or closed. Chrome alarms are used only to resume that pending user-started job if the Manifest V3 service worker sleeps; they do not start periodic creator collection.</p>
<h2>Storage and deletion</h2>
<p>The extension stores its session, user preferences, optional TikHub key, up to 100 cached public profile/audience results and a bounded public country-result cache in Chrome local storage. While an audience job is pending, it also stores the requested public handle, start/update timestamps and reserved TikHub request count; these pending fields are removed when the job finishes or fails. The service stores voluntarily submitted creator reviews and the minimum account identity needed for authorship and moderation. Removing the extension or clearing its storage deletes local data; users may delete their own reviews or email the address below for a broader deletion request.</p>
<h2>Limited Use</h2>
<p>The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.</p>
<h2>Contact</h2>
<p><a href="mailto:ahuocicicicici@gmail.com">ahuocicicicici@gmail.com</a></p>
</body></html>`;
}

function supportPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>COCO Creator Intel Support</title><style>body{max-width:700px;margin:48px auto;padding:0 22px;font:16px/1.65 system-ui;color:#24262b}h1{line-height:1.2}</style></head><body><h1>COCO Creator Intel Support</h1><p>For sign-in, privacy, data deletion or extension support, email <a href="mailto:ahuocicicicici@gmail.com">ahuocicicicici@gmail.com</a>.</p></body></html>`;
}

function termsPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>COCO Creator Intel Terms</title><style>body{max-width:760px;margin:48px auto;padding:0 22px;font:16px/1.65 system-ui;color:#24262b}h1,h2{line-height:1.2}</style></head><body><h1>COCO Creator Intel Terms of Service</h1><p>Last updated: August 31, 2026.</p><p>COCO Creator Intel is a creator-research assistant that summarizes public information from supported social-media pages and an access-controlled personal creator library.</p><h2>Acceptable use</h2><p>Users must comply with applicable law and the terms of the supported websites and third-party APIs. The extension must not be used for harassment, unlawful surveillance, credential sharing or unauthorized bulk extraction.</p><h2>Data accuracy</h2><p>Creator metrics and historical records may be incomplete or outdated and are provided for research assistance only. Users should verify material decisions against current primary sources.</p><h2>Third-party services</h2><p>Google sign-in and optional TikHub requests are governed by their respective terms. TikHub usage may incur charges under the user's own account.</p><h2>Contact</h2><p><a href="mailto:ahuocicicici@gmail.com">ahuocicicicici@gmail.com</a></p></body></html>`;
}

async function handle(request, response) {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  const url = new URL(request.url, 'http://localhost');
  const pathname = routePath(url.pathname);

  if (request.method === 'GET' && pathname === '/health') {
    return json(response, 200, { ok: true, ...getLibraryStatus(), googleAuth: authConfig().enabled });
  }
  if (request.method === 'GET' && pathname === '/privacy') return html(response, 200, privacyPage());
  if (request.method === 'GET' && pathname === '/support') return html(response, 200, supportPage());
  if (request.method === 'GET' && pathname === '/terms') return html(response, 200, termsPage());
  if (request.method === 'GET' && pathname === '/api/auth/config') return json(response, 200, authConfig());

  if (request.method === 'GET' && pathname === '/auth/google/start') {
    try {
      return redirect(response, googleAuthorizationUrl(url.searchParams.get('redirect')));
    } catch (error) {
      return json(response, error.message === 'google_auth_not_configured' ? 503 : 400, { error: error.message });
    }
  }
  if (request.method === 'GET' && pathname === '/auth/google/callback') {
    if (url.searchParams.get('error')) return json(response, 401, { error: 'google_login_cancelled' });
    try {
      const location = await completeGoogleLogin({
        code: url.searchParams.get('code'),
        state: url.searchParams.get('state'),
      });
      return redirect(response, location);
    } catch (error) {
      return json(response, 401, { error: error.message });
    }
  }
  if (request.method === 'POST' && pathname === '/api/auth/exchange') {
    const body = await readJson(request);
    const session = exchangeOneTimeCode(body.code);
    return session ? json(response, 200, session) : json(response, 401, { error: 'login_code_invalid' });
  }
  if (request.method === 'GET' && pathname === '/api/session') {
    const session = requestSession(request);
    return session ? json(response, 200, { user: session }) : json(response, 401, { error: 'login_required' });
  }

  if (rateLimited(request)) return json(response, 429, { error: 'rate_limited' });
  const session = requestSession(request);

  if (request.method === 'GET' && pathname === '/api/context') {
    if (!session) return json(response, 401, { error: 'login_required' });
    const platform = url.searchParams.get('platform');
    const handle = url.searchParams.get('handle');
    const record = lookup(platform, handle, { includePrivate: Boolean(session.isOwner) });
    return json(response, 200, {
      found: Boolean(record),
      ...(record ? { record, source: 'personal_library' } : {}),
      access: session.isOwner ? 'owner' : 'public',
      reviews: listReviews(platform, handle, session),
    });
  }

  if (request.method === 'POST' && pathname === '/api/reviews') {
    if (!session) return json(response, 401, { error: 'login_required' });
    try {
      const review = await addReview({ ...(await readJson(request)), session });
      return json(response, 201, { ok: true, review });
    } catch (error) {
      return json(response, error.statusCode || 400, { ok: false, error: error.message });
    }
  }

  const deleteMatch = pathname.match(/^\/api\/reviews\/([0-9a-f-]{36})$/i);
  if (request.method === 'DELETE' && deleteMatch) {
    if (!session) return json(response, 401, { error: 'login_required' });
    try {
      await deleteReview(deleteMatch[1], session);
      return json(response, 200, { ok: true });
    } catch (error) {
      return json(response, error.statusCode || 400, { ok: false, error: error.message });
    }
  }

  if (request.method === 'GET' && pathname === '/api/lookup') {
    if (!session && !legacyAuthorized(request)) return json(response, 401, { error: 'login_required' });
    const record = lookup(url.searchParams.get('platform'), url.searchParams.get('handle'), {
      includePrivate: Boolean(session?.isOwner),
    });
    if (!record) return json(response, 404, { found: false });
    return json(response, 200, {
      found: true,
      record,
      source: 'personal_library',
      access: session?.isOwner ? 'owner' : 'public',
    });
  }

  return json(response, 404, { error: 'not_found' });
}

export function createApp() {
  return createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error('request failed', error);
      if (!response.headersSent) json(response, 500, { error: 'internal_error' });
      else response.end();
    });
  });
}

if (process.env.NODE_ENV !== 'test') {
  await Promise.all([loadLibrary(), loadReviews()]);
  createApp().listen(PORT, '0.0.0.0', () => {
    console.log(`COCO Creator Intel listening on ${PORT}; ${getLibraryStatus().count} records loaded`);
  });
}
