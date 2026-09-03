import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '');
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '');
const GOOGLE_REDIRECT_URI = String(process.env.GOOGLE_REDIRECT_URI || 'https://mccoco.xyz/creator-intel-api/auth/google/callback');
const SESSION_SECRET = String(process.env.SESSION_SECRET || '');
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || 'ahuocicicicici@gmail.com').trim().toLowerCase();
const SESSION_TTL_SECONDS = Math.max(3600, Number(process.env.SESSION_TTL_SECONDS || 30 * 24 * 3600));
const ALLOWED_EXTENSION_IDS = new Set(
  String(process.env.ALLOWED_EXTENSION_IDS || 'ogmmgjpedgjhhdpmmjiadgphenmineaa')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^[a-p]{32}$/.test(value)),
);
const pendingCodes = new Map();

export function authEnabled() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && SESSION_SECRET.length >= 32);
}

export function authConfig() {
  return { enabled: authEnabled(), ownerFeatures: true };
}

function signature(value) {
  return createHmac('sha256', SESSION_SECRET).update(value).digest();
}

function signed(payload) {
  if (SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(body).toString('base64url')}`;
}

function verified(token, kind) {
  const [body, encodedSignature, extra] = String(token || '').split('.');
  if (!body || !encodedSignature || extra) return null;
  let provided;
  try { provided = Buffer.from(encodedSignature, 'base64url'); } catch { return null; }
  const expected = signature(body);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.kind !== kind || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeExtensionRedirect(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !/^[a-p]{32}\.chromiumapp\.org$/i.test(url.hostname)) return null;
    const extensionId = url.hostname.slice(0, 32).toLowerCase();
    if (!ALLOWED_EXTENSION_IDS.has(extensionId)) return null;
    if (url.pathname !== '/oauth2' && url.pathname !== '/oauth2/') return null;
    return url.href;
  } catch {
    return null;
  }
}

export function googleAuthorizationUrl(extensionRedirect) {
  if (!authEnabled()) throw new Error('google_auth_not_configured');
  const redirect = safeExtensionRedirect(extensionRedirect);
  if (!redirect) throw new Error('invalid_extension_redirect');
  const nonce = randomBytes(20).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const state = signed({ kind: 'oauth_state', redirect, nonce, exp: now + 600 });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
    nonce,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenProfile(code, nonce) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || ''),
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokens = await response.json().catch(() => null);
  if (!response.ok || !tokens?.id_token) throw new Error('google_token_exchange_failed');

  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const info = await infoResponse.json().catch(() => null);
  if (!infoResponse.ok || !info) throw new Error('google_token_verification_failed');
  if (info.aud !== GOOGLE_CLIENT_ID || info.nonce !== nonce || info.email_verified !== 'true') {
    throw new Error('google_identity_invalid');
  }
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) throw new Error('google_issuer_invalid');
  return {
    sub: String(info.sub || ''),
    email: String(info.email || '').trim().toLowerCase(),
    name: String(info.name || info.email || ''),
    picture: String(info.picture || ''),
  };
}

export async function completeGoogleLogin({ code, state }) {
  const oauthState = verified(state, 'oauth_state');
  if (!oauthState) throw new Error('oauth_state_invalid');
  const profile = await tokenProfile(code, oauthState.nonce);
  const oneTimeCode = randomBytes(32).toString('base64url');
  pendingCodes.set(oneTimeCode, { profile, expiresAt: Date.now() + 120_000 });
  if (pendingCodes.size > 1000) pendingCodes.delete(pendingCodes.keys().next().value);
  const redirect = new URL(oauthState.redirect);
  redirect.searchParams.set('code', oneTimeCode);
  return redirect.href;
}

export function exchangeOneTimeCode(code) {
  const value = pendingCodes.get(String(code || ''));
  pendingCodes.delete(String(code || ''));
  if (!value || value.expiresAt <= Date.now()) return null;
  const now = Math.floor(Date.now() / 1000);
  const user = { ...value.profile, isOwner: value.profile.email === OWNER_EMAIL };
  return {
    token: signed({ kind: 'session', ...user, iat: now, exp: now + SESSION_TTL_SECONDS }),
    user,
  };
}

export function verifySession(token) {
  const payload = verified(token, 'session');
  if (!payload?.email || !payload?.sub) return null;
  return {
    sub: payload.sub,
    email: String(payload.email).toLowerCase(),
    name: payload.name || payload.email,
    picture: payload.picture || '',
    isOwner: String(payload.email).toLowerCase() === OWNER_EMAIL,
  };
}

export const authInternals = { safeExtensionRedirect, signed, verified };
