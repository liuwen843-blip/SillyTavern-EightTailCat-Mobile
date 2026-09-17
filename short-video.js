/**
 * 酒馆宿主层 · 沉浸式短视频流媒体中心 v11
 * - YouTube：官方 Data API（可选 Key）/ Invidious 镜像搜索 → 真实 videoId 轮播
 * - 成人源：三重 CORS 代理 + Eporner/PH 官方接口，卡片列表点播
 * - 无 B站；关闭立刻清空 iframe，杜绝漏声
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_STYLE_ID = 'eight-tail-sv-style-v12';
const SV_OPEN_GUARD_MS = 550;
const SV_MODE_LS_KEY = 'eight_tail_short_video_mode';
const SV_YT_IDX_LS_KEY = 'eight_tail_short_video_yt_idx';
const SV_SEARCH_LS_KEY = 'eight_tail_short_video_recent_search';
const SV_YT_API_KEY_LS = 'eight_tail_yt_api_key';
const SV_SWIPE_PX = 48;

const SV_QUICK_TAGS = [
  { label: '🐱 萌宠', kw: 'cat shorts' },
  { label: '🎧 ASMR', kw: 'asmr' },
  { label: '🎮 游戏切片', kw: 'game highlights shorts' },
  { label: '🔥 热门短片', kw: 'trending shorts' },
];

/** 精选公开、可嵌 Shorts / 短片（单视频 ID，非失效 Playlist） */
const SV_YT_SHORTS = [
  { id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny 预告' },
  { id: 'YE7VzlLtp-4', title: 'Big Buck Bunny' },
  { id: 'LXb3EKWsInQ', title: 'Costa Rica in 4K' },
  { id: 'ScMzIvxBSi4', title: 'Peaceful Nature' },
  { id: 'C0DPdy98e4c', title: 'Test Short Clip' },
  { id: 'hY7m5jjJ9mM', title: 'Cats Short' },
  { id: 'jNQXAC9IVRw', title: 'Me at the zoo' },
  { id: 'kJQP7kiw5Fk', title: 'Despacito' },
  { id: '9bZkp7q19f0', title: 'Gangnam Style' },
  { id: 'fJ9rUzIMcZQ', title: 'Bohemian Rhapsody' },
  { id: 'OPf0YbXqDm0', title: 'Uptown Funk' },
  { id: 'RgKAFK5djSk', title: 'See You Again' },
  { id: 'e-ORhEE9VVg', title: 'Blank Space' },
  { id: 'JGwWNGJdvx8', title: 'Shape of You' },
  { id: '2Vv-BfVoq4g', title: 'Perfect' },
];

const SV_EPORNER_API =
  'https://www.eporner.com/api/v2/video/search/?query=popular&per_page=24&page=1&order=most-popular&thumbsize=big&format=json';
const SV_PH_API =
  'https://www.pornhub.com/webmasters/search?ordering=mostviewed&period=weekly&thumbsize=large';

/** 三重免跨域代理 */
const SV_CORS_PROXIES = [
  {
    name: 'allorigins',
    build: function (url) {
      return 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
    },
    parse: function (data) {
      if (data && typeof data.contents === 'string') {
        try { return JSON.parse(data.contents); } catch (_) {
          return data.contents;
        }
      }
      return data;
    },
  },
  {
    name: 'codetabs',
    build: function (url) {
      return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url);
    },
    parse: function (data) { return data; },
  },
  {
    name: 'corsproxy',
    build: function (url) {
      return 'https://corsproxy.io/?' + encodeURIComponent(url);
    },
    parse: function (data) { return data; },
  },
];

