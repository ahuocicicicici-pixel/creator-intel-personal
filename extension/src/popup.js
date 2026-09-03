const apiKey = document.getElementById('apiKey');
const cacheHours = document.getElementById('cacheHours');
const enabled = document.getElementById('enabled');
const saveBtn = document.getElementById('saveBtn');
const showKey = document.getElementById('showKey');
const googleLogin = document.getElementById('googleLogin');
const account = document.getElementById('account');
const accountPicture = document.getElementById('accountPicture');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const ownerBadge = document.getElementById('ownerBadge');
const logoutBtn = document.getElementById('logoutBtn');
const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');
const xViralEnabled = document.getElementById('xViralEnabled');
const xLeaderboardEnabled = document.getElementById('xLeaderboardEnabled');
const xTrendingPerHour = document.getElementById('xTrendingPerHour');
const xViralPerHour = document.getElementById('xViralPerHour');
const xTopN = document.getElementById('xTopN');

const DEFAULT_X_VIRAL_SETTINGS = Object.freeze({
  enabled: true,
  leaderboardEnabled: true,
  topN: 10,
  trendingPerHour: 1000,
  viralPerHour: 10000,
});

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function readXViralSettings() {
  const trendingPerHour = normalizePositiveInteger(xTrendingPerHour.value, DEFAULT_X_VIRAL_SETTINGS.trendingPerHour);
  return {
    enabled: xViralEnabled.checked,
    leaderboardEnabled: xLeaderboardEnabled.checked,
    topN: Math.max(1, Math.min(30, normalizePositiveInteger(xTopN.value, DEFAULT_X_VIRAL_SETTINGS.topN))),
    trendingPerHour,
    viralPerHour: Math.max(trendingPerHour, normalizePositiveInteger(xViralPerHour.value, DEFAULT_X_VIRAL_SETTINGS.viralPerHour)),
  };
}

function renderXViralSettings(value) {
  const settings = { ...DEFAULT_X_VIRAL_SETTINGS, ...(value || {}) };
  xViralEnabled.checked = settings.enabled !== false;
  xLeaderboardEnabled.checked = settings.leaderboardEnabled !== false;
  xTrendingPerHour.value = String(settings.trendingPerHour);
  xViralPerHour.value = String(settings.viralPerHour);
  xTopN.value = String(settings.topN);
}

document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

const ask = (message) => new Promise((resolve) => {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return resolve(null);
    resolve(response);
  });
});

function status(text, type = '') {
  statusText.textContent = text;
  dot.className = `dot${type ? ` ${type}` : ''}`;
}

function renderAccount(user) {
  const loggedIn = Boolean(user?.email);
  googleLogin.style.display = loggedIn ? 'none' : '';
  account.classList.toggle('show', loggedIn);
  if (!loggedIn) return;
  accountPicture.src = user.picture || '../assets/icons/icon-48.png';
  accountName.textContent = user.name || user.email;
  accountEmail.textContent = user.email;
  ownerBadge.textContent = user.isOwner ? '所有者 · 可查看私有报价与合作记录' : '公开资料权限';
}

async function load() {
  const saved = await chrome.storage.local.get(['tikhubApiKey', 'user', 'enabled', 'cacheHours', 'xViralSettings']);
  apiKey.value = saved.tikhubApiKey || '';
  enabled.checked = saved.enabled !== false;
  cacheHours.value = String(Number(saved.cacheHours) || 24);
  renderAccount(saved.user || null);
  renderXViralSettings(saved.xViralSettings);
  status(saved.user ? '正在验证登录状态...' : '请使用 Google 账号登录');
  const session = await ask({ type: 'refreshSession' });
  renderAccount(session?.user || null);
  status(session?.loggedIn ? 'COCO 情报库已连接' : '请使用 Google 账号登录', session?.loggedIn ? 'ok' : '');
}

showKey.addEventListener('click', () => {
  const showing = apiKey.type === 'text';
  apiKey.type = showing ? 'password' : 'text';
  showKey.textContent = showing ? '显示' : '隐藏';
});

googleLogin.addEventListener('click', async () => {
  googleLogin.disabled = true;
  status('正在打开 Google 登录...');
  const result = await ask({ type: 'loginGoogle' });
  googleLogin.disabled = false;
  if (!result?.ok) {
    status(`登录失败：${result?.error || '未知错误'}`, 'err');
    return;
  }
  renderAccount(result.user);
  status(result.user.isOwner ? '所有者登录成功 · 私有资料已解锁' : '登录成功 · 可查看公开资料', 'ok');
});

logoutBtn.addEventListener('click', async () => {
  await ask({ type: 'logoutGoogle' });
  renderAccount(null);
  status('已退出 Google 账号');
});

saveBtn.addEventListener('click', async () => {
  const key = apiKey.value.trim();
  saveBtn.disabled = true;
  status(key ? '正在验证 TikHub API Key...' : '正在保存设置...');
  await chrome.storage.local.set({ xViralSettings: readXViralSettings() });
  const saved = await ask({ type: 'saveSettings', apiKey: key, enabled: enabled.checked, cacheHours: Number(cacheHours.value) });
  if (!saved?.ok) {
    status('设置保存失败，请重试', 'err');
    saveBtn.disabled = false;
    return;
  }
  if (!key) {
    saveBtn.disabled = false;
    status('设置已保存', 'ok');
    return;
  }
  const result = await ask({ type: 'testApiKey' });
  saveBtn.disabled = false;
  if (!result?.ok) {
    status(`TikHub 验证失败：${result?.error || '未知错误'}`, 'err');
    return;
  }
  const credits = [];
  if (result.balance != null) credits.push(`余额 ${result.balance}`);
  if (result.freeCredit != null) credits.push(`赠送额度 ${result.freeCredit}`);
  status(`TikHub 验证成功${credits.length ? ` · ${credits.join(' · ')}` : ''}`, 'ok');
});

enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));
cacheHours.addEventListener('change', () => chrome.storage.local.set({ cacheHours: Number(cacheHours.value) }));

load();
