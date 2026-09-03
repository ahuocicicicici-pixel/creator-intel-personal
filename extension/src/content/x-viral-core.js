// X 热帖流速的纯数据层。该文件会分别运行在 MAIN world（供 collector 解析
// GraphQL）和隔离世界（供 UI 计算/格式化），因此不能依赖 chrome.* API。
(function (root) {
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    leaderboardEnabled: true,
    topN: 10,
    trendingPerHour: 1000,
    viralPerHour: 10000,
  });
  const MIN_ENGAGEMENT_RATE_VIEWS = 100;

  function finiteNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
    return null;
  }

  function integerInRange(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function normalizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const trendingPerHour = integerInRange(
      source.trendingPerHour,
      DEFAULT_SETTINGS.trendingPerHour,
      1,
      1000000000,
    );
    const viralPerHour = Math.max(
      trendingPerHour,
      integerInRange(source.viralPerHour, DEFAULT_SETTINGS.viralPerHour, 1, 1000000000),
    );
    return {
      enabled: source.enabled !== false,
      leaderboardEnabled: source.leaderboardEnabled !== false,
      topN: integerInRange(source.topN, DEFAULT_SETTINGS.topN, 1, 30),
      trendingPerHour,
      viralPerHour,
    };
  }

  function computeVelocity(views, createdAt, now = Date.now()) {
    const count = finiteNumber(views);
    const created = Date.parse(createdAt);
    if (count == null || count < 0 || !Number.isFinite(created)) return null;
    const hours = Math.max((now - created) / 3600000, 0.1);
    return count / hours;
  }

  function computePublicEngagementRate(metrics) {
    const source = metrics && typeof metrics === 'object' ? metrics : {};
    const views = finiteNumber(source.views);
    if (views == null || views < MIN_ENGAGEMENT_RATE_VIEWS) return null;
    const values = ['likes', 'retweets', 'replies', 'quotes'].map((key) => finiteNumber(source[key]));
    if (source.metricsComplete === false || values.some((value) => value == null)) return null;
    const interactions = values.reduce((total, value) => total + Math.max(0, value), 0);
    if (interactions > views) return null;
    return (interactions / views) * 100;
  }

  function assessViewInflationRisk(metrics, createdAt, now = Date.now()) {
    const source = metrics && typeof metrics === 'object' ? metrics : {};
    const views = finiteNumber(source.views);
    const created = Date.parse(createdAt);
    const rate = computePublicEngagementRate(source);
    const ageHours = Number.isFinite(created) ? Math.max((now - created) / 3600000, 0) : null;
    if (views == null || rate == null || !Number.isFinite(ageHours)) {
      return { level: 'unknown', rate, ageHours, reason: 'missing-data' };
    }
    // 小样本和新帖的比率波动极大，不据此判断刷量风险。
    if (views < 10000 || ageHours < 2) {
      return { level: 'unknown', rate, ageHours, reason: views < 10000 ? 'small-sample' : 'new-post' };
    }
    if (views >= 20000 && rate < 0.1) {
      return { level: 'high', rate, ageHours, reason: 'very-low-interaction' };
    }
    if (rate < 0.3) {
      return { level: 'watch', rate, ageHours, reason: 'low-interaction' };
    }
    return { level: 'low', rate, ageHours, reason: 'within-range' };
  }

  function mergeTweetRecord(previous, incoming) {
    const merged = { ...(previous || {}), ...(incoming || {}) };
    for (const key of ['views', 'likes', 'retweets', 'replies', 'quotes', 'bookmarks']) {
      const oldValue = finiteNumber(previous?.[key]);
      const newValue = finiteNumber(incoming?.[key]);
      if (oldValue != null || newValue != null) merged[key] = Math.max(oldValue ?? 0, newValue ?? 0);
    }
    merged.metricsComplete = previous?.metricsComplete === true || incoming?.metricsComplete === true;
    if (previous?.metricsComplete === true && incoming?.metricsComplete !== true) {
      merged.metricsSource = previous.metricsSource;
    }
    return merged;
  }

  function classifyVelocity(velocity, settings) {
    const normalized = normalizeSettings(settings);
    if (!Number.isFinite(velocity)) return 'normal';
    if (velocity >= normalized.viralPerHour) return 'viral';
    if (velocity >= normalized.trendingPerHour) return 'trending';
    return 'normal';
  }

  function formatCompact(value) {
    const count = Number(value) || 0;
    if (count >= 1000000000) return `${(count / 1000000000).toFixed(1)}B`;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(Math.round(count));
  }

  function formatPercent(value) {
    const rate = finiteNumber(value);
    if (rate == null || rate < 0 || rate > 100) return '--';
    if (rate < 1) return `${rate.toFixed(2)}%`;
    if (rate < 10) return `${rate.toFixed(1)}%`;
    return `${Math.round(rate)}%`;
  }

  function parseCompact(value) {
    const match = String(value || '')
      .replace(/[\u00a0\u202f]/g, ' ')
      .match(/(\d(?:[\d.,]*\d)?(?:\s+\d{3})*)\s*(mil|mio|mln|万|萬|亿|億|千|[KkMmBb])?(?=\s|$|[^\p{L}\d])/u);
    if (!match) return null;
    const unit = (match[2] || '').toLowerCase();
    let raw = match[1].replace(/\s/g, '');
    const separators = [...raw.matchAll(/[.,]/g)].map((item) => item.index);
    if (separators.length) {
      const last = separators.at(-1);
      const decimals = raw.length - last - 1;
      const decimalSeparator = decimals > 0 && decimals <= 2 ? raw[last] : '';
      raw = raw.replace(/[.,]/g, (separator, index) => (separator === decimalSeparator && index === last ? '.' : ''));
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) return null;
    const multiplier = unit === '万' || unit === '萬' ? 1e4 : unit === '亿' || unit === '億' ? 1e8
      : unit === '千' || unit === 'mil' || unit === 'k' ? 1e3
        : unit === 'm' || unit === 'mio' || unit === 'mln' ? 1e6 : unit === 'b' ? 1e9 : 1;
    return Math.round(number * multiplier);
  }

  function unwrapTweetResult(result) {
    let current = result;
    const visited = new Set();
    while (current && typeof current === 'object' && !visited.has(current)) {
      visited.add(current);
      if (current.tweet && typeof current.tweet === 'object') {
        current = current.tweet;
        continue;
      }
      if (current.result && typeof current.result === 'object' && !current.legacy) {
        current = current.result;
        continue;
      }
      break;
    }
    return current;
  }

  function extractTweet(result) {
    const tweet = unwrapTweetResult(result);
    const legacy = tweet?.legacy;
    if (!legacy) return null;
    if (legacy.promotedMetadata || tweet.promotedMetadata) return null;
    const id = String(legacy.id_str || tweet.rest_id || '');
    const createdAt = legacy.created_at || '';
    const views = finiteNumber(tweet.views?.count);
    if (!id || !createdAt || views == null || tweet.views?.state === 'Disabled') return null;

    const user = tweet.core?.user_results?.result || {};
    const userLegacy = user.legacy || {};
    const userCore = user.core || {};
    const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
    const likes = finiteNumber(legacy.favorite_count);
    const retweets = finiteNumber(legacy.retweet_count);
    const replies = finiteNumber(legacy.reply_count);
    const quotes = finiteNumber(legacy.quote_count);
    return {
      id,
      views,
      createdAt,
      likes: likes ?? 0,
      retweets: retweets ?? 0,
      replies: replies ?? 0,
      quotes: quotes ?? 0,
      bookmarks: finiteNumber(legacy.bookmark_count) || 0,
      metricsComplete: [likes, retweets, replies, quotes].every((value) => value != null),
      metricsSource: 'graphql',
      text: noteText || legacy.full_text || '',
      screenName: userLegacy.screen_name || userCore.screen_name || '',
      displayName: userLegacy.name || userCore.name || '',
      isArticle: Boolean(tweet.article?.article_results?.result),
    };
  }

  function extractTweets(json, limit = 50000) {
    const records = new Map();
    const visited = new Set();
    let remaining = limit;

    function add(result) {
      const record = extractTweet(result);
      if (record) records.set(record.id, record);
    }

    function walk(node) {
      if (!node || typeof node !== 'object' || remaining <= 0 || visited.has(node)) return;
      remaining--;
      visited.add(node);
      add(node.tweet_results?.result);
      add(node.tweetResult?.result);
      add(node.tweetResults?.result);
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
      } else {
        for (const value of Object.values(node)) walk(value);
      }
    }

    walk(json);
    return [...records.values()];
  }

  root.KolXViralCore = Object.freeze({
    DEFAULT_SETTINGS,
    normalizeSettings,
    computeVelocity,
    computePublicEngagementRate,
    assessViewInflationRisk,
    mergeTweetRecord,
    classifyVelocity,
    formatCompact,
    formatPercent,
    parseCompact,
    extractTweet,
    extractTweets,
  });
})(globalThis);
