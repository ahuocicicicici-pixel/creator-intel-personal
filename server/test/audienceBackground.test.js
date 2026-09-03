import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const extensionRoot = new URL('../../extension/src/', import.meta.url);

async function harness({ initialStorage = {}, about, storageDelay = 0, initialAlarms = [] }) {
  const storage = { tikhubApiKey: 'test-key', cacheHours: 24, ...initialStorage };
  const alarms = new Set(initialAlarms);
  let apiCalls = 0;
  let connectListener;
  const context = vm.createContext({
    console, URL, URLSearchParams, AbortSignal, Date, Map, Set, Object, Number, String, Math, JSON, Promise, Array, RegExp, Intl,
    setTimeout, clearTimeout, setInterval, clearInterval,
    chrome: {
      storage: { local: {
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : Object.keys(storage))
          .filter((key) => key in storage).map((key) => [key, storage[key]])),
        set: async (values) => {
          if (storageDelay) await new Promise((resolve) => setTimeout(resolve, storageDelay));
          Object.assign(storage, values);
        },
        remove: async () => {},
      } },
      runtime: {
        onMessage: { addListener: () => {} },
        onConnect: { addListener: (listener) => { connectListener = listener; } },
        onStartup: { addListener: () => {} },
      },
      alarms: {
        create: async (name) => { alarms.add(name); },
        clear: async (name) => alarms.delete(name),
        onAlarm: { addListener: () => {} },
      },
      identity: {},
    },
    fetch: async (input) => {
      apiCalls += 1;
      const url = new URL(input);
      if (url.pathname.endsWith('/fetch_user_reels')) {
        const handle = url.searchParams.get('username');
        return response({ data: { items: [{ code: `${handle}-reel`, play_count: 1000 }] } });
      }
      if (url.pathname.endsWith('/fetch_post_likes')) {
        const handle = url.searchParams.get('code_or_url').replace(/-reel$/, '');
        return response({ users: Array.from({ length: 50 }, (_, index) => ({ id: `${handle}-${index + 1}`, username: `${handle}_u${index + 1}` })) });
      }
      if (url.pathname.endsWith('/get_user_about')) {
        assert.equal(url.searchParams.has('user_id'), false);
        return about(url.searchParams.get('username'));
      }
      throw new Error(`unexpected request: ${url.pathname}`);
    },
  });
  context.globalThis = context;
  context.importScripts = async () => {};
  vm.runInContext(await readFile(new URL('audience-core.js', extensionRoot), 'utf8'), context, { filename: 'audience-core.js' });
  context.importScripts = () => {};
  vm.runInContext(await readFile(new URL('background.js', extensionRoot), 'utf8'), context, { filename: 'background.js' });

  function start(handle, force = true) {
    const incoming = [];
    const disconnect = [];
    let resolveResult;
    const result = new Promise((resolve) => { resolveResult = resolve; });
    const port = {
      name: 'creator-intel-audience',
      onMessage: { addListener: (listener) => incoming.push(listener) },
      onDisconnect: { addListener: (listener) => disconnect.push(listener) },
      postMessage: (message) => { if (message.type === 'audienceResult') resolveResult(message.response); },
    };
    connectListener(port);
    incoming[0]({ type: 'fetchAudience', platform: 'IG', handle, force });
    return { result, disconnect: () => disconnect.forEach((listener) => listener()) };
  }
  async function setPendingRequests(handle, requests) {
    await context.markAudiencePending('IG', handle, 24);
    const jobs = await context.pendingAudienceJobs();
    jobs.get(`IG:${handle}`).requests = requests;
    await context.savePendingAudienceJobs();
  }
  return {
    start,
    storage,
    alarms,
    apiCalls: () => apiCalls,
    setPendingRequests,
    fetchAudience: (handle) => context.fetchAudience('IG', handle, false),
  };
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('audience analysis rejects a tiny biased sample and stops after consecutive upstream errors', async () => {
  let aboutCalls = 0;
  const now = Date.now();
  const app = await harness({
    initialStorage: { audienceCountryCache: { 'ig:creator-1': { cc: 'US', at: now } } },
    about: async () => { aboutCalls += 1; return response({ message: 'rate limit' }, false, 429); },
  });
  const result = await app.start('creator').result;
  assert.equal(result.ok, false);
  assert.match(result.error, /连续异常|有效地区样本不足/);
  assert.ok(aboutCalls < 50, `expected cost fuse before all candidates, got ${aboutCalls}`);
  assert.equal(app.storage.audienceCache, undefined);
});