const SV_BUILTIN_FEED = [
  {
    id: 'cn1',
    title: 'Uni-App 演示片',
    author: '@dcloud',
    url: 'https://qiniu-web-assets.dcloud.net.cn/unidoc/zh/uni-app-video-demo.mp4',
  },
  {
    id: 'cn2',
    title: '两分钟演示',
    author: '@dcloud',
    url: 'https://qiniu-web-assets.dcloud.net.cn/unidoc/zh/2minute-demo.mp4',
  },
  {
    id: 'cn3',
    title: 'Oceans',
    author: '@videojs',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
  },
  {
    id: 'cn4',
    title: 'Big Buck Bunny',
    author: '@w3c',
    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
  },
  {
    id: 'cn5',
    title: 'Flower',
    author: '@mdn',
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
];

const SV_EMBED_MODES = { youtube: 1, adult: 1 };

let svState = {
  index: 0,
  feed: SV_BUILTIN_FEED.slice(),
  muted: true,
  liked: Object.create(null),
  startY: 0,
  startX: 0,
  moved: false,
  open: false,
  mode: 'native', /* native | youtube | adult */
  embedId: '',
  ignoreClicksUntil: 0,
  ytIndex: 0,
  ytPlaylist: null, /* null=预置 Shorts；数组=搜索结果 [{id,title}] */
  ytSearchKw: '',
  ytSearching: false,
  ytUsedOfficial: false,
  adultList: [],
  adultIndex: 0,
  adultLoading: false,
  browseOpen: false,
  searchOpen: false,
  ytConfigOpen: false,
  lastSearchKw: '',
};

function svIsEmbedMode(mode) {
  return !!(mode && SV_EMBED_MODES[mode]);
}

function svReadMode() {
  try {
    const m = localStorage.getItem(SV_MODE_LS_KEY);
    if (m === 'bilibili') return 'native'; /* 旧 B站模式废弃 */
    if (m === 'pornhub') return 'adult';
    if (m === 'native' || svIsEmbedMode(m)) return m;
  } catch (_) {}
  return 'native';
}

function svWriteMode(mode) {
  const m = svIsEmbedMode(mode) ? mode : 'native';
  try { localStorage.setItem(SV_MODE_LS_KEY, m); } catch (_) {}
}

function svEnsureNoReferrerMeta() {
  try {
    let meta = document.querySelector('meta[name="referrer"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'referrer');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'no-referrer');
  } catch (_) {}
}

function svYoutubeEmbedUrl(videoId) {
  const id = encodeURIComponent(String(videoId || '').trim());
  let currentOrigin = 'http://127.0.0.1';
  try {
    if (window.location && window.location.origin && window.location.origin !== 'null') {
      currentOrigin = window.location.origin;
    }
  } catch (_) {}
  return 'https://www.youtube-nocookie.com/embed/' + id +
    '?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=' +
    encodeURIComponent(currentOrigin);
}

function svGetPageOrigin() {
  try {
    if (window.location && window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
  } catch (_) {}
  return 'http://127.0.0.1';
}

function svFormatDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function svYtActiveList() {
  if (svState.ytPlaylist && svState.ytPlaylist.length) return svState.ytPlaylist;
  return SV_YT_SHORTS;
}

function svGetYtApiKey() {
  try {
    return String(localStorage.getItem(SV_YT_API_KEY_LS) || '').trim();
  } catch (_) {
    return '';
  }
}

function svSaveYtApiKey(raw) {
  const key = String(raw || '').trim();
  if (!key) return false;
  try {
    localStorage.setItem(SV_YT_API_KEY_LS, key);
    return true;
  } catch (_) {
    return false;
  }
}

function svClearYtApiKey() {
  try { localStorage.removeItem(SV_YT_API_KEY_LS); } catch (_) {}
}

function svUpdateYtSearchHint() {
  const els = svEls();
  if (!els.searchHint) return;
  if (svGetYtApiKey()) {
    els.searchHint.textContent = 'YouTube：官方 API 已加速 · Pornhub：卡片列表';
  } else {
    els.searchHint.textContent = 'YouTube：公共镜像（可配 API Key 加速）· Pornhub：卡片列表';
  }
}

function svSyncYtConfigUi(root) {
  const els = svEls(root);
  if (els.ytKeyInput) {
    try { els.ytKeyInput.value = svGetYtApiKey(); } catch (_) {}
  }
  svUpdateYtSearchHint();
}

function svFetchWithTimeout(url, ms) {
  const timeoutMs = ms || 6000;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer = null;
  const opts = {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    mode: 'cors',
  };
  if (ctrl) {
    opts.signal = ctrl.signal;
    timer = setTimeout(function () {
      try { ctrl.abort(); } catch (_) {}
    }, timeoutMs);
  }
  return fetch(url, opts).finally(function () {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 官方 YouTube Data API v3（需用户自备 Key）
 * 返回 [{id,title}] 或 null
 */
async function svSearchYouTubeOfficial(keyword, apiKey) {
  const kw = String(keyword || '').trim();
  const key = String(apiKey || '').trim();
  if (!kw || !key) return null;

  const apiUrl =
    'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=' +
    encodeURIComponent(kw) + '&key=' + encodeURIComponent(key);

  try {
    const res = await svFetchWithTimeout(apiUrl, 8000);
    if (!res.ok) {
      console.warn('[EightTailCat] YouTube 官方 API HTTP', res.status);
      return null;
    }
    const data = await res.json();
    const items = (data && data.items) || [];
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const id = String((it.id && it.id.videoId) || '').trim();
      if (!id || seen[id]) continue;
      seen[id] = 1;
      const title = String((it.snippet && it.snippet.title) || ('视频 ' + id)).slice(0, 80);
      out.push({ id: id, title: title });
    }
    return out.length ? out : null;
  } catch (e) {
    console.warn('[EightTailCat] YouTube 官方 API 失败', e);
    return null;
  }
}

/**
 * Invidious 开放搜索（免 API Key）
 * 经 allorigins / corsproxy 穿透，返回 [{id,title}]
 */
async function svSearchYouTubeVideos(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return null;

  /* 有 Key → 优先官方极速接口 */
  const ytApiKey = svGetYtApiKey();
  svState.ytUsedOfficial = false;
  if (ytApiKey) {
    const official = await svSearchYouTubeOfficial(kw, ytApiKey);
    if (official && official.length) {
      svState.ytUsedOfficial = true;
      return official;
    }
    console.warn('[EightTailCat] 官方 API 无结果，回退公共镜像');
  }

  const invEndpoints = [
    'https://inv.tux.pizza/api/v1/search?q=' + encodeURIComponent(kw) + '&type=video',
    'https://vid.puffyan.us/api/v1/search?q=' + encodeURIComponent(kw) + '&type=video',
    'https://invidious.fdn.fr/api/v1/search?q=' + encodeURIComponent(kw) + '&type=video',
  ];

  const proxied = [];
  for (let i = 0; i < invEndpoints.length; i++) {
    const target = invEndpoints[i];
    proxied.push('https://api.allorigins.win/get?url=' + encodeURIComponent(target));
    proxied.push('https://corsproxy.io/?' + encodeURIComponent(target));
    proxied.push('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target));
  }

  function normalizeList(data) {
    let arr = data;
    if (!Array.isArray(arr) && data && Array.isArray(data.contents)) {
      try { arr = JSON.parse(data.contents); } catch (_) { arr = null; }
    }
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = Object.create(null);
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i] || {};
      const type = String(item.type || item.videoType || 'video').toLowerCase();
      if (type && type !== 'video' && type !== 'shortvideo') continue;
      const id = String(item.videoId || item.videoID || item.id || '').trim();
      if (!id || id.length < 8 || seen[id]) continue;
      seen[id] = 1;
      out.push({
        id: id,
        title: String(item.title || item.videoTitle || ('视频 ' + id)).slice(0, 80),
      });
    }
    return out;
  }

  for (let i = 0; i < proxied.length; i++) {
    const url = proxied[i];
    try {
      const res = await svFetchWithTimeout(url, 6500);
      if (!res.ok) continue;
      const raw = await res.json();
      let data = raw;
      if (url.indexOf('allorigins') >= 0) {
        if (raw && typeof raw.contents === 'string') {
          try { data = JSON.parse(raw.contents); } catch (_) { continue; }
        }
      }
      const list = normalizeList(data);
      if (list.length) return list;
    } catch (e) {
      console.warn('[EightTailCat] YouTube 镜像搜索失败，尝试下一节点', e);
    }
  }
  return null;
}

/* —— 三重代理穿透 —— */

async function svFetchJsonDirect(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    mode: 'cors',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function svFetchJsonViaProxies(targetUrl) {
  /* 先试直连 */
  try {
    return await svFetchJsonDirect(targetUrl);
  } catch (_) {}

  for (let i = 0; i < SV_CORS_PROXIES.length; i++) {
    const proxy = SV_CORS_PROXIES[i];
    try {
      const res = await fetch(proxy.build(targetUrl), {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
        referrerPolicy: 'no-referrer',
      });
      if (!res.ok) continue;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let raw;
      if (ct.indexOf('application/json') >= 0 || proxy.name === 'allorigins') {
        raw = await res.json();
      } else {
        const text = await res.text();
        try { raw = JSON.parse(text); } catch (_) { raw = text; }
      }
      const parsed = proxy.parse(raw);
      if (typeof parsed === 'string') {
        try { return JSON.parse(parsed); } catch (_) { continue; }
      }
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      console.warn('[EightTailCat] proxy fail:', proxy.name, err);
    }
  }
  throw new Error('all proxies failed');
}

function svNormalizeAdultItems(source, data) {
  const out = [];
  const seen = Object.create(null);

  function push(item) {
    if (!item || !item.embedUrl || !item.id) return;
    if (seen[item.id]) return;
    seen[item.id] = 1;
    out.push(item);
  }

  if (source === 'eporner') {
    const videos = (data && data.videos) || [];
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i] || {};
      const id = String(v.id || v.video_id || '').trim();
      if (!id) continue;
      const thumb = v.default_thumb || v.thumb ||
        (v.thumbs && v.thumbs[0] && (v.thumbs[0].src || v.thumbs[0])) || '';
      const len = v.length_sec != null ? v.length_sec :
        (v.length_min != null ? Math.round(Number(v.length_min) * 60) : 0);
      push({
        id: 'ep_' + id,
        title: String(v.title || 'Eporner 视频').slice(0, 80),
        thumb: String(thumb || ''),
        duration: svFormatDuration(len),
        durationSec: len,
        embedUrl: 'https://www.eporner.com/embed/' + encodeURIComponent(id),
        source: 'eporner',
      });
    }
  }

  if (source === 'pornhub') {
    let videos = [];
    if (data && Array.isArray(data.videos)) videos = data.videos;
    else if (data && data.videos && Array.isArray(data.videos.video)) videos = data.videos.video;
    else if (Array.isArray(data)) videos = data;

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i] || {};
      let key = String(v.video_id || v.vkey || v.viewkey || '').trim();
      if (!key && v.url) {
        const m = String(v.url).match(/[?&]viewkey=([^&#]+)/i);
        if (m) key = decodeURIComponent(m[1]);
      }
      if (!key) continue;
      const thumb = v.thumb || v.default_thumb || v.thumbnail ||
        (v.thumbs && v.thumbs[0]) || '';
      const len = v.duration != null ? v.duration :
        (v.length != null ? v.length : 0);
      push({
        id: 'ph_' + key,
        title: String(v.title || 'Pornhub 视频').slice(0, 80),
        thumb: String(thumb || ''),
        duration: typeof len === 'string' ? len : svFormatDuration(len),
        durationSec: typeof len === 'number' ? len : 0,
        embedUrl: 'https://www.pornhub.com/embed/' + encodeURIComponent(key) + '?autoplay=1',
        source: 'pornhub',
      });
    }
  }

  return out;
}

async function svLoadAdultCatalog(searchKw) {
  const kw = String(searchKw || '').trim();
  const merged = [];
  const epUrl = kw
    ? ('https://www.eporner.com/api/v2/video/search/?query=' + encodeURIComponent(kw) +
      '&per_page=24&page=1&order=most-popular&thumbsize=big&format=json')
    : SV_EPORNER_API;
  const phUrl = kw
    ? ('https://www.pornhub.com/webmasters/search?search=' + encodeURIComponent(kw) +
      '&ordering=mostviewed&period=weekly&thumbsize=large')
    : SV_PH_API;

  try {
    const ep = await svFetchJsonViaProxies(epUrl);
    merged.push.apply(merged, svNormalizeAdultItems('eporner', ep));
  } catch (err) {
    console.warn('[EightTailCat] Eporner fail', err);
  }
  try {
    const ph = await svFetchJsonViaProxies(phUrl);
    merged.push.apply(merged, svNormalizeAdultItems('pornhub', ph));
  } catch (err) {
    console.warn('[EightTailCat] Pornhub fail', err);
  }

  if (!merged.length && !kw) {
    try {
      const alt = await svFetchJsonViaProxies(
        'https://www.eporner.com/api/v2/video/search/?query=hot&per_page=12&page=1&format=json&thumbsize=big&order=most-popular'
      );
      merged.push.apply(merged, svNormalizeAdultItems('eporner', alt));
    } catch (_) {}
  }
  return merged;
}

/* —— DOM / 样式 —— */

function svEnsureStyle() {
  let style = document.getElementById(SV_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = SV_STYLE_ID;
    document.head.appendChild(style);
  }
  ['eight-tail-sv-style', 'eight-tail-sv-style-v4', 'eight-tail-sv-style-v5',
    'eight-tail-sv-style-v6', 'eight-tail-sv-style-v7', 'eight-tail-sv-style-v8',
    'eight-tail-sv-style-v9', 'eight-tail-sv-style-v10', 'eight-tail-sv-style-v11'].forEach(function (id) {
    try {
      const n = document.getElementById(id);
      if (n) n.remove();
    } catch (_) {}
  });

  style.textContent = `
#eight-tail-short-video-root {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100dvh !important;
  margin: 0 !important; padding: 0 !important; background: #000 !important; z-index: 100002 !important;
  display: none !important; flex-direction: column !important; overflow: hidden !important;
  pointer-events: auto !important; touch-action: none !important; color: #fff;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none; box-sizing: border-box !important;
}
#eight-tail-short-video-root.is-open { display: flex !important; }
#eight-tail-short-video-root, #eight-tail-short-video-root * { pointer-events: auto !important; box-sizing: border-box; }
#eight-tail-sv-toolbar {
  position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important;
  z-index: 40 !important; display: flex !important; justify-content: flex-end !important; gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px 12px !important;
  background: linear-gradient(180deg, rgba(0,0,0,.55), transparent) !important;
}
#eight-tail-sv-search-toggle,
#eight-tail-sv-yt-config-toggle,
#eight-tail-sv-close {
  width: 44px !important; height: 44px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(255,255,255,.22) !important; color: #fff !important; font-size: 20px !important;
  font-weight: 700 !important; display: flex !important; align-items: center !important;
  justify-content: center !important; cursor: pointer !important;
  box-shadow: 0 4px 14px rgba(0,0,0,.4); pointer-events: auto !important;
  touch-action: manipulation !important; z-index: 100005 !important;
}
#eight-tail-sv-yt-config-toggle { font-size: 18px !important; }
#eight-tail-sv-close {
  background: rgba(239, 68, 68, .92) !important; font-size: 26px !important;
}
#eight-tail-sv-search-panel {
  display: none !important;
  position: absolute !important;
  top: max(56px, calc(env(safe-area-inset-top) + 48px)) !important;
  left: 10px !important; right: 10px !important;
  z-index: 100005 !important;
  pointer-events: auto !important;
  padding: 10px 12px 12px !important;
  border-radius: 16px !important;
  background: rgba(18, 18, 24, 0.78) !important;
  backdrop-filter: blur(16px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.2) !important;
  box-shadow: 0 10px 28px rgba(0,0,0,.45) !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  touch-action: manipulation !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  max-height: min(72vh, 560px) !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch !important;
}
#eight-tail-short-video-root.search-open #eight-tail-sv-search-panel {
  display: block !important;
}
#eight-tail-sv-search-row {
  display: flex !important; gap: 8px !important; align-items: center !important;
}
#eight-tail-sv-search-input,
#eight-tail-sv-yt-key-input {
  flex: 1 1 auto !important; min-width: 0 !important;
  border: 1px solid rgba(255,255,255,.22) !important; border-radius: 12px !important;
  background: rgba(255,255,255,.12) !important; color: #fff !important;
  padding: 11px 12px !important; font-size: 14px !important; outline: none !important;
  pointer-events: auto !important; touch-action: manipulation !important;
  -webkit-user-select: text !important; user-select: text !important;
  z-index: 100005 !important;
}
#eight-tail-sv-search-input::placeholder,
#eight-tail-sv-yt-key-input::placeholder { color: rgba(255,255,255,.45); }
#eight-tail-sv-search-go,
#eight-tail-sv-search-collapse,
#eight-tail-sv-yt-key-save,
#eight-tail-sv-yt-key-clear {
  flex: 0 0 auto !important; border: 0 !important; border-radius: 12px !important;
  padding: 10px 12px !important; font-size: 13px !important; font-weight: 800 !important;
  cursor: pointer !important; pointer-events: auto !important; touch-action: manipulation !important;
  z-index: 100005 !important; color: #fff !important;
}
#eight-tail-sv-search-go { background: #5b8def !important; }
#eight-tail-sv-search-collapse { background: rgba(255,255,255,.14) !important; }
#eight-tail-sv-yt-config {
  display: none !important;
  margin-top: 10px !important;
  padding: 10px !important;
  border-radius: 12px !important;
  background: rgba(255,255,255,.06) !important;
  border: 1px solid rgba(255,255,255,.1) !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}
#eight-tail-short-video-root.yt-config-open #eight-tail-sv-yt-config {
  display: block !important;
}
#eight-tail-sv-yt-config-title {
  font-size: 13px !important; font-weight: 800 !important; margin-bottom: 8px !important;
  pointer-events: none !important;
}
#eight-tail-sv-yt-key-row {
  display: flex !important; flex-wrap: wrap !important; gap: 8px !important; align-items: center !important;
  margin-bottom: 8px !important;
}
#eight-tail-sv-yt-key-save { background: #3d9a5f !important; }
#eight-tail-sv-yt-key-clear { background: rgba(255,255,255,.14) !important; }
#eight-tail-sv-yt-guide {
  margin-top: 6px !important;
  padding: 10px 11px !important;
  border-radius: 10px !important;
  background: rgba(91, 141, 239, 0.14) !important;
  border: 1px solid rgba(91, 141, 239, 0.28) !important;
  font-size: 11.5px !important;
  line-height: 1.55 !important;
  color: rgba(255,255,255,.88) !important;
  opacity: 0.95 !important;
  pointer-events: auto !important;
  user-select: text !important;
  -webkit-user-select: text !important;
}
#eight-tail-sv-yt-guide a {
  color: #9ec1ff !important;
  text-decoration: underline !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}
#eight-tail-sv-yt-guide strong { font-weight: 800 !important; }
#eight-tail-sv-yt-guide ol {
  margin: 6px 0 4px 1.1em !important;
  padding: 0 !important;
}
#eight-tail-sv-yt-guide li { margin: 3px 0 !important; }
#eight-tail-sv-yt-guide .etc-sv-guide-note {
  margin-top: 6px !important;
  opacity: .78 !important;
  font-style: italic !important;
}
#eight-tail-sv-search-tags {
  display: flex !important; flex-wrap: wrap !important; gap: 8px !important; margin-top: 10px !important;
  pointer-events: auto !important; z-index: 100005 !important;
}
.etc-sv-chip {
  border: 0 !important; border-radius: 999px !important; padding: 6px 12px !important;
  font-size: 12px !important; font-weight: 700 !important; cursor: pointer !important;
  background: rgba(255,255,255,.14) !important; color: #fff !important;
  pointer-events: auto !important; touch-action: manipulation !important;
}
.etc-sv-chip:active { transform: scale(0.96); }
#eight-tail-sv-search-hint {
  margin-top: 8px; font-size: 11px; opacity: .65; pointer-events: none !important;
}
#eight-tail-sv-apps {
  position: absolute !important; top: max(56px, calc(env(safe-area-inset-top) + 48px)) !important;
  left: 10px !important; right: 10px !important; z-index: 35 !important;
  display: flex !important; gap: 8px !important; overflow-x: auto !important; scrollbar-width: none;
  padding: 4px 2px 8px !important;
}
#eight-tail-sv-apps::-webkit-scrollbar { display: none; }
.etc-sv-app {
  flex: 0 0 auto !important; width: 64px !important; border: 0 !important; border-radius: 16px !important;
  padding: 8px 4px 6px !important; background: rgba(255,255,255,.14) !important; color: #fff !important;
  display: flex !important; flex-direction: column !important; align-items: center !important; gap: 4px !important;
  cursor: pointer !important; touch-action: manipulation !important; backdrop-filter: blur(8px);
}
.etc-sv-app .emoji {
  width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-size: 20px; background: linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,.06));
}
.etc-sv-app .name { font-size: 10px; font-weight: 700; }
.etc-sv-app[data-app="youtube"] .emoji { background: linear-gradient(160deg, #ff6b6b, #c62828); }
.etc-sv-app[data-app="pornhub"] .emoji { background: linear-gradient(160deg, #ff9900, #ff6600); }
.etc-sv-app[data-app="picacg"] .emoji { background: linear-gradient(160deg, #ff8fb8, #e91e63); }
.etc-sv-app[data-app="douyin"] .emoji { background: linear-gradient(160deg, #2a2a2a, #111); }
.etc-sv-app[data-app="xiaohongshu"] .emoji { background: linear-gradient(160deg, #ff5a6a, #e11d48); }
.etc-sv-app.is-on { outline: 2px solid rgba(255,255,255,.9); }
#eight-tail-sv-stage {
  position: relative !important; flex: 1 1 auto !important; width: 100% !important; min-height: 0 !important;
  overflow: hidden !important; background: #000 !important; margin-top: 108px !important;
  touch-action: none !important;
}
#eight-tail-sv-video {
  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  object-fit: contain !important; background: #000 !important; pointer-events: none !important;
}
#eight-tail-sv-embed {
  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  border: none !important; background: #000 !important; display: none !important; z-index: 3 !important;
}
#eight-tail-short-video-root.mode-embed #eight-tail-sv-video { display: none !important; }
#eight-tail-short-video-root.mode-embed #eight-tail-sv-embed { display: block !important; }
#eight-tail-short-video-root.browse-open #eight-tail-sv-embed,
#eight-tail-short-video-root.browse-open #eight-tail-sv-video { display: none !important; }
#eight-tail-sv-browse {
  display: none !important; position: absolute !important; inset: 0 !important; z-index: 6 !important;
  overflow-y: auto !important; -webkit-overflow-scrolling: touch !important;
  padding: 8px 12px 80px !important; background: rgba(8,8,12,.96) !important;
  touch-action: pan-y !important;
}
#eight-tail-short-video-root.browse-open #eight-tail-sv-browse { display: block !important; }
#eight-tail-sv-browse-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 10px; font-size: 13px; font-weight: 700;
}
#eight-tail-sv-browse-refresh {
  border: 0; border-radius: 10px; padding: 8px 12px; font-size: 12px; font-weight: 700;
  background: rgba(255,255,255,.14); color: #fff; cursor: pointer;
}
#eight-tail-sv-cards {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
}
@media (min-width: 720px) {
  #eight-tail-sv-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.etc-sv-card {
  border: 0; border-radius: 14px; overflow: hidden; padding: 0; text-align: left;
  background: rgba(255,255,255,.08); color: #fff; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.35); touch-action: manipulation;
}
.etc-sv-card:active { transform: scale(0.98); }
.etc-sv-card-thumb {
  position: relative; width: 100%; aspect-ratio: 16/10; background: #1a1a1a; overflow: hidden;
}
.etc-sv-card-thumb img {
  width: 100%; height: 100%; object-fit: cover; display: block; border: 0;
  referrerpolicy: no-referrer;
}
.etc-sv-card-dur {
  position: absolute; right: 6px; bottom: 6px; font-size: 10px; font-weight: 700;
  background: rgba(0,0,0,.7); padding: 2px 6px; border-radius: 6px;
}
.etc-sv-card-body { padding: 8px 9px 10px; }
.etc-sv-card-title {
  font-size: 12px; font-weight: 650; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.etc-sv-card-src { font-size: 10px; opacity: .55; margin-top: 4px; }
#eight-tail-sv-hint {
  position: absolute; left: 50%; top: 45%; transform: translate(-50%,-50%); z-index: 8;
  font-size: 14px; opacity: 0; pointer-events: none !important; transition: opacity .18s;
  background: rgba(0,0,0,.55); padding: 8px 16px; border-radius: 999px;
}
#eight-tail-sv-hint.show { opacity: 1; }
#eight-tail-sv-rail {
  position: absolute !important; right: 10px !important;
  bottom: max(120px, calc(16% + env(safe-area-inset-bottom))) !important;
  z-index: 12 !important; display: flex !important; flex-direction: column !important;
  align-items: center !important; gap: 14px !important;
}
#eight-tail-short-video-root.browse-open #eight-tail-sv-rail { display: none !important; }
.etc-sv-rail-btn {
  width: 52px !important; min-height: 52px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(0,0,0,.45) !important; color: #fff !important; display: flex !important;
  flex-direction: column !important; align-items: center !important; justify-content: center !important;
  gap: 2px !important; font-size: 11px !important; cursor: pointer !important; padding: 6px 0 !important;
}
.etc-sv-rail-btn .ico { font-size: 20px; line-height: 1; }
.etc-sv-rail-btn.is-on { color: #ff4d6d; }
#eight-tail-sv-next {
  background: linear-gradient(145deg, #5b8def, #3d6fd8) !important;
  width: 56px !important; min-height: 56px !important; font-weight: 800 !important;
}
#eight-tail-sv-list-btn {
  background: linear-gradient(145deg, #ff9900, #e67e00) !important;
}
#eight-tail-sv-meta {
  position: absolute; left: 14px; right: 78px;
  bottom: max(72px, calc(12% + env(safe-area-inset-bottom)));
  z-index: 10; pointer-events: none !important; text-shadow: 0 1px 4px rgba(0,0,0,.75);
}
#eight-tail-short-video-root.browse-open #eight-tail-sv-meta { display: none !important; }
#eight-tail-sv-author { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
#eight-tail-sv-title { font-size: 13px; opacity: .92; line-height: 1.4; }
#eight-tail-sv-status-bar {
  position: absolute !important; left: 12px !important; right: 12px !important;
  bottom: max(12px, env(safe-area-inset-bottom)) !important; z-index: 11 !important;
  font-size: 11px !important; opacity: .7 !important; pointer-events: none !important;
  text-align: center !important;
}
#eight-tail-short-video-root.browse-open #eight-tail-sv-status-bar { display: none !important; }
`;
}

function svForceRootCss(root) {
  if (!root) return;
  ['position:fixed', 'inset:0', 'width:100vw', 'height:100dvh', 'background:#000',
    'z-index:100002', 'display:flex', 'flex-direction:column', 'overflow:hidden',
    'pointer-events:auto'].forEach(function (pair) {
    const p = pair.split(':');
    try { root.style.setProperty(p[0], p[1], 'important'); } catch (_) {}
  });
}

function svGetRoot() {
  return document.getElementById(SV_ROOT_ID);
}

function svBuildDom() {
  svEnsureNoReferrerMeta();
  svEnsureStyle();
  let root = svGetRoot();
  if (root && root.dataset.svVersion === '12') {
    svForceRootCss(root);
    svSyncYtConfigUi(root);
    return root;
  }
  if (root) {
    try { root.remove(); } catch (_) {}
  }

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.dataset.svVersion = '12';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '短视频流');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="eight-tail-sv-toolbar">',
    '  <button type="button" id="eight-tail-sv-search-toggle" title="搜索" aria-label="搜索">🔍</button>',
    '  <button type="button" id="eight-tail-sv-yt-config-toggle" title="YouTube 配置" aria-label="YouTube 配置">🔑</button>',
    '  <button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭">×</button>',
    '</div>',
    '<div id="eight-tail-sv-search-panel" aria-label="多源搜索">',
    '  <div id="eight-tail-sv-search-row">',
    '    <input id="eight-tail-sv-search-input" type="search" enterkeyhint="search" autocomplete="off"',
    '      placeholder="搜索关键词：cat shorts / anime / asmr…" />',
    '    <button type="button" id="eight-tail-sv-search-go">搜索</button>',
    '    <button type="button" id="eight-tail-sv-search-collapse">收起</button>',
    '  </div>',
    '  <div id="eight-tail-sv-yt-config" aria-label="YouTube API Key 配置">',
    '    <div id="eight-tail-sv-yt-config-title">🔑 YouTube 配置</div>',
    '    <div id="eight-tail-sv-yt-key-row">',
    '      <input id="eight-tail-sv-yt-key-input" type="password" autocomplete="off" spellcheck="false"',
    '        placeholder="粘贴你的 YouTube API Key (AIzaSy...)" />',
    '      <button type="button" id="eight-tail-sv-yt-key-save">保存配置</button>',
    '      <button type="button" id="eight-tail-sv-yt-key-clear">清除配置</button>',
    '    </div>',
    '    <div id="eight-tail-sv-yt-guide">',
    '      <div>💡 <strong>如何获取免费 API Key（每天免费 10,000 次）：</strong></div>',
    '      <ol>',
    '        <li>点击直达 <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> 创建项目。</li>',
    '        <li>进入「API 和服务」→「库」，启用 <strong>YouTube Data API v3</strong>。</li>',
    '        <li>在「凭据」页点击「+ 创建凭据」→「API 密钥」，复制粘贴到此处保存即可！</li>',
    '      </ol>',
    '      <div class="etc-sv-guide-note">未配置时将自动走免翻公共镜像，配置后秒级出画且更稳定。</div>',
    '    </div>',
    '  </div>',
    '  <div id="eight-tail-sv-search-tags" role="group" aria-label="快捷标签"></div>',
    '  <div id="eight-tail-sv-search-hint">YouTube：公共镜像（可配 API Key 加速）· Pornhub：卡片列表</div>',
    '</div>',
    '<div id="eight-tail-sv-apps" role="toolbar" aria-label="应用入口">',
    '  <button type="button" class="etc-sv-app" data-app="youtube"><span class="emoji">▶</span><span class="name">YouTube</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="pornhub"><span class="emoji">🔥</span><span class="name">Pornhub</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="picacg"><span class="emoji">📖</span><span class="name">PicACG</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="douyin" data-action="external" data-scheme="snssdk1128://feed" data-web="https://www.douyin.com/"><span class="emoji">🎵</span><span class="name">抖音</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="xiaohongshu" data-action="external" data-scheme="xhsdiscover://home" data-web="https://www.xiaohongshu.com/explore"><span class="emoji">📕</span><span class="name">小红书</span></button>',
    '</div>',
    '<div id="eight-tail-sv-stage">',
    '  <video id="eight-tail-sv-video" muted autoplay loop playsinline webkit-playsinline preload="auto"></video>',
    '  <iframe id="eight-tail-sv-embed" title="内嵌播放器" scrolling="no" frameborder="0" allowfullscreen="true"',
    '    allow="autoplay; fullscreen; encrypted-media; picture-in-picture"',
    '    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"',
    '    referrerpolicy="strict-origin-when-cross-origin"></iframe>',
    '  <div id="eight-tail-sv-browse" aria-label="成人片源列表">',
    '    <div id="eight-tail-sv-browse-head">',
    '      <span id="eight-tail-sv-browse-title">热门片源</span>',
    '      <button type="button" id="eight-tail-sv-browse-refresh">刷新</button>',
    '    </div>',
    '    <div id="eight-tail-sv-cards"></div>',
    '  </div>',
    '  <div id="eight-tail-sv-hint">暂停</div>',
    '  <div id="eight-tail-sv-rail">',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-like"><span class="ico">♡</span><span class="n">赞</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-mute"><span class="ico">🔇</span><span class="n">静音</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-list-btn" title="返回列表"><span class="ico">☰</span><span class="n">列表</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-next" title="换一个 / 下一条"><span class="ico">⏭</span><span class="n">下一条</span></button>',
    '  </div>',
    '  <div id="eight-tail-sv-meta">',
    '    <div id="eight-tail-sv-author">@sample</div>',
    '    <div id="eight-tail-sv-title">短视频</div>',
    '  </div>',
    '  <div id="eight-tail-sv-status-bar">上下滑切 · 点「下一条」换片 · 🔍 可搜索</div>',
    '</div>',
  ].join('');

  document.body.appendChild(root);
  svForceRootCss(root);
  svFillQuickTags(root);
  svSyncYtConfigUi(root);
  svBindUi(root);
  return root;
}

function svEls(root) {
  root = root || svGetRoot();
  if (!root) return {};
  return {
    root: root,
    video: root.querySelector('#eight-tail-sv-video'),
    embed: root.querySelector('#eight-tail-sv-embed'),
    browse: root.querySelector('#eight-tail-sv-browse'),
    cards: root.querySelector('#eight-tail-sv-cards'),
    browseTitle: root.querySelector('#eight-tail-sv-browse-title'),
    browseRefresh: root.querySelector('#eight-tail-sv-browse-refresh'),
    hint: root.querySelector('#eight-tail-sv-hint'),
    like: root.querySelector('#eight-tail-sv-like'),
    mute: root.querySelector('#eight-tail-sv-mute'),
    next: root.querySelector('#eight-tail-sv-next'),
    listBtn: root.querySelector('#eight-tail-sv-list-btn'),
    author: root.querySelector('#eight-tail-sv-author'),
    title: root.querySelector('#eight-tail-sv-title'),
    close: root.querySelector('#eight-tail-sv-close'),
    searchToggle: root.querySelector('#eight-tail-sv-search-toggle'),
    searchPanel: root.querySelector('#eight-tail-sv-search-panel'),
    searchInput: root.querySelector('#eight-tail-sv-search-input'),
    searchGo: root.querySelector('#eight-tail-sv-search-go'),
    searchCollapse: root.querySelector('#eight-tail-sv-search-collapse'),
    searchTags: root.querySelector('#eight-tail-sv-search-tags'),
    searchHint: root.querySelector('#eight-tail-sv-search-hint'),
    ytConfigToggle: root.querySelector('#eight-tail-sv-yt-config-toggle'),
    ytConfig: root.querySelector('#eight-tail-sv-yt-config'),
    ytKeyInput: root.querySelector('#eight-tail-sv-yt-key-input'),
    ytKeySave: root.querySelector('#eight-tail-sv-yt-key-save'),
    ytKeyClear: root.querySelector('#eight-tail-sv-yt-key-clear'),
    status: root.querySelector('#eight-tail-sv-status-bar'),
    stage: root.querySelector('#eight-tail-sv-stage'),
    apps: root.querySelector('#eight-tail-sv-apps'),
  };
}

function svFillQuickTags(root) {
  const box = (root || svGetRoot()).querySelector('#eight-tail-sv-search-tags');
  if (!box) return;
  box.innerHTML = '';
  SV_QUICK_TAGS.forEach(function (tag) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etc-sv-chip';
    b.dataset.kw = tag.kw;
    b.textContent = tag.label;
    box.appendChild(b);
  });
  /* 最近搜索胶囊 */
  try {
    const recent = JSON.parse(localStorage.getItem(SV_SEARCH_LS_KEY) || '[]');
    if (Array.isArray(recent)) {
      recent.slice(0, 4).forEach(function (kw) {
        if (!kw) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'etc-sv-chip';
        b.dataset.kw = kw;
        b.textContent = '🕒 ' + String(kw).slice(0, 12);
        box.appendChild(b);
      });
    }
  } catch (_) {}
}

function svRememberSearch(kw) {
  const q = String(kw || '').trim();
  if (!q) return;
  svState.lastSearchKw = q;
  try {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(SV_SEARCH_LS_KEY) || '[]'); } catch (_) { list = []; }
    if (!Array.isArray(list)) list = [];
    list = [q].concat(list.filter(function (x) { return x !== q; })).slice(0, 8);
    localStorage.setItem(SV_SEARCH_LS_KEY, JSON.stringify(list));
  } catch (_) {}
  svFillQuickTags(svGetRoot());
}

