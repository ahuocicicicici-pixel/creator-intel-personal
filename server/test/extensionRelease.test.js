import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function source(path) {
  return readFile(new URL(`../../extension/${path}`, import.meta.url), 'utf8');
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
  assert.equal(manifest.version, '1.3.2');
  assert.deepEqual(manifest.content_scripts[0].js, ['src/content/x-viral-core.js', 'src/content/collector.js']);
  assert.deepEqual(manifest.content_scripts[1].js, ['src/content/metrics-core.js', 'src/content/engine.js']);
  assert.deepEqual(manifest.content_scripts[2].js, ['src/content/x-viral-ui-core.js', 'src/content/x-viral.js']);
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['assets/icons/icon-32.png'],
    matches: ['*://x.com/*', '*://*.x.com/*', '*://twitter.com/*', '*://*.twitter.com/*'],
  }]);
  const [engine, background, collector, radar] = await Promise.all([
    source('src/content/engine.js'), source('src/background.js'), source('src/content/collector.js'), source('src/content/x-viral.js'),
  ]);
  assert.match(engine, /data-tab="reviews"/);
  assert.match(engine, /type: 'addReview'/);
  assert.match(background, /\/api\/reviews/);
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
