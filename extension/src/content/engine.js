(function () {
  const metricsCore = globalThis.CreatorIntelMetricsCore;
  const HOST_ID = 'creator-insight-panel-host';
  const PLATFORM = [
    {
      code: 'TT', hosts: ['tiktok.com'], path: '^/@([^/?#]+)', reserved: [],
      avatars: ['[data-e2e="user-avatar"]', '[data-e2e="user-page"] img', 'h1 + div img'],
      follower: { selector: '[data-e2e="followers-count"]' },
      items: '[data-e2e="user-post-item"]', pinned: ['置顶', 'Pinned'],
    },
    {
      code: 'IG', hosts: ['instagram.com'], path: '^/([^/?#]+)',
      reserved: ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct', 'about', 'developer', 'legal', 'directory'],
      avatars: ['header img', 'header a img'],
      follower: { scope: 'header', regex: '([\\d.,]+[万亿KMB]?)\\s*(?:粉丝|followers)' },
      items: 'a[href*="/reel/"]',
    },
    {
      code: 'YT', hosts: ['youtube.com'], path: '^/@([^/?#]+)', reserved: [],
      avatars: ['yt-page-header-renderer img.ytSpecAvatarShapeImage', 'yt-page-header-renderer #avatar img', '#page-header img.ytSpecAvatarShapeImage', '#channel-header #avatar img'],
      follower: { scope: 'yt-page-header-renderer, #page-header', regex: '([\\d.,]+[万亿KMB]?)\\s*(?:位订阅者|订阅者|subscribers)' },
      items: 'ytd-rich-item-renderer, ytd-grid-video-renderer',
    },
    {
      code: 'X', hosts: ['x.com', 'twitter.com'], path: '^/([^/?#]+)',
      reserved: ['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'search', 'hashtag', 'compose', 'login', 'signup', 'tos', 'privacy', 'about', 'jobs'],
      avatars: ['[data-testid^="UserAvatar-Container"]', 'a[href$="/photo"] img'],
      follower: { scope: '[data-testid="primaryColumn"]', regex: '([\\d.,]+[万亿KMB]?)\\s*(?:Followers|关注者|位关注者)' },
    },
  ];

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .card { width: 264px; max-height: min(568px, calc(100vh - 24px)); overflow: hidden; border: 1px solid rgba(32,33,36,.08); border-radius: 14px; background: #fff;
      color: #202124; box-shadow: 0 12px 32px rgba(15,23,42,.16); font: 12px/1.45 -apple-system, "SF Pro Text", BlinkMacSystemFont, "PingFang SC", sans-serif;
      display:flex; flex-direction:column; }
    .head { display: flex; align-items: center; gap: 8px; min-height: 37px; padding: 8px 12px; border-bottom: 1px solid #f0f1f2;
      background: #fff; cursor: move; user-select: none; }
    .platform { padding: 2px 8px; border-radius: 999px; background: #202329; color: #fff; font-size: 10px; font-weight: 800; }
    .pf-TT .platform { background: #fe2c55; } .pf-YT .platform { background: #f00; } .pf-X .platform { background: #111; }
    .pf-IG .platform { background: #b82b7d; }
    .handle { min-width: 0; overflow: hidden; color: #4f555d; font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
    .head-fans { margin-left:auto; color:#8a9099; font-size:10px; font-weight:600; white-space:nowrap; }
    .min { width: 24px; height: 24px; margin-left: auto; padding: 0; border: 0; border-radius: 5px; background: transparent; color: #737983;
      cursor: pointer; font-size: 17px; font-weight: 700; }
    .min:hover { background: #e8eaed; }
    .card-scroll { min-height:0; flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; }
    .content { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .section-title { color: #858a93; font-size: 10px; font-weight: 750; text-transform: uppercase; }
    .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .metric { min-width: 0; padding: 7px 8px; border-radius: 6px; background: #f3f4f6; }
    .metric b { display: block; overflow: hidden; color: #202329; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
    .metric span { display: block; color: #858a93; font-size: 10px; }
    .library { display: none; padding: 8px 9px; border: 1px solid #dbe7df; border-radius: 7px; background: #f4faf6; }
    .library.show { display: block; }
    .libraryhead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; color: #27704c; font-size: 10px; font-weight: 800; }
    .libraryrows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
    .libraryrows span { color: #68736d; font-size: 10px; }
    .libraryrows b { display: block; overflow: hidden; color: #26312b; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .owner-data { display: none; padding-top: 8px; margin-top: 8px; border-top: 1px solid #dbe7df; }
    .owner-data.show { display: block; }
    .owner-title { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px; color: #bd4b45; font-size: 10px; font-weight: 800; }
    .owner-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
    .owner-grid span { min-width: 0; color: #68736d; font-size: 10px; }
    .owner-grid b { display: block; overflow: hidden; color: #26312b; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .collabs { margin-top: 6px; color: #68736d; font-size: 10px; }
    .collabs b { color: #26312b; }
    .collab-post { display: flex; justify-content: space-between; gap: 8px; padding-top: 4px; }
    .api { padding-top: 9px; border-top: 1px solid #eceef1; }
    .apihead { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
    .apihead b { font-size: 11px; }
    .verified { color: #2d6cdf; font-weight: 800; }
    .name { overflow: hidden; margin-bottom: 7px; color: #555b64; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .rows { display: flex; flex-direction: column; gap: 4px; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .row span { color: #858a93; font-size: 11px; } .row b { color: #444a52; font-size: 11px; text-align: right; }
    .query { width: 100%; min-height: 34px; margin-top: 9px; padding: 7px 9px; border: 1px solid #cfd3d9; border-radius: 7px;
      background: #fff; color: #202329; cursor: pointer; font: 650 11px/1.35 inherit; }
    .query:hover { background: #f5f6f7; } .query:disabled { opacity: .58; cursor: default; }
    .message { min-height: 16px; margin-top: 6px; color: #858a93; font-size: 10px; }
    .message.error { color: #c33f3f; }
    .audience-analysis { padding-top:2px; }
    .audience-title { color:#30343a; font-size:11px; font-weight:750; }
    .audience-copy { margin-top:3px; color:#777e88; font-size:9px; line-height:1.5; }
    .aud-query { width:100%; min-height:34px; margin-top:9px; padding:7px 9px; border:0; border-radius:7px; background:#20242a;
      color:#fff; cursor:pointer; font:700 11px/1.35 -apple-system,"SF Pro Text",system-ui,"PingFang SC",sans-serif; }
    .aud-query:hover { background:#353a42; } .aud-query:disabled { opacity:.58; cursor:default; }
    .aud-status { min-height:15px; margin-top:6px; color:#858a93; font-size:9px; }
    .aud-status.error { color:#c33f3f; }
    .aud-result { margin-top:9px; padding:9px; border:1px solid #e5e7eb; border-radius:8px; background:#fafafa; }
    .aud-result-head { display:flex; justify-content:space-between; gap:8px; margin-bottom:7px; color:#4c535d; font-size:9px; }
    .aud-result-head b { color:#252a31; font-size:10px; }
    .aud-tier { display:grid; grid-template-columns:42px 1fr 30px; align-items:center; gap:6px; margin-top:5px; color:#68707a; font-size:9px; }
    .aud-tier b { color:#3f464f; font-size:9px; text-align:right; }
    .aud-bar { height:5px; overflow:hidden; border-radius:999px; background:#e6e8eb; }
    .aud-bar i { display:block; height:100%; border-radius:inherit; background:#7c8795; }
    .aud-tier.t1 .aud-bar i { background:#15905a; } .aud-tier.t2 .aud-bar i { background:#d69b26; }
    .aud-countries { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
    .aud-country { padding:2px 5px; border-radius:999px; background:#eef0f2; color:#515862; font-size:8px; }
    .aud-result-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px; color:#8a9099; font-size:8px; }
    .aud-refresh { padding:2px 0; border:0; background:none; color:#b82b7d; cursor:pointer; font:700 8px inherit; }
    .foot { padding: 10px 12px 12px; background:#fff; }
    .personal-entry { min-height:34px; display:flex; align-items:center; justify-content:center; gap:7px; border-radius:8px; background:#f4f5f6; color:#4a5058; font-size:10px; font-weight:700; }
    .personal-entry b { color:#20242a; }
    .ico { width:14px; height:14px; flex:0 0 auto; }
    .signals { border-block:1px solid #eef0f2; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .signal { min-width:0; padding:8px 0; display:flex; align-items:baseline; justify-content:space-between; gap:6px; }
    .signal:nth-child(even) { padding-left:12px; border-left:1px solid #eef0f2; }
    .signal:nth-child(n+3) { border-top:1px solid #eef0f2; }
    .signal span { min-width:0; overflow:hidden; color:#8a9099; font-size:9px; white-space:nowrap; text-overflow:ellipsis; }
    .signal b { overflow:hidden; color:#30343a; font-size:13px; font-weight:730; white-space:nowrap; text-overflow:ellipsis; }
    .kol-tabs { display:grid; grid-auto-flow:column; grid-auto-columns:1fr; border-bottom:1px solid #eef0f2; }
    .kol-tab { position:relative; min-width:0; height:30px; padding:0 6px; border:0; background:transparent; color:#626a74;
      display:inline-flex; align-items:center; justify-content:center; gap:4px; cursor:pointer; font:600 10px/1 -apple-system,"SF Pro Text",system-ui,"PingFang SC",sans-serif; }
    .kol-tab.active { color:#20242a; }
    .kol-tab.active::after { content:""; position:absolute; right:14px; bottom:-1px; left:14px; height:2px; border-radius:2px 2px 0 0; background:#20242a; }
    .tab-count { min-width:14px; height:14px; margin-left:3px; padding:0 4px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center;
      color:#6b7280; background:#edf0f2; font-size:8px; }
    .kol-panel { padding-top:6px; }
    .panel-empty { min-height:54px; display:flex; align-items:center; justify-content:center; color:#8a9099; font-size:11px; text-align:center; }
    .commercial { display:none; align-items:flex-end; justify-content:space-between; gap:12px; padding-bottom:10px; border-bottom:1px solid #eef0f2; }
    .commercial.show { display:flex; }
    .price { min-width:0; display:flex; flex-direction:column; }
    .price .num { color:#202124; font-size:20px; font-weight:780; line-height:1.1; }
    .price .label { order:-1; color:#8a9099; font-size:9px; font-weight:650; }
    .collab-pill { display:inline-flex; align-items:center; gap:5px; color:#69717b; font-size:9px; font-weight:650; }
    .collab-pill i { width:6px; height:6px; border-radius:50%; background:#15905a; }
    .library { padding:0; border:0; border-radius:0; background:#fff; }
    .libraryhead { color:#59616b; }
    .libraryrows { padding:7px 0; border-bottom:1px solid #eef0f2; }
    .owner-data { margin-top:0; padding-top:0; border-top:0; }
    .api { padding-top:2px; border-top:0; }
    .query { min-height:32px; padding:6px 9px; font-size:11px; }
    .rv-wrap { display:flex; min-height:0; flex-direction:column; gap:7px; }
    .rv-list { display:flex; flex-direction:column; }
    .rv-item { padding:8px 2px; }
    .rv-item + .rv-item { border-top:1px solid #eef0f2; }
    .rv-meta { display:flex; align-items:center; gap:5px; color:#6b7280; font-size:10px; }
    .rv-meta b { color:#3c4043; font-size:10px; }
    .rv-tag { padding:1px 5px; border-radius:999px; font-size:9px; font-weight:700; }
    .rv-ok { color:#138a4a; background:#e7f7ee; } .rv-warn { color:#b45309; background:#fff4e5; } .rv-bad { color:#c0202a; background:#fdecec; }
    .rv-date { margin-left:auto; } .rv-delete { padding:0 2px; border:0; background:none; color:#c2185b; cursor:pointer; font-weight:700; }
    .rv-body { margin-top:3px; color:#1f2329; font-size:11px; white-space:pre-wrap; word-break:break-word; }
    .rv-compose { padding-top:6px; border-top:1px solid #eef0f2; }
    .rv-compose summary { min-height:28px; display:flex; align-items:center; justify-content:center; border-radius:6px; color:#4a5058; cursor:pointer; font-size:11px; font-weight:650; list-style:none; }
    .rv-compose summary::-webkit-details-marker { display:none; }
    .rv-form { margin-top:6px; display:flex; flex-direction:column; gap:5px; }
    .rv-select,.rv-text { width:100%; padding:5px 7px; border:1px solid #d7dbe0; border-radius:7px; background:#fff; color:#1f2329; font:11px inherit; }
    .rv-text { min-height:44px; max-height:70px; resize:vertical; }
    .rv-submit { width:100%; padding:6px 10px; border:0; border-radius:7px; background:#e11d63; color:#fff; cursor:pointer; font-size:11px; font-weight:700; }
    .rv-submit:disabled { background:#c9ced3; cursor:default; }
    .rv-message { min-height:0; color:#6b7280; font-size:10px; } .rv-message.error { color:#e24b4a; } .rv-message.ok { color:#138a4a; }
    .cp-wrap { margin-top:1px; }
    .cp-head { display:flex; align-items:center; justify-content:space-between; color:#59616b; font-size:10px; font-weight:650; }
    .cp-head b { color:#9a9fa7; font-size:9px; font-weight:600; }
    .cp-item { display:block; padding:8px 1px; color:inherit; text-decoration:none; }
    .cp-older .cp-item { border-top:1px solid #eef0f2; }
    a.cp-item:hover { background:#fff8fb; }
    .cp-top { display:flex; align-items:center; gap:6px; min-width:0; }
    .cp-top b { min-width:0; overflow:hidden; color:#30353b; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .cp-date { margin-left:auto; flex:0 0 auto; color:#6b7280; font-size:9px; }
    .cp-open { color:#c2185b; font-size:11px; font-weight:700; }
    .cp-metrics { display:flex; align-items:center; gap:8px; margin-top:4px; color:#6b7280; font-size:9px; }
    .cp-metrics b { color:#3c4043; font-size:10px; font-variant-numeric:tabular-nums; }
    .cp-window { margin-left:auto; padding:1px 5px; border-radius:999px; background:#f1f3f5; color:#626a74; font-size:8px; font-weight:700; }
    .cp-more,.record-details { border-top:1px solid #eef0f2; }
    .cp-more summary,.record-details summary { min-height:34px; display:flex; align-items:center; justify-content:space-between; color:#737a84; cursor:pointer; font-size:9px; font-weight:600; list-style:none; }
    .cp-more summary::-webkit-details-marker,.record-details summary::-webkit-details-marker { display:none; }
    .record-rows { padding:2px 1px 8px; display:flex; flex-direction:column; gap:6px; }
    .record-row { display:flex; justify-content:space-between; gap:10px; color:#6b7280; font-size:10px; }
    .record-row b { color:#3c4043; font-size:11px; }
    .panel-empty.compact { min-height:38px; }
    .card.minimized { width: auto; }
    .card.minimized .card-scroll, .card.minimized .foot, .card.minimized .handle, .card.minimized .head-fans { display: none; }
    .card.minimized .head { border-bottom: 0; }
    .card.minimized .min { margin-left: 0; }
  `;

  const ICONS = {
    overview: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    followers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    reviews: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 8h8"/><path d="M8 12h6"/>',
  };
  const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  let currentKey = '';
  let collected = [];
  const collectedIndex = new Map();
  let collectedSnapshot = [];
  let domSnapshot = [];
  let activePanel = null;
  let moveHandler = null;
  let upHandler = null;
  let localRetryTimer = null;
  let metricsRenderTimer = null;

  const ask = (message) => new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response);
    });
  });

  const runAudienceRequest = (message) => new Promise((resolve) => {
    const port = chrome.runtime.connect({ name: 'creator-intel-audience' });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      try { port.disconnect(); } catch {}
      resolve(value);
    };
    const heartbeat = setInterval(() => {
      try { port.postMessage({ type: 'ping' }); } catch { finish(null); }
    }, 20_000);
    port.onMessage.addListener((event) => {
      if (event?.type === 'audienceResult') finish(event.response || null);
    });
    port.onDisconnect.addListener(() => finish(null));
    port.postMessage(message);
  });

  function parseCount(value) {
    if (!value) return null;
    const match = String(value).replace(/\s/g, '').match(/([\d.,]+)([万亿KkMmBb])?/);
    if (!match) return null;
    const base = Number(match[1].replace(/,/g, ''));
    const unit = match[2] || '';
    const multiplier = unit === '万' ? 1e4 : unit === '亿' ? 1e8 : /k/i.test(unit) ? 1e3 : /m/i.test(unit) ? 1e6 : /b/i.test(unit) ? 1e9 : 1;
    return Number.isFinite(base) ? Math.round(base * multiplier) : null;
  }

  function formatCount(value) {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    if (number >= 1e9) return `${(number / 1e9).toFixed(1)}B`;
    if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(1)}K`;
    return number.toLocaleString('en-US');
  }

  function formatRate(engagement, views) {
    if (!engagement || !views) return '—';
    const rate = Number(engagement) / Number(views) * 100;
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return '—';
    if (rate < 0.01) return '<0.01%';
    return `${rate.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
  }

  function formatPercent(rate) {
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100) return '—';
    if (rate < 0.01) return '<0.01%';
    return `${rate.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
  }

  function detect() {
    let url;
    try { url = new URL(location.href); } catch { return null; }
    const host = url.hostname.replace(/^www\./, '');
    const config = PLATFORM.find((item) => item.hosts.some((value) => host.includes(value)));
    if (!config) return null;
    const match = url.pathname.match(new RegExp(config.path));
    if (!match || !match[1]) return null;
    const handle = match[1].replace(/^@/, '');
    if (config.reserved.map((value) => value.toLowerCase()).includes(handle.toLowerCase())) return null;
    return { ...config, handle };
  }

  function scrapeFollowers(config) {
    const source = config.follower;
    if (!source) return null;
    try {
      if (source.selector) return parseCount(document.querySelector(source.selector)?.textContent);
      const scope = source.scope ? document.querySelector(source.scope) : document.body;
      const match = (scope?.innerText || '').match(new RegExp(source.regex, 'i'));
      return match ? parseCount(match[1]) : null;
    } catch { return null; }
  }

  function domAverages(config) {
    const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    const pageRows = [];
    try {
      for (const item of [...document.querySelectorAll(config.items || '')].slice(0, 24)) {
        const pinned = item.querySelector('img[alt*="置顶"], svg[aria-label*="置顶"], svg[aria-label*="固定"], [aria-label*="Pinned" i]');
        if (pinned) continue;
        const text = (item.innerText || item.textContent || '')
          .replace(/[\d.]+\s*%/g, ' ')
          .replace(/[\d.]+\s*[XxＸ]/g, ' ');
        if ((config.pinned || []).some((word) => text.includes(word))) continue;
        const values = [...text.matchAll(/([\d.,]+)\s*([万亿KkMmBb]?)/g)].map((match) => parseCount(match[1] + match[2])).filter((value) => value > 0).sort((a, b) => b - a);
        if (!values.length) continue;
        pageRows.push({ views: values[0], engagement: values.length >= 3 ? values[1] + values[2] : null });
        if (pageRows.length >= 10) break;
      }
    } catch {}
    if (domSnapshot.length < 3 && pageRows.length >= 3) domSnapshot = pageRows.slice(0, 10);
    const stablePageRows = domSnapshot.length >= 3 ? domSnapshot : pageRows;
    const liveMetrics = metricsCore?.aggregate(collected, { minimum: 3, limit: 12 })
      || { rows: [], sampleSize: 0, avgViews: null, avgEngagement: null, engagementRate: null };
    const stableMetrics = collectedSnapshot.length >= 3
      ? metricsCore.aggregate(collectedSnapshot, { minimum: 3, limit: 12 })
      : liveMetrics;
    const avgViews = stableMetrics.avgViews != null
      ? stableMetrics.avgViews
      : stablePageRows.length >= 3 ? average(stablePageRows.map((row) => row.views)) : null;
    const avgEngagement = stableMetrics.avgEngagement;
    const engagementRate = stableMetrics.engagementRate;
    const sampleSize = stableMetrics.sampleSize >= 3 ? stableMetrics.sampleSize : stablePageRows.length;
    if (avgViews || avgEngagement) return { avgViews, avgEngagement, engagementRate, sampleSize };
    return {
      avgViews: null,
      avgEngagement: null,
      engagementRate: null,
      sampleSize: pageRows.length,
    };
  }

  function setText(root, selector, text) {
    const element = root.querySelector(selector);
    if (element) element.textContent = text;
  }

  function setRow(root, name, value, show = value != null && value !== '') {
    const row = root.querySelector(`[data-row="${name}"]`);
    if (!row) return;
    row.style.display = show ? '' : 'none';
    if (show) row.querySelector('b').textContent = value;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function formatMoney(value) {
    if (value == null || value === '') return null;
    const number = Number(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(number) && number > 0 ? `$${number.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : String(value);
  }

  function formatStoredRate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const parsed = Number(raw.replace(/[%\s,]/g, ''));
    if (!Number.isFinite(parsed)) return raw;
    const percentage = raw.includes('%') || parsed > 1 ? parsed : parsed * 100;
    return `${percentage.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`;
  }

  function ownerPrivateHtml(value) {
    if (!value || typeof value !== 'object') return '';
    const collaboration = value.collaboration || {};
    const posts = (Array.isArray(collaboration.posts) ? collaboration.posts : [])
      .filter((post) => post && (post.product || post.date || post.views || post.engagementRate || post.link))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    if (!posts.length) return '<div class="panel-empty compact">暂无合作明细</div>';
    const item = (post) => {
      const link = safeHttpUrl(post.link);
      const tag = link ? 'a' : 'div';
      const attrs = link ? ` href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"` : '';
      const metrics = [
        post.views ? `<span><b>${escapeHtml(formatCount(Number(post.views) || parseCount(post.views)))}</b> Views</span>` : '',
        post.engagementRate ? `<span><b>${escapeHtml(formatStoredRate(post.engagementRate))}</b> 互动率</span>` : '',
      ].filter(Boolean).join('');
      const windowLabel = post.metricsWindow ? `<span class="cp-window">${escapeHtml(post.metricsWindow)}</span>` : '';
      return `<${tag} class="cp-item"${attrs}><div class="cp-top"><b>${escapeHtml(post.product || '历史合作')}</b>${post.date ? `<span class="cp-date">${escapeHtml(post.date)}</span>` : ''}${link ? '<span class="cp-open">↗</span>' : ''}</div><div class="cp-metrics">${metrics || '<span>暂无效果数据</span>'}${windowLabel}</div></${tag}>`;
    };
    const older = posts.length > 1 ? `<details class="cp-more"><summary>更早的 ${posts.length - 1} 条记录<span>⌄</span></summary><div class="cp-older">${posts.slice(1).map(item).join('')}</div></details>` : '';
    return `<div class="cp-wrap"><div class="cp-head"><span>最近合作</span><b>${posts.length} 条</b></div>${item(posts[0])}${older}</div>`;
  }

  function reviewClass(rating) {
    return rating === '推荐' ? 'rv-ok' : rating === '拉黑' ? 'rv-bad' : 'rv-warn';
  }

  function reviewDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function renderReviews(root, context, config) {
    const reviews = Array.isArray(context?.reviews) ? context.reviews : [];
    const count = root.querySelector('[data-review-count]');
    if (count) count.textContent = String(reviews.length);
    const list = reviews.length
      ? `<div class="rv-list">${reviews.map((review) => `<div class="rv-item"><div class="rv-meta"><b>${escapeHtml(review.author || 'Google 用户')}</b>${review.rating ? `<span class="rv-tag ${reviewClass(review.rating)}">${escapeHtml(review.rating)}</span>` : ''}<span class="rv-date">${escapeHtml(reviewDate(review.createdAt))}</span>${review.canDelete ? `<button class="rv-delete" type="button" data-review-delete="${escapeHtml(review.id)}" title="删除评价">✕</button>` : ''}</div><div class="rv-body">${escapeHtml(review.body)}</div></div>`).join('')}</div>`
      : '<div class="panel-empty">暂无评价</div>';
    const panel = root.querySelector('[data-panel="reviews"]');
    if (!panel) return;
    panel.innerHTML = `<div class="rv-wrap">${list}<details class="rv-compose"><summary>＋ 写评价</summary><div class="rv-form"><select class="rv-select"><option value="">无标签</option><option value="推荐">推荐</option><option value="谨慎">谨慎</option><option value="拉黑">拉黑</option></select><textarea class="rv-text" maxlength="600" placeholder="写点评价，登录用户可见…"></textarea><button class="rv-submit" type="button">提交评价</button><div class="rv-message"></div></div></details></div>`;
    wireReviews(root, config);
  }

  function wireTabs(root) {
    const tabs = [...root.querySelectorAll('[data-tab]')];
    const activate = (name) => {
      tabs.forEach((tab) => {
        const active = tab.dataset.tab === name;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      root.querySelectorAll('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    };
    tabs.forEach((tab) => tab.addEventListener('click', () => activate(tab.dataset.tab)));
    activate('overview');
  }

  function wireReviews(root, config) {
    const panel = root.querySelector('[data-panel="reviews"]');
    if (!panel) return;
    panel.querySelectorAll('.rv-select,.rv-text').forEach((field) => {
      ['keydown', 'keyup', 'keypress'].forEach((eventName) => field.addEventListener(eventName, (event) => event.stopPropagation()));
    });
    const submit = panel.querySelector('.rv-submit');
    const message = panel.querySelector('.rv-message');
    submit?.addEventListener('click', async () => {
      const body = panel.querySelector('.rv-text')?.value.trim() || '';
      const rating = panel.querySelector('.rv-select')?.value || '';
      if (!body) { message.textContent = '请先填写评价内容'; message.className = 'rv-message error'; return; }
      submit.disabled = true; message.textContent = '提交中…'; message.className = 'rv-message';
      const result = await ask({ type: 'addReview', platform: config.code, handle: config.handle, rating, body });
      submit.disabled = false;
      if (!result?.ok) { message.textContent = result?.error || '提交失败，请重试'; message.className = 'rv-message error'; return; }
      renderReviews(root, result.context, config);
    });
    panel.querySelectorAll('[data-review-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.dataset.confirm !== '1') {
          button.dataset.confirm = '1'; button.textContent = '确认?';
          setTimeout(() => { if (button.isConnected && button.dataset.confirm === '1') { button.dataset.confirm = ''; button.textContent = '✕'; } }, 3000);
          return;
        }
        button.disabled = true;
        const result = await ask({ type: 'deleteReview', platform: config.code, handle: config.handle, id: button.dataset.reviewDelete });
        if (result?.ok) renderReviews(root, result.context, config);
        else { button.disabled = false; button.textContent = '失败'; }
      });
    });
  }

  function showProfile(root, profile) {
    const api = root.querySelector('.api');
    if (api) api.dataset.loaded = '1';
    setText(root, '.name', profile.name || `@${profile.handle}`);
    const verified = root.querySelector('.verified');
    if (verified) verified.style.display = profile.verified ? '' : 'none';
    setRow(root, 'followers', formatCount(profile.followers), profile.followers != null);
    setRow(root, 'following', formatCount(profile.following), profile.following != null);
    setRow(root, 'posts', formatCount(profile.posts), profile.posts != null);
    setRow(root, 'likes', formatCount(profile.totalLikes), profile.totalLikes != null);
    setRow(root, 'avgViews', formatCount(profile.avgViews), profile.avgViews != null);
    setRow(root, 'avgEngagement', formatCount(profile.avgEngagement), profile.avgEngagement != null);
    setRow(root, 'country', profile.country, Boolean(profile.country));
    setRow(root, 'updated', profile.fetchedAt ? new Date(profile.fetchedAt).toLocaleString() : '', Boolean(profile.fetchedAt));
  }

  function showLibrary(root, library, config) {
    const section = root.querySelector('.library');
    if (!section) return;
    renderReviews(root, library, config);
    setText(root, '.handle', library?.found ? '库中记录' : '公开资料');
    const empty = root.querySelector('.no-library');
    if (!library || library.error || !library.found) {
      section.classList.remove('show');
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    section.classList.add('show');
    const record = library.record || {};
    setText(root, '[data-library="followers"]', formatCount(parseCount(record.followers)));
    setText(root, '[data-library="views"]', formatCount(parseCount(record.avgViews)));
    const owner = root.querySelector('.owner-data');
    const ownerHtml = ownerPrivateHtml(record.private);
    owner.classList.toggle('show', Boolean(ownerHtml));
    owner.querySelector('[data-owner-content]').innerHTML = ownerHtml;
    const commercial = root.querySelector('.commercial');
    const price = record.private?.price || {};
    const collaboration = record.private?.collaboration || {};
    const historicalCost = price.historicalCost ?? price.externalQuote;
    commercial?.classList.toggle('show', historicalCost != null || Number(collaboration.count) > 0);
    setText(root, '[data-commercial="price"]', historicalCost != null ? formatMoney(historicalCost) : '—');
    const totalCost = formatMoney(collaboration.totalCost);
    setText(root, '[data-commercial="collab"]', `已合作 ${Number(collaboration.count) || 0} 次${totalCost ? ` · 累计 ${totalCost}` : ''}`);
    const totalRow = root.querySelector('[data-private-detail="totalCost"]');
    if (totalRow) {
      totalRow.hidden = !totalCost;
      if (totalCost) totalRow.querySelector('b').textContent = totalCost;
    }
    const lastRow = root.querySelector('[data-private-detail="lastDate"]');
    if (lastRow) {
      lastRow.hidden = !collaboration.lastDate;
      if (collaboration.lastDate) lastRow.querySelector('b').textContent = collaboration.lastDate;
    }
  }

  function removePanel() {
    const host = document.getElementById(HOST_ID);
    if (host && typeof host.__cleanup === 'function') host.__cleanup();
    host?.remove();
    activePanel = null;
    if (moveHandler) window.removeEventListener('mousemove', moveHandler, true);
    if (upHandler) window.removeEventListener('mouseup', upHandler, true);
    moveHandler = null;
    upHandler = null;
    if (localRetryTimer) clearTimeout(localRetryTimer);
    localRetryTimer = null;
    if (metricsRenderTimer) clearTimeout(metricsRenderTimer);
    metricsRenderTimer = null;
  }

  function createPanel(config, avatar) {
    removePanel();
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    const wrapper = document.createElement('div');
    const audienceTab = `<button class="kol-tab" type="button" role="tab" aria-selected="false" data-tab="audience">${icon('followers')}<span>受众画像</span></button>`;
    const profilePanel = `
        <div class="api">
          <div class="apihead"><b>公开资料补充（可选）</b><span class="verified" style="display:none">✓</span></div>
          <div class="name">页面粉丝数据无需 API Key</div>
          <div class="rows">
            <div class="row" data-row="followers" style="display:none"><span>粉丝</span><b></b></div>
            <div class="row" data-row="following" style="display:none"><span>关注</span><b></b></div>
            <div class="row" data-row="posts" style="display:none"><span>内容数</span><b></b></div>
            <div class="row" data-row="likes" style="display:none"><span>累计获赞</span><b></b></div>
            <div class="row" data-row="avgViews" style="display:none"><span>近期平均播放</span><b></b></div>
            <div class="row" data-row="avgEngagement" style="display:none"><span>近期平均互动</span><b></b></div>
            <div class="row" data-row="country" style="display:none"><span>账号地区</span><b></b></div>
            <div class="row" data-row="updated" style="display:none"><span>更新时间</span><b></b></div>
          </div>
          <button class="query profile-query" type="button">重新抓取页面公开数据</button>
          <div class="message profile-message">已自动读取当前页面；TikHub API Key 仅用于补充公开资料</div>
        </div>`;
    const igAudiencePanel = `
        <div class="audience-analysis">
          <div class="audience-title">受众画像 · 地区分布</div>
          <div class="audience-copy">抽样近期 Reels 的公开互动用户，聚合其公开账号所在地。最多约 313 次 TikHub 请求；按当前公开单价，费用上限约 US$2.43，实际以 TikHub 计费为准。</div>
          <button class="aud-query" type="button" data-audience-query>分析受众画像（最多约 US$2.43）</button>
          <div class="aud-status" data-audience-status>尚未分析</div>
          <div data-audience-result></div>
        </div>`;
    const audiencePanel = `
      <section class="kol-panel" role="tabpanel" data-panel="audience" hidden>
        ${config.code === 'IG' ? igAudiencePanel : profilePanel}
      </section>`;
    wrapper.innerHTML = `
      <div class="card pf-${config.code}">
        <div class="head"><span class="platform">${config.code}</span><span class="handle" title="@${escapeHtml(config.handle)}">公开资料</span><span class="head-fans" data-local="headerFollowers">—</span><button class="min" type="button" title="最小化">−</button></div>
        <div class="card-scroll"><div class="content">
          <div class="commercial"><div class="price"><span class="num" data-commercial="price">—</span><span class="label">历史成本</span></div><span class="collab-pill"><i></i><span data-commercial="collab">已合作 0 次</span></span></div>
          <div class="signals">
            <div class="signal"><span>粉丝</span><b data-local="followers">—</b></div>
            <div class="signal"><span>平均播放量</span><b data-local="views">—</b></div>
            <div class="signal"><span>互动率</span><b data-local="engagementRate">—</b></div>
            <div class="signal"><span>样本内容</span><b data-local="sample">—</b></div>
          </div>
          <div class="kol-tabs" role="tablist" aria-label="达人情报视图">
            <button class="kol-tab active" type="button" role="tab" aria-selected="true" data-tab="overview">${icon('overview')}<span>概览</span></button>
            ${audienceTab}
            <button class="kol-tab" type="button" role="tab" aria-selected="false" data-tab="reviews">${icon('reviews')}<span>评价</span><span class="tab-count" data-review-count>0</span></button>
          </div>
          <div class="kol-panels">
            <section class="kol-panel" role="tabpanel" data-panel="overview">
              <div class="library">
                <div class="owner-data"><div data-owner-content></div></div>
                <details class="record-details"><summary>记录详情 <span>⌄</span></summary><div class="record-rows">
                  <div class="record-row"><span>历史粉丝</span><b data-library="followers">—</b></div>
                  <div class="record-row"><span>历史平均播放</span><b data-library="views">—</b></div>
                  <div class="record-row" data-private-detail="totalCost" hidden><span>累计成本</span><b></b></div>
                  <div class="record-row" data-private-detail="lastDate" hidden><span>最近合作</span><b></b></div>
                </div></details>
              </div>
              <div class="no-library panel-empty">当前账号暂无历史记录；页面公开指标仍可使用</div>
            </section>
            ${audiencePanel}
            <section class="kol-panel" role="tabpanel" data-panel="reviews" hidden><div class="panel-empty">正在读取评价…</div></section>
          </div>
        </div></div>
        <div class="foot"><div class="personal-entry">✦ <b>COCO Creator Intel</b><span>mccoco.xyz</span></div></div>
      </div>`;
    shadow.append(style, wrapper);
    document.body.appendChild(host);
    activePanel = { root: wrapper, config };

    wireTabs(wrapper);
    let localAttempts = 0;
    const refreshLocal = () => {
      const stats = updateLocalMetrics();
      if (stats && stats.sampleSize >= 3) return;
      if (++localAttempts < 20) localRetryTimer = setTimeout(refreshLocal, 1000);
    };
    refreshLocal();

    const card = wrapper.querySelector('.card');
    const minButton = wrapper.querySelector('.min');
    minButton.addEventListener('click', () => {
      const minimized = card.classList.toggle('minimized');
      minButton.textContent = minimized ? '+' : '−';
      minButton.title = minimized ? '展开' : '最小化';
      place();
    });

    const queryButton = wrapper.querySelector('.profile-query');
    const message = wrapper.querySelector('.profile-message');
    let tikhubConfigured = false;
    const setMessage = (text, error = false) => {
      if (!message) return;
      message.textContent = text;
      message.className = `message profile-message${error ? ' error' : ''}`;
    };
    ask({ type: 'getCachedProfile', platform: config.code, handle: config.handle }).then((result) => {
      if (!wrapper.isConnected || !result) return;
      showLibrary(wrapper, result.library, config);
      tikhubConfigured = result.configured;
      if (result.profile) {
        showProfile(wrapper, result.profile);
        if (queryButton) {
          queryButton.textContent = result.configured
            ? (result.fresh ? '刷新公开资料（可能计费）' : '资料缓存已过期，重新获取')
            : '重新抓取页面公开数据';
          setMessage(result.configured
            ? (result.fresh ? '已从本机缓存恢复，本次未产生 API 请求' : '缓存已过期，点击后请求最新资料')
            : '已显示本机历史缓存；页面公开数据仍可无 Key 自动更新');
        }
      } else if (!result.configured && queryButton) {
        queryButton.textContent = '重新抓取页面公开数据';
        setMessage('无需 API Key；已自动读取页面，点击可立即重试');
      } else if (queryButton) {
        queryButton.textContent = '获取公开资料（可能计费）';
        setMessage('页面数据已自动读取；点击可补充公开资料');
      }
    });
    queryButton?.addEventListener('click', async () => {
      if (!tikhubConfigured) {
        localAttempts = 0;
        const stats = updateLocalMetrics();
        queryButton.textContent = '已重新抓取页面数据';
        setMessage(stats && stats.sampleSize >= 3
          ? `已读取最近 ${stats.sampleSize} 条公开内容`
          : '暂未读到内容数据，请等待页面加载或切换到 Reels 标签');
        localRetryTimer = setTimeout(() => { queryButton.textContent = '重新抓取页面公开数据'; }, 1600);
        return;
      }
      queryButton.disabled = true;
      queryButton.textContent = '正在获取公开资料...';
      setMessage('本次操作会调用 TikHub，可能产生 API 费用');
      const result = await ask({ type: 'fetchProfile', platform: config.code, handle: config.handle, pageUrl: location.href.split('?')[0] });
      queryButton.disabled = false;
      if (!result || !result.ok) {
        queryButton.textContent = '重试获取公开资料';
        setMessage((result && result.error) || '请求失败，请稍后重试', true);
        return;
      }
      showProfile(wrapper, result.profile);
      queryButton.textContent = '刷新公开资料（可能计费）';
      setMessage('公开资料已更新并缓存到本机');
      place();
    });

    const audienceButton = wrapper.querySelector('[data-audience-query]');
    const audienceStatus = wrapper.querySelector('[data-audience-status]');
    const audienceResult = wrapper.querySelector('[data-audience-result]');
    if (audienceButton && audienceStatus && audienceResult) {
      const setAudienceStatus = (text, error = false) => {
        audienceStatus.textContent = text;
        audienceStatus.className = `aud-status${error ? ' error' : ''}`;
      };
      const renderAudience = (result, { cached = false, fresh = true } = {}) => {
        const tier = (label, value, cls) => `<div class="aud-tier ${cls}"><span>${label}</span><span class="aud-bar"><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></span><b>${Number(value) || 0}%</b></div>`;
        const countries = (result.topCountries || []).map((item) => `<span class="aud-country">${escapeHtml(item.flag)} ${escapeHtml(item.name || item.cc)} ${Number(item.pct) || 0}%</span>`).join('');
        const date = result.at ? String(result.at).slice(0, 10) : '';
        audienceResult.innerHTML = `<div class="aud-result"><div class="aud-result-head"><b>受众地区分布</b><span>${Number(result.valid) || 0}/${Number(result.analyzed) || 0} 有效样本</span></div>${tier('发达', result.tierPct?.T1, 't1')}${tier('发展中', result.tierPct?.T2, 't2')}${tier('其他', result.tierPct?.T3, 't3')}<div class="aud-countries">${countries}</div><div class="aud-result-foot"><span>${cached ? '本机缓存 · ' : ''}${escapeHtml(date)}</span><button class="aud-refresh" type="button" data-audience-refresh>重新分析</button></div></div>`;
        audienceButton.hidden = true;
        setAudienceStatus(cached
          ? (fresh ? '已读取本机缓存，本次未调用 TikHub' : '本机缓存已过期，可保留查看或点击重新分析')
          : '分析完成，结果已缓存到本机');
        audienceResult.querySelector('[data-audience-refresh]')?.addEventListener('click', () => startAudience(true));
        place();
      };
      const startAudience = async (force) => {
        audienceButton.hidden = false;
        audienceButton.disabled = true;
        audienceButton.textContent = '后台分析中… 0s';
        setAudienceStatus('正在抽样近期互动用户；首次通常需要 1–3 分钟。可以刷新或关闭标签页，任务会在后台继续；进度自动保存，重新打开该账号后会自动接回');
        let seconds = 0;
        const timer = setInterval(() => { seconds += 1; if (audienceButton.isConnected) audienceButton.textContent = `后台分析中… ${seconds}s`; }, 1000);
        const response = await runAudienceRequest({ type: 'fetchAudience', platform: config.code, handle: config.handle, force });
        clearInterval(timer);
        if (!wrapper.isConnected) return;
        audienceButton.disabled = false;
        if (!response?.ok || !response.result) {
          audienceButton.hidden = false;
          audienceButton.textContent = '重试分析受众画像';
          setAudienceStatus(response?.error || '分析中断，请稍后重试', true);
          return;
        }
        renderAudience(response.result, { cached: Boolean(response.cached), fresh: true });
      };
      audienceButton.addEventListener('click', () => startAudience(false));
      ask({ type: 'getCachedAudience', platform: config.code, handle: config.handle }).then((cached) => {
        if (!wrapper.isConnected || !cached) return;
        if (cached.running) startAudience(false);
        else if (cached.result) renderAudience(cached.result, { cached: true, fresh: cached.fresh });
        else if (!cached.configured) {
          audienceButton.textContent = '配置 TikHub Key 后分析';
          setAudienceStatus('当前未配置 TikHub API Key；页面基础数据不受影响');
        }
      });
    }

    let userMoved = false;
    function place() {
      if (!avatar.isConnected || userMoved) return;
      const rect = avatar.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) { host.style.display = 'none'; return; }
      host.style.display = '';
      const width = host.offsetWidth || 248;
      let left = rect.left - width - 12;
      if (left < 8) left = rect.right + 12;
      host.style.left = `${Math.max(8, Math.min(left, innerWidth - width - 8))}px`;
      host.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - 48))}px`;
    }
    place();
    const follow = () => place();
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    const observer = new ResizeObserver(place);
    observer.observe(host);
    host.__cleanup = () => {
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      observer.disconnect();
    };

    const head = wrapper.querySelector('.head');
    let dragging = false;
    let startX = 0; let startY = 0; let originX = 0; let originY = 0;
    head.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      dragging = true; startX = event.clientX; startY = event.clientY;
      const rect = host.getBoundingClientRect(); originX = rect.left; originY = rect.top;
      event.preventDefault();
    });
    moveHandler = (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX; const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) userMoved = true;
      host.style.left = `${Math.max(0, Math.min(originX + dx, innerWidth - 40))}px`;
      host.style.top = `${Math.max(0, Math.min(originY + dy, innerHeight - 32))}px`;
    };
    upHandler = () => { dragging = false; };
    window.addEventListener('mousemove', moveHandler, true);
    window.addEventListener('mouseup', upHandler, true);
  }

  function updateLocalMetrics() {
    if (!activePanel) return null;
    const { root, config } = activePanel;
    const stats = domAverages(config);
    const followers = scrapeFollowers(config);
    setText(root, '[data-local="followers"]', formatCount(followers));
    setText(root, '[data-local="headerFollowers"]', followers != null ? `${formatCount(followers)} 粉` : '');
    setText(root, '[data-local="views"]', formatCount(stats.avgViews));
    setText(root, '[data-local="engagementRate"]', formatPercent(stats.engagementRate));
    setText(root, '[data-local="sample"]', stats.sampleSize ? String(stats.sampleSize) : '—');
    return stats;
  }

  function scheduleLocalMetricsUpdate() {
    if (metricsRenderTimer) clearTimeout(metricsRenderTimer);
    metricsRenderTimer = setTimeout(() => {
      metricsRenderTimer = null;
      if (collectedSnapshot.length < 3) {
        collectedSnapshot = metricsCore?.aggregate(collected, { minimum: 3, limit: 12 }).rows || [];
      }
      updateLocalMetrics();
    }, 700);
  }

  function waitForAvatar(config, callback) {
    const find = () => config.avatars.map((selector) => document.querySelector(selector)).find(Boolean);
    const immediate = find();
    if (immediate) { callback(immediate); return; }
    let attempts = 0;
    const timer = setInterval(() => {
      const avatar = find();
      if (avatar || ++attempts > 40) {
        clearInterval(timer);
        if (avatar) callback(avatar);
      }
    }, 200);
  }

  async function run() {
    const config = detect();
    if (!config) { currentKey = ''; removePanel(); return; }
    const saved = await ask({ type: 'getSettings' });
    if (!saved || !saved.enabled) { removePanel(); return; }
    const key = `${config.code}:${config.handle.toLowerCase()}`;
    if (key !== currentKey) {
      collected = [];
      collectedIndex.clear();
      collectedSnapshot = [];
      domSnapshot = [];
    }
    currentKey = key;
    window.postMessage({ __creatorInsightCollectorRequest: true, pageKey: location.pathname }, '*');
    const href = location.href;
    waitForAvatar(config, (avatar) => {
      if (location.href !== href || currentKey !== key) return;
      createPanel(config, avatar);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.__creatorInsightCollector !== true) return;
    for (const row of event.data.stats || []) {
      if (row.pageKey && row.pageKey !== location.pathname) continue;
      const signature = row.id
        ? `id:${row.id}`
        : `${row.pageKey || location.pathname}:${row.views}:${row.likes}:${row.comments}:${row.shares}`;
      const index = collectedIndex.get(signature);
      if (index == null) {
        collectedIndex.set(signature, collected.length);
        collected.push(row);
      } else {
        collected[index] = { ...collected[index], ...row };
      }
    }
    scheduleLocalMetricsUpdate();
  });

  const onRouteChange = () => setTimeout(run, 120);
  const originalPush = history.pushState;
  history.pushState = function (...args) { originalPush.apply(this, args); onRouteChange(); };
  const originalReplace = history.replaceState;
  history.replaceState = function (...args) { originalReplace.apply(this, args); onRouteChange(); };
  window.addEventListener('popstate', onRouteChange);
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; onRouteChange(); }
  }).observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) run();
  });
  run();
})();
