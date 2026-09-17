/**
 * 酒馆宿主层 · 沉浸式短视频流媒体中心 v9
 * - YouTube：精选公开 Shorts 单视频列表，一键切换
 * - 成人源：三重 CORS 代理 + Eporner/PH 官方接口，卡片列表点播
 * - 无 B站；关闭立刻清空 iframe，杜绝漏声
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_STYLE_ID = 'eight-tail-sv-style-v9';
const SV_OPEN_GUARD_MS = 550;
const SV_MODE_LS_KEY = 'eight_tail_short_video_mode';
const SV_YT_IDX_LS_KEY = 'eight_tail_short_video_yt_idx';
const SV_SWIPE_PX = 48;

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
  adultList: [],
  adultIndex: 0,
  adultLoading: false,
  browseOpen: false,
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

function svFormatDuration(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
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

async function svLoadAdultCatalog() {
  const merged = [];
  /* Eporner 官方公开 API（优先，常可直连或走代理） */
  try {
    const ep = await svFetchJsonViaProxies(SV_EPORNER_API);
    merged.push.apply(merged, svNormalizeAdultItems('eporner', ep));
  } catch (err) {
    console.warn('[EightTailCat] Eporner fail', err);
  }
  /* Pornhub Webmaster 经代理 */
  try {
    const ph = await svFetchJsonViaProxies(SV_PH_API);
    merged.push.apply(merged, svNormalizeAdultItems('pornhub', ph));
  } catch (err) {
    console.warn('[EightTailCat] Pornhub fail', err);
  }

  if (!merged.length) {
    /* 极简兜底：Eporner 热门页常见可嵌 ID 形态不可靠时，用二次 Eporner 搜索词 */
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
    'eight-tail-sv-style-v6', 'eight-tail-sv-style-v7', 'eight-tail-sv-style-v8'].forEach(function (id) {
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
#eight-tail-sv-close {
  width: 44px !important; height: 44px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(239, 68, 68, .92) !important; color: #fff !important; font-size: 26px !important;
  font-weight: 700 !important; display: flex !important; align-items: center !important;
  justify-content: center !important; cursor: pointer !important;
  box-shadow: 0 4px 14px rgba(0,0,0,.4);
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
  if (root && root.dataset.svVersion === '9') {
    svForceRootCss(root);
    return root;
  }
  if (root) {
    try { root.remove(); } catch (_) {}
  }

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.dataset.svVersion = '9';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '短视频流');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="eight-tail-sv-toolbar">',
    '  <button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭">×</button>',
    '</div>',
    '<div id="eight-tail-sv-apps" role="toolbar" aria-label="应用入口">',
    '  <button type="button" class="etc-sv-app" data-app="youtube"><span class="emoji">▶</span><span class="name">YouTube</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="pornhub"><span class="emoji">🔥</span><span class="name">Pornhub</span></button>',
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
    '  <div id="eight-tail-sv-status-bar">上下滑切 · 点「下一条」换片</div>',
    '</div>',
  ].join('');

  document.body.appendChild(root);
  svForceRootCss(root);
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
    status: root.querySelector('#eight-tail-sv-status-bar'),
    stage: root.querySelector('#eight-tail-sv-stage'),
    apps: root.querySelector('#eight-tail-sv-apps'),
  };
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

function svShowHint(text) {
  const hint = svEls().hint;
  if (!hint) return;
  hint.textContent = text;
  hint.classList.add('show');
  clearTimeout(svShowHint._t);
  svShowHint._t = setTimeout(function () { hint.classList.remove('show'); }, 700);
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

function svUpdateChrome() {
  const item = svCurrent();
  const els = svEls();
  if (!els.root) return;

  if (svState.mode === 'youtube') {
    const yt = SV_YT_SHORTS[svState.ytIndex] || SV_YT_SHORTS[0];
    if (els.author) els.author.textContent = '@YouTube Shorts';
    if (els.title) {
      els.title.textContent = (yt ? yt.title : 'Shorts') +
        ' · ' + (svState.ytIndex + 1) + '/' + SV_YT_SHORTS.length;
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

/* —— YouTube Shorts —— */

function svPlayYoutubeAt(index) {
  const list = SV_YT_SHORTS;
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  svState.ytIndex = i;
  try { localStorage.setItem(SV_YT_IDX_LS_KEY, String(i)); } catch (_) {}
  const yt = list[i];
  svMarkAppActive('youtube');
  svSetEmbedSrc(svYoutubeEmbedUrl(yt.id), 'youtube', yt.id);
  svShowHint('Shorts ' + (i + 1) + '/' + list.length);
  svSetStatus('YouTube Shorts · 点「换一个」或上滑切换');
}

function svOpenYoutubeFeed() {
  let start = 0;
  try {
    const n = parseInt(localStorage.getItem(SV_YT_IDX_LS_KEY) || '0', 10);
    if (!isNaN(n)) start = n;
  } catch (_) {}
  svPlayYoutubeAt(start);
}

function svNextYoutube() {
  let next = svState.ytIndex + 1;
  if (Math.random() > 0.5 && SV_YT_SHORTS.length > 2) {
    next = Math.floor(Math.random() * SV_YT_SHORTS.length);
  }
  if (next === svState.ytIndex) next = svState.ytIndex + 1;
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

async function svOpenAdultBrowse(forceReload) {
  if (svState.adultLoading) {
    svShowHint('加载中…');
    return;
  }
  svMarkAppActive('pornhub');
  svSetBrowseOpen(true);
  svPauseNativeVideo();
  svClearEmbedFrame();
  svState.mode = 'adult';
  svWriteMode('adult');

  const els = svEls();
  if (els.browseTitle) els.browseTitle.textContent = '热门片源加载中…';
  if (!forceReload && svState.adultList.length) {
    if (els.browseTitle) els.browseTitle.textContent = '热门片源 · ' + svState.adultList.length;
    svRenderAdultCards(svState.adultList);
    svShowHint('选择影片');
    return;
  }

  svState.adultLoading = true;
  svShowHint('代理拉取中…');
  svSetStatus('三重代理穿透 · Eporner / Pornhub');
  try {
    const list = await svLoadAdultCatalog();
    svState.adultList = list;
    svState.adultIndex = 0;
    if (els.browseTitle) {
      els.browseTitle.textContent = list.length
        ? ('热门片源 · ' + list.length + ' 部')
        : '暂无结果';
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
  }
}

function svGo(delta) {
  if (svState.browseOpen) return;
  if (svState.mode === 'youtube') {
    if (delta > 0) svNextYoutube();
    else svPlayYoutubeAt(svState.ytIndex - 1);
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
    svNextYoutube();
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
    el.closest('button') ||
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
      svOpenAdultBrowse(true);
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
      if (svIsInteractiveTarget(e.target)) return;
      if (!e.touches || !e.touches.length) return;
      svState.moved = false;
      svState.startY = e.touches[0].clientY;
      svState.startX = e.touches[0].clientX;
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (svIsInteractiveTarget(e.target)) return;
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
      if (svIsInteractiveTarget(e.target)) return;
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