function svArmClickGuard() {
  svState.ignoreClicksUntil = Date.now() + SV_OPEN_GUARD_MS;
}

function svClicksArmed() {
  return Date.now() >= (svState.ignoreClicksUntil || 0);
}

function svSetStatus(text) {
  const el = svEls().status;
  if (el) el.textContent = text || '';
}

function svShowHint(text, ms) {
  const hint = svEls().hint;
  if (!hint) return;
  hint.textContent = text;
  hint.classList.add('show');
  clearTimeout(svShowHint._t);
  svShowHint._t = setTimeout(function () { hint.classList.remove('show'); }, ms || 700);
}

function svMarkAppActive(appName) {
  const els = svEls();
  if (!els.apps) return;
  const nodes = els.apps.querySelectorAll('.etc-sv-app');
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].classList.toggle('is-on', nodes[i].getAttribute('data-app') === appName);
  }
}

function svCurrent() {
  const feed = svState.feed || [];
  if (!feed.length) return null;
  const i = ((svState.index % feed.length) + feed.length) % feed.length;
  svState.index = i;
  return feed[i];
}

function svSetBrowseOpen(on) {
  svState.browseOpen = !!on;
  const root = svGetRoot();
  if (root) root.classList.toggle('browse-open', svState.browseOpen);
}

