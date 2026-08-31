// Read statistics already returned to the social page. No extra platform request is made.
(function () {
  const KEYS = {
    views: ['playCount', 'play_count', 'view_count', 'ig_play_count', 'viewCount', 'video_view_count'],
    likes: ['diggCount', 'digg_count', 'like_count', 'likeCount'],
    comments: ['commentCount', 'comment_count'],
    shares: ['shareCount', 'share_count', 'reshare_count', 'forward_count'],
  };
  const seen = new Set();

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

  function walk(node, rows, budget) {
    if (!node || typeof node !== 'object' || budget.count <= 0) return;
    budget.count--;
    if (!Array.isArray(node)) {
      const views = pick(node, KEYS.views);
      const likes = pick(node, KEYS.likes) || 0;
      const comments = pick(node, KEYS.comments) || 0;
      if (views != null) {
        const signature = `${views}:${likes}:${comments}`;
        if (!seen.has(signature)) {
          seen.add(signature);
          rows.push({ views, likes, comments, shares: pick(node, KEYS.shares) || 0 });
        }
      }
    }
    for (const child of Object.values(node)) if (child && typeof child === 'object') walk(child, rows, budget);
  }

  function inspect(url, text) {
    if (!text || text.length > 6e6 || !/item_list|\/post\/|reel|feed|graphql|\/api\/|aweme/i.test(url)) return;
    let json;
    try { json = JSON.parse(text); } catch { return; }
    const rows = [];
    walk(json, rows, { count: 30000 });
    if (rows.length) window.postMessage({ __creatorInsightCollector: true, stats: rows }, '*');
  }

  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (...args) {
      return originalFetch.apply(this, args).then((response) => {
        try {
          const url = response.url || args[0];
          response.clone().text().then((text) => inspect(String(url), text)).catch(() => {});
        } catch {}
        return response;
      });
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (_method, url) {
    this.__creatorInsightUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try { inspect(String(this.__creatorInsightUrl || ''), this.responseText); } catch {}
    });
    return originalSend.apply(this, arguments);
  };
})();
