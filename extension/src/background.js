importScripts('audience-core.js');

const API_BASE = 'https://api.tikhub.io';
const PERSONAL_API_BASE = 'https://mccoco.xyz/creator-intel-api';
const DEFAULTS = { enabled: true, cacheHours: 24 };
const memoryCache = new Map();
const libraryCache = new Map();
const audienceJobs = new Map();
let audienceResultMemory = null;
let audienceCountryMemory = null;
let audiencePendingMemory = null;
let audienceResultLoad = null;
let audienceCountryLoad = null;
let audiencePendingLoad = null;
let audienceResultSave = Promise.resolve();
let audienceCountrySave = Promise.resolve();
let audiencePendingSave = Promise.resolve();

const AUDIENCE_TARGET = 100;
const AUDIENCE_MAX_LOOKUPS = 300;
const AUDIENCE_REQUEST_CAP = 313;
const AUDIENCE_REELS = 12;
const AUDIENCE_PER_REEL = 50;
const AUDIENCE_CONCURRENCY = 6;
const AUDIENCE_BREAK_AT = 20;
const AUDIENCE_MIN_VALID = 20;
const AUDIENCE_COUNTRY_HIT_MS = 90 * 24 * 3_600_000;
const AUDIENCE_RESULT_CACHE_VERSION = 2;
const AUDIENCE_COUNTRY_CACHE_VERSION = 2;
const AUDIENCE_RESUME_ALARM = 'creator-intel-audience-resume';

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

async function readAudienceCache(platform, handle) {
  const key = cacheKey(platform, handle);
  if (!audienceResultMemory) {
    audienceResultLoad ||= chrome.storage.local.get(['audienceCache', 'audienceCacheVersion']).then(async ({ audienceCache = {}, audienceCacheVersion }) => {
      const compatible = Number(audienceCacheVersion) === AUDIENCE_RESULT_CACHE_VERSION;
      audienceResultMemory = new Map(compatible ? Object.entries(audienceCache) : []);
      if (!compatible) {
        await chrome.storage.local.set({ audienceCache: {}, audienceCacheVersion: AUDIENCE_RESULT_CACHE_VERSION });
      }
      return audienceResultMemory;
    });
    await audienceResultLoad;
  }
  return audienceResultMemory.get(key) || null;
}

async function writeAudienceCache(result) {
  const key = cacheKey(result.platform, result.handle);
  await readAudienceCache(result.platform, result.handle);
  audienceResultMemory.set(key, result);
  audienceResultSave = audienceResultSave.catch(() => {}).then(async () => {
    const entries = [...audienceResultMemory.entries()]
      .sort((left, right) => String(right[1]?.at || '').localeCompare(String(left[1]?.at || '')));
    for (const [oldKey] of entries.slice(100)) audienceResultMemory.delete(oldKey);
    await chrome.storage.local.set({
      audienceCache: Object.fromEntries(audienceResultMemory),
      audienceCacheVersion: AUDIENCE_RESULT_CACHE_VERSION,
    });
  });
  await audienceResultSave;
}

async function audienceCountries() {
  if (audienceCountryMemory) return audienceCountryMemory;
  audienceCountryLoad ||= chrome.storage.local.get(['audienceCountryCache', 'audienceCountryCacheVersion']).then(async ({ audienceCountryCache = {}, audienceCountryCacheVersion }) => {
    const compatible = Number(audienceCountryCacheVersion) === AUDIENCE_COUNTRY_CACHE_VERSION;
    audienceCountryMemory = new Map(compatible ? Object.entries(audienceCountryCache) : []);
    if (!compatible) {
      await chrome.storage.local.set({ audienceCountryCache: {}, audienceCountryCacheVersion: AUDIENCE_COUNTRY_CACHE_VERSION });
    }
    return audienceCountryMemory;
  });
  return audienceCountryLoad;
}

