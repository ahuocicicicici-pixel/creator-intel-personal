const apiKey = document.getElementById('apiKey');
const personalApiKey = document.getElementById('personalApiKey');
const cacheHours = document.getElementById('cacheHours');
const enabled = document.getElementById('enabled');
const saveBtn = document.getElementById('saveBtn');
const showKey = document.getElementById('showKey');
const showPersonalKey = document.getElementById('showPersonalKey');
const dot = document.getElementById('dot');
const statusText = document.getElementById('statusText');

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

async function load() {
  const saved = await chrome.storage.local.get(['tikhubApiKey', 'personalApiKey', 'enabled', 'cacheHours']);
  apiKey.value = saved.tikhubApiKey || '';
  personalApiKey.value = saved.personalApiKey || '';
  enabled.checked = saved.enabled !== false;
  cacheHours.value = String(Number(saved.cacheHours) || 24);
  status(personalApiKey.value ? '个人达人库已配置' : '请填写个人达人库密钥', personalApiKey.value ? 'ok' : '');
}

function toggleSecret(input, button) {
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  button.textContent = showing ? '显示' : '隐藏';
}

showKey.addEventListener('click', () => {
  toggleSecret(apiKey, showKey);
});

showPersonalKey.addEventListener('click', () => toggleSecret(personalApiKey, showPersonalKey));

saveBtn.addEventListener('click', async () => {
  const key = apiKey.value.trim();
  const libraryKey = personalApiKey.value.trim();
  saveBtn.disabled = true;
  status(libraryKey ? '正在验证个人达人库...' : '正在保存设置...');
  const saved = await ask({ type: 'saveSettings', apiKey: key, personalApiKey: libraryKey, enabled: enabled.checked, cacheHours: Number(cacheHours.value) });
  if (!saved || !saved.ok) {
    status('设置保存失败，请重试', 'err');
    saveBtn.disabled = false;
    return;
  }
  if (libraryKey) {
    const libraryResult = await ask({ type: 'testPersonalApiKey' });
    if (!libraryResult || !libraryResult.ok) {
      status(`个人达人库验证失败：${(libraryResult && libraryResult.error) || '未知错误'}`, 'err');
      saveBtn.disabled = false;
      return;
    }
  }
  if (!key) {
    saveBtn.disabled = false;
    status(libraryKey ? '已保存 · 个人达人库可用' : '已保存 · 页面公开数据抓取可用', 'ok');
    return;
  }
  const result = await ask({ type: 'testApiKey' });
  saveBtn.disabled = false;
  if (!result || !result.ok) {
    status(`验证失败：${(result && result.error) || '未知错误'}`, 'err');
    return;
  }
  const credits = [];
  if (result.balance != null) credits.push(`余额 ${result.balance}`);
  if (result.freeCredit != null) credits.push(`赠送额度 ${result.freeCredit}`);
  status(`个人库与 TikHub 验证成功${credits.length ? ` · ${credits.join(' · ')}` : ''}`, 'ok');
});

enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabled.checked });
});

cacheHours.addEventListener('change', () => {
  chrome.storage.local.set({ cacheHours: Number(cacheHours.value) });
});

load();
