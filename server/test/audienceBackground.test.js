import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const extensionRoot = new URL('../../extension/src/', import.meta.url);

async function harness({ initialStorage = {}, about, storageDelay = 0 }) {
  const storage = { tikhubApiKey: 'test-key', cacheHours: 24, ...initialStorage };
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
      },
      identity: {},
    },
    fetch: async (input) => {
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
  return { start, storage };
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

test('disconnect cancels an unshared job and persists completed country lookups', async () => {
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
  assert.equal(result.ok, false);
  assert.match(result.error, /取消/);
  assert.ok(aboutCalls < 50);
  assert.ok(Object.keys(app.storage.audienceCountryCache || {}).length > 0);
});