function svSetSearchOpen(on) {
  svState.searchOpen = !!on;
  const root = svGetRoot();
  const els = svEls(root);
  if (root) root.classList.toggle('search-open', svState.searchOpen);
  if (svState.searchOpen) {
    svFillQuickTags(root);
    svSyncYtConfigUi(root);
    setTimeout(function () {
      try {
        if (els.searchInput) {
          els.searchInput.focus();
          els.searchInput.select();
        }
      } catch (_) {}
    }, 40);
  } else {
    svSetYtConfigOpen(false);
  }
}

function svSetYtConfigOpen(on) {
  svState.ytConfigOpen = !!on;
  const root = svGetRoot();
  if (!root) return;
  root.classList.toggle('yt-config-open', svState.ytConfigOpen);
  if (svState.ytConfigOpen) {
    if (!svState.searchOpen) svSetSearchOpen(true);
    svSyncYtConfigUi(root);
    setTimeout(function () {
      try {
        const input = root.querySelector('#eight-tail-sv-yt-key-input');
        if (input) {
          input.focus();
          input.select();
        }
      } catch (_) {}
    }, 40);
  }
}

async function svPlayYoutubeSearch(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) {
    svShowHint('请输入关键词');
    return;
  }
  if (svState.ytSearching) {
    svShowHint('搜索中…');
    return;
  }
  svRememberSearch(kw);
  svMarkAppActive('youtube');
  svSetBrowseOpen(false);
  svState.ytSearching = true;
  const hasKey = !!svGetYtApiKey();
  svShowHint(hasKey ? '官方 API 搜索中…' : '搜索中…');
  svSetStatus((hasKey ? 'YouTube API · ' : 'Invidious 搜索 · ') + kw);
  try {
    const list = await svSearchYouTubeVideos(kw);
    if (list && list.length) {
      svState.ytPlaylist = list;
      svState.ytSearchKw = kw;
      svState.ytIndex = 0;
      svPlayYoutubeAt(0);
      svShowHint('找到 ' + list.length + ' 条');
      svSetStatus(
        (svState.ytUsedOfficial ? '官方 API · ' : 'YouTube 搜索 · ') + kw +
        ' · ' + list.length + ' 条 · 上下滑切换'
      );
    } else {
      /* 全部超时 / 无结果 → 精选兜底，杜绝黑屏 */
      svState.ytPlaylist = null;
      svState.ytSearchKw = '';
      svPlayYoutubeAt(0);
      svShowHint('搜索失败，已用精选池');
      svSetStatus('镜像超时 · 已回退精选 Shorts/动漫池');
    }
  } catch (err) {
    console.warn(err);
    svState.ytPlaylist = null;
    svState.ytSearchKw = '';
    svPlayYoutubeAt(0);
    svShowHint('搜索失败，已用精选池');
    svSetStatus('搜索异常 · 已回退精选池');
  } finally {
    svState.ytSearching = false;
    svSetSearchOpen(false);
  }
}

