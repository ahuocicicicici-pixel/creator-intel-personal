import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function source(path) {
  return readFile(new URL(`../../extension/${path}`, import.meta.url), 'utf8');
}

async function storeSource(path) {
  return readFile(new URL(`../../store/${path}`, import.meta.url), 'utf8');
}

async function loadGlobal(path, name) {
  const context = { Date, Map, Set, Object, Number, String, Math, globalThis: {} };
  vm.runInNewContext(await source(path), context);
  return context.globalThis[name];
}

test('engagement aggregation uses matched posts, stays stable at twelve, and rejects impossible rows', async () => {
  const metrics = await loadGlobal('src/content/metrics-core.js', 'CreatorIntelMetricsCore');
  const rows = Array.from({ length: 15 }, (_, index) => ({
    id: String(index + 1), views: 1000, likes: 50, comments: 10, shares: 0, engagementKnown: true,
  }));
  rows.splice(2, 0, { id: 'bad', views: 100, likes: 111, comments: 0, shares: 0, engagementKnown: true });
  const result = metrics.aggregate(rows, { minimum: 3, limit: 12 });
  assert.equal(result.sampleSize, 12);
  assert.equal(result.avgViews, 1000);
  assert.equal(result.avgEngagement, 60);
  assert.equal(result.engagementRate, 6);
  assert.deepEqual(Array.from(result.rows, (row) => row.id), Array.from({ length: 12 }, (_, index) => String(index + 1)));
});

test('engagement stays unavailable until three complete posts share the same denominator sample', async () => {
  const metrics = await loadGlobal('src/content/metrics-core.js', 'CreatorIntelMetricsCore');
  const result = metrics.aggregate([
    { views: 1000, likes: 20, comments: 2, shares: 1, engagementKnown: true },
    { views: 900, likes: 10, comments: null, shares: 0, engagementKnown: false },
  ]);
  assert.equal(result.engagementRate, null);
  assert.equal(result.avgViews, null);
});

