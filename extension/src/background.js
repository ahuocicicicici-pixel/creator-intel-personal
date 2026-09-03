const API_BASE = 'https://api.tikhub.io';
const PERSONAL_API_BASE = 'https://mccoco.xyz/creator-intel-api';
const DEFAULTS = { enabled: true, cacheHours: 24 };
const memoryCache = new Map();
const libraryCache = new Map();

function cacheKey(platform, handle) {
  return `${platform}:${String(handle).toLowerCase()}`;
}

async function settings() {
  const saved = await chrome.storage.local.get(['tikhubApiKey', 'sessionToken', 'user', 'enabled', 'cacheHours']);
  return {
    apiKey: saved.tikhubApiKey || '',
    sessionToken: saved.sessionToken || '',
    user: saved.user || null,
    enabled: saved.enabled !== false,
    cacheHours: Number(saved.cacheHours) || DEFAULTS.cacheHours,
  };
}

async function libraryLookup(platform, handle, { force = false } = {}) {
  const cfg = await settings();
  const key = `${cfg.user?.email || 'anonymous'}:${cacheKey(platform, handle)}`;
  if (!force && libraryCache.has(key)) return libraryCache.get(key);
  if (!cfg.sessionToken) return { error: 'login_required' };
  const url = `${PERSONAL_API_BASE}/api/context?${new URLSearchParams({ platform, handle }).toString()}`;
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.sessionToken}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch {
    return { error: '个人达人库暂时无法连接' };
  }
  if (response.status === 401) {
    await chrome.storage.local.remove(['sessionToken', 'user']);
    libraryCache.clear();
    return { error: 'login_required' };
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) return { error: `COCO 情报库请求失败（${response.status}）` };
  const context = {
    found: Boolean(body.found),
    ...(body.record ? { record: body.record } : {}),
    reviews: Array.isArray(body.reviews) ? body.reviews : [],
    access: body.access || 'public',
  };
  libraryCache.set(key, context);
  return context;
}

async function reviewRequest(method, platform, handle, payload = {}) {
  const cfg = await settings();
  if (!cfg.sessionToken) return { ok: false, error: '请先登录 Google 账号' };
  const path = method === 'POST' ? '/api/reviews' : `/api/reviews/${encodeURIComponent(payload.id || '')}`;
  const response = await fetch(`${PERSONAL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.sessionToken}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify({ platform, handle, rating: payload.rating, body: payload.body }) } : {}),
    cache: 'no-store',
  }).catch(() => null);
  if (!response) return { ok: false, error: '个人评价服务暂时无法连接' };
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    await chrome.storage.local.remove(['sessionToken', 'user']);
    libraryCache.clear();
  }
  if (!response.ok) return { ok: false, error: body.error || `评价请求失败（${response.status}）` };
  const context = await libraryLookup(platform, handle, { force: true });
  return { ok: true, context };
}

async function googleLogin() {
  const configResponse = await fetch(`${PERSONAL_API_BASE}/api/auth/config`, { cache: 'no-store' });
  const config = await configResponse.json().catch(() => null);
  if (!configResponse.ok || !config?.enabled) throw new Error('Google 登录尚未配置完成');
  const redirect = chrome.identity.getRedirectURL('oauth2');
  const startUrl = `${PERSONAL_API_BASE}/auth/google/start?${new URLSearchParams({ redirect }).toString()}`;
  const finalUrl = await chrome.identity.launchWebAuthFlow({ url: startUrl, interactive: true });
  const code = new URL(finalUrl).searchParams.get('code');
  if (!code) throw new Error('Google 登录未返回授权码');
  const exchange = await fetch(`${PERSONAL_API_BASE}/api/auth/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    cache: 'no-store',
  });
  const body = await exchange.json().catch(() => null);
  if (!exchange.ok || !body?.token || !body?.user) throw new Error(body?.error || 'Google 登录失败');
  await chrome.storage.local.set({ sessionToken: body.token, user: body.user });
  libraryCache.clear();
  return body.user;
}