async function svSearchAdult(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) {
    svShowHint('请输入关键词');
    return;
  }
  svRememberSearch(kw);
  await svOpenAdultBrowse(true, kw);
  svSetSearchOpen(false);
}

async function svRunSearch(rawKw) {
  const els = svEls();
  const kw = String(rawKw != null ? rawKw : (els.searchInput && els.searchInput.value) || '').trim();
  if (!kw) {
    svShowHint('请输入关键词');
    try { if (els.searchInput) els.searchInput.focus(); } catch (_) {}
    return;
  }
  if (els.searchInput) els.searchInput.value = kw;

  if (svState.mode === 'adult' || (els.root && els.root.querySelector('.etc-sv-app[data-app="pornhub"].is-on'))) {
    await svSearchAdult(kw);
    return;
  }
  if (svState.mode !== 'youtube') {
    svMarkAppActive('youtube');
  }
  await svPlayYoutubeSearch(kw);
}

function svUpdateChrome() {
  const item = svCurrent();
  const els = svEls();
  if (!els.root) return;

  if (svState.mode === 'youtube') {
    const list = svYtActiveList();
    const yt = list[svState.ytIndex] || list[0];
    const isSearch = !!(svState.ytPlaylist && svState.ytPlaylist.length);
    if (els.author) els.author.textContent = '@YouTube' + (isSearch ? ' 搜索' : ' Shorts');
    if (els.title) {
      const name = yt ? (yt.title || yt.id) : 'Shorts';
      els.title.textContent = name + ' · ' + (svState.ytIndex + 1) + '/' + list.length +
        (isSearch && svState.ytSearchKw ? (' · ' + svState.ytSearchKw) : '');
    }
  } else if (svState.mode === 'adult') {
    const a = svState.adultList[svState.adultIndex];
    if (els.author) els.author.textContent = '@' + ((a && a.source) === 'eporner' ? 'Eporner' : 'Pornhub');
    if (els.title) els.title.textContent = a ? a.title : '成人片源';
  } else if (item) {
    if (els.author) els.author.textContent = item.author || '@sample';
    if (els.title) els.title.textContent = item.title || '';
  }

  const likedKey = svIsEmbedMode(svState.mode)
    ? (svState.mode + ':' + svState.embedId)
    : (item && (item.id || item.url));
  const liked = likedKey ? !!svState.liked[likedKey] : false;
  if (els.like) {
    els.like.classList.toggle('is-on', liked);
    const ico = els.like.querySelector('.ico');
    const n = els.like.querySelector('.n');
    if (ico) ico.textContent = liked ? '❤' : '♡';
    if (n) n.textContent = liked ? '已赞' : '赞';
  }
  if (els.mute) {
    const ico = els.mute.querySelector('.ico');
    const n = els.mute.querySelector('.n');
    if (ico) ico.textContent = svState.muted ? '🔇' : '🔊';
    if (n) n.textContent = svIsEmbedMode(svState.mode) ? '片内音量' : (svState.muted ? '静音' : '声音');
  }
  if (els.next) {
    const n = els.next.querySelector('.n');
    if (n) n.textContent = svState.mode === 'youtube' ? '换一个' : '下一条';
  }
  if (els.listBtn) {
    els.listBtn.style.display = svState.mode === 'adult' ? '' : 'none';
  }
}