async function saveAudienceCountries() {
  await audienceCountries();
  audienceCountrySave = audienceCountrySave.catch(() => {}).then(async () => {
    const entries = [...audienceCountryMemory.entries()]
      .sort((left, right) => Number(right[1]?.at || 0) - Number(left[1]?.at || 0));
    for (const [oldKey] of entries.slice(5000)) audienceCountryMemory.delete(oldKey);
    await chrome.storage.local.set({
      audienceCountryCache: Object.fromEntries(audienceCountryMemory),
      audienceCountryCacheVersion: AUDIENCE_COUNTRY_CACHE_VERSION,
    });
  });
  await audienceCountrySave;
}

async function pendingAudienceJobs() {
  if (audiencePendingMemory) return audiencePendingMemory;
  audiencePendingLoad ||= chrome.storage.local.get(['audiencePendingJobs']).then(({ audiencePendingJobs = {} }) => {
    audiencePendingMemory = new Map(Object.entries(audiencePendingJobs));
    return audiencePendingMemory;
  });
  return audiencePendingLoad;
}

async function savePendingAudienceJobs() {
  await pendingAudienceJobs();
  const snapshot = Object.fromEntries(audiencePendingMemory);
  audiencePendingSave = audiencePendingSave.catch(() => {}).then(() => chrome.storage.local.set({ audiencePendingJobs: snapshot }));
  await audiencePendingSave;
}

async function keepAudienceResumeAlarm() {
  if (!chrome.alarms?.create) return;
  await chrome.alarms.create(AUDIENCE_RESUME_ALARM, { periodInMinutes: 1 });
}

async function markAudiencePending(platform, handle, cacheHours) {
  const jobs = await pendingAudienceJobs();
  const key = cacheKey(platform, handle);
  const previous = jobs.get(key);
  jobs.set(key, {
    platform,
    handle,
    cacheHours,
    requests: Math.max(0, Number(previous?.requests) || 0),
    startedAt: previous?.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  await savePendingAudienceJobs();
  await keepAudienceResumeAlarm();
  return jobs.get(key);
}

async function reserveAudienceRequest(platform, handle, cacheHours) {
  const jobs = await pendingAudienceJobs();
  const key = cacheKey(platform, handle);
  const previous = jobs.get(key) || await markAudiencePending(platform, handle, cacheHours);
  const requests = Math.max(0, Number(previous?.requests) || 0);
  if (requests >= AUDIENCE_REQUEST_CAP) {
    const error = new Error(`已达到单次分析 ${AUDIENCE_REQUEST_CAP} 次 TikHub 请求上限，已停止`);
    error.code = 'AUDIENCE_REQUEST_CAP';
    throw error;
  }
  jobs.set(key, { ...previous, requests: requests + 1, updatedAt: new Date().toISOString() });
  await savePendingAudienceJobs();
}

async function audienceApiCall(path, params, handle, cacheHours) {
  await reserveAudienceRequest('IG', handle, cacheHours);
  return apiCall(path, params);
}

async function clearAudiencePending(platform, handle) {
  const jobs = await pendingAudienceJobs();
  jobs.delete(cacheKey(platform, handle));
  await savePendingAudienceJobs();
  if (!jobs.size && chrome.alarms?.clear) await chrome.alarms.clear(AUDIENCE_RESUME_ALARM);
}

async function readAudiencePending(platform, handle) {
  const jobs = await pendingAudienceJobs();
  return jobs.get(cacheKey(platform, handle)) || null;
}

async function mapConcurrent(values, concurrency, worker) {
  let cursor = 0;
  const results = new Array(values.length);
  const run = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, run));
  return results;
}