test('personal manifest preserves creator reviews and loads the local X radar in the required worlds', async () => {
  const manifest = JSON.parse(await source('manifest.json'));
  assert.equal(manifest.version, '1.3.5');
  assert.deepEqual(manifest.permissions, ['storage', 'identity', 'alarms']);
  assert.deepEqual(manifest.content_scripts[0].js, ['src/content/x-viral-core.js', 'src/content/collector.js']);
  assert.deepEqual(manifest.content_scripts[1].js, ['src/content/metrics-core.js', 'src/content/engine.js']);
  assert.deepEqual(manifest.content_scripts[2].js, ['src/content/x-viral-ui-core.js', 'src/content/x-viral.js']);
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['assets/icons/icon-32.png'],
    matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  }]);
  const [engine, background, collector, radar, popup] = await Promise.all([
    source('src/content/engine.js'), source('src/background.js'), source('src/content/collector.js'), source('src/content/x-viral.js'), source('src/popup.html'),
  ]);
  assert.match(engine, /data-tab="reviews"/);
  assert.match(engine, /type: 'addReview'/);
  assert.match(engine, /data-audience-query/);
  assert.match(engine, /data-tab="audience"[^>]*>.*<span>受众画像<\/span>/);
  assert.doesNotMatch(engine, /class="fan-grid"/);
  assert.doesNotMatch(engine, /data-fan=/);
  assert.match(engine, /type: 'fetchAudience'/);
  assert.match(engine, /creator-intel-audience/);
  assert.match(engine, /可以刷新或关闭标签页，任务会在后台继续/);
  assert.match(engine, /进度自动保存/);
  assert.match(engine, /cached\.running\) startAudience\(false\)/);
  assert.match(engine, /type: 'ping'/);
  assert.doesNotMatch(engine, /audienceConfigured/);
  assert.match(background, /\/api\/reviews/);
  assert.match(background, /instagram\/v2\/fetch_post_likes/);
  assert.match(background, /instagram\/v3\/get_user_about/);
  assert.match(background, /get_user_about', \{ username: user\.username \}/);
  assert.match(background, /audienceCountryCache/);
  assert.match(background, /runtime\.onConnect/);
  assert.doesNotMatch(`${engine}\n${background}\n${popup}`, /粉丝画像/);
  assert.match(popup, /受众画像（TikHub，可选）/);
  assert.match(collector, /X_PUBLIC_POST_OPERATIONS/);
  assert.match(collector, /__kolXViralCollector/);
  assert.match(collector, /isPublicContentPage/);
  assert.ok(collector.indexOf('shouldInspectResponse(url, response)') < collector.indexOf('readTextWithinLimit(response.clone())'));
  assert.match(collector, /reader\.cancel\(\)/);
  assert.match(radar, /X 流速雷达/);
  assert.match(radar, /disabled-private-route/);
  assert.match(radar, /messages\|settings\|notifications\|i\\\/chat/);
  assert.match(radar, /function renderBadges\(\) \{\s+if \(!isPublicXPage\(\)\)/);
  assert.match(radar, /function renderPanel\(\) \{\s+if \(!isPublicXPage\(\)\)/);
  assert.doesNotMatch(radar, /fetch\s*\(/);
});

test('store materials disclose resumable audience-job metadata consistently', async () => {
  const materials = await Promise.all([
    storeSource('listing.md'),
    storeSource('submission-ready/LISTING.md'),
    storeSource('privacy-practices.md'),
    storeSource('submission-ready/PRIVACY-PRACTICES.md'),
  ]);
  for (const material of materials) {
    assert.match(material, /public (?:Instagram )?handle, start\/update timestamps and reserved TikHub request count/);
    assert.match(material, /Chrome alarms/);
    assert.match(material, /user-started/);
    assert.doesNotMatch(material, /Followers tab|Analyze follower profile/);
  }
});

test('Instagram audience core extracts public interactors and aggregates country tiers', async () => {
  const audience = await loadGlobal('src/audience-core.js', 'CreatorIntelAudienceCore');
  assert.deepEqual(Array.from(audience.reelCodes({ data: { items: [
    { code: 'PINNED', is_pinned: true, play_count: 10 },
    { code: 'REEL_A', is_pinned: false, play_count: 100 },
    { code: 'REEL_B', media_type: 2 },
  ] } })), ['REEL_A', 'REEL_B']);
  assert.deepEqual(Array.from(audience.postLikeUsers({ users: [
    { id: '10', username: 'one' }, { pk: '20', username: 'two' }, { id: '10', username: 'one' },
  ] }), (user) => ({ ...user })), [{ id: '10', username: 'one' }, { id: '20', username: 'two' }]);
  assert.equal(audience.countryFromAbout({ data: { bloks: { text: 'Account based in', unrelated: 'United States', initial: 'India' } } }), 'IN');
  assert.equal(audience.countryFromAbout({ data: { bloks: { text: 'Account based in' } } }), null);
  assert.equal(audience.countryFromAbout({ data: { message: 'temporary upstream error' } }), undefined);
  assert.equal(audience.countryFromAbout({ data: { bloks: { text: 'Account based in', initial: 'Albania' } } }), 'AL');
  assert.equal(audience.countryFromAbout({ data: { bloks: { text: 'Account based in', initial: 'Slovenia' } } }), 'SI');
  assert.equal(audience.countryFromAbout({ data: { bloks: { text: 'Account based in', initial: 'Estonia' } } }), 'EE');
  assert.equal(audience.countryFromAbout({ data: { payload: { layout: { bloks_payload: { data: [
    { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country_visibility', initial: true } },
    { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country', initial: 'Somalia' } },
  ] } } } } }), 'SO');
  assert.equal(audience.countryFromAbout({ data: { payload: { layout: { bloks_payload: { data: [
    { data: { key: 'IG_ABOUT_THIS_ACCOUNT:about_this_account_country', initial: 'Not shared' } },
  ] } } } } }), null);
  const result = audience.buildResult({ handle: 'creator', counts: { US: 3, IN: 1 }, analyzed: 5, target: 100, at: '2026-09-03T00:00:00.000Z' });
  assert.equal(result.valid, 4);
  assert.deepEqual({ ...result.tierPct }, { T1: 75, T2: 25, T3: 0 });
  assert.deepEqual(Array.from(result.topCountries, (item) => item.cc), ['US', 'IN']);
});

test('X GraphQL records provide the public metrics used by the velocity radar', async () => {
  const core = await loadGlobal('src/content/x-viral-core.js', 'KolXViralCore');
  const rows = core.extractTweets({ tweet_results: { result: {
    rest_id: '123',
    views: { count: '12000', state: 'EnabledWithCount' },
    legacy: {
      id_str: '123', created_at: 'Fri Aug 08 00:00:00 +0000 2026', favorite_count: 50,
      retweet_count: 4, reply_count: 3, quote_count: 1, full_text: 'public post',
    },
    core: { user_results: { result: { legacy: { screen_name: 'creator', name: 'Creator' } } } },
  } } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].views, 12000);
  assert.equal(rows[0].metricsComplete, true);
  assert.equal(Math.round(core.computeVelocity(12000, '2026-08-08T00:00:00Z', Date.parse('2026-08-08T06:00:00Z'))), 2000);
  assert.equal(core.computePublicEngagementRate({ views: 100, likes: 111, retweets: 0, replies: 0, quotes: 0 }), null);
  assert.equal(core.computePublicEngagementRate({ views: 99, likes: 1, retweets: 0, replies: 0, quotes: 0 }), null);
  assert.equal(core.formatPercent(null), '--');
  const merged = core.mergeTweetRecord(
    { views: 1000, likes: 20, retweets: 5, replies: 4, quotes: 3, bookmarks: 8, metricsComplete: true, metricsSource: 'graphql' },
    { views: 900, likes: 19, retweets: 4, replies: 3, quotes: 2, bookmarks: 7, metricsComplete: true, metricsSource: 'graphql' },
  );
  assert.deepEqual(
    [merged.views, merged.likes, merged.retweets, merged.replies, merged.quotes, merged.bookmarks, merged.metricsComplete],
    [1000, 20, 5, 4, 3, 8, true],
  );
});
