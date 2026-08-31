(function () {
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
    .card { width: 248px; overflow: hidden; border: 1px solid rgba(20,24,31,.1); border-radius: 8px; background: #fff;
      color: #202329; box-shadow: 0 10px 28px rgba(20,24,31,.18); font: 12px/1.45 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
    .head { display: flex; align-items: center; gap: 7px; min-height: 39px; padding: 8px 10px; border-bottom: 1px solid #eceef1;
      background: #f7f8f9; cursor: move; user-select: none; }
    .platform { padding: 2px 7px; border-radius: 5px; background: #202329; color: #fff; font-size: 10px; font-weight: 800; }
    .pf-TT .platform { background: #fe2c55; } .pf-YT .platform { background: #f00; } .pf-X .platform { background: #111; }
    .pf-IG .platform { background: #b82b7d; }
    .handle { min-width: 0; overflow: hidden; color: #555b64; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
    .min { width: 24px; height: 24px; margin-left: auto; padding: 0; border: 0; border-radius: 5px; background: transparent; color: #737983;
      cursor: pointer; font-size: 17px; font-weight: 700; }
    .min:hover { background: #e8eaed; }
    .content { display: flex; flex-direction: column; gap: 10px; padding: 11px; }
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
    .foot { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; background: #202329; color: #aeb3ba; font-size: 9px; }
    .foot b { color: #fff; font-size: 10px; }
    .card.minimized { width: auto; }
    .card.minimized .content, .card.minimized .foot, .card.minimized .handle { display: none; }
    .card.minimized .head { border-bottom: 0; }
    .card.minimized .min { margin-left: 0; }
  `;

  let currentKey = '';
  let collected = [];
  const collectedSignatures = new Set();
  let activePanel = null;
  let moveHandler = null;
  let upHandler = null;
  let localRetryTimer = null;

  const ask = (message) => new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(response);
    });
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
    if (pageRows.length >= 3) {
      const engagements = pageRows.map((row) => row.engagement).filter((value) => value != null);
      return {
        avgViews: average(pageRows.map((row) => row.views)),
        avgEngagement: engagements.length >= 3 ? average(engagements) : null,
        sampleSize: pageRows.length,
      };
    }
    if (collected.length >= 3) {
      const rows = collected.slice(0, 12);
      const engagements = rows.map((row) => row.likes + row.comments + row.shares).filter((value) => value > 0);
      return {
        avgViews: average(rows.map((row) => row.views)),
        avgEngagement: engagements.length >= 3 ? average(engagements) : null,
        sampleSize: rows.length,
      };
    }
    return {
      avgViews: null,
      avgEngagement: null,
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

  function showProfile(root, profile) {
    const api = root.querySelector('.api');
    api.dataset.loaded = '1';
    setText(root, '.name', profile.name || `@${profile.handle}`);
    root.querySelector('.verified').style.display = profile.verified ? '' : 'none';
    setRow(root, 'followers', formatCount(profile.followers), profile.followers != null);
    setRow(root, 'following', formatCount(profile.following), profile.following != null);
    setRow(root, 'posts', formatCount(profile.posts), profile.posts != null);
    setRow(root, 'likes', formatCount(profile.totalLikes), profile.totalLikes != null);
    setRow(root, 'avgViews', formatCount(profile.avgViews), profile.avgViews != null);
    setRow(root, 'avgEngagement', formatCount(profile.avgEngagement), profile.avgEngagement != null);
    setRow(root, 'country', profile.country, Boolean(profile.country));
    setRow(root, 'updated', profile.fetchedAt ? new Date(profile.fetchedAt).toLocaleString() : '', Boolean(profile.fetchedAt));
  }

  function showLibrary(root, library, configured) {
    const section = root.querySelector('.library');
    if (!section) return;
    if (!library || library.error || !library.found) {
      section.classList.remove('show');
      const message = root.querySelector('.library-message');
      if (message) message.textContent = library?.error || (configured ? '个人库暂未收录' : '在扩展设置中填写个人库密钥');
      return;
    }
    section.classList.add('show');
    const record = library.record || {};
    setText(root, '[data-library="followers"]', formatCount(parseCount(record.followers)));
    setText(root, '[data-library="views"]', formatCount(parseCount(record.avgViews)));
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
    wrapper.innerHTML = `
      <div class="card pf-${config.code}">
        <div class="head"><span class="platform">${config.code}</span><span class="handle"></span><button class="min" type="button" title="最小化">−</button></div>
        <div class="content">
          <div class="section-title">当前页面</div>
          <div class="metrics">
            <div class="metric"><b data-local="followers">—</b><span>粉丝</span></div>
            <div class="metric"><b data-local="views">—</b><span>平均播放</span></div>
            <div class="metric"><b data-local="engagement">—</b><span>平均互动</span></div>
            <div class="metric"><b data-local="sample">—</b><span>样本内容</span></div>
          </div>
          <div class="library">
            <div class="libraryhead"><span>个人达人库记录</span><span>已命中</span></div>
            <div class="libraryrows">
              <span>历史粉丝<b data-library="followers">—</b></span>
              <span>历史平均播放<b data-library="views">—</b></span>
            </div>
          </div>
          <div class="api">
            <div class="apihead"><b>TikHub 增强资料（可选）</b><span class="verified" style="display:none">✓</span></div>
            <div class="name">页面数据无需 API Key</div>
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
            <button class="query" type="button">重新抓取页面公开数据</button>
            <div class="message">已自动读取当前页面；TikHub API Key 仅用于补充资料</div>
          </div>
        </div>
        <div class="foot"><b>Creator Insight</b><span>Powered by TikHub</span></div>
      </div>`;
    shadow.append(style, wrapper);
    document.body.appendChild(host);
    activePanel = { root: wrapper, config };

    setText(wrapper, '.handle', `@${config.handle}`);
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

    const queryButton = wrapper.querySelector('.query');
    const message = wrapper.querySelector('.message');
    let tikhubConfigured = false;
    const setMessage = (text, error = false) => { message.textContent = text; message.className = `message${error ? ' error' : ''}`; };
    ask({ type: 'getCachedProfile', platform: config.code, handle: config.handle }).then((result) => {
      if (!wrapper.isConnected || !result) return;
      showLibrary(wrapper, result.library, result.personalConfigured);
      tikhubConfigured = result.configured;
      if (result.profile) {
        showProfile(wrapper, result.profile);
        queryButton.textContent = result.configured
          ? (result.fresh ? '刷新 TikHub 资料（可能计费）' : '缓存已过期，重新获取')
          : '重新抓取页面公开数据';
        setMessage(result.configured
          ? (result.fresh ? '已从本机缓存恢复，本次未产生 API 请求' : '缓存已过期，点击后请求最新资料')
          : '已显示本机历史缓存；页面公开数据仍可无 Key 自动更新');
      } else if (!result.configured) {
        queryButton.textContent = '重新抓取页面公开数据';
        setMessage('无需 API Key；已自动读取页面，点击可立即重试');
      } else {
        queryButton.textContent = '获取 TikHub 增强资料（可能计费）';
        setMessage('页面数据已自动读取；点击可补充 TikHub 资料');
      }
    });
    queryButton.addEventListener('click', async () => {
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
      queryButton.textContent = '正在请求 TikHub...';
      setMessage('本次操作可能产生 TikHub API 费用');
      const result = await ask({ type: 'fetchProfile', platform: config.code, handle: config.handle, pageUrl: location.href.split('?')[0] });
      queryButton.disabled = false;
      if (!result || !result.ok) {
        queryButton.textContent = '重试获取 TikHub 资料';
        setMessage((result && result.error) || '请求失败，请稍后重试', true);
        return;
      }
      showProfile(wrapper, result.profile);
      queryButton.textContent = '刷新 TikHub 资料（可能计费）';
      setMessage('资料已更新并缓存到本机');
      place();
    });

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
    setText(root, '[data-local="followers"]', formatCount(scrapeFollowers(config)));
    setText(root, '[data-local="views"]', formatCount(stats.avgViews));
    setText(root, '[data-local="engagement"]', formatCount(stats.avgEngagement));
    setText(root, '[data-local="sample"]', stats.sampleSize ? String(stats.sampleSize) : '—');
    return stats;
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
    if (key !== currentKey) { collected = []; collectedSignatures.clear(); }
    currentKey = key;
    const href = location.href;
    waitForAvatar(config, (avatar) => {
      if (location.href !== href || currentKey !== key) return;
      createPanel(config, avatar);
    });
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.__creatorInsightCollector !== true) return;
    for (const row of event.data.stats || []) {
      const signature = `${row.views}:${row.likes}:${row.comments}`;
      if (!collectedSignatures.has(signature)) { collectedSignatures.add(signature); collected.push(row); }
    }
    updateLocalMetrics();
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