async function runAudience(handle, cacheHours) {
  const core = globalThis.CreatorIntelAudienceCore;
  const reelsResponse = await audienceApiCall('/api/v1/instagram/v2/fetch_user_reels', { username: handle }, handle, cacheHours);
  const codes = core.reelCodes(reelsResponse, AUDIENCE_REELS);
  if (!codes.length) throw new Error('取不到该账号近期 Reels，请确认账号公开且存在 Reels');

  const likeLists = await mapConcurrent(codes, 4, async (code) => {
    try {
      const response = await audienceApiCall('/api/v1/instagram/v2/fetch_post_likes', { code_or_url: code }, handle, cacheHours);
      return core.postLikeUsers(response, AUDIENCE_PER_REEL);
    } catch (error) {
      if (error?.code === 'AUDIENCE_REQUEST_CAP') throw error;
      return [];
    }
  });
  const candidates = [];
  const seen = new Set();
  for (const users of likeLists) {
    for (const user of users) {
      if (!seen.has(user.id)) { seen.add(user.id); candidates.push(user); }
      if (candidates.length >= AUDIENCE_MAX_LOOKUPS) break;
    }
    if (candidates.length >= AUDIENCE_MAX_LOOKUPS) break;
  }
  if (!candidates.length) throw new Error('取不到近期内容互动用户，可能是 TikHub 暂时限流');

  const countryCache = await audienceCountries();
  const counts = {};
  let valid = 0;
  let analyzed = 0;
  let errors = 0;
  let consecutiveErrors = 0;
  let freshLookups = 0;
  let cursor = 0;
  let stop = false;
  let capError = null;
  const worker = async () => {
    while (!stop) {
      const index = cursor++;
      if (index >= candidates.length || analyzed >= AUDIENCE_MAX_LOOKUPS) return;
      const user = candidates[index];
      const userKey = `ig:${user.id}`;
      analyzed += 1;
      let country;
      const cached = countryCache.get(userKey);
      const cachedAge = cached ? Date.now() - Number(cached.at || 0) : Infinity;
      const cachedTtl = cached?.cc ? AUDIENCE_COUNTRY_HIT_MS : Math.max(1, Number(cacheHours) || DEFAULTS.cacheHours) * 3_600_000;
      if (cached && Object.prototype.hasOwnProperty.call(cached, 'cc') && cachedAge < cachedTtl) {
        country = cached.cc || null;
      } else {
        if (cached) countryCache.delete(userKey);
        try {
          const response = await audienceApiCall('/api/v1/instagram/v3/get_user_about', { username: user.username }, handle, cacheHours);
          country = core.countryFromAbout(response);
          if (country === undefined) throw new Error('ig_about_unavailable');
          countryCache.set(userKey, { cc: country || null, at: Date.now() });
          consecutiveErrors = 0;
          freshLookups += 1;
          if (freshLookups % 10 === 0) await saveAudienceCountries();
        } catch (error) {
          if (error?.code === 'AUDIENCE_REQUEST_CAP') {
            stop = true;
            capError ||= error;
            return;
          }
          errors += 1;
          consecutiveErrors += 1;
          if (consecutiveErrors >= AUDIENCE_BREAK_AT) stop = true;
          continue;
        }
      }
      if (country) {
        counts[country] = (counts[country] || 0) + 1;
        valid += 1;
        if (valid >= AUDIENCE_TARGET) stop = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AUDIENCE_CONCURRENCY, candidates.length) }, worker));
  await saveAudienceCountries();
  if (capError) throw capError;
  if (consecutiveErrors >= AUDIENCE_BREAK_AT) throw new Error('TikHub 受众接口连续异常，已停止请求以避免继续计费');
  if (valid < AUDIENCE_MIN_VALID) {
    throw new Error(`已检查 ${analyzed} 个互动用户，仅识别 ${valid} 个地区（至少需要 ${AUDIENCE_MIN_VALID} 个），未生成画像`);
  }
  const result = core.buildResult({ handle, counts, analyzed, target: AUDIENCE_TARGET });
  if (!result) throw new Error(errors ? 'TikHub 受众接口暂时异常，请稍后重试' : '抽样用户均未公开所在地区');
  await writeAudienceCache(result);
  return result;
}

function releaseAudienceSubscriber(subscriber) {
  if (!subscriber?.active || !subscriber.entry) return;
  subscriber.active = false;
  subscriber.entry.subscribers = Math.max(0, subscriber.entry.subscribers - 1);
}