async function refreshSession() {
  const cfg = await settings();
  if (!cfg.sessionToken) return { loggedIn: false, user: null };
  const response = await fetch(`${PERSONAL_API_BASE}/api/session`, {
    headers: { Authorization: `Bearer ${cfg.sessionToken}` },
    cache: 'no-store',
  }).catch(() => null);
  if (!response?.ok) {
    await chrome.storage.local.remove(['sessionToken', 'user']);
    libraryCache.clear();
    return { loggedIn: false, user: null };
  }
  const body = await response.json();
  await chrome.storage.local.set({ user: body.user });
  return { loggedIn: true, user: body.user };
}

async function apiCall(path, params = {}) {
  const { apiKey } = await settings();
  if (!apiKey) throw new Error('请先在扩展设置中填写 TikHub API Key');
  const url = `${API_BASE}${path}?${new URLSearchParams(params).toString()}`;
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(40_000),
      cache: 'no-store',
    });
  } catch (error) {
    throw new Error(error && error.name === 'TimeoutError' ? 'TikHub 请求超时，请稍后重试' : '无法连接 TikHub API');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && (body.message_zh || body.message || body.detail)) || `TikHub 请求失败（${res.status}）`);
  if (body && Number(body.code) >= 400) throw new Error(body.message_zh || body.message || `TikHub 返回错误（${body.code}）`);
  return body;
}