function svClearEmbedFrame() {
  const els = svEls();
  if (els.embed) {
    try { els.embed.src = 'about:blank'; } catch (_) {}
    try { els.embed.removeAttribute('src'); } catch (_) {}
    els.embed.style.display = 'none';
  }
  if (els.root) {
    els.root.classList.remove('mode-embed', 'mode-youtube', 'mode-adult', 'mode-pornhub', 'mode-bilibili');
  }
}

function svPauseNativeVideo() {
  const els = svEls();
  if (!els.video) return;
  try { els.video.pause(); } catch (_) {}
  try { els.video.removeAttribute('src'); els.video.load(); } catch (_) {}
  els.video.style.display = 'none';
}

function svConfigureEmbedEl(embed, platform) {
  if (!embed) return;
  embed.setAttribute('scrolling', 'no');
  embed.setAttribute('frameborder', '0');
  embed.setAttribute('allowfullscreen', 'true');
  embed.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
  embed.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation');
  /* YouTube 错误 153：必须保留跨域 Referrer，不能用 no-referrer */
  if (platform === 'youtube') {
    embed.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  } else {
    embed.setAttribute('referrerpolicy', 'no-referrer');
  }
  embed.style.width = '100%';
  embed.style.height = '100%';
  embed.style.border = 'none';
}

function svSetEmbedSrc(url, platform, id) {
  const els = svEls();
  const root = els.root;
  if (!els.embed || !root) return false;
  svPauseNativeVideo();
  svSetBrowseOpen(false);
  try { els.embed.src = 'about:blank'; } catch (_) {}

  svState.mode = platform;
  svState.embedId = String(id || '').trim();
  svWriteMode(platform === 'adult' ? 'adult' : platform);

  root.classList.remove('mode-youtube', 'mode-adult', 'mode-pornhub', 'mode-bilibili');
  root.classList.add('mode-embed', 'mode-' + (platform === 'adult' ? 'adult' : platform));
  svConfigureEmbedEl(els.embed, platform);
  els.embed.style.display = 'block';
  els.embed.title = platform === 'youtube' ? 'YouTube' : '内嵌播放器';
  els.embed.src = url;
  svUpdateChrome();
  return true;
}

function svSwitchToNativeMode() {
  svState.mode = 'native';
  svWriteMode('native');
  svClearEmbedFrame();
  svSetBrowseOpen(false);
  const els = svEls();
  if (els.video) els.video.style.display = 'block';
  svMarkAppActive('');
  svUpdateChrome();
}

function svPrepareVideoEl(v) {
  if (!v) return;
  v.muted = true;
  v.defaultMuted = true;
  v.autoplay = true;
  v.loop = true;
  v.playsInline = true;
}

function svTryPlay(v) {
  if (!v) return;
  v.muted = true;
  svState.muted = true;
  const p = v.play();
  if (p && typeof p.catch === 'function') p.catch(function () {});
}

function svPlayCurrent() {
  if (svIsEmbedMode(svState.mode)) return;
  svSwitchToNativeMode();
  const item = svCurrent();
  const els = svEls();
  if (!item || !els.video) return;
  svUpdateChrome();
  const v = els.video;
  svPrepareVideoEl(v);
  v.pause();
  v.removeAttribute('src');
  v.src = item.url;
  try { v.load(); } catch (_) {}
  svTryPlay(v);
  svSetStatus((svState.index + 1) + ' / ' + svState.feed.length + ' · 上下滑切内置片');
}

/* —— YouTube：单视频 ID 播放 / Invidious 搜索列表 —— */

function svPlayYoutubeAt(index) {
  const list = svYtActiveList();
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  svState.ytIndex = i;
  if (!svState.ytPlaylist) {
    try { localStorage.setItem(SV_YT_IDX_LS_KEY, String(i)); } catch (_) {}
  }
  const yt = list[i];
  const videoId = yt.id || yt;
  svMarkAppActive('youtube');
  /* 只认纯正单视频 embed，绝不使用 listType=search */
  svSetEmbedSrc(svYoutubeEmbedUrl(videoId), 'youtube', videoId);
  const isSearch = !!(svState.ytPlaylist && svState.ytPlaylist.length);
  svShowHint((isSearch ? '搜索' : 'Shorts') + ' ' + (i + 1) + '/' + list.length);
  svSetStatus(
    (isSearch ? ('搜索 · ' + (svState.ytSearchKw || '')) : 'YouTube Shorts') +
    ' · ' + (i + 1) + '/' + list.length + ' · 上下滑切换'
  );
}

function svOpenYoutubeFeed() {
  /* 点图标回到精选池（清空搜索列表） */
  svState.ytPlaylist = null;
  svState.ytSearchKw = '';
  let start = 0;
  try {
    const n = parseInt(localStorage.getItem(SV_YT_IDX_LS_KEY) || '0', 10);
    if (!isNaN(n)) start = n;
  } catch (_) {}
  svPlayYoutubeAt(start);
}