function ensureAudienceJob(platform, handle, cacheHours) {
  const key = cacheKey(platform, handle);
  let entry = audienceJobs.get(key);
  if (entry) return entry;
  entry = { subscribers: 0, promise: null };
  audienceJobs.set(key, entry);
  entry.promise = (async () => {
    await markAudiencePending(platform, handle, cacheHours);
    return runAudience(handle, cacheHours);
  })().finally(async () => {
    try { await clearAudiencePending(platform, handle); } catch {}
    if (audienceJobs.get(key) === entry) audienceJobs.delete(key);
  });
  return entry;
}

async function fetchAudience(platform, handle, force = false, subscriber = null) {
  if (platform !== 'IG') return { ok: false, error: '受众画像目前仅支持 Instagram' };
  const cfg = await settings();
  const normalizedHandle = String(handle || '').trim().replace(/^@/, '');
  if (!cfg.apiKey) {
    await clearAudiencePending(platform, normalizedHandle);
    return { ok: false, error: '请先在扩展设置中填写 TikHub API Key' };
  }
  const key = cacheKey(platform, normalizedHandle);
  const pending = await readAudiencePending(platform, normalizedHandle);
  let entry = audienceJobs.get(key);
  if (!force && !entry) {
    const cached = await readAudienceCache(platform, normalizedHandle);
    const fresh = Boolean(cached && Date.now() - Date.parse(cached.at) < cfg.cacheHours * 3_600_000);
    const pendingCompleted = Boolean(pending && cached && Date.parse(cached.at) >= Date.parse(pending.startedAt));
    if (fresh && (!pending || pendingCompleted)) {
      await clearAudiencePending(platform, normalizedHandle);
      return { ok: true, result: cached, cached: true };
    }
  }
  entry ||= ensureAudienceJob(platform, normalizedHandle, cfg.cacheHours);
  if (subscriber) {
    entry.subscribers += 1;
    subscriber.entry = entry;
    subscriber.active = true;
  }
  try {
    return { ok: true, result: await entry.promise, cached: false };
  } catch (error) {
    return { ok: false, error: error.message || '受众画像分析失败' };
  } finally {
    releaseAudienceSubscriber(subscriber);
  }
}

async function resumePendingAudienceJobs() {
  const jobs = await pendingAudienceJobs();
  if (!jobs.size) {
    if (chrome.alarms?.clear) await chrome.alarms.clear(AUDIENCE_RESUME_ALARM);
    return;
  }
  await keepAudienceResumeAlarm();
  for (const job of jobs.values()) {
    fetchAudience(job.platform, job.handle, false).catch(() => {});
  }
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
  if (message?.type === 'getCachedAudience') {
    Promise.all([settings(), readAudienceCache(message.platform, message.handle), readAudiencePending(message.platform, message.handle)]).then(([cfg, result, pending]) => {
      const fresh = Boolean(result && Date.now() - Date.parse(result.at) < cfg.cacheHours * 3_600_000);
      sendResponse({ result, fresh, configured: Boolean(cfg.apiKey), running: Boolean(pending), startedAt: pending?.startedAt || null });
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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'creator-intel-audience') return;
  let started = false;
  const subscriber = { active: false, entry: null };
  port.onDisconnect.addListener(() => {
    releaseAudienceSubscriber(subscriber);
  });
  port.onMessage.addListener((message) => {
    if (message?.type === 'ping') {
      try { port.postMessage({ type: 'pong' }); } catch {}
      return;
    }
    if (message?.type !== 'fetchAudience' || started) return;
    started = true;
    fetchAudience(message.platform, message.handle, Boolean(message.force), subscriber).then((response) => {
      try { port.postMessage({ type: 'audienceResult', response }); } catch {}
    });
  });
});

if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUDIENCE_RESUME_ALARM) resumePendingAudienceJobs().catch(() => {});
  });
}
chrome.runtime.onStartup?.addListener(() => resumePendingAudienceJobs().catch(() => {}));
resumePendingAudienceJobs().catch(() => {});