function walkObjects(root, limit = 20000) {
  const out = [];
  const stack = [root];
  const seen = new Set();
  while (stack.length && out.length < limit) {
    const value = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (!Array.isArray(value)) out.push(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
  }
  return out;
}

function valueAt(obj, paths) {
  for (const path of paths) {
    let value = obj;
    for (const key of path.split('.')) value = value && typeof value === 'object' ? value[key] : undefined;
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function asNumber(value) {
  if (value && typeof value === 'object' && 'count' in value) value = value.count;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/,/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*([KMB万亿])?/i);
  if (!match) return null;
  const base = Number(match[1]);
  const unit = (match[2] || '').toUpperCase();
  const multiplier = unit === 'K' ? 1e3 : unit === 'M' ? 1e6 : unit === 'B' ? 1e9 : unit === '万' ? 1e4 : unit === '亿' ? 1e8 : 1;
  return Number.isFinite(base) ? Math.round(base * multiplier) : null;
}

const HANDLE_PATHS = ['username', 'uniqueId', 'unique_id', 'screen_name', 'handle', 'userName', 'user.username', 'user.uniqueId', 'user.unique_id', 'author.uniqueId', 'legacy.screen_name', 'core.screen_name'];
const FOLLOWER_PATHS = ['follower_count', 'followers_count', 'followerCount', 'fans', 'fans_count', 'fansCount', 'edge_followed_by.count', 'stats.followerCount', 'authorStats.followerCount', 'subscriber_count', 'legacy.followers_count', 'public_metrics.followers_count'];
const FOLLOWING_PATHS = ['following_count', 'followingCount', 'friends_count', 'edge_follow.count', 'stats.followingCount', 'authorStats.followingCount', 'legacy.friends_count', 'public_metrics.following_count'];
const POST_PATHS = ['media_count', 'post_count', 'posts_count', 'video_count', 'aweme_count', 'edge_owner_to_timeline_media.count', 'stats.videoCount', 'authorStats.videoCount', 'legacy.statuses_count', 'public_metrics.tweet_count'];
const LIKE_TOTAL_PATHS = ['heart_count', 'heartCount', 'total_favorited', 'stats.heartCount', 'authorStats.heartCount'];
const VIEW_PATHS = ['play_count', 'playCount', 'view_count', 'viewCount', 'video_view_count', 'stats.playCount'];
const LIKE_PATHS = ['like_count', 'likeCount', 'digg_count', 'diggCount', 'stats.diggCount'];
const COMMENT_PATHS = ['comment_count', 'commentCount', 'stats.commentCount'];

function pickProfile(root, handle) {
  const wanted = String(handle).replace(/^@/, '').toLowerCase();
  let best = root && typeof root === 'object' ? root : {};
  let bestScore = -1;
  for (const obj of walkObjects(root)) {
    const candidateHandle = String(valueAt(obj, HANDLE_PATHS) || '').replace(/^@/, '').toLowerCase();
    let score = candidateHandle === wanted ? 20 : 0;
    if (valueAt(obj, FOLLOWER_PATHS) != null) score += 6;
    if (valueAt(obj, FOLLOWING_PATHS) != null) score += 2;
    if (valueAt(obj, ['nickname', 'full_name', 'name', 'display_name', 'user.nickname', 'user.full_name', 'legacy.name', 'core.name']) != null) score += 2;
    if (valueAt(obj, ['biography', 'bio', 'signature', 'description']) != null) score += 1;
    if (score > bestScore) { best = obj; bestScore = score; }
  }
  return best;
}

function recentAverages(root) {
  const rows = [];
  const ids = new Set();
  for (const obj of walkObjects(root)) {
    const views = asNumber(valueAt(obj, VIEW_PATHS));
    if (views == null || views <= 0) continue;
    const id = String(valueAt(obj, ['id', 'aweme_id', 'pk', 'code', 'video_id']) || `${views}:${valueAt(obj, LIKE_PATHS) || ''}`);
    if (ids.has(id)) continue;
    ids.add(id);
    rows.push({
      views,
      likes: asNumber(valueAt(obj, LIKE_PATHS)) || 0,
      comments: asNumber(valueAt(obj, COMMENT_PATHS)) || 0,
    });
    if (rows.length >= 12) break;
  }
  if (!rows.length) return { sampleSize: 0, avgViews: null, avgEngagement: null };
  const avg = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    sampleSize: rows.length,
    avgViews: avg(rows.map((row) => row.views)),
    avgEngagement: avg(rows.map((row) => row.likes + row.comments)),
  };
}

function normalizeProfile(platform, handle, response) {
  const root = response && response.data != null ? response.data : response;
  const profile = pickProfile(root, handle);
  const averages = recentAverages(root);
  const verified = valueAt(profile, ['is_verified', 'verified', 'isVerified', 'verification.verified', 'legacy.verified', 'is_blue_verified']);
  return {
    platform,
    handle: String(valueAt(profile, HANDLE_PATHS) || handle).replace(/^@/, ''),
    name: String(valueAt(profile, ['nickname', 'full_name', 'name', 'display_name', 'title', 'user.nickname', 'user.full_name', 'legacy.name', 'core.name']) || ''),
    followers: asNumber(valueAt(profile, FOLLOWER_PATHS)),
    following: asNumber(valueAt(profile, FOLLOWING_PATHS)),
    posts: asNumber(valueAt(profile, POST_PATHS)),
    totalLikes: platform === 'X' ? null : asNumber(valueAt(profile, LIKE_TOTAL_PATHS)),
    country: String(valueAt(profile, ['country', 'region', 'location', 'account_region', 'legacy.location']) || ''),
    verified: verified === true || verified === 1 || verified === 'true',
    ...averages,
    fetchedAt: new Date().toISOString(),
  };
}

function findChannelId(response) {
  const root = response && response.data != null ? response.data : response;
  for (const obj of walkObjects(root, 3000)) {
    const value = valueAt(obj, ['channel_id', 'channelId', 'externalId', 'id']);
    if (typeof value === 'string' && /^UC[A-Za-z0-9_-]{20,}$/.test(value)) return value;
  }
  return null;
}

async function fetchPlatformProfile(platform, handle, pageUrl) {
  if (platform === 'TT') return apiCall('/api/v1/tiktok/web/fetch_user_profile', { uniqueId: handle });
  if (platform === 'IG') return apiCall('/api/v1/instagram/v3/get_user_profile', { username: handle });
  if (platform === 'X') return apiCall('/api/v1/twitter/web/fetch_user_profile', { screen_name: handle });
  if (platform === 'YT') {
    const idResponse = await apiCall('/api/v1/youtube/web/get_channel_id_v2', { channel_url: pageUrl });
    const channelId = findChannelId(idResponse);
    if (!channelId) throw new Error('TikHub 未返回 YouTube 频道 ID');
    return apiCall('/api/v1/youtube/web/get_channel_info', { channel_id: channelId });
  }
  throw new Error('暂不支持该平台');
}

async function readCache(platform, handle) {
  const key = cacheKey(platform, handle);
  if (memoryCache.has(key)) return memoryCache.get(key);
  const { profileCache = {} } = await chrome.storage.local.get(['profileCache']);
  const hit = profileCache[key] || null;
  if (hit) memoryCache.set(key, hit);
  return hit;
}

async function writeCache(profile) {
  const key = cacheKey(profile.platform, profile.handle);
  const { profileCache = {} } = await chrome.storage.local.get(['profileCache']);
  profileCache[key] = profile;
  const ordered = Object.entries(profileCache).sort((a, b) => String(b[1].fetchedAt).localeCompare(String(a[1].fetchedAt))).slice(0, 100);
  const trimmed = Object.fromEntries(ordered);
  memoryCache.set(key, profile);
  await chrome.storage.local.set({ profileCache: trimmed });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getSettings') {
    settings().then((value) => sendResponse({
      ...value,
      apiKey: value.apiKey ? 'configured' : '',
      sessionToken: value.sessionToken ? 'configured' : '',
      loggedIn: Boolean(value.sessionToken && value.user),
    }));
    return true;
  }
  if (message?.type === 'saveSettings') {
    const update = {
      enabled: message.enabled !== false,
      cacheHours: [1, 6, 24, 72, 168].includes(Number(message.cacheHours)) ? Number(message.cacheHours) : DEFAULTS.cacheHours,
    };
    if (typeof message.apiKey === 'string') update.tikhubApiKey = message.apiKey.trim();
    chrome.storage.local.set(update).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === 'loginGoogle') {
    googleLogin().then((user) => sendResponse({ ok: true, user }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'logoutGoogle') {
    chrome.storage.local.remove(['sessionToken', 'user']).then(() => {
      libraryCache.clear();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === 'refreshSession') {
    refreshSession().then((result) => sendResponse(result));
    return true;
  }
  if (message?.type === 'testLibrarySession') {
    libraryCache.clear();
    libraryLookup('IG', '__creator_intel_key_test__').then((result) => {
      sendResponse({ ok: !result?.error, error: result?.error || '' });
    });
    return true;
  }
  if (message?.type === 'testApiKey') {
    apiCall('/api/v1/tikhub/user/get_user_info').then((body) => {
      const user = body?.user_data || body?.data?.user_data || body?.data || {};
      sendResponse({ ok: true, balance: user.balance, freeCredit: user.free_credit, email: user.email || '' });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'getCachedProfile') {
    Promise.all([settings(), readCache(message.platform, message.handle), libraryLookup(message.platform, message.handle)]).then(([cfg, profile, library]) => {
      if (!profile) return sendResponse({ profile: null, library, configured: Boolean(cfg.apiKey), loggedIn: Boolean(cfg.sessionToken), user: cfg.user, enabled: cfg.enabled });
      const fresh = Date.now() - Date.parse(profile.fetchedAt) < cfg.cacheHours * 3_600_000;
      sendResponse({ profile, library, fresh, configured: Boolean(cfg.apiKey), loggedIn: Boolean(cfg.sessionToken), user: cfg.user, enabled: cfg.enabled });
    });
    return true;
  }
  if (message?.type === 'refreshCreatorContext') {
    libraryLookup(message.platform, message.handle, { force: true }).then((context) => sendResponse({ context }));
    return true;
  }
  if (message?.type === 'addReview') {
    reviewRequest('POST', message.platform, message.handle, message).then(sendResponse);
    return true;
  }
  if (message?.type === 'deleteReview') {
    reviewRequest('DELETE', message.platform, message.handle, { id: message.id }).then(sendResponse);
    return true;
  }
  if (message?.type === 'fetchProfile') {
    fetchPlatformProfile(message.platform, message.handle, message.pageUrl)
      .then((response) => normalizeProfile(message.platform, message.handle, response))
      .then(async (profile) => { await writeCache(profile); sendResponse({ ok: true, profile }); })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
