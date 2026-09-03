(function (root) {
  const COUNTRIES = [
    ['US', 'United States', '美国'], ['GB', 'United Kingdom', '英国'], ['CA', 'Canada', '加拿大'],
    ['AU', 'Australia', '澳大利亚'], ['NZ', 'New Zealand', '新西兰'], ['IE', 'Ireland', '爱尔兰'],
    ['DE', 'Germany', '德国'], ['FR', 'France', '法国'], ['IT', 'Italy', '意大利'], ['ES', 'Spain', '西班牙'],
    ['PT', 'Portugal', '葡萄牙'], ['NL', 'Netherlands', '荷兰'], ['BE', 'Belgium', '比利时'],
    ['CH', 'Switzerland', '瑞士'], ['AT', 'Austria', '奥地利'], ['SE', 'Sweden', '瑞典'], ['NO', 'Norway', '挪威'],
    ['DK', 'Denmark', '丹麦'], ['FI', 'Finland', '芬兰'], ['IS', 'Iceland', '冰岛'], ['LU', 'Luxembourg', '卢森堡'],
    ['JP', 'Japan', '日本'], ['KR', 'South Korea', '韩国'], ['SG', 'Singapore', '新加坡'],
    ['HK', 'Hong Kong', '香港'], ['TW', 'Taiwan', '台湾'], ['IL', 'Israel', '以色列'],
    ['AE', 'United Arab Emirates', '阿联酋'], ['QA', 'Qatar', '卡塔尔'], ['KW', 'Kuwait', '科威特'],
    ['SA', 'Saudi Arabia', '沙特'], ['BH', 'Bahrain', '巴林'], ['CN', 'China', '中国'],
    ['IN', 'India', '印度'], ['ID', 'Indonesia', '印尼'], ['PH', 'Philippines', '菲律宾'],
    ['VN', 'Vietnam', '越南'], ['TH', 'Thailand', '泰国'], ['MY', 'Malaysia', '马来西亚'],
    ['PK', 'Pakistan', '巴基斯坦'], ['BD', 'Bangladesh', '孟加拉'], ['LK', 'Sri Lanka', '斯里兰卡'],
    ['NP', 'Nepal', '尼泊尔'], ['MM', 'Myanmar', '缅甸'], ['KH', 'Cambodia', '柬埔寨'],
    ['BR', 'Brazil', '巴西'], ['MX', 'Mexico', '墨西哥'], ['AR', 'Argentina', '阿根廷'],
    ['CL', 'Chile', '智利'], ['CO', 'Colombia', '哥伦比亚'], ['PE', 'Peru', '秘鲁'],
    ['VE', 'Venezuela', '委内瑞拉'], ['EC', 'Ecuador', '厄瓜多尔'], ['BO', 'Bolivia', '玻利维亚'],
    ['UY', 'Uruguay', '乌拉圭'], ['PY', 'Paraguay', '巴拉圭'], ['GT', 'Guatemala', '危地马拉'],
    ['DO', 'Dominican Republic', '多米尼加'], ['RU', 'Russia', '俄罗斯'], ['UA', 'Ukraine', '乌克兰'],
    ['PL', 'Poland', '波兰'], ['RO', 'Romania', '罗马尼亚'], ['CZ', 'Czechia', '捷克'],
    ['HU', 'Hungary', '匈牙利'], ['GR', 'Greece', '希腊'], ['BG', 'Bulgaria', '保加利亚'],
    ['RS', 'Serbia', '塞尔维亚'], ['HR', 'Croatia', '克罗地亚'], ['SK', 'Slovakia', '斯洛伐克'],
    ['KZ', 'Kazakhstan', '哈萨克'], ['TR', 'Turkey', '土耳其'], ['IR', 'Iran', '伊朗'],
    ['IQ', 'Iraq', '伊拉克'], ['EG', 'Egypt', '埃及'], ['MA', 'Morocco', '摩洛哥'],
    ['DZ', 'Algeria', '阿尔及利亚'], ['TN', 'Tunisia', '突尼斯'], ['JO', 'Jordan', '约旦'],
    ['LB', 'Lebanon', '黎巴嫩'], ['SY', 'Syria', '叙利亚'], ['YE', 'Yemen', '也门'],
    ['NG', 'Nigeria', '尼日利亚'], ['ZA', 'South Africa', '南非'], ['KE', 'Kenya', '肯尼亚'],
    ['GH', 'Ghana', '加纳'], ['TZ', 'Tanzania', '坦桑尼亚'], ['UG', 'Uganda', '乌干达'],
    ['ET', 'Ethiopia', '埃塞俄比亚'], ['ZW', 'Zimbabwe', '津巴布韦'], ['ZM', 'Zambia', '赞比亚'],
    ['CM', 'Cameroon', '喀麦隆'], ['CI', "Cote d'Ivoire", '科特迪瓦'], ['SN', 'Senegal', '塞内加尔'],
    ['RW', 'Rwanda', '卢旺达'], ['AO', 'Angola', '安哥拉'], ['MZ', 'Mozambique', '莫桑比克'],
  ];
  const ALIASES = { 'united states of america': 'US', usa: 'US', uk: 'GB', england: 'GB', 'republic of korea': 'KR', 'korea, republic of': 'KR', uae: 'AE', 'czech republic': 'CZ', 'russian federation': 'RU' };
  const NAME_TO_ISO = new Map();
  const ISO_INFO = new Map();
  for (const [iso, en, zh] of COUNTRIES) {
    NAME_TO_ISO.set(en.toLowerCase(), iso);
    ISO_INFO.set(iso, { en, zh });
  }
  const ALL_ISO_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
  try {
    const english = new Intl.DisplayNames(['en'], { type: 'region' });
    const chinese = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
    for (const iso of ALL_ISO_CODES) {
      const en = english.of(iso);
      if (en) NAME_TO_ISO.set(en.toLowerCase(), iso);
      if (!ISO_INFO.has(iso)) ISO_INFO.set(iso, { en: en || iso, zh: chinese.of(iso) || iso });
    }
  } catch {}

  const T1 = new Set(['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI', 'CH', 'AT', 'BE', 'IE', 'AU', 'NZ', 'JP', 'KR', 'SG', 'HK', 'TW', 'IL', 'AE', 'LU', 'IS', 'PT']);
  const T2 = new Set(['CN', 'BR', 'MX', 'RU', 'TR', 'TH', 'MY', 'PL', 'CZ', 'HU', 'RO', 'GR', 'AR', 'CL', 'CO', 'ZA', 'SA', 'QA', 'KW', 'IN', 'ID', 'PH', 'VN', 'UA', 'KZ', 'BG', 'HR', 'SK']);

  function walkObjects(value, limit = 25000) {
    const output = [];
    const stack = [value];
    const seen = new Set();
    while (stack.length && output.length < limit) {
      const current = stack.pop();
      if (!current || typeof current !== 'object' || seen.has(current)) continue;
      seen.add(current);
      if (!Array.isArray(current)) output.push(current);
      const children = Object.values(current);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && typeof child === 'object') stack.push(child);
      }
    }
    return output;
  }

  function reelCodes(payload, limit = 12) {
    const codes = [];
    for (const item of walkObjects(payload)) {
      if (typeof item.code !== 'string' || item.is_pinned) continue;
      if (!('play_count' in item) && !('like_count' in item) && !('media_type' in item)) continue;
      if (!codes.includes(item.code)) codes.push(item.code);
      if (codes.length >= limit) break;
    }
    return codes;
  }

  function postLikeUsers(payload, limit = 50) {
    const users = [];
    const seen = new Set();
    for (const item of walkObjects(payload)) {
      if (!item.username || (!item.id && !item.pk)) continue;
      const id = String(item.id || item.pk);
      const username = String(item.username).trim().replace(/^@/, '');
      if (!username) continue;
      if (!seen.has(id)) { seen.add(id); users.push({ id, username }); }
      if (users.length >= limit) break;
    }
    return users;
  }

  function countryNameToISO(value) {
    if (!value) return null;
    const normalized = String(value).trim().toLowerCase();
    if (/^[a-z]{2}$/.test(normalized) && ISO_INFO.has(normalized.toUpperCase())) return normalized.toUpperCase();
    return NAME_TO_ISO.get(normalized) || ALIASES[normalized] || null;
  }

  function countryFromAbout(payload) {
    const serialized = JSON.stringify(payload?.data ?? payload);
    const isLabel = (value) => /account based in|based in/i.test(String(value || ''));
    const isCountryKey = (value) => /(?:^|:)about_this_account_country$/i.test(String(value || ''));
    const stringValues = (value) => {
      const values = [];
      const visit = (current) => {
        if (typeof current === 'string') values.push(current);
        else if (Array.isArray(current)) current.forEach(visit);
        else if (current && typeof current === 'object') Object.values(current).forEach(visit);
      };
      visit(value);
      return values;
    };
    for (const object of walkObjects(payload?.data ?? payload).sort((left, right) => JSON.stringify(left).length - JSON.stringify(right).length)) {
      const direct = Object.values(object).filter((value) => typeof value === 'string');
      if (direct.some(isCountryKey)) {
        for (const [key, value] of Object.entries(object)) {
          if (!/initial|value|subtitle|description|secondary/i.test(key) || typeof value !== 'string') continue;
          const iso = countryNameToISO(value);
          if (iso) return iso;
        }
        return null;
      }
      if (!direct.some(isLabel)) continue;
      const preferred = [];
      const collectPreferred = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (typeof child === 'string' && /initial|value|subtitle|description|secondary/i.test(key)) preferred.push(child);
          else if (child && typeof child === 'object') collectPreferred(child);
        }
      };
      collectPreferred(object);
      for (const value of preferred) {
        if (isLabel(value)) continue;
        const iso = countryNameToISO(value);
        if (iso) return iso;
      }
      for (const value of stringValues(object)) {
        if (isLabel(value)) continue;
        const iso = countryNameToISO(value);
        if (iso) return iso;
      }
    }
    const labelIndex = serialized.toLowerCase().search(/account based in|based in/);
    if (labelIndex >= 0) {
      const nearby = serialized.slice(labelIndex, labelIndex + 700);
      for (const match of nearby.matchAll(/"([^"\\]{2,60})"/g)) {
        if (isLabel(match[1])) continue;
        const iso = countryNameToISO(match[1]);
        if (iso) return iso;
      }
    }
    const loaded = /based in|date joined|former usernames?|date_joined|account based|about_this_account_country|verified/i.test(serialized)
      || Boolean(payload?.data?.layout || payload?.data?.screen || payload?.data?.bloks);
    return loaded ? null : undefined;
  }

  function flag(iso) {
    try { return iso.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0))); } catch { return ''; }
  }

  function buildResult({ handle, counts, analyzed, target, at = new Date().toISOString() }) {
    const valid = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
    if (!valid) return null;
    const all = Object.entries(counts)
      .map(([cc, count]) => ({ cc, count, pct: Math.round(Number(count) / valid * 100) }))
      .sort((left, right) => right.count - left.count);
    const tiers = { T1: 0, T2: 0, T3: 0 };
    for (const item of all) tiers[T1.has(item.cc) ? 'T1' : T2.has(item.cc) ? 'T2' : 'T3'] += item.count;
    return {
      platform: 'IG', handle, analyzed, valid, target, at,
      tierPct: Object.fromEntries(Object.entries(tiers).map(([tier, count]) => [tier, Math.round(count / valid * 100)])),
      topCountries: all.slice(0, 6).map((item) => ({ ...item, name: ISO_INFO.get(item.cc)?.zh || item.cc, flag: flag(item.cc) })),
    };
  }

  root.CreatorIntelAudienceCore = { buildResult, countryFromAbout, countryNameToISO, postLikeUsers, reelCodes };
})(globalThis);