test('concurrent audience jobs merge result and country caches without overwriting each other', async () => {
  const app = await harness({
    storageDelay: 2,
    about: async (username) => response({ data: { bloks: { text: 'Account based in', initial: username.startsWith('alpha_') ? 'United States' : 'India' } } }),
  });
  const alpha = app.start('alpha');
  const beta = app.start('beta');
  const [alphaResult, betaResult] = await Promise.all([alpha.result, beta.result]);
  assert.equal(alphaResult.ok, true);
  assert.equal(betaResult.ok, true);
  assert.deepEqual(Object.keys(app.storage.audienceCache).sort(), ['IG:alpha', 'IG:beta']);
  assert.ok(Object.keys(app.storage.audienceCountryCache).some((key) => key.startsWith('ig:alpha-')));
  assert.ok(Object.keys(app.storage.audienceCountryCache).some((key) => key.startsWith('ig:beta-')));
});

test('expired result and negative country caches are refreshed instead of reused forever', async () => {
  let aboutCalls = 0;
  const oldAt = Date.now() - 2 * 3_600_000;
  const app = await harness({
    initialStorage: {
      cacheHours: 1,
      audienceCache: { 'IG:stale': { platform: 'IG', handle: 'stale', valid: 100, analyzed: 100, at: new Date(oldAt).toISOString(), tierPct: { T1: 100, T2: 0, T3: 0 }, topCountries: [] } },
      audienceCountryCache: { 'ig:stale-1': { cc: null, at: oldAt } },
    },
    about: async () => { aboutCalls += 1; return response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }); },
  });
  const result = await app.start('stale', false).result;
  assert.equal(result.ok, true);
  assert.equal(result.cached, false);
  assert.ok(aboutCalls > 0);
  assert.equal(result.result.topCountries[0].cc, 'IN');
});

