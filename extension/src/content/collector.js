// Read statistics already returned to the social page. No extra platform request is made.
(function () {
  const xViralCore = window.KolXViralCore;
  const KEYS = {
    id: ['id', 'id_str', 'aweme_id', 'video_id', 'media_id', 'pk', 'code'],
    views: ['playCount', 'play_count', 'view_count', 'ig_play_count', 'viewCount', 'video_view_count'],
    likes: ['diggCount', 'digg_count', 'like_count', 'likeCount'],
    comments: ['commentCount', 'comment_count'],
    shares: ['shareCount', 'share_count', 'reshare_count', 'forward_count'],
  };
  const seen = new Set();
  const history = new Map();
  const xSeen = new Map();
  const xRecords = new Map();
  const X_PUBLIC_POST_OPERATIONS = new Set([
    'HomeTimeline', 'HomeLatestTimeline', 'SearchTimeline', 'UserTweets',
    'UserTweetsAndReplies', 'TweetDetail', 'ListLatestTweetsTimeline',
    'CommunityTweetsTimeline',
  ]);

  function isXHost() {
    return /(^|\.)(x|twitter)\.com$/i.test(location.hostname);
  }

  function xOperation(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      return decodeURIComponent(path.match(/\/i\/api\/graphql\/[^/]+\/([^/?#]+)/i)?.[1] || '');
    } catch { return ''; }
  }

  function platform() {
    const host = location.hostname.toLowerCase();
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube';
    return '';
  }

  function isPublicContentPage() {
    const path = location.pathname.toLowerCase();
    const current = platform();
    if (current === 'x') return !/^\/(messages|settings|notifications|i\/chat)(?:\/|$)/.test(path);
    if (current === 'instagram') {
      if (/^\/(?:p|reel)\/[a-z0-9_-]+\/?$/i.test(path)) return true;
      const profile = path.match(/^\/([a-z0-9._]+)(?:\/reels)?\/?$/i)?.[1] || '';
      return Boolean(profile && !new Set(['accounts', 'direct', 'explore', 'reels', 'stories', 'web']).has(profile));
    }
    if (current === 'tiktok') return /^\/@[a-z0-9._-]+(?:\/video\/\d+)?\/?$/i.test(path);
    if (current === 'youtube') return /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?/i.test(path);
    return false;
  }

  function shouldInspectUrl(value) {
    if (!isPublicContentPage()) return false;
    let path = '';
    try { path = new URL(String(value || ''), location.origin).pathname; } catch { return false; }
    const current = platform();
    if (current === 'x') return X_PUBLIC_POST_OPERATIONS.has(xOperation(value));
    if (current === 'instagram') {
      return /^\/graphql\/query\/?$/i.test(path)
        || /^\/api\/v1\/(?:feed\/user\/|clips\/user\/|users\/[^/]+\/info\/?$)/i.test(path);
    }
    if (current === 'tiktok') return /^\/api\/(?:post\/item_list|recommend\/item_list|user\/list|item\/detail)\/?$/i.test(path);
    if (current === 'youtube') return /^\/youtubei\/v1\/(?:browse|next)\/?$/i.test(path);
    return false;
  }

  function shouldInspectResponse(url, response) {
    if (!shouldInspectUrl(url)) return false;
    const type = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    if (type && !/(?:json|javascript|text\/plain)/.test(type)) return false;
    const length = Number(response?.headers?.get?.('content-length'));
    return !Number.isFinite(length) || length <= 6e6;
  }

  async function readTextWithinLimit(response, limit = 6e6) {
    const reader = response?.body?.getReader?.();
    if (!reader) {
      const text = await response.text();
      return text.length <= limit ? text : null;
    }
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  }

  function publish(rows, pageKey = location.pathname) {
    if (!rows.length) return;
    const bucket = history.get(pageKey) || [];
    for (const row of rows) {
      const rowKey = row.id || `${row.views}:${row.likes}:${row.comments}:${row.shares}`;
      const signature = `${pageKey}:${rowKey}:${row.views}:${row.likes}:${row.comments}:${row.shares}:${row.engagementKnown}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const existing = row.id ? bucket.findIndex((item) => item.id === row.id) : -1;
      if (existing >= 0) bucket[existing] = { ...bucket[existing], ...row, pageKey };
      else bucket.push({ ...row, pageKey });
    }
    const recent = bucket.slice(-160);
    history.set(pageKey, recent);
    if (recent.length) window.postMessage({ __creatorInsightCollector: true, stats: recent }, '*');
  }

  function number(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    return null;
  }

  function pick(obj, keys) {
    for (const key of keys) {
      const value = number(obj[key]);
      if (value != null) return value;
    }
    return null;
  }

  function pickId(obj) {
    for (const key of KEYS.id) {
      const value = obj[key];
      if (typeof value === 'string' || typeof value === 'number') return String(value);
    }
    return '';
  }

  function walk(node, rows, budget) {
    if (!node || typeof node !== 'object' || budget.count <= 0) return;
    budget.count--;
    if (!Array.isArray(node)) {
      const views = pick(node, KEYS.views);
      const likes = pick(node, KEYS.likes);
      const comments = pick(node, KEYS.comments);
      const shares = pick(node, KEYS.shares);
      if (views != null && likes != null && comments != null) rows.push({
        id: pickId(node),
        views,
        likes,
        comments,
        shares: shares || 0,
        engagementKnown: true,
      });
    }
    for (const child of Object.values(node)) if (child && typeof child === 'object') walk(child, rows, budget);
  }

  function inspect(url, text) {
    if (!text || text.length > 6e6) return;
    if (isXHost()) {
      if (!X_PUBLIC_POST_OPERATIONS.has(xOperation(url))) return;
      let json;
      try { json = JSON.parse(text); } catch { return; }
      const changed = [];
      for (const tweet of xViralCore?.extractTweets(json) || []) {
        const previous = xRecords.get(tweet.id);
        const record = xViralCore?.mergeTweetRecord(previous, tweet) || tweet;
        xRecords.set(record.id, record);
        const signature = `${record.views}:${record.likes}:${record.retweets}:${record.replies}:${record.quotes}:${record.bookmarks}:${record.metricsComplete ? 1 : 0}`;
        if (xSeen.get(record.id) === signature) continue;
        xSeen.set(record.id, signature);
        changed.push(record);
      }
      while (xRecords.size > 2000) {
        const oldest = xRecords.keys().next().value;
        xRecords.delete(oldest);
        xSeen.delete(oldest);
      }
      if (changed.length) window.postMessage({ __kolXViralCollector: true, tweets: changed }, '*');
      return;
    }
    if (!/item_list|\/post\/|reel|feed|graphql|\/api\/|aweme/i.test(url)) return;
    let json;
    try { json = JSON.parse(text); } catch { return; }
    const rows = [];
    walk(json, rows, { count: 30000 });
    publish(rows);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.__kolXViralSnapshotRequest === true && isPublicContentPage() && xRecords.size) {
      window.postMessage({ __kolXViralCollector: true, tweets: [...xRecords.values()] }, '*');
    }
    if (event.data.__creatorInsightCollectorRequest === true) {
      const pageKey = String(event.data.pageKey || location.pathname);
      const rows = history.get(pageKey) || [];
      if (rows.length) window.postMessage({ __creatorInsightCollector: true, stats: rows }, '*');
    }
  });

  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (...args) {
      const requestContextAllowed = isPublicContentPage();
      return originalFetch.apply(this, args).then((response) => {
        try {
          const url = String(response.url || args[0] || '');
          if (requestContextAllowed && shouldInspectResponse(url, response)) {
            readTextWithinLimit(response.clone()).then((text) => {
              if (text != null) inspect(url, text);
            }).catch(() => {});
          }
        } catch {}
        return response;
      });
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_method, url) {
    this.__creatorInsightUrl = url;
    this.__creatorInsightPublic = isPublicContentPage();
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try {
        const url = String(this.responseURL || this.__creatorInsightUrl || '');
        const type = String(this.getResponseHeader?.('content-type') || '').toLowerCase();
        const length = Number(this.getResponseHeader?.('content-length'));
        if (!this.__creatorInsightPublic || !shouldInspectUrl(url)) return;
        if (type && !/(?:json|javascript|text\/plain)/.test(type)) return;
        if (Number.isFinite(length) && length > 6e6) return;
        if (this.responseType && this.responseType !== 'text') return;
        inspect(url, this.responseText);
      } catch {}
    });
    return originalSend.apply(this, arguments);
  };
})();