function svNextYoutube(delta) {
  const d = delta == null ? 1 : delta;
  const list = svYtActiveList();
  if (!list.length) return;
  /* 搜索结果：顺序切换；精选池：可随机跳 */
  if (svState.ytPlaylist && svState.ytPlaylist.length) {
    svPlayYoutubeAt(svState.ytIndex + d);
    return;
  }
  let next = svState.ytIndex + d;
  if (d > 0 && Math.random() > 0.55 && list.length > 2) {
    next = Math.floor(Math.random() * list.length);
  }
  if (next === svState.ytIndex) next = svState.ytIndex + d;
  svPlayYoutubeAt(next);
}

/* —— 成人片源：卡片列表 —— */

function svRenderAdultCards(list) {
  const els = svEls();
  if (!els.cards) return;
  els.cards.innerHTML = '';
  if (!list || !list.length) {
    els.cards.innerHTML = '<div style="grid-column:1/-1;opacity:.7;padding:24px;text-align:center;font-size:13px;">暂无结果，请点刷新重试</div>';
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'etc-sv-card';
    btn.dataset.index = String(i);
    btn.innerHTML =
      '<div class="etc-sv-card-thumb">' +
        (item.thumb
          ? '<img src="' + String(item.thumb).replace(/"/g, '&quot;') + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
          : '') +
        '<span class="etc-sv-card-dur">' + (item.duration || '') + '</span>' +
      '</div>' +
      '<div class="etc-sv-card-body">' +
        '<div class="etc-sv-card-title"></div>' +
        '<div class="etc-sv-card-src"></div>' +
      '</div>';
    const titleEl = btn.querySelector('.etc-sv-card-title');
    const srcEl = btn.querySelector('.etc-sv-card-src');
    if (titleEl) titleEl.textContent = item.title || '视频';
    if (srcEl) srcEl.textContent = (item.source === 'eporner' ? 'Eporner' : 'Pornhub') + ' · 点播';
    els.cards.appendChild(btn);
  }
}

function svPlayAdultAt(index) {
  const list = svState.adultList || [];
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  svState.adultIndex = i;
  const item = list[i];
  svMarkAppActive('pornhub');
  svSetEmbedSrc(item.embedUrl, 'adult', item.id);
  svShowHint((i + 1) + '/' + list.length);
  svSetStatus((item.source === 'eporner' ? 'Eporner' : 'Pornhub') + ' · 上下滑切 · 列表可返回');
}

async function svOpenAdultBrowse(forceReload, searchKw) {
  if (svState.adultLoading) {
    svShowHint('加载中…');
    return;
  }
  const kw = String(searchKw != null ? searchKw : '').trim();
  svMarkAppActive('pornhub');
  svSetBrowseOpen(true);
  svPauseNativeVideo();
  svClearEmbedFrame();
  svState.mode = 'adult';
  svWriteMode('adult');

  const els = svEls();
  const titlePrefix = kw ? ('搜索「' + kw + '」') : '热门片源';
  if (els.browseTitle) els.browseTitle.textContent = titlePrefix + '加载中…';

  if (!forceReload && !kw && svState.adultList.length) {
    if (els.browseTitle) els.browseTitle.textContent = '热门片源 · ' + svState.adultList.length;
    svRenderAdultCards(svState.adultList);
    svShowHint('选择影片');
    return;
  }

  svState.adultLoading = true;
  svShowHint(kw ? '搜索中…' : '代理拉取中…');
  svSetStatus(kw ? ('搜索 · ' + kw) : '三重代理穿透 · Eporner / Pornhub');
  try {
    const list = await svLoadAdultCatalog(kw);
    svState.adultList = list;
    svState.adultIndex = 0;
    if (els.browseTitle) {
      els.browseTitle.textContent = list.length
        ? (titlePrefix + ' · ' + list.length + ' 部')
        : (titlePrefix + ' · 暂无结果');
    }
    svRenderAdultCards(list);
    svShowHint(list.length ? '点封面播放' : '无结果');
  } catch (err) {
    console.warn(err);
    svShowHint('拉取失败');
    if (els.browseTitle) els.browseTitle.textContent = '拉取失败，请刷新';
    svRenderAdultCards([]);
  } finally {
    svState.adultLoading = false;
  }
}

/* —— 外链 —— */

function svLaunchExternalApp(opts) {
  opts = opts || {};
  const scheme = String(opts.scheme || '').trim();
  const web = String(opts.web || '').trim();
  let opened = false;
  function openWeb() {
    if (!web) return;
    try { window.open(web, '_blank', 'noopener,noreferrer'); opened = true; } catch (_) {}
  }
  if (scheme) {
    const start = Date.now();
    let t = null;
    const clear = function () {
      try { window.removeEventListener('pagehide', onHide); } catch (_) {}
      try { document.removeEventListener('visibilitychange', onVis); } catch (_) {}
      if (t) clearTimeout(t);
    };
    const onHide = function () { opened = true; clear(); };
    const onVis = function () { if (document.hidden) { opened = true; clear(); } };
    try {
      window.addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', onVis);
    } catch (_) {}
    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;left:-9999px;';
      iframe.src = scheme;
      document.body.appendChild(iframe);
      setTimeout(function () { try { iframe.remove(); } catch (_) {} }, 1600);
    } catch (_) {}
    t = setTimeout(function () {
      clear();
      if (!opened && Date.now() - start < 2800) openWeb();
    }, 1200);
  } else {
    openWeb();
  }
  svShowHint('正在打开 ' + (opts.name || '应用'));
}

function svOnAppDockClick(btn) {
  if (!btn || !svClicksArmed()) return;
  const app = btn.getAttribute('data-app') || '';
  const action = btn.getAttribute('data-action') || '';
  if (action === 'external' || app === 'douyin' || app === 'xiaohongshu') {
    svLaunchExternalApp({
      name: app === 'douyin' ? '抖音' : '小红书',
      scheme: btn.getAttribute('data-scheme') || '',
      web: btn.getAttribute('data-web') || '',
    });
    return;
  }
  if (app === 'youtube') {
    svOpenYoutubeFeed();
    return;
  }
  if (app === 'pornhub') {
    svOpenAdultBrowse(true);
    return;
  }
  if (app === 'picacg') {
    try {
      if (typeof window.openPicacgApp === 'function') {
        window.openPicacgApp();
        return;
      }
    } catch (_) {}
    try {
      window.postMessage({ type: 'eight-tail-open-picacg' }, '*');
    } catch (_) {}
    svShowHint('正在打开 PicACG…', 1200);
  }
}

function svGo(delta) {
  if (svState.browseOpen) return;
  if (svState.mode === 'youtube') {
    if (delta > 0) svNextYoutube(1);
    else svNextYoutube(-1);
    return;
  }
  if (svState.mode === 'adult') {
    svPlayAdultAt(svState.adultIndex + (delta > 0 ? 1 : -1));
    return;
  }
  const feed = svState.feed || [];
  if (!feed.length) return;
  svState.index = (svState.index + delta + feed.length) % feed.length;
  const els = svEls();
  if (els.video) {
    try { els.video.pause(); } catch (_) {}
  }
  svPlayCurrent();
  svShowHint(delta > 0 ? '下一条' : '上一条');
}

function svOnNextClick() {
  if (!svClicksArmed()) return;
  if (svState.mode === 'youtube') {
    svNextYoutube(1);
    return;
  }
  if (svState.mode === 'adult') {
    if (svState.browseOpen) return;
    svPlayAdultAt(svState.adultIndex + 1);
    return;
  }
  svGo(1);
}

function svToggleMute() {
  if (svIsEmbedMode(svState.mode)) {
    svShowHint('请用播放器内音量');
    return;
  }
  const v = svEls().video;
  svState.muted = !svState.muted;
  if (v) {
    v.muted = svState.muted;
    if (!svState.muted) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }
  svUpdateChrome();
}

function svTogglePlay() {
  if (svIsEmbedMode(svState.mode) || svState.browseOpen) return;
  const v = svEls().video;
  if (!v) return;
  if (v.paused) {
    v.muted = !!svState.muted;
    v.play().catch(function () {});
    svShowHint('播放');
  } else {
    v.pause();
    svShowHint('暂停');
  }
}

function svToggleLike() {
  const item = svCurrent();
  const key = svIsEmbedMode(svState.mode)
    ? (svState.mode + ':' + svState.embedId)
    : (item && (item.id || item.url));
  if (!key) return;
  svState.liked[key] = !svState.liked[key];
  svUpdateChrome();
}