test('incompatible negative country cache is cleared before current about responses are parsed', async () => {
  let aboutCalls = 0;
  const app = await harness({
    initialStorage: {
      audienceCache: { 'IG:current-shape': {
        platform: 'IG', handle: 'current-shape', valid: 20, analyzed: 300,
        at: new Date().toISOString(), tierPct: { T1: 100, T2: 0, T3: 0 }, topCountries: [],
      } },
      audienceCountryCache: { 'ig:poisoned-id': { cc: null, at: Date.now() } },
    },
    about: async () => {
      aboutCalls += 1;
      return response({ data: { payload: { layout: { bloks_payload: { data: [
        { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country_visibility', initial: true } },
        { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country', initial: 'India' } },
      ] } } } } });
    },
  });
  const result = await app.start('current-shape', false).result;
  assert.equal(result.ok, true);
  assert.equal(result.cached, false);
  assert.ok(aboutCalls > 0);
  assert.equal(app.storage.audienceCacheVersion, 2);
  assert.equal(app.storage.audienceCountryCacheVersion, 2);
  assert.equal(app.storage.audienceCountryCache['ig:poisoned-id'], undefined);
  assert.equal(result.result.topCountries[0].cc, 'IN');
});

test('insufficient audience error reports inspected users separately from valid countries', async () => {
  const app = await harness({
    initialStorage: { audienceCountryCacheVersion: 2 },
    about: async () => response({ data: { payload: { layout: { bloks_payload: { data: [
      { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country_visibility', initial: false } },
      { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country', initial: 'Not shared' } },
    ] } } } } }),
  });
  const result = await app.start('private-audience').result;
  assert.equal(result.ok, false);
  assert.match(result.error, /^已检查 \d+ 个互动用户，仅识别 0 个地区（至少需要 20 个），未生成画像$/);
});

test('disconnect leaves the background job running and saves the final result', async () => {
  let aboutCalls = 0;
  const app = await harness({
    about: async () => {
      aboutCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return response({ data: { bloks: { text: 'Account based in', initial: 'United States' } } });
    },
  });
  const job = app.start('leaving');
  await new Promise((resolve) => setTimeout(resolve, 12));
  job.disconnect();
  const result = await job.result;
  assert.equal(result.ok, true);
  assert.equal(aboutCalls, 50);
  assert.equal(app.storage.audienceCache['IG:leaving'].valid, 50);
  assert.deepEqual(app.storage.audiencePendingJobs, {});
  assert.equal(app.alarms.size, 0);
});

test('a persisted pending job resumes when the service worker starts again', async () => {
  const app = await harness({
    initialStorage: {
      audiencePendingJobs: {
        'IG:resume-me': { platform: 'IG', handle: 'resume-me', cacheHours: 24, startedAt: new Date().toISOString() },
      },
    },
    about: async () => response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }),
  });
  for (let attempt = 0; attempt < 50 && !app.storage.audienceCache?.['IG:resume-me']; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(app.storage.audienceCache['IG:resume-me'].valid, 50);
  assert.deepEqual(app.storage.audiencePendingJobs, {});
});

test('a newer pending refresh job is not hidden by an older fresh aggregate', async () => {
  const oldAt = new Date(Date.now() - 60_000).toISOString();
  const app = await harness({
    initialStorage: {
      audienceCacheVersion: 2,
      audienceCountryCacheVersion: 2,
      audienceCache: { 'IG:refreshing': {
        platform: 'IG', handle: 'refreshing', valid: 20, analyzed: 20, at: oldAt,
        tierPct: { T1: 100, T2: 0, T3: 0 }, topCountries: [{ cc: 'US', count: 20, pct: 100 }],
      } },
      audiencePendingJobs: {
        'IG:refreshing': { platform: 'IG', handle: 'refreshing', cacheHours: 24, requests: 0, startedAt: new Date().toISOString() },
      },
    },
    about: async () => response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }),
  });
  for (let attempt = 0; attempt < 50 && app.storage.audienceCache?.['IG:refreshing']?.at === oldAt; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(app.apiCalls() > 0);
  assert.equal(app.storage.audienceCache['IG:refreshing'].topCountries[0].cc, 'IN');
  assert.deepEqual(app.storage.audiencePendingJobs, {});
});

test('a resumed job preserves the persisted TikHub request cap', async () => {
  const app = await harness({
    initialStorage: {
      audiencePendingJobs: {
        'IG:capped': { platform: 'IG', handle: 'capped', cacheHours: 24, requests: 312, startedAt: new Date().toISOString() },
      },
    },
    about: async () => response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }),
  });
  for (let attempt = 0; attempt < 50 && Object.keys(app.storage.audiencePendingJobs || {}).length; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(app.apiCalls(), 1);
  assert.deepEqual(app.storage.audiencePendingJobs, {});
  assert.equal(app.storage.audienceCache?.['IG:capped'], undefined);
});

test('request-cap exhaustion is reported directly instead of as an upstream failure', async () => {
  const app = await harness({
    about: async () => response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }),
  });
  await app.setPendingRequests('capped-message', 313);
  const result = await app.fetchAudience('capped-message');
  assert.equal(result.ok, false);
  assert.match(result.error, /313 次 TikHub 请求上限/);
  assert.equal(app.apiCalls(), 0);
  assert.deepEqual(app.storage.audiencePendingJobs, {});
});

test('request cap waits for paid in-flight country lookups before saving and failing', async () => {
  const app = await harness({
    about: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return response({ data: { bloks: { text: 'Account based in', initial: 'India' } } });
    },
  });
  await app.setPendingRequests('near-cap', 310);
  const result = await app.fetchAudience('near-cap');
  assert.equal(result.ok, false);
  assert.match(result.error, /313 次 TikHub 请求上限/);
  assert.equal(app.apiCalls(), 3);
  const cache = app.storage.audienceCountryCache || {};
  assert.equal(Object.keys(cache).length, 1);
  assert.equal(Object.values(cache)[0].cc, 'IN');
  assert.deepEqual(app.storage.audiencePendingJobs, {});
});

test('service worker startup clears an orphan resume alarm when no job is pending', async () => {
  const app = await harness({
    initialAlarms: ['creator-intel-audience-resume'],
    about: async () => response({ data: { bloks: { text: 'Account based in', initial: 'India' } } }),
  });
  for (let attempt = 0; attempt < 20 && app.alarms.size; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.equal(app.alarms.size, 0);
});
