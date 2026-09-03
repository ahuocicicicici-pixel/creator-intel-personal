// X 时间线平均曝光流速徽章 + 本次浏览热帖榜。
// 数据只来自 collector 旁听到的 X 页面 GraphQL 响应；不调用外部 API。
(function () {
  if (!/(^|\.)(x|twitter)\.com$/i.test(location.hostname)) return;
  const rootElement = document.documentElement;
  if (rootElement) rootElement.dataset.kolXViralStatus = 'loading';
  const core = globalThis.KolXViralCore;
  if (!core) {
    if (rootElement) rootElement.dataset.kolXViralStatus = 'core-missing';
    console.warn('[KOL 流速] UI 计算模块未加载');
    return;
  }

  const SETTINGS_KEY = 'xViralSettings';
  const POSITION_KEY = 'xViralPanelPosition';
  const LOGO_URL = chrome.runtime.getURL('assets/icons/icon-32.png');
  const PANEL_ID = 'kol-x-viral-panel';
  const STYLE_ID = 'kol-x-viral-style';
  const LINK_CLASS = 'kol-x-viral-link';
  const TOOLTIP_ID = 'kol-x-viral-tooltip';
  const MAX_RECORDS = 2000;
  const MAX_PAGE_RECORDS = 500;
  const MAX_PAGE_CONTEXTS = 8;
  const tweets = new Map();
  // X 会在滚动时回收离屏 article。按页面/搜索上下文保留已见帖子，避免榜单随 DOM 抖动。
  const pageCaches = new Map();
  let settings = core.normalizeSettings();
  let panel = null;
  let renderFrame = 0;
  let selected = null;
  let savedScrollY = null;
  let lastHref = location.href;
  let activePageKey = pageKey(location.href);
  let routeSettling = false;
  let routeOldIds = new Set();
  let routeGeneration = 0;
  let routeGuardTimer = 0;
  let lastPanelSignature = '';

  function isPublicXPage() {
    return !/^\/(messages|settings|notifications|i\/chat)(?:\/|$)/i.test(location.pathname);
  }

  function trustedUserEvent(event) {
    return event?.isTrusted === true;
  }

  function storageGet(key) {
    return new Promise((resolve) => chrome.storage.local.get([key], (value) => resolve(value?.[key])));
  }

  function storageSet(value) {
    return new Promise((resolve) => chrome.storage.local.set(value, resolve));
  }

  function remember(record) {
    if (!record?.id) return;
    const previous = tweets.get(record.id) || {};
    tweets.delete(record.id);
    tweets.set(record.id, { ...previous, ...record });
    while (tweets.size > MAX_RECORDS) tweets.delete(tweets.keys().next().value);
  }

  function pageKey(href) {
    try {
      const url = new URL(href, location.origin);
      return `${url.pathname}${url.search}`;
    } catch {
      return String(href || '');
    }
  }

  function pageCache(key = activePageKey) {
    let cache = pageCaches.get(key);
    if (!cache) {
      cache = new Map();
      pageCaches.set(key, cache);
    } else {
      // Map 的插入顺序同时作为页面上下文的 LRU。
      pageCaches.delete(key);
      pageCaches.set(key, cache);
    }
    while (pageCaches.size > MAX_PAGE_CONTEXTS) pageCaches.delete(pageCaches.keys().next().value);
    return cache;
  }

  function rememberPageItem(cache, entry) {
    if (!entry?.id) return;
    const previous = cache.get(entry.id) || {};
    cache.delete(entry.id);
    cache.set(entry.id, { ...previous, ...entry });
    while (cache.size > MAX_PAGE_RECORDS) cache.delete(cache.keys().next().value);
  }

  function own(article, selector) {
    return [...article.querySelectorAll(selector)]
      .find((node) => node.closest('article[data-testid="tweet"]') === article) || null;
  }

  function tweetIdForArticle(article) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')]
      .filter((link) => link.closest('article[data-testid="tweet"]') === article);
    const analytics = links.find((link) => /\/analytics(?:[/?#]|$)/.test(link.getAttribute('href') || ''));
    const ordered = analytics ? [analytics, ...links] : links;
    for (const link of ordered) {
      const id = (link.getAttribute('href') || '').match(/\/status\/(\d+)(?:[/?#]|$)/)?.[1];
      if (id) return id;
    }
    return '';
  }

  function statusUrlForArticle(article, id) {
    const link = [...article.querySelectorAll(`a[href*="/status/${id}"]`)]
      .find((node) => node.closest('article[data-testid="tweet"]') === article
        && !/\/analytics(?:[/?#]|$)/.test(node.getAttribute('href') || ''));
    try {
      return new URL(link?.getAttribute('href') || `/i/status/${id}`, location.origin).href;
    } catch {
      return `https://x.com/i/status/${id}`;
    }
  }

  function countFromAria(element) {
    const text = element?.getAttribute?.('aria-label') || element?.textContent || '';
    return core.parseCompact(text);
  }

  function metricFromButton(element) {
    if (!element) return null;
    return countFromAria(element) ?? 0;
  }

  function authorFromArticle(article) {
    const box = own(article, '[data-testid="User-Name"]');
    if (!box) return { displayName: '', screenName: '' };
    const statusHref = own(article, 'a[href*="/status/"]')?.getAttribute('href') || '';
    const screenName = statusHref.match(/^\/([^/]+)\/status\//)?.[1] || '';
    const labels = [...box.querySelectorAll('span')]
      .map((node) => String(node.textContent || '').trim())
      .filter(Boolean);
    const displayName = labels.find((label) => !label.startsWith('@') && label !== '·') || '';
    return { displayName, screenName };
  }

  function fallbackRecord(article, id) {
    const time = own(article, 'time[datetime]');
    if (!time) return null;
    const analytics = own(article, `a[href*="/status/${id}/analytics"]`);
    const views = countFromAria(analytics);
    if (views == null) return null;
    const author = authorFromArticle(article);
    return {
      id,
      views,
      createdAt: time.getAttribute('datetime') || '',
      likes: metricFromButton(own(article, 'button[data-testid="like"], button[data-testid="unlike"]')),
      retweets: metricFromButton(own(article, 'button[data-testid="retweet"], button[data-testid="unretweet"]')),
      replies: metricFromButton(own(article, 'button[data-testid="reply"]')),
      quotes: null,
      bookmarks: 0,
      metricsComplete: false,
      metricsSource: 'dom',
      text: own(article, '[data-testid="tweetText"]')?.textContent || '',
      ...author,
      isArticle: false,
    };
  }

  function dataForArticle(article, id) {
    const cached = tweets.get(id);
    if (cached?.metricsSource === 'graphql') return cached;
    const fallback = fallbackRecord(article, id);
    if (!fallback) return cached || null;
    for (const key of ['views', 'likes', 'retweets', 'replies']) {
      const previous = Number(cached?.[key]);
      const current = Number(fallback[key]);
      if (Number.isFinite(previous) && (!Number.isFinite(current) || previous > current)) fallback[key] = previous;
    }
    remember(fallback);
    return tweets.get(id) || fallback;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .kol-x-viral-badge {
        display:inline-flex; align-items:center; gap:5px; flex:0 0 auto; margin-inline:6px 2px;
        min-height:20px; padding:1px 7px; border-radius:6px;
        color:oklch(97% .008 330); background:oklch(18% .015 330);
        font:750 11px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        letter-spacing:.01em; white-space:nowrap; cursor:default;
        box-shadow:0 0 0 1px oklch(31% .02 330);
      }
      .kol-x-viral-badge::before { content:""; width:5px; height:5px; border-radius:2px; background:oklch(72% .03 330); }
      .kol-x-viral-badge[data-level="trending"] { color:oklch(88% .13 340); background:oklch(25% .09 340); box-shadow:0 0 0 1px oklch(45% .16 340); }
      .kol-x-viral-badge[data-level="trending"]::before { background:oklch(72% .22 340); }
      .kol-x-viral-badge[data-level="viral"] { color:oklch(91% .11 18); background:oklch(27% .11 18); box-shadow:0 0 0 1px oklch(49% .19 18); }
      .kol-x-viral-badge[data-level="viral"]::before { background:oklch(73% .19 18); }
      .kol-x-viral-badge .kxv-badge-segment + .kxv-badge-segment { border-left:1px solid oklch(42% .025 330); padding-left:6px; }
      .kol-x-viral-badge .kxv-badge-rate { color:oklch(82% .03 330); }
      .kol-x-viral-badge .kxv-badge-risk[data-risk="low"] { color:oklch(82% .12 150); }
      .kol-x-viral-badge .kxv-badge-risk[data-risk="watch"] { color:oklch(84% .15 75); }
      .kol-x-viral-badge .kxv-badge-risk[data-risk="high"] { color:oklch(82% .16 25); }
      .kol-x-viral-badge .kxv-badge-risk[data-risk="unknown"] { color:oklch(70% .02 330); }
      #${TOOLTIP_ID} {
        position:fixed; z-index:2147483647; width:max-content; max-width:min(360px,calc(100vw - 20px));
        padding:9px 11px; color:oklch(96% .008 330); background:oklch(12% .012 330);
        border:1px solid oklch(38% .04 340); border-radius:7px;
        box-shadow:0 8px 24px rgba(0,0,0,.34); pointer-events:none;
        font:500 11px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
        white-space:normal;
      }
      #${TOOLTIP_ID}[hidden] { display:none !important; }
      #${PANEL_ID} {
        --kxv-bg:oklch(15% .014 330); --kxv-raised:oklch(20% .018 330); --kxv-hover:oklch(24% .025 330);
        --kxv-ink:oklch(96% .008 330); --kxv-muted:oklch(72% .018 330); --kxv-line:oklch(31% .022 330);
        --kxv-accent:oklch(64% .24 350); --kxv-hot:oklch(68% .21 18);
        position:fixed; z-index:2147483644; top:84px; right:18px; width:440px; max-width:calc(100vw - 24px);
        color:var(--kxv-ink); background:var(--kxv-bg); border-radius:12px;
        box-shadow:0 8px 24px rgba(10,8,12,.28); overflow:hidden;
        font:13px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
      }
      #${PANEL_ID}[hidden] { display:none !important; }
      #${PANEL_ID} .kxv-head { display:flex; align-items:center; gap:9px; min-height:50px; padding:0 9px 0 11px; background:var(--kxv-raised); border-top:2px solid var(--kxv-accent); border-bottom:1px solid var(--kxv-line); cursor:grab; user-select:none; }
      #${PANEL_ID} .kxv-head:active { cursor:grabbing; }
      #${PANEL_ID} .kxv-brand { display:block; width:24px; height:24px; border-radius:6px; object-fit:cover; background:#000; box-shadow:0 0 0 1px var(--kxv-line); }
      #${PANEL_ID} .kxv-heading { display:flex; flex:1; min-width:0; flex-direction:column; justify-content:center; }
      #${PANEL_ID} .kxv-title { font-weight:780; font-size:13px; letter-spacing:-.01em; }
      #${PANEL_ID} .kxv-subtitle { color:var(--kxv-muted); font-size:10px; }
      #${PANEL_ID} .kxv-live { padding:2px 6px; color:oklch(91% .11 350); background:oklch(28% .08 350); border-radius:4px; font-size:9px; font-weight:800; letter-spacing:.08em; }
      #${PANEL_ID} .kxv-btn { border:0; background:transparent; color:var(--kxv-muted); border-radius:6px; min-width:28px; height:28px; cursor:pointer; font:700 16px/1 inherit; transition:background-color 160ms ease-out,color 160ms ease-out; }
      #${PANEL_ID} .kxv-btn:hover { color:var(--kxv-ink); background:var(--kxv-hover); }
      #${PANEL_ID} .kxv-btn:focus-visible, #${PANEL_ID} .kxv-row:focus-visible { outline:2px solid var(--kxv-accent); outline-offset:-2px; }
      #${PANEL_ID} .kxv-back[hidden] { visibility:hidden; display:block; }
      #${PANEL_ID} .kxv-list { list-style:none; padding:5px; margin:0; max-height:min(58vh,520px); overflow:auto; }
      #${PANEL_ID} .kxv-empty { padding:22px 16px; color:var(--kxv-muted); text-align:center; }
      #${PANEL_ID} .kxv-row { width:100%; display:grid; grid-template-columns:22px minmax(0,1fr) auto auto auto auto; gap:7px; align-items:center; border:0; border-radius:7px; padding:7px 8px; color:inherit; background:transparent; cursor:pointer; text-align:left; transition:background-color 160ms ease-out,box-shadow 160ms ease-out; }
      #${PANEL_ID} .kxv-row:hover { background:var(--kxv-hover); }
      #${PANEL_ID} .kxv-row[data-selected="1"] { background:oklch(27% .06 350); box-shadow:inset 0 0 0 1px var(--kxv-accent); }
      #${PANEL_ID} .kxv-rank { color:var(--kxv-muted); text-align:right; font-size:11px; font-variant-numeric:tabular-nums; }
      #${PANEL_ID} .kxv-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
      #${PANEL_ID} .kxv-views { color:var(--kxv-muted); white-space:nowrap; font-size:11px; font-variant-numeric:tabular-nums; }
      #${PANEL_ID} .kxv-rate { color:var(--kxv-muted); white-space:nowrap; font-size:10px; font-variant-numeric:tabular-nums; }
      #${PANEL_ID} .kxv-risk { white-space:nowrap; font-size:10px; font-weight:750; }
      #${PANEL_ID} .kxv-risk[data-risk="low"] { color:oklch(79% .13 150); }
      #${PANEL_ID} .kxv-risk[data-risk="watch"] { color:oklch(82% .15 75); }
      #${PANEL_ID} .kxv-risk[data-risk="high"] { color:oklch(80% .17 25); }
      #${PANEL_ID} .kxv-risk[data-risk="unknown"] { color:var(--kxv-muted); }
      #${PANEL_ID} .kxv-speed { color:var(--kxv-ink); white-space:nowrap; font-weight:800; font-variant-numeric:tabular-nums; }
      #${PANEL_ID} .kxv-row[data-level="trending"] .kxv-speed { color:oklch(82% .16 340); }
      #${PANEL_ID} .kxv-row[data-level="viral"] .kxv-speed { color:oklch(82% .15 18); }
      article.kol-x-viral-selected { outline:2px solid var(--kxv-accent,oklch(64% .24 350)) !important; outline-offset:-1px; border-radius:12px; }
      svg.${LINK_CLASS} { position:fixed; inset:0; width:100vw; height:100vh; z-index:2147483643; pointer-events:none; overflow:visible; }
      svg.${LINK_CLASS} path { fill:none; stroke:oklch(64% .24 350); stroke-width:2; stroke-dasharray:5 5; }
      svg.${LINK_CLASS} circle { fill:oklch(15% .014 330); stroke:oklch(64% .24 350); stroke-width:2; }
      @media (max-width:760px) { #${PANEL_ID} { width:340px; right:8px; top:68px; } #${PANEL_ID} .kxv-views, #${PANEL_ID} .kxv-rate { display:none; } #${PANEL_ID} .kxv-row { grid-template-columns:20px minmax(0,1fr) auto auto; } }
      @media (prefers-reduced-motion:reduce) { #${PANEL_ID} .kxv-btn, #${PANEL_ID} .kxv-row { transition:none; } }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function levelLabel(level, compact = false) {
    if (level === 'viral') return compact ? '爆' : '爆发';
    if (level === 'trending') return compact ? '快' : '加速';
    return compact ? '稳' : '稳定';
  }

  function riskLabel(level) {
    if (level === 'high') return '刷量嫌疑 高';
    if (level === 'watch') return '刷量嫌疑 中';
    if (level === 'low') return '刷量嫌疑 低';
    return '刷量嫌疑 待定';
  }

  function postSignals(data) {
    const metrics = {
      views: data?.views,
      likes: data?.likes,
      retweets: data?.retweets,
      replies: data?.replies,
      quotes: data?.quotes,
      metricsComplete: data?.metricsComplete,
    };
    const risk = core.assessViewInflationRisk(metrics, data?.createdAt);
    return { rate: risk.rate, risk };
  }

  function riskExplanation(signals, data) {
    const views = Math.round(Number(data?.views) || 0).toLocaleString();
    const label = riskLabel(signals.risk.level);
    let basis = signals.risk.reason === 'missing-data'
      ? '公开互动指标尚未加载完整，暂不判断。'
      : signals.risk.reason === 'new-post'
      ? '发布时间不足 2 小时，暂不判断。'
      : '浏览量不足 1 万，暂不判断。';
    if (signals.risk.level === 'high') basis = '至少 2 万浏览，且表层互动率低于 0.1%。';
    if (signals.risk.level === 'watch') basis = '样本已成熟，且表层互动率低于 0.3%。';
    if (signals.risk.level === 'low') basis = '样本已成熟，且表层互动率不低于 0.3%。';
    return `${label}｜浏览 ${views}，表层互动率 ${core.formatPercent(signals.rate)}。${basis}互动率按赞、转帖、回复、引用除以浏览量计算。广告投放、推荐流放大和重复浏览也可能造成低比率，这只是异常提示，不是刷量定论。`;
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(target) {
    if (!target?.isConnected || !target.dataset.tooltip) return;
    const tooltip = ensureTooltip();
    tooltip.textContent = target.dataset.tooltip;
    tooltip.hidden = false;
    const anchor = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8));
    let top = anchor.top - box.height - 8;
    if (top < 8) top = Math.min(window.innerHeight - box.height - 8, anchor.bottom + 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function hideTooltip() {
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) tooltip.hidden = true;
  }

  function bindTooltip(target, text) {
    target.dataset.tooltip = text;
    target.setAttribute('aria-describedby', TOOLTIP_ID);
    if (!target.closest('button')) target.tabIndex = 0;
    if (target.dataset.tooltipBound === '1') return;
    target.dataset.tooltipBound = '1';
    target.addEventListener('mouseenter', () => showTooltip(target));
    target.addEventListener('mouseleave', hideTooltip);
    target.addEventListener('focus', () => showTooltip(target));
    target.addEventListener('blur', hideTooltip);
  }

  function headerRowForArticle(article) {
    const userName = own(article, '[data-testid="User-Name"]');
    const caret = own(article, '[data-testid="caret"]');
    if (!userName) return null;
    let node = (caret || userName).parentElement;
    while (node && node !== article) {
      const display = getComputedStyle(node);
      if (display.display === 'flex' && node.contains(userName) && (!caret || node.contains(caret))) return node;
      node = node.parentElement;
    }
    return userName.parentElement;
  }

  function renderBadges() {
    if (!isPublicXPage()) {
      disableRadarForPrivatePage();
      return;
    }
    if (!settings.enabled) {
      hideTooltip();
      document.querySelectorAll('.kol-x-viral-badge').forEach((node) => node.remove());
      return;
    }
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      // X 的推广帖通常没有公开发布时间；流速公式不适用，也不应进入自然热帖榜。
      if (!own(article, 'time[datetime]')) {
        [...article.querySelectorAll('.kol-x-viral-badge')]
          .filter((node) => node.closest('article[data-testid="tweet"]') === article)
          .forEach((node) => { hideTooltip(); node.remove(); });
        continue;
      }
      const id = tweetIdForArticle(article);
      if (!id) continue;
      const data = dataForArticle(article, id);
      const velocity = data && core.computeVelocity(data.views, data.createdAt);
      if (!Number.isFinite(velocity)) continue;
      const level = core.classifyVelocity(velocity, settings);
      let badge = [...article.querySelectorAll('.kol-x-viral-badge')]
        .find((node) => node.closest('article[data-testid="tweet"]') === article);
      if (!badge) {
        const row = headerRowForArticle(article);
        if (!row) continue;
        badge = document.createElement('span');
        badge.className = 'kol-x-viral-badge';
        badge.innerHTML = '<span class="kxv-badge-segment kxv-badge-speed"></span><span class="kxv-badge-segment kxv-badge-rate"></span><span class="kxv-badge-segment kxv-badge-risk"></span>';
        const anchor = own(article, '[data-testid="caret"]');
        const anchorChild = anchor && [...row.children].find((child) => child === anchor || child.contains(anchor));
        row.insertBefore(badge, anchorChild || row.lastElementChild || null);
      }
      if (!badge.querySelector('.kxv-badge-speed')) {
        badge.innerHTML = '<span class="kxv-badge-segment kxv-badge-speed"></span><span class="kxv-badge-segment kxv-badge-rate"></span><span class="kxv-badge-segment kxv-badge-risk"></span>';
      }
      const signals = postSignals(data);
      const speedText = `${levelLabel(level, true)} ${core.formatCompact(velocity)}/h`;
      const rateText = `互 ${core.formatPercent(signals.rate)}`;
      const riskText = riskLabel(signals.risk.level);
      const tooltipText = `${levelLabel(level)}，发布以来平均 ${core.formatCompact(velocity)}/h。${riskExplanation(signals, data)}`;
      if (badge.dataset.tweetId !== id) badge.dataset.tweetId = id;
      if (badge.dataset.level !== level) badge.dataset.level = level;
      const speed = badge.querySelector('.kxv-badge-speed');
      const rate = badge.querySelector('.kxv-badge-rate');
      const risk = badge.querySelector('.kxv-badge-risk');
      if (speed.textContent !== speedText) speed.textContent = speedText;
      if (rate.textContent !== rateText) rate.textContent = rateText;
      if (risk.textContent !== riskText) risk.textContent = riskText;
      if (risk.dataset.risk !== signals.risk.level) risk.dataset.risk = signals.risk.level;
      bindTooltip(badge, tooltipText);
    }
  }

  function visibleArticle(article) {
    if (!article?.isConnected || article.getClientRects().length === 0) return false;
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    return article.style.display !== 'none' && cell?.style?.display !== 'none';
  }

  function collectRanked() {
    const cache = pageCache();
    const articles = new Map();
    const seen = new Set();
    // SPA 切换搜索词时 URL 会先变化、旧 DOM 稍后才卸载；短暂跳过采集，防止串榜。
    const mountedArticles = routeSettling ? [] : document.querySelectorAll('article[data-testid="tweet"]');
    for (const article of mountedArticles) {
      if (!visibleArticle(article)) continue;
      if (!own(article, 'time[datetime]')) continue;
      const id = tweetIdForArticle(article);
      if (!id || seen.has(id)) continue;
      const data = dataForArticle(article, id);
      const velocity = data && core.computeVelocity(data.views, data.createdAt);
      if (!Number.isFinite(velocity)) continue;
      seen.add(id);
      const author = authorFromArticle(article);
      articles.set(id, article);
      rememberPageItem(cache, {
        id,
        pageY: window.scrollY + article.getBoundingClientRect().top,
        statusUrl: statusUrlForArticle(article, id),
        views: data.views,
        createdAt: data.createdAt,
        likes: data.likes || 0,
        retweets: data.retweets || 0,
        replies: data.replies || 0,
        quotes: data.quotes || 0,
        metricsComplete: data.metricsComplete === true,
        metricsSource: data.metricsSource || 'dom',
        preview: String(data.text || author.displayName || `@${data.screenName || author.screenName || ''}`).slice(0, 600),
      });
    }

    const ranked = [];
    for (const [id, meta] of cache) {
      const data = tweets.get(id) || {};
      const views = data.views ?? meta.views;
      const createdAt = data.createdAt || meta.createdAt;
      const velocity = core.computeVelocity(views, createdAt);
      if (!Number.isFinite(velocity)) continue;
      const metrics = {
        views,
        likes: data.likes ?? meta.likes ?? 0,
        retweets: data.retweets ?? meta.retweets ?? 0,
        replies: data.replies ?? meta.replies ?? 0,
        quotes: data.quotes ?? meta.quotes ?? 0,
        metricsComplete: data.metricsComplete ?? meta.metricsComplete ?? false,
        metricsSource: data.metricsSource || meta.metricsSource || 'dom',
      };
      ranked.push({
        ...meta,
        id,
        article: articles.get(id) || null,
        velocity,
        views,
        ...metrics,
        signals: postSignals({ ...metrics, createdAt }),
        preview: data.text || meta.preview || data.displayName || `@${data.screenName || ''}`,
      });
    }
    return {
      ranked: ranked.sort((a, b) => b.velocity - a.velocity),
      visibleCount: seen.size,
      cachedCount: cache.size,
    };
  }

  function ensurePanel() {
    if (panel?.isConnected) return panel;
    panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-label', 'X 本次浏览热帖流速榜');
    panel.innerHTML = `
      <div class="kxv-head">
        <button class="kxv-btn kxv-back" type="button" title="返回原位置" hidden>↶</button>
        <img class="kxv-brand" src="${LOGO_URL}" alt="COCO" />
        <span class="kxv-heading"><span class="kxv-title">X 流速雷达</span><span class="kxv-subtitle">等待页面帖子</span></span>
        <span class="kxv-live">LIVE</span>
        <button class="kxv-btn kxv-close" type="button" title="隐藏流速榜">×</button>
      </div>
      <ol class="kxv-list"></ol>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.kxv-close').addEventListener('click', async (event) => {
      if (!trustedUserEvent(event)) return;
      event.stopPropagation();
      settings = { ...settings, leaderboardEnabled: false };
      await storageSet({ [SETTINGS_KEY]: settings });
      clearSelection();
      savedScrollY = null;
      renderPanel();
    });
    panel.querySelector('.kxv-back').addEventListener('click', (event) => {
      if (!trustedUserEvent(event)) return;
      event.stopPropagation();
      if (savedScrollY != null) window.scrollTo({ top: savedScrollY, behavior: 'smooth' });
      savedScrollY = null;
      clearSelection();
      updateBackButton();
    });
    installPanelDrag(panel.querySelector('.kxv-head'));
    storageGet(POSITION_KEY).then((position) => applyPanelPosition(position));
    return panel;
  }

  function applyPanelPosition(position) {
    if (!panel?.isConnected || !position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return;
    const rect = panel.getBoundingClientRect();
    const left = Math.max(6, Math.min(position.left, window.innerWidth - rect.width - 6));
    const top = Math.max(6, Math.min(position.top, window.innerHeight - 48));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
  }

  function installPanelDrag(handle) {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (!trustedUserEvent(event)) return;
      if (event.button !== 0 || event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', (event) => {
      if (!trustedUserEvent(event)) return;
      if (!drag || drag.id !== event.pointerId) return;
      const rect = panel.getBoundingClientRect();
      applyPanelPosition({
        left: Math.max(6, Math.min(event.clientX - drag.dx, window.innerWidth - rect.width - 6)),
        top: Math.max(6, Math.min(event.clientY - drag.dy, window.innerHeight - 48)),
      });
    });
    const stop = async (event) => {
      if (!trustedUserEvent(event)) return;
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      const rect = panel.getBoundingClientRect();
      await storageSet({ [POSITION_KEY]: { left: rect.left, top: rect.top } });
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  function renderPanel() {
    if (!isPublicXPage()) {
      disableRadarForPrivatePage();
      return;
    }
    if (!document.body) return;
    if (!settings.enabled || !settings.leaderboardEnabled) {
      hideTooltip();
      if (panel) panel.hidden = true;
      lastPanelSignature = 'hidden';
      return;
    }
    const element = ensurePanel();
    element.hidden = false;
    const list = element.querySelector('.kxv-list');
    const collected = collectRanked();
    const ranked = collected.ranked.slice(0, settings.topN);
    const subtitle = element.querySelector('.kxv-subtitle');
    const subtitleText = `已浏览 ${collected.cachedCount} · 当前 ${collected.visibleCount}`;
    if (subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;
    const signature = JSON.stringify({
      topN: settings.topN,
      selected: selected?.id || '',
      cachedCount: collected.cachedCount,
      visibleCount: collected.visibleCount,
      ranked: ranked.map((entry) => [entry.id, Math.round(entry.views), core.formatCompact(entry.velocity), core.formatPercent(entry.signals.rate), entry.signals.risk.level]),
    });
    if (signature === lastPanelSignature && list.childElementCount) {
      updateBackButton();
      updateLinkGeometry();
      return;
    }
    lastPanelSignature = signature;
    hideTooltip();
    list.replaceChildren();
    if (!ranked.length) {
      const empty = document.createElement('li');
      empty.className = 'kxv-empty';
      empty.textContent = '滚动页面后，这里会持续记住已加载的热帖';
      list.appendChild(empty);
      updateBackButton();
      return;
    }
    ranked.forEach((entry, index) => {
      const level = core.classifyVelocity(entry.velocity, settings);
      const item = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'kxv-row';
      row.dataset.id = entry.id;
      row.dataset.level = level;
      row.dataset.selected = selected?.id === entry.id ? '1' : '0';
      const rank = document.createElement('span');
      rank.className = 'kxv-rank';
      rank.textContent = String(index + 1);
      const preview = document.createElement('span');
      preview.className = 'kxv-preview';
      preview.textContent = `${levelLabel(level)} · ${String(entry.preview || '').replace(/\s+/g, ' ').trim() || 'X 帖子'}`;
      preview.title = String(entry.preview || '');
      const views = document.createElement('span');
      views.className = 'kxv-views';
      views.textContent = `◉ ${core.formatCompact(entry.views)}`;
      const rate = document.createElement('span');
      rate.className = 'kxv-rate';
      rate.textContent = `互 ${core.formatPercent(entry.signals.rate)}`;
      const risk = document.createElement('span');
      risk.className = 'kxv-risk';
      risk.dataset.risk = entry.signals.risk.level;
      risk.textContent = riskLabel(entry.signals.risk.level, true);
      const speed = document.createElement('span');
      speed.className = 'kxv-speed';
      speed.textContent = `${core.formatCompact(entry.velocity)}/h`;
      row.append(rank, preview, views, rate, risk, speed);
      bindTooltip(row, riskExplanation(entry.signals, entry));
      row.addEventListener('click', (event) => {
        if (trustedUserEvent(event)) jumpToTweet(entry.id, row);
      });
      item.appendChild(row);
      list.appendChild(item);
      if (selected?.id === entry.id) selected.item = row;
    });
    updateBackButton();
    updateLinkGeometry();
  }

  function findArticle(id) {
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (visibleArticle(article) && tweetIdForArticle(article) === id) return article;
    }
    return null;
  }

  function ensureLinkSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', LINK_CLASS);
    svg.innerHTML = '<path></path><circle r="5"></circle><circle r="5"></circle>';
    document.body.appendChild(svg);
    return svg;
  }

  function updateLinkGeometry() {
    if (!selected) return;
    if (!selected.item?.isConnected && panel) {
      selected.item = panel.querySelector(`.kxv-row[data-id="${CSS.escape(selected.id)}"]`);
    }
    if (!selected.article?.isConnected) selected.article = findArticle(selected.id);
    const { item, article, svg } = selected;
    if (!item?.isConnected || !article?.isConnected || !svg?.isConnected) {
      if (svg) svg.style.display = 'none';
      return;
    }
    svg.style.display = '';
    article.classList.add('kol-x-viral-selected');
    item.dataset.selected = '1';
    const a = item.getBoundingClientRect();
    const b = article.getBoundingClientRect();
    const startRight = b.left + b.width / 2 >= a.left + a.width / 2;
    const x1 = startRight ? a.right : a.left;
    const y1 = a.top + a.height / 2;
    const x2 = startRight ? b.left : b.right;
    const y2 = Math.max(Math.max(b.top, 8), Math.min(y1, Math.min(b.bottom, window.innerHeight - 8)));
    const bend = Math.max(60, Math.abs(x2 - x1) * 0.4) * (startRight ? 1 : -1);
    svg.querySelector('path').setAttribute('d', `M ${x1},${y1} C ${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`);
    const circles = svg.querySelectorAll('circle');
    circles[0].setAttribute('cx', x1); circles[0].setAttribute('cy', y1);
    circles[1].setAttribute('cx', x2); circles[1].setAttribute('cy', y2);
  }

  function setSelection(id, item, article) {
    clearSelection();
    selected = { id, item, article, svg: ensureLinkSvg() };
    updateLinkGeometry();
    updateBackButton();
  }

  function clearSelection() {
    if (!selected) return;
    selected.item?.removeAttribute('data-selected');
    selected.article?.classList.remove('kol-x-viral-selected');
    findArticle(selected.id)?.classList.remove('kol-x-viral-selected');
    selected.svg?.remove();
    selected = null;
  }

  function updateBackButton() {
    const back = panel?.querySelector('.kxv-back');
    if (back) back.hidden = savedScrollY == null;
  }

  function waitForArticle(id, item, onTimeout, timeoutMs = 6000) {
    const started = Date.now();
    let timer = 0;
    const finish = () => {
      const article = findArticle(id);
      if (article) {
        observer.disconnect();
        clearTimeout(timer);
        article.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSelection(id, item, article);
        return true;
      }
      if (Date.now() - started >= timeoutMs) {
        observer.disconnect();
        clearTimeout(timer);
        onTimeout?.();
        return true;
      }
      return false;
    };
    const observer = new MutationObserver(finish);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(finish, timeoutMs + 50);
    finish();
  }

  function jumpToTweet(id, item) {
    const article = findArticle(id);
    if (selected?.id === id) {
      clearSelection();
      renderPanel();
      return;
    }
    if (savedScrollY == null) savedScrollY = window.scrollY;
    if (article) {
      article.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setSelection(id, item, article);
      renderPanel();
      return;
    }
    const meta = pageCache().get(id);
    if (!Number.isFinite(meta?.pageY)) {
      if (meta?.statusUrl) location.assign(meta.statusUrl);
      return;
    }
    const originPageKey = activePageKey;
    const originGeneration = routeGeneration;
    window.scrollTo({ top: meta.pageY, behavior: 'smooth' });
    waitForArticle(id, item, () => {
      if (meta.statusUrl && pageKey(location.href) === originPageKey && routeGeneration === originGeneration) location.assign(meta.statusUrl);
    });
    updateBackButton();
  }

  function scheduleRender() {
    if (!isPublicXPage()) {
      disableRadarForPrivatePage();
      return;
    }
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      injectStyles();
      renderBadges();
      renderPanel();
    });
  }

  window.addEventListener('message', (event) => {
    if (!isPublicXPage() || event.source !== window || event.data?.__kolXViralCollector !== true) return;
    for (const tweet of event.data.tweets || []) remember(tweet);
    scheduleRender();
  });

  function requestCollectorSnapshot() {
    if (!isPublicXPage()) return;
    window.postMessage({ __kolXViralSnapshotRequest: true }, '*');
  }

  function disableRadarForPrivatePage() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    hideTooltip();
    clearSelection();
    savedScrollY = null;
    document.querySelectorAll('.kol-x-viral-badge').forEach((node) => node.remove());
    document.querySelectorAll(`svg.${LINK_CLASS}`).forEach((node) => node.remove());
    document.getElementById(TOOLTIP_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    panel?.remove();
    panel = null;
    lastPanelSignature = '';
    document.documentElement.dataset.kolXViralStatus = 'disabled-private-route';
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) return;
    settings = core.normalizeSettings(changes[SETTINGS_KEY].newValue);
    if (!settings.enabled || !settings.leaderboardEnabled) {
      clearSelection();
      savedScrollY = null;
    }
    scheduleRender();
  });

  function startDomObserver() {
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', startDomObserver, { once: true });
      return;
    }
    const pluginElement = (node) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return Boolean(element?.matches?.(`#${PANEL_ID},#${TOOLTIP_ID},#${STYLE_ID},.kol-x-viral-badge,svg.${LINK_CLASS}`)
        || element?.closest?.(`#${PANEL_ID},#${TOOLTIP_ID},.kol-x-viral-badge,svg.${LINK_CLASS}`));
    };
    const pluginOnlyMutation = (mutation) => {
      if (pluginElement(mutation.target)) return true;
      const added = [...mutation.addedNodes];
      return mutation.removedNodes.length === 0 && added.length > 0 && added.every(pluginElement);
    };
    const currentTweetIds = () => new Set([...document.querySelectorAll('article[data-testid="tweet"]')]
      .filter(visibleArticle).map(tweetIdForArticle).filter(Boolean));
    const currentArticles = () => new Set([...document.querySelectorAll('article[data-testid="tweet"]')]
      .filter(visibleArticle));
    let stableArticles = currentArticles();
    let routeOldArticles = new Set();
    const settleRoute = () => {
      routeSettling = false;
      routeOldIds.clear();
      routeOldArticles.clear();
      clearTimeout(routeGuardTimer);
      routeGuardTimer = 0;
      lastPanelSignature = '';
    };
    const finishRouteWhenNewTimelineMounted = () => {
      if (!routeSettling) return;
      const current = currentTweetIds();
      const articles = currentArticles();
      const hasNewTweet = [...current].some((id) => !routeOldIds.has(id));
      const hasNewArticle = [...articles].some((article) => !routeOldArticles.has(article));
      const oldTimelineGone = routeOldArticles.size > 0
        && [...routeOldArticles].every((article) => !article.isConnected || !visibleArticle(article));
      if (!current.size) {
        if (oldTimelineGone) settleRoute();
        return;
      }
      if (!routeOldIds.size || hasNewTweet || hasNewArticle || oldTimelineGone) settleRoute();
    };
    new MutationObserver((mutations) => {
      if (!isPublicXPage()) {
        lastHref = location.href;
        activePageKey = pageKey(lastHref);
        routeSettling = false;
        clearTimeout(routeGuardTimer);
        routeGuardTimer = 0;
        disableRadarForPrivatePage();
        return;
      }
      if (mutations.length && mutations.every(pluginOnlyMutation)) return;
      if (location.href !== lastHref) {
        routeOldArticles = new Set(stableArticles);
        routeOldIds = new Set([...stableArticles].map(tweetIdForArticle).filter(Boolean));
        lastHref = location.href;
        activePageKey = pageKey(lastHref);
        routeSettling = true;
        const generation = ++routeGeneration;
        clearTimeout(routeGuardTimer);
        routeGuardTimer = setTimeout(() => {
          if (generation !== routeGeneration || location.href !== lastHref) return;
          settleRoute();
          stableArticles = currentArticles();
          scheduleRender();
        }, 8000);
        lastPanelSignature = '';
        savedScrollY = null;
        hideTooltip();
        clearSelection();
      }
      finishRouteWhenNewTimelineMounted();
      if (!routeSettling) stableArticles = currentArticles();
      scheduleRender();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  startDomObserver();

  window.addEventListener('scroll', () => {
    hideTooltip();
    scheduleRender();
    updateLinkGeometry();
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    hideTooltip();
    applyPanelPosition(panel ? { left: panel.getBoundingClientRect().left, top: panel.getBoundingClientRect().top } : null);
    updateLinkGeometry();
  }, { passive: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      clearSelection();
      renderPanel();
    }
  });

  storageGet(SETTINGS_KEY).then((stored) => {
    settings = core.normalizeSettings(stored);
    if (isPublicXPage()) {
      document.documentElement.dataset.kolXViralStatus = 'active';
      scheduleRender();
    } else {
      disableRadarForPrivatePage();
    }
  });
  requestCollectorSnapshot();
  setTimeout(requestCollectorSnapshot, 500);
  window.addEventListener('DOMContentLoaded', requestCollectorSnapshot, { once: true });
  setInterval(scheduleRender, 30000);
})();