function svIsInteractiveTarget(el) {
  if (!el || !el.closest) return false;
  return !!(
    el.closest('#eight-tail-sv-toolbar') ||
    el.closest('#eight-tail-sv-apps') ||
    el.closest('#eight-tail-sv-rail') ||
    el.closest('#eight-tail-sv-browse') ||
    el.closest('#eight-tail-sv-search-panel') ||
    el.closest('#eight-tail-sv-search-toggle') ||
    el.closest('#eight-tail-sv-yt-config-toggle') ||
    el.closest('#eight-tail-sv-yt-config') ||
    el.closest('button') ||
    el.closest('input') ||
    el.closest('textarea') ||
    el.closest('a')
  );
}

function svBindUi(root) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const els = svEls(root);

  function stopBubble(e) {
    try { e.stopPropagation(); } catch (_) {}
  }

  if (els.close) {
    els.close.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      closeShortVideoPlayer();
    });
  }
  if (els.searchToggle) {
    els.searchToggle.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svSetSearchOpen(!svState.searchOpen);
    });
  }
  if (els.ytConfigToggle) {
    els.ytConfigToggle.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      if (!svState.searchOpen) {
        svSetSearchOpen(true);
        svSetYtConfigOpen(true);
      } else {
        svSetYtConfigOpen(!svState.ytConfigOpen);
      }
    });
  }
  if (els.ytKeySave) {
    els.ytKeySave.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      const raw = els.ytKeyInput ? els.ytKeyInput.value : '';
      if (!String(raw || '').trim()) {
        svShowHint('请先粘贴 API Key', 1400);
        return;
      }
      if (svSaveYtApiKey(raw)) {
        svSyncYtConfigUi(root);
        svShowHint('YouTube API Key 已生效，搜索已加速！', 2200);
        svSetStatus('YouTube 官方 API 已启用');
      } else {
        svShowHint('保存失败，请重试', 1400);
      }
    });
  }
  if (els.ytKeyClear) {
    els.ytKeyClear.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svClearYtApiKey();
      if (els.ytKeyInput) els.ytKeyInput.value = '';
      svUpdateYtSearchHint();
      svShowHint('已清除 API Key，改用公共镜像', 1800);
      svSetStatus('YouTube：公共镜像模式');
    });
  }
  if (els.ytKeyInput) {
    els.ytKeyInput.addEventListener('keydown', function (e) {
      stopBubble(e);
      if (e.key === 'Enter') {
        e.preventDefault();
        if (els.ytKeySave) els.ytKeySave.click();
      }
    });
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove'].forEach(function (evName) {
      els.ytKeyInput.addEventListener(evName, function (e) {
        stopBubble(e);
      }, { passive: true });
    });
  }
  if (els.searchCollapse) {
    els.searchCollapse.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svSetSearchOpen(false);
    });
  }
  if (els.searchGo) {
    els.searchGo.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svRunSearch();
    });
  }
  if (els.searchInput) {
    els.searchInput.addEventListener('keydown', function (e) {
      stopBubble(e);
      if (e.key === 'Enter') {
        e.preventDefault();
        svRunSearch();
      }
    });
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove'].forEach(function (evName) {
      els.searchInput.addEventListener(evName, function (e) {
        stopBubble(e);
      }, { passive: true });
    });
  }
  if (els.searchPanel) {
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'click'].forEach(function (evName) {
      els.searchPanel.addEventListener(evName, function (e) {
        stopBubble(e);
      }, { passive: true });
    });
  }
  if (els.searchTags) {
    els.searchTags.addEventListener('click', function (e) {
      const chip = e.target && e.target.closest ? e.target.closest('.etc-sv-chip') : null;
      if (!chip) return;
      e.preventDefault();
      stopBubble(e);
      const kw = chip.getAttribute('data-kw') || '';
      if (els.searchInput) els.searchInput.value = kw;
      svRunSearch(kw);
    });
  }
  if (els.like) {
    els.like.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svToggleLike();
    });
  }
  if (els.mute) {
    els.mute.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svToggleMute();
    });
  }
  if (els.next) {
    els.next.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svOnNextClick();
    });
  }
  if (els.listBtn) {
    els.listBtn.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svClearEmbedFrame();
      svOpenAdultBrowse(false);
    });
  }
  if (els.browseRefresh) {
    els.browseRefresh.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svOpenAdultBrowse(true, svState.lastSearchKw || '');
    });
  }
  if (els.cards) {
    els.cards.addEventListener('click', function (e) {
      const card = e.target && e.target.closest ? e.target.closest('.etc-sv-card') : null;
      if (!card) return;
      e.preventDefault();
      stopBubble(e);
      const idx = parseInt(card.dataset.index || '0', 10) || 0;
      svPlayAdultAt(idx);
    });
  }
  if (els.apps) {
    els.apps.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('.etc-sv-app') : null;
      if (!btn) return;
      e.preventDefault();
      stopBubble(e);
      svOnAppDockClick(btn);
    });
  }

  const stage = els.stage;
  if (stage) {
    stage.addEventListener('touchstart', function (e) {
      if (svIsInteractiveTarget(e.target) || svState.searchOpen) return;
      if (!e.touches || !e.touches.length) return;
      svState.moved = false;
      svState.startY = e.touches[0].clientY;
      svState.startX = e.touches[0].clientX;
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (svIsInteractiveTarget(e.target) || svState.searchOpen) return;
      if (svState.browseOpen) return;
      if (!e.touches || !e.touches.length) return;
      const dy = e.touches[0].clientY - svState.startY;
      const dx = e.touches[0].clientX - svState.startX;
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) svState.moved = true;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        try { e.preventDefault(); } catch (_) {}
      }
    }, { passive: false });

    stage.addEventListener('touchend', function (e) {
      if (svIsInteractiveTarget(e.target) || svState.searchOpen) return;
      if (svState.browseOpen) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      const dy = t.clientY - svState.startY;
      if (Math.abs(dy) >= SV_SWIPE_PX) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        if (dy < 0) svGo(1);
        else svGo(-1);
        return;
      }
      if (!svState.moved && svState.mode === 'native') {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        svTogglePlay();
      }
    }, { passive: false });

    stage.addEventListener('click', function (e) {
      if (svIsInteractiveTarget(e.target)) return;
      if (svIsEmbedMode(svState.mode) || svState.browseOpen) return;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      e.stopPropagation();
      svTogglePlay();
    });

    stage.addEventListener('wheel', function (e) {
      if (!svState.open || svState.browseOpen) return;
      if (svIsInteractiveTarget(e.target)) return;
      e.preventDefault();
      if (e.deltaY > 24) svGo(1);
      else if (e.deltaY < -24) svGo(-1);
    }, { passive: false });
  }

  root.addEventListener('pointerdown', function (e) {
    if (svIsInteractiveTarget(e.target)) return;
    e.stopPropagation();
  });
}

export async function openShortVideoPlayer() {
  svEnsureNoReferrerMeta();
  /* 清理旧 B站 模式 */
  try {
    if (localStorage.getItem(SV_MODE_LS_KEY) === 'bilibili') {
      localStorage.setItem(SV_MODE_LS_KEY, 'native');
    }
    localStorage.removeItem('eight_tail_short_video_bvid');
  } catch (_) {}

  const root = svBuildDom();
  try {
    if (root.parentElement !== document.body) document.body.appendChild(root);
  } catch (_) {}

  svForceRootCss(root);
  svState.muted = true;
  svArmClickGuard();

  const savedMode = svReadMode();
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  svState.open = true;

  setTimeout(function () {
    svForceRootCss(root);
    if (savedMode === 'youtube') {
      svOpenYoutubeFeed();
      return;
    }
    if (savedMode === 'adult' || savedMode === 'pornhub') {
      svOpenAdultBrowse(false);
      return;
    }
    svState.feed = SV_BUILTIN_FEED.slice();
    svState.index = 0;
    svSwitchToNativeMode();
    svPlayCurrent();
  }, 0);
}

export function closeShortVideoPlayer() {
  const root = svGetRoot();
  const els = svEls(root);
  if (els.video) {
    try { els.video.pause(); } catch (_) {}
    try { els.video.muted = true; } catch (_) {}
  }
  if (svIsEmbedMode(svState.mode)) {
    svWriteMode(svState.mode);
  }
  svClearEmbedFrame();
  svSetBrowseOpen(false);
  svSetSearchOpen(false);
  if (root) {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('display', 'none', 'important');
  }
  svState.open = false;
}

export function toggleShortVideoPlayer() {
  if (svState.open) closeShortVideoPlayer();
  else openShortVideoPlayer();
}

export function isShortVideoOpen() {
  return !!svState.open;
}

try {
  window.openShortVideoPlayer = openShortVideoPlayer;
  window.closeShortVideoPlayer = closeShortVideoPlayer;
  window.toggleShortVideoPlayer = toggleShortVideoPlayer;
  window.isShortVideoOpen = isShortVideoOpen;
  window.__etcPlayYoutube = svOpenYoutubeFeed;
  window.__etcPlayPornhub = function () { svOpenAdultBrowse(true); };
} catch (_) {}
