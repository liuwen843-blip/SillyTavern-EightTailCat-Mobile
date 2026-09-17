/**
 * 酒馆宿主层 · 沉浸式多功能应用与媒体中心
 * - 顶部拟态 App 网格：B站 / YouTube / Pornhub（内嵌）· 抖音 / 小红书（仅点图标才唤起）
 * - 原生 <video> + 多平台 iframe；关闭彻底静音
 * - 注意：桌宠 📱 按钮不得直接调 Scheme，只能 toggle 本弹窗
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_STYLE_ID = 'eight-tail-sv-style-v6';
const SV_OPEN_GUARD_MS = 550;
const SV_API_LS_KEY = 'eight_tail_short_video_custom_api';
const SV_MUTED_LS_KEY = 'eight_tail_short_video_muted';
const SV_MODE_LS_KEY = 'eight_tail_short_video_mode'; /* native | bilibili | youtube | pornhub */
const SV_EMBED_LS_KEY = 'eight_tail_short_video_embed_id';
const SV_BV_LS_KEY_LEGACY = 'eight_tail_short_video_bvid';
const SV_SWIPE_PX = 40;

/** 小猪佩奇合集（B站） */
const SV_PEPPA_BVID = 'BV1Wx411n7Mh';
const SV_PEPPA_TITLE = '小猪佩奇合集';
/** YouTube 开箱测试片（Big Buck Bunny 预告） */
const SV_YT_DEMO_ID = 'aqz-KE-bpKQ';
const SV_YT_DEMO_TITLE = 'YouTube 测试片';

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

const SV_EMBED_MODES = { bilibili: 1, youtube: 1, pornhub: 1 };

let svState = {
  index: 0,
  feed: SV_BUILTIN_FEED.slice(),
  muted: true,
  liked: Object.create(null),
  startY: 0,
  startX: 0,
  moved: false,
  open: false,
  panelOpen: false,
  preloadVideo: null,
  mode: 'native', /* native | bilibili | youtube | pornhub */
  embedId: '',
  lastEmbed: { mode: '', id: '' },
  /** 打开后短时间内忽略点击，防止 📱 抬手误点到小红书等图标 */
  ignoreClicksUntil: 0,
};

function svIsEmbedMode(mode) {
  return !!(mode && SV_EMBED_MODES[mode]);
}

function svReadMuted() {
  try {
    const v = localStorage.getItem(SV_MUTED_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (_) {}
  return true;
}

function svWriteMuted(muted) {
  try { localStorage.setItem(SV_MUTED_LS_KEY, muted ? '1' : '0'); } catch (_) {}
}

function svReadCustomApi() {
  try { return String(localStorage.getItem(SV_API_LS_KEY) || '').trim(); } catch (_) { return ''; }
}

function svWriteCustomApi(url) {
  try { localStorage.setItem(SV_API_LS_KEY, String(url || '').trim()); } catch (_) {}
}

function svReadMode() {
  try {
    const m = localStorage.getItem(SV_MODE_LS_KEY);
    if (m === 'native' || svIsEmbedMode(m)) return m;
  } catch (_) {}
  return 'native';
}

function svWriteMode(mode) {
  const m = svIsEmbedMode(mode) ? mode : 'native';
  try { localStorage.setItem(SV_MODE_LS_KEY, m); } catch (_) {}
}

function svReadEmbedId() {
  try {
    const cur = String(localStorage.getItem(SV_EMBED_LS_KEY) || '').trim();
    if (cur) return cur;
    return String(localStorage.getItem(SV_BV_LS_KEY_LEGACY) || '').trim();
  } catch (_) { return ''; }
}

function svWriteEmbedId(id) {
  try { localStorage.setItem(SV_EMBED_LS_KEY, String(id || '').trim()); } catch (_) {}
}

/* —— 多平台解析 —— */

function svExtractBvId(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/(BV[a-zA-Z0-9]{10})/i);
  return m ? m[1] : null;
}

function svExtractYoutubeId(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (m) return m[1];
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
  if (m && /youtube\.com/i.test(s)) return m[1];
  m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/i);
  if (m) return m[1];
  m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(s) && !/^BV/i.test(s)) return s;
  return null;
}

function svExtractPornhubKey(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let m = s.match(/[?&]viewkey=([^&#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  m = s.match(/pornhub\.com\/(?:embed|view_video\.php)\/?\??(?:.*viewkey=)?([a-zA-Z0-9]+)/i);
  if (m && m[1] && m[1].toLowerCase() !== 'embed') return m[1];
  if (/^[a-zA-Z0-9]{8,20}$/.test(s) && !/^BV/i.test(s) && !/^[a-zA-Z0-9_-]{11}$/.test(s)) {
    return s;
  }
  return null;
}

function svLooksLikeBilibili(text) {
  const s = String(text || '');
  return /bilibili\.com/i.test(s) || /b23\.tv/i.test(s) || /(BV[a-zA-Z0-9]{10})/i.test(s);
}

function svLooksLikeYoutube(text) {
  const s = String(text || '');
  return /youtu\.be\//i.test(s) || /youtube\.com/i.test(s) || /youtube-nocookie\.com/i.test(s);
}

function svLooksLikePornhub(text) {
  const s = String(text || '');
  return /pornhub\.com/i.test(s) || /[?&]viewkey=/i.test(s);
}

function svParseEmbedInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  if (svLooksLikeBilibili(text) || /(BV[a-zA-Z0-9]{10})/i.test(text)) {
    const id = svExtractBvId(text);
    if (id) return { platform: 'bilibili', id: id };
  }
  if (svLooksLikeYoutube(text)) {
    const id = svExtractYoutubeId(text);
    if (id) return { platform: 'youtube', id: id };
  }
  if (svLooksLikePornhub(text)) {
    const id = svExtractPornhubKey(text);
    if (id) return { platform: 'pornhub', id: id };
  }
  /* 裸 BV */
  const bv = svExtractBvId(text);
  if (bv && text.length <= 20) return { platform: 'bilibili', id: bv };
  /* 裸 YouTube 11 位 id */
  if (/^[a-zA-Z0-9_-]{11}$/.test(text) && !/^BV/i.test(text)) {
    return { platform: 'youtube', id: text };
  }
  /* 裸 Pornhub viewkey（纯字母数字，非 BV） */
  if (/^[a-zA-Z0-9]{8,20}$/.test(text) && !/^BV/i.test(text)) {
    return { platform: 'pornhub', id: text };
  }

  return null;
}

function svEmbedUrl(platform, id) {
  const safe = encodeURIComponent(String(id || '').trim());
  if (platform === 'bilibili') {
    return 'https://player.bilibili.com/player.html?bvid=' + safe +
      '&page=1&high_quality=1&danmaku=0&autoplay=1';
  }
  if (platform === 'youtube') {
    return 'https://www.youtube-nocookie.com/embed/' + safe + '?autoplay=1&rel=0';
  }
  if (platform === 'pornhub') {
    return 'https://www.pornhub.com/embed/' + safe;
  }
  return '';
}

function svPlatformLabel(platform) {
  if (platform === 'bilibili') return 'B站';
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'pornhub') return 'Pornhub';
  return '内嵌';
}

function svNormalizeItem(raw, i) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const url = raw.trim();
    if (!url) return null;
    return { id: 'c' + i, title: '自定义 #' + (i + 1), author: '@custom', url: url };
  }
  if (typeof raw === 'object') {
    const url = String(raw.url || raw.src || raw.video || raw.mp4 || '').trim();
    if (!url) return null;
    return {
      id: String(raw.id || ('c' + i)),
      title: String(raw.title || raw.desc || raw.name || ('视频 #' + (i + 1))),
      author: String(raw.author || raw.user || raw.nickname || '@custom'),
      url: url,
    };
  }
  return null;
}

async function svLoadFeedFromApi(apiUrl) {
  const api = String(apiUrl || '').trim();
  if (!api) return SV_BUILTIN_FEED.slice();
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(api)) {
    return [{ id: 'direct', title: '自定义源', author: '@custom', url: api }];
  }
  try {
    const res = await fetch(api, { method: 'GET', credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('video/') === 0) {
      return [{ id: 'direct-bin', title: '自定义源', author: '@custom', url: api }];
    }
    const data = await res.json();
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data.data)) list = data.data;
    else if (Array.isArray(data.list)) list = data.list;
    else if (Array.isArray(data.videos)) list = data.videos;
    else if (data.url) list = [data];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const item = svNormalizeItem(list[i], i);
      if (item) out.push(item);
    }
    if (out.length) return out;
  } catch (err) {
    console.warn('[EightTailCat-ShortVideo] 自定义源失败，回退内置', err);
  }
  return SV_BUILTIN_FEED.slice();
}

function svEnsureStyle() {
  let style = document.getElementById(SV_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = SV_STYLE_ID;
    document.head.appendChild(style);
  }
  try {
    const old4 = document.getElementById('eight-tail-sv-style-v4');
    if (old4) old4.remove();
    const old5 = document.getElementById('eight-tail-sv-style-v5');
    if (old5) old5.remove();
    const old = document.getElementById('eight-tail-sv-style');
    if (old) old.remove();
  } catch (_) {}

  style.textContent = `
#eight-tail-short-video-root {
  position: fixed !important; inset: 0 !important; left: 0 !important; top: 0 !important;
  right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100dvh !important;
  max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important;
  background: #000 !important; z-index: 100002 !important; display: none !important;
  flex-direction: column !important; overflow: hidden !important; pointer-events: auto !important;
  touch-action: none !important; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #fff; user-select: none; -webkit-user-select: none; box-sizing: border-box !important;
  transform: none !important; border: 0 !important; border-radius: 0 !important;
}
#eight-tail-short-video-root.is-open { display: flex !important; }
#eight-tail-short-video-root,
#eight-tail-short-video-root * { pointer-events: auto !important; box-sizing: border-box; }
#eight-tail-sv-toolbar {
  position: absolute !important; top: 0 !important; left: 0 !important; right: 0 !important;
  z-index: 20 !important; display: flex !important; align-items: flex-start !important;
  justify-content: flex-end !important; gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px 12px !important;
  background: linear-gradient(180deg, rgba(0,0,0,.55), transparent) !important;
  pointer-events: auto !important;
}
#eight-tail-sv-apps {
  position: absolute !important;
  top: max(56px, calc(env(safe-area-inset-top) + 48px)) !important;
  left: 10px !important; right: 10px !important;
  z-index: 18 !important;
  display: flex !important; flex-wrap: nowrap !important; gap: 8px !important;
  overflow-x: auto !important; -webkit-overflow-scrolling: touch !important;
  padding: 4px 2px 8px !important; pointer-events: auto !important;
  scrollbar-width: none;
}
#eight-tail-sv-apps::-webkit-scrollbar { display: none; }
.etc-sv-app {
  flex: 0 0 auto !important; width: 64px !important; border: 0 !important;
  border-radius: 16px !important; padding: 8px 4px 6px !important;
  background: rgba(255,255,255,.14) !important; color: #fff !important;
  display: flex !important; flex-direction: column !important; align-items: center !important;
  gap: 4px !important; cursor: pointer !important; pointer-events: auto !important;
  touch-action: manipulation !important; backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0,0,0,.25);
}
.etc-sv-app .emoji {
  width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center;
  justify-content: center; font-size: 20px;
  background: linear-gradient(160deg, rgba(255,255,255,.22), rgba(255,255,255,.06));
}
.etc-sv-app .name { font-size: 10px; font-weight: 700; opacity: .92; line-height: 1.1; }
.etc-sv-app[data-app="bilibili"] .emoji { background: linear-gradient(160deg, #ff8fab, #fb7299); }
.etc-sv-app[data-app="youtube"] .emoji { background: linear-gradient(160deg, #ff6b6b, #c62828); }
.etc-sv-app[data-app="pornhub"] .emoji { background: linear-gradient(160deg, #ff9900, #ff6600); }
.etc-sv-app[data-app="douyin"] .emoji { background: linear-gradient(160deg, #2a2a2a, #111); }
.etc-sv-app[data-app="xiaohongshu"] .emoji { background: linear-gradient(160deg, #ff5a6a, #e11d48); }
.etc-sv-app.is-on { outline: 2px solid rgba(255,255,255,.85); }
#eight-tail-sv-gear,
#eight-tail-sv-close {
  width: 42px !important; height: 42px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(255,255,255,.22) !important; color: #fff !important; font-size: 20px !important;
  line-height: 1 !important; display: flex !important; align-items: center !important;
  justify-content: center !important; cursor: pointer !important; pointer-events: auto !important;
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 14px rgba(0,0,0,.35); flex-shrink: 0 !important;
}
#eight-tail-sv-close {
  background: rgba(239, 68, 68, .88) !important; font-size: 26px !important; font-weight: 700 !important;
}
#eight-tail-sv-stage {
  position: relative !important; flex: 1 1 auto !important; width: 100% !important; height: 100% !important;
  min-height: 0 !important; overflow: hidden !important; background: #000 !important;
  pointer-events: auto !important; touch-action: none !important;
  margin-top: 108px !important;
}
#eight-tail-sv-video {
  position: absolute !important; inset: 0 !important; flex: 1 !important; width: 100% !important;
  height: 100% !important; object-fit: contain !important; background: #000 !important;
  pointer-events: none !important; display: block !important;
}
#eight-tail-sv-embed,
#eight-tail-sv-bili {
  position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
  border: none !important; background: #000 !important; display: none !important;
  pointer-events: auto !important; z-index: 3 !important;
}
#eight-tail-short-video-root.mode-embed #eight-tail-sv-video { display: none !important; }
#eight-tail-short-video-root.mode-embed #eight-tail-sv-embed,
#eight-tail-short-video-root.mode-embed #eight-tail-sv-bili { display: block !important; }
#eight-tail-short-video-root.mode-embed #eight-tail-sv-mute { opacity: 0.45; }
#eight-tail-sv-presets {
  display: flex !important; flex-wrap: wrap !important; gap: 8px !important;
  position: relative !important; z-index: 100005 !important;
}
#eight-tail-sv-presets button {
  flex: 1 1 auto !important; min-width: 72px !important; border: 0 !important; border-radius: 10px !important;
  padding: 9px 10px !important; font-size: 13px !important; font-weight: 800 !important;
  cursor: pointer !important; pointer-events: auto !important; touch-action: manipulation !important;
  color: #fff !important; position: relative !important; z-index: 100005 !important;
}
#eight-tail-sv-btn-bili {
  background: linear-gradient(135deg, #ff8fab, #ff5d8f) !important;
  box-shadow: 0 4px 12px rgba(255, 93, 143, 0.3) !important;
}
#eight-tail-sv-btn-yt {
  background: linear-gradient(135deg, #ff6b6b, #c62828) !important;
  box-shadow: 0 4px 12px rgba(198, 40, 40, 0.3) !important;
}
#eight-tail-sv-btn-ph {
  background: linear-gradient(135deg, #ff9900, #ff6600) !important;
  box-shadow: 0 4px 12px rgba(255, 102, 0, 0.28) !important;
}
#eight-tail-sv-hint {
  position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%);
  z-index: 6; font-size: 14px; opacity: 0; pointer-events: none !important;
  transition: opacity .18s; background: rgba(0,0,0,.5); padding: 8px 16px; border-radius: 999px;
}
#eight-tail-sv-hint.show { opacity: 1; }
#eight-tail-sv-rail {
  position: absolute !important; right: 10px !important;
  bottom: max(100px, calc(18% + env(safe-area-inset-bottom))) !important;
  z-index: 8 !important; display: flex !important; flex-direction: column !important;
  align-items: center !important; gap: 16px !important; pointer-events: auto !important;
}
.etc-sv-rail-btn {
  width: 48px !important; min-height: 48px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(0,0,0,.4) !important; color: #fff !important; display: flex !important;
  flex-direction: column !important; align-items: center !important; justify-content: center !important;
  gap: 2px !important; font-size: 11px !important; backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px); pointer-events: auto !important; cursor: pointer !important;
  padding: 6px 0 !important;
}
.etc-sv-rail-btn .ico { font-size: 22px; line-height: 1; }
.etc-sv-rail-btn.is-on { color: #ff4d6d; }
#eight-tail-sv-avatar {
  width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff;
  background: linear-gradient(145deg, #5b8def, #2db89a);
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; pointer-events: none !important;
}
#eight-tail-sv-meta {
  position: absolute; left: 14px; right: 72px;
  bottom: max(72px, calc(12% + env(safe-area-inset-bottom)));
  z-index: 7; pointer-events: none !important; text-shadow: 0 1px 4px rgba(0,0,0,.7);
}
#eight-tail-sv-author { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
#eight-tail-sv-title { font-size: 13px; opacity: .92; line-height: 1.4; max-height: 3.2em; overflow: hidden; }
#eight-tail-sv-panel,
#video-source-panel {
  position: relative !important; z-index: 100005 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
  display: none !important; flex-direction: column !important; gap: 8px !important;
  margin-top: auto !important; flex: 0 0 auto !important;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) !important;
  background: rgba(10,10,14,.96) !important; border-top: 1px solid rgba(255,255,255,.1) !important;
  pointer-events: auto !important;
}
#eight-tail-short-video-root.panel-open #eight-tail-sv-panel,
#eight-tail-short-video-root.panel-open #video-source-panel { display: flex !important; }
#eight-tail-sv-panel label,
#video-source-panel label { font-size: 11px; opacity: .75; pointer-events: none !important; }
#eight-tail-sv-api,
#video-source-panel input {
  position: relative !important; z-index: 100005 !important; width: 100% !important;
  border-radius: 10px !important; border: 1px solid rgba(255,255,255,.2) !important;
  background: rgba(255,255,255,.12) !important; color: #fff !important; padding: 10px 12px !important;
  font-size: 13px !important; outline: none !important; pointer-events: auto !important;
  -webkit-user-select: text !important; user-select: text !important; touch-action: manipulation !important;
}
#eight-tail-sv-actions { display: flex; gap: 8px; position: relative; z-index: 100005 !important; }
#eight-tail-sv-actions button,
#video-source-panel button:not(#eight-tail-sv-presets button) {
  position: relative !important; z-index: 100005 !important; flex: 1 !important; border: 0 !important;
  border-radius: 10px !important; padding: 10px !important; font-size: 13px !important;
  font-weight: 700 !important; cursor: pointer !important; pointer-events: auto !important;
  touch-action: manipulation !important;
}
#eight-tail-sv-apply { background: #5b8def !important; color: #fff !important; }
#eight-tail-sv-reset { background: rgba(255,255,255,.14) !important; color: #fff !important; }
#eight-tail-sv-status { font-size: 11px; opacity: .7; min-height: 14px; pointer-events: none !important; }
`;
}

function svForceRootCss(root) {
  if (!root) return;
  root.style.setProperty('position', 'fixed', 'important');
  root.style.setProperty('inset', '0', 'important');
  root.style.setProperty('width', '100vw', 'important');
  root.style.setProperty('height', '100dvh', 'important');
  root.style.setProperty('background', '#000', 'important');
  root.style.setProperty('z-index', '100002', 'important');
  root.style.setProperty('display', 'flex', 'important');
  root.style.setProperty('flex-direction', 'column', 'important');
  root.style.setProperty('overflow', 'hidden', 'important');
  root.style.setProperty('pointer-events', 'auto', 'important');
}

function svGetRoot() {
  return document.getElementById(SV_ROOT_ID);
}

function svBuildDom() {
  svEnsureStyle();
  let root = svGetRoot();
  if (root && root.dataset.svVersion === '6') {
    svForceRootCss(root);
    return root;
  }
  if (root) {
    try { root.remove(); } catch (_) {}
  }

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.dataset.svVersion = '6';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '应用与媒体中心');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="eight-tail-sv-toolbar">',
    '  <button type="button" id="eight-tail-sv-gear" title="换源设置" aria-label="换源设置">⚙</button>',
    '  <button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭媒体中心">×</button>',
    '</div>',
    '<div id="eight-tail-sv-apps" role="toolbar" aria-label="应用入口">',
    '  <button type="button" class="etc-sv-app" data-app="bilibili" data-action="embed"><span class="emoji" aria-hidden="true">📺</span><span class="name">B站</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="youtube" data-action="embed"><span class="emoji" aria-hidden="true">▶</span><span class="name">YouTube</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="pornhub" data-action="embed"><span class="emoji" aria-hidden="true">🔥</span><span class="name">Pornhub</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="douyin" data-action="external" data-scheme="snssdk1128://feed" data-web="https://www.douyin.com/"><span class="emoji" aria-hidden="true">🎵</span><span class="name">抖音</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="xiaohongshu" data-action="external" data-scheme="xhsdiscover://home" data-web="https://www.xiaohongshu.com/explore"><span class="emoji" aria-hidden="true">📕</span><span class="name">小红书</span></button>',
    '</div>',
    '<div id="eight-tail-sv-stage">',
    '  <video id="eight-tail-sv-video" muted autoplay loop playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5-page" preload="auto"></video>',
    '  <iframe id="eight-tail-sv-embed" title="内嵌播放器" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen scrolling="no" referrerpolicy="no-referrer-when-downgrade"></iframe>',
    '  <div id="eight-tail-sv-hint">暂停</div>',
    '  <div id="eight-tail-sv-rail">',
    '    <div id="eight-tail-sv-avatar" aria-hidden="true">🐱</div>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-like"><span class="ico">♡</span><span class="n">赞</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-mute" title="点击开声音"><span class="ico">🔇</span><span class="n">静音</span></button>',
    '  </div>',
    '  <div id="eight-tail-sv-meta">',
    '    <div id="eight-tail-sv-author">@sample</div>',
    '    <div id="eight-tail-sv-title">短视频</div>',
    '  </div>',
    '</div>',
    '<div id="video-source-panel" class="eight-tail-sv-panel">',
    '  <div id="eight-tail-sv-presets" role="group" aria-label="平台快捷">',
    '    <button type="button" id="eight-tail-sv-btn-bili" title="B站 · 小猪佩奇">🐷 B站</button>',
    '    <button type="button" id="eight-tail-sv-btn-yt" title="YouTube 测试">▶ YouTube</button>',
    '    <button type="button" id="eight-tail-sv-btn-ph" title="Pornhub 链接/viewkey">🔥 Pornhub</button>',
    '  </div>',
    '  <label for="eight-tail-sv-api">自定义源：mp4 / B站·YT·PH 链接 / BV / viewkey</label>',
    '  <input id="eight-tail-sv-api" type="text" inputmode="url" placeholder="mp4 直链 · BV号 · youtube.com/... · viewkey=..." autocomplete="off" />',
    '  <div id="eight-tail-sv-actions">',
    '    <button type="button" id="eight-tail-sv-apply">应用源</button>',
    '    <button type="button" id="eight-tail-sv-reset">恢复内置</button>',
    '  </div>',
    '  <div id="eight-tail-sv-status">点顶部图标切换 · 抖音/小红书仅点卡片才唤起 App</div>',
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
    embed: root.querySelector('#eight-tail-sv-embed') || root.querySelector('#eight-tail-sv-bili'),
    hint: root.querySelector('#eight-tail-sv-hint'),
    like: root.querySelector('#eight-tail-sv-like'),
    mute: root.querySelector('#eight-tail-sv-mute'),
    author: root.querySelector('#eight-tail-sv-author'),
    title: root.querySelector('#eight-tail-sv-title'),
    close: root.querySelector('#eight-tail-sv-close'),
    gear: root.querySelector('#eight-tail-sv-gear'),
    api: root.querySelector('#eight-tail-sv-api'),
    apply: root.querySelector('#eight-tail-sv-apply'),
    reset: root.querySelector('#eight-tail-sv-reset'),
    btnBili: root.querySelector('#eight-tail-sv-btn-bili'),
    btnYt: root.querySelector('#eight-tail-sv-btn-yt'),
    btnPh: root.querySelector('#eight-tail-sv-btn-ph'),
    apps: root.querySelector('#eight-tail-sv-apps'),
    status: root.querySelector('#eight-tail-sv-status'),
    stage: root.querySelector('#eight-tail-sv-stage'),
    panel: root.querySelector('#video-source-panel') || root.querySelector('#eight-tail-sv-panel'),
  };
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
  svShowHint._t = setTimeout(function () { hint.classList.remove('show'); }, 650);
}

function svCurrent() {
  const feed = svState.feed || [];
  if (!feed.length) return null;
  const i = ((svState.index % feed.length) + feed.length) % feed.length;
  svState.index = i;
  return feed[i];
}

function svUpdateChrome() {
  const item = svCurrent();
  const els = svEls();
  if (!els.root) return;
  if (svIsEmbedMode(svState.mode)) {
    const label = svPlatformLabel(svState.mode);
    if (els.author) els.author.textContent = '@' + label;
    let title = label + ' 视频';
    if (svState.mode === 'bilibili' && svState.embedId === SV_PEPPA_BVID) title = SV_PEPPA_TITLE;
    if (svState.mode === 'youtube' && svState.embedId === SV_YT_DEMO_ID) title = SV_YT_DEMO_TITLE;
    if (els.title) els.title.textContent = title + (svState.embedId ? ' · ' + svState.embedId : '');
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
    if (n) {
      n.textContent = svIsEmbedMode(svState.mode)
        ? (svPlatformLabel(svState.mode) + '内音量')
        : (svState.muted ? '静音' : '声音');
    }
  }
}

function svClearEmbedFrame() {
  const els = svEls();
  const root = els.root;
  if (els.embed) {
    try { els.embed.src = 'about:blank'; } catch (_) {}
    try { els.embed.removeAttribute('src'); } catch (_) {}
    els.embed.style.display = 'none';
  }
  if (root) {
    root.classList.remove('mode-embed', 'mode-bilibili', 'mode-youtube', 'mode-pornhub');
  }
}

function svSwitchToNativeMode() {
  svState.mode = 'native';
  svWriteMode('native');
  svClearEmbedFrame();
  const els = svEls();
  if (els.video) els.video.style.display = 'block';
  svUpdateChrome();
}

function svSwitchToEmbedMode(platform, id, opts) {
  opts = opts || {};
  const pid = String(id || '').trim();
  if (!svIsEmbedMode(platform) || !pid) {
    svShowHint('未识别到有效 ID');
    return false;
  }
  const els = svEls();
  const root = els.root;
  if (!els.embed || !root) return false;

  /* 暂停原生 video，清空旧 iframe，防双声道 / 旧源漏声 */
  if (els.video) {
    try { els.video.pause(); } catch (_) {}
    try { els.video.removeAttribute('src'); els.video.load(); } catch (_) {}
    els.video.style.display = 'none';
  }
  try { els.embed.src = 'about:blank'; } catch (_) {}

  const src = svEmbedUrl(platform, pid);
  if (!src) {
    svShowHint('无法生成播放地址');
    return false;
  }

  svState.mode = platform;
  svState.embedId = pid;
  svState.lastEmbed = { mode: platform, id: pid };
  svWriteMode(platform);
  svWriteEmbedId(pid);
  if (opts.saveInput !== false) {
    const saveVal = opts.inputValue != null ? opts.inputValue : pid;
    svWriteCustomApi(saveVal);
    if (els.api) els.api.value = saveVal;
  }

  root.classList.remove('mode-bilibili', 'mode-youtube', 'mode-pornhub');
  root.classList.add('mode-embed', 'mode-' + platform);
  els.embed.style.display = 'block';
  els.embed.style.width = '100%';
  els.embed.style.height = '100%';
  els.embed.style.border = 'none';
  els.embed.title = svPlatformLabel(platform) + ' 播放器';
  els.embed.src = src;

  svUpdateChrome();
  const hintName = (platform === 'bilibili' && pid === SV_PEPPA_BVID)
    ? '🐷 小猪佩奇'
    : (svPlatformLabel(platform) + ' 播放');
  svShowHint(hintName);
  svSetStatus(svPlatformLabel(platform) + ' 内嵌 · ' + pid +
    (platform === 'bilibili' && pid === SV_PEPPA_BVID ? ' · 小猪佩奇' : ''));
  if (opts.closePanel !== false) svSetPanelOpen(false);
  return true;
}

function svPreloadNext() {
  const feed = svState.feed || [];
  if (feed.length < 2) return;
  const next = feed[(svState.index + 1) % feed.length];
  if (!next || !next.url) return;
  try {
    if (!svState.preloadVideo) {
      svState.preloadVideo = document.createElement('video');
      svState.preloadVideo.preload = 'auto';
      svState.preloadVideo.muted = true;
      svState.preloadVideo.playsInline = true;
    }
    if (svState.preloadVideo.src !== next.url) {
      svState.preloadVideo.src = next.url;
      try { svState.preloadVideo.load(); } catch (_) {}
    }
  } catch (_) {}
}

function svPrepareVideoEl(v) {
  if (!v) return;
  v.muted = true;
  v.defaultMuted = true;
  v.autoplay = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('muted', '');
  v.setAttribute('autoplay', '');
  v.setAttribute('loop', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.setAttribute('x5-playsinline', '');
  v.setAttribute('x5-video-player-type', 'h5-page');
}

function svTryPlay(v) {
  if (!v) return;
  v.muted = true;
  svState.muted = true;
  svWriteMuted(true);
  svUpdateChrome();
  const playPromise = v.play();
  if (playPromise !== undefined && typeof playPromise.catch === 'function') {
    playPromise.catch(function (err) {
      console.warn('自动播放被拦截，需要手动点击播放:', err);
      svSetStatus('点屏幕播放 · 点右侧喇叭开声音');
    });
  }
}

function svPlayCurrent() {
  if (svIsEmbedMode(svState.mode)) {
    if (svState.embedId) {
      svSwitchToEmbedMode(svState.mode, svState.embedId, { saveInput: false, closePanel: false });
    }
    return;
  }
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
  svPreloadNext();
  svSetStatus((svState.index + 1) + ' / ' + svState.feed.length + ' · 上滑下一条 · 点喇叭开声');
}

function svApplyDirectUrl(newUrl) {
  svSwitchToNativeMode();
  const els = svEls();
  const video = els.video;
  if (!video) return;
  const item = {
    id: 'custom-direct',
    title: '自定义源',
    author: '@custom',
    url: newUrl,
  };
  svState.feed = [item].concat(
    SV_BUILTIN_FEED.filter(function (x) { return x.url !== newUrl; })
  );
  svState.index = 0;
  svPrepareVideoEl(video);
  video.pause();
  video.src = newUrl;
  video.load();
  video.muted = true;
  const playPromise = video.play();
  if (playPromise !== undefined && typeof playPromise.catch === 'function') {
    playPromise.catch(function (err) {
      console.warn('自动播放被拦截，需要手动点击播放:', err);
      svSetStatus('已换源 · 点屏幕播放');
    });
  }
  svState.muted = true;
  svWriteMuted(true);
  svUpdateChrome();
  svWriteCustomApi(newUrl);
  svShowHint('已应用源');
  svSetStatus('已应用源');
  svSetPanelOpen(false);
}

function svGo(delta) {
  if (svIsEmbedMode(svState.mode)) {
    svShowHint(svPlatformLabel(svState.mode) + ' 模式请用播放器内切换');
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

function svToggleMute() {
  if (svIsEmbedMode(svState.mode)) {
    svShowHint('请用 ' + svPlatformLabel(svState.mode) + ' 播放器内音量');
    return;
  }
  const v = svEls().video;
  svState.muted = !svState.muted;
  svWriteMuted(svState.muted);
  if (v) {
    v.muted = svState.muted;
    if (!svState.muted) {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }
  svUpdateChrome();
  svShowHint(svState.muted ? '已静音' : '已开声音');
}

function svTogglePlay() {
  if (svIsEmbedMode(svState.mode)) {
    svShowHint('请点 ' + svPlatformLabel(svState.mode) + ' 播放器控制');
    return;
  }
  const v = svEls().video;
  if (!v) return;
  if (v.paused) {
    if (svState.muted) v.muted = true;
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

function svSetPanelOpen(on) {
  svState.panelOpen = !!on;
  const root = svGetRoot();
  if (root) root.classList.toggle('panel-open', svState.panelOpen);
}

function svArmClickGuard() {
  svState.ignoreClicksUntil = Date.now() + SV_OPEN_GUARD_MS;
}

function svClicksArmed() {
  return Date.now() >= (svState.ignoreClicksUntil || 0);
}

function svMarkAppActive(appName) {
  const els = svEls();
  if (!els.apps) return;
  const nodes = els.apps.querySelectorAll('.etc-sv-app');
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    n.classList.toggle('is-on', n.getAttribute('data-app') === appName);
  }
}

/**
 * 仅从弹窗内 App 卡片调用。严禁 window.location（会打断酒馆）。
 * Scheme 用隐藏 iframe；网页版用 window.open 新窗。
 */
function svLaunchExternalApp(opts) {
  opts = opts || {};
  const scheme = String(opts.scheme || '').trim();
  const web = String(opts.web || '').trim();
  const name = String(opts.name || '应用');
  let opened = false;

  function openWebFallback() {
    if (!web) return;
    try {
      window.open(web, '_blank', 'noopener,noreferrer');
      opened = true;
    } catch (_) {}
  }

  if (scheme) {
    const start = Date.now();
    let fallbackTimer = null;
    const clearWatch = function () {
      try { window.removeEventListener('pagehide', onHide); } catch (_) {}
      try { document.removeEventListener('visibilitychange', onVis); } catch (_) {}
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };
    const onHide = function () { opened = true; clearWatch(); };
    const onVis = function () {
      if (document.hidden) { opened = true; clearWatch(); }
    };
    try {
      window.addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', onVis);
    } catch (_) {}

    try {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;left:-9999px;';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.src = scheme;
      document.body.appendChild(iframe);
      setTimeout(function () { try { iframe.remove(); } catch (_) {} }, 1600);
    } catch (_) {
      /* 绝不使用 window.location.href，避免打断酒馆生成 */
    }

    fallbackTimer = setTimeout(function () {
      clearWatch();
      if (!opened && Date.now() - start < 2800) {
        openWebFallback();
        svShowHint(name + ' · 网页版');
        svSetStatus(name + ' 未安装时已打开网页版（新窗口）');
      }
    }, 1200);
  } else {
    openWebFallback();
  }
  svShowHint('正在打开 ' + name);
}

function svOnAppDockClick(btn) {
  if (!btn || !svClicksArmed()) return;
  const app = btn.getAttribute('data-app') || '';
  const action = btn.getAttribute('data-action') || '';

  if (action === 'external' || app === 'douyin' || app === 'xiaohongshu') {
    const label = app === 'douyin' ? '抖音' : (app === 'xiaohongshu' ? '小红书' : app);
    svLaunchExternalApp({
      name: label,
      scheme: btn.getAttribute('data-scheme') || '',
      web: btn.getAttribute('data-web') || '',
    });
    /* 不关闭媒体中心，不打断酒馆 */
    return;
  }

  if (app === 'bilibili') {
    svMarkAppActive('bilibili');
    svPlayBilibiliPreset();
    return;
  }
  if (app === 'youtube') {
    svMarkAppActive('youtube');
    svPlayYoutubePreset();
    return;
  }
  if (app === 'pornhub') {
    svMarkAppActive('pornhub');
    svPromptPornhub();
    return;
  }
}

function svPlayBilibiliPreset() {
  const els = svEls();
  if (els.api) els.api.value = SV_PEPPA_BVID;
  svMarkAppActive('bilibili');
  svSwitchToEmbedMode('bilibili', SV_PEPPA_BVID, { saveInput: true, closePanel: true });
}

function svPlayYoutubePreset() {
  const demo = 'https://www.youtube.com/watch?v=' + SV_YT_DEMO_ID;
  const els = svEls();
  if (els.api) els.api.value = demo;
  svMarkAppActive('youtube');
  svSwitchToEmbedMode('youtube', SV_YT_DEMO_ID, {
    saveInput: true,
    closePanel: true,
    inputValue: demo,
  });
}

function svPromptPornhub() {
  const els = svEls();
  svSetPanelOpen(true);
  if (els.api) {
    els.api.placeholder = '粘贴 Pornhub 链接或 viewkey=xxxx';
    els.api.value = '';
    setTimeout(function () {
      try { els.api.focus(); } catch (_) {}
    }, 40);
  }
  svSetStatus('Pornhub：粘贴完整链接或 viewkey，再点「应用源」');
  svShowHint('粘贴 PH 链接');
}

async function svOnApplySource() {
  const els = svEls();
  const raw = els.api ? String(els.api.value || '').trim() : '';
  if (!raw) {
    svShowHint('请先填写视频地址');
    svSetStatus('输入框为空');
    try { if (els.api) els.api.focus(); } catch (_) {}
    return;
  }

  const parsed = svParseEmbedInput(raw);
  if (parsed) {
    svSwitchToEmbedMode(parsed.platform, parsed.id, {
      saveInput: true,
      closePanel: true,
      inputValue: raw,
    });
    return;
  }

  if (!/^https?:\/\//i.test(raw)) {
    svShowHint('请填写 http(s) / BV / viewkey');
    svSetStatus('未识别：可填 mp4、B站/YT/PH 链接、BV 号或 viewkey');
    return;
  }
  svWriteCustomApi(raw);

  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(raw)) {
    svApplyDirectUrl(raw);
    return;
  }

  svApplyDirectUrl(raw);
  try {
    const feed = await svLoadFeedFromApi(raw);
    if (feed && feed.length && feed[0] && feed[0].url && feed[0].url !== raw) {
      svState.feed = feed;
      svState.index = 0;
      svPlayCurrent();
      svShowHint('已应用源');
      svSetStatus('已从 API 加载 ' + feed.length + ' 条');
      svSetPanelOpen(false);
    }
  } catch (_) {}
}

function svIsInteractiveTarget(el) {
  if (!el || !el.closest) return false;
  return !!(
    el.closest('#video-source-panel') ||
    el.closest('#eight-tail-sv-panel') ||
    el.closest('#eight-tail-sv-toolbar') ||
    el.closest('#eight-tail-sv-apps') ||
    el.closest('#eight-tail-sv-rail') ||
    el.closest('input') ||
    el.closest('button') ||
    el.closest('textarea') ||
    el.closest('label') ||
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

  if (els.gear) {
    els.gear.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svSetPanelOpen(!svState.panelOpen);
      if (svState.panelOpen) {
        setTimeout(function () {
          try { if (els.api) els.api.focus(); } catch (_) {}
        }, 50);
      }
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

  if (els.apply) {
    els.apply.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svOnApplySource();
    });
  }
  if (els.btnBili) {
    els.btnBili.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svPlayBilibiliPreset();
    });
  }
  if (els.btnYt) {
    els.btnYt.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      svPlayYoutubePreset();
    });
  }
  if (els.btnPh) {
    els.btnPh.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      if (!svClicksArmed()) return;
      svPromptPornhub();
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
  if (els.reset) {
    els.reset.addEventListener('click', function (e) {
      e.preventDefault();
      stopBubble(e);
      if (els.api) els.api.value = '';
      svWriteCustomApi('');
      svWriteEmbedId('');
      svWriteMode('native');
      svState.embedId = '';
      svState.lastEmbed = { mode: '', id: '' };
      svSwitchToNativeMode();
      svState.feed = SV_BUILTIN_FEED.slice();
      svState.index = 0;
      svPlayCurrent();
      svSetStatus('已恢复内置片源');
      svShowHint('已恢复内置');
      svSetPanelOpen(false);
    });
  }

  if (els.panel) {
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'click'].forEach(function (evName) {
      els.panel.addEventListener(evName, function (e) {
        stopBubble(e);
      }, { passive: true });
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
      if (svIsEmbedMode(svState.mode)) return;
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      const dy = t.clientY - svState.startY;
      if (Math.abs(dy) >= SV_SWIPE_PX) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        if (dy < 0) svGo(1);
        else svGo(-1);
        return;
      }
      if (!svState.moved) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        svTogglePlay();
      }
    }, { passive: false });

    stage.addEventListener('click', function (e) {
      if (svIsInteractiveTarget(e.target)) return;
      if (svIsEmbedMode(svState.mode)) return;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      e.stopPropagation();
      svTogglePlay();
    });

    stage.addEventListener('wheel', function (e) {
      if (!svState.open) return;
      if (svIsInteractiveTarget(e.target)) return;
      if (svIsEmbedMode(svState.mode)) return;
      e.preventDefault();
      if (e.deltaY > 24) svGo(1);
      else if (e.deltaY < -24) svGo(-1);
    }, { passive: false });
  }

  root.addEventListener('pointerdown', function (e) {
    if (svIsInteractiveTarget(e.target)) return;
    e.stopPropagation();
  });
  root.addEventListener('touchstart', function (e) {
    if (svIsInteractiveTarget(e.target)) return;
    e.stopPropagation();
  }, { passive: true });
}

function svRestoreSavedEmbed(savedMode, savedId, savedCustom) {
  if (svIsEmbedMode(savedMode) && savedId) {
    return svSwitchToEmbedMode(savedMode, savedId, { saveInput: false, closePanel: true });
  }
  if (savedCustom) {
    const parsed = svParseEmbedInput(savedCustom);
    if (parsed) {
      return svSwitchToEmbedMode(parsed.platform, parsed.id, {
        saveInput: true,
        closePanel: true,
        inputValue: savedCustom,
      });
    }
  }
  return false;
}

export async function openShortVideoPlayer() {
  const root = svBuildDom();
  try {
    if (root.parentElement !== document.body) document.body.appendChild(root);
    else document.body.appendChild(root);
  } catch (_) {}

  svForceRootCss(root);
  svState.muted = true;
  svWriteMuted(true);
  svSetPanelOpen(false);
  svArmClickGuard(); /* 防止抬手误点小红书/抖音 */

  const els = svEls(root);
  const savedCustom = svReadCustomApi();
  const savedMode = svReadMode();
  const savedId = svReadEmbedId() ||
    (savedMode === 'bilibili' ? svExtractBvId(savedCustom) : '') ||
    '';
  if (els.api) {
    els.api.value = savedCustom || (svIsEmbedMode(savedMode) ? savedId : '');
  }

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  svState.open = true;
  if (svIsEmbedMode(savedMode)) svMarkAppActive(savedMode);
  else svMarkAppActive('');

  setTimeout(function () {
    svForceRootCss(root);
    if (svRestoreSavedEmbed(savedMode, savedId, savedCustom)) {
      if (svIsEmbedMode(savedMode)) svMarkAppActive(savedMode);
      return;
    }

    svSwitchToNativeMode();
    try {
      const isHttp = savedCustom && /^https?:\/\//i.test(savedCustom);
      const isEmbed = savedCustom && svParseEmbedInput(savedCustom);
      svState.feed = (isHttp && !isEmbed)
        ? [{ id: 'saved', title: '已保存源', author: '@custom', url: savedCustom }].concat(SV_BUILTIN_FEED)
        : SV_BUILTIN_FEED.slice();
    } catch (_) {
      svState.feed = SV_BUILTIN_FEED.slice();
    }
    if (!svState.feed.length) svState.feed = SV_BUILTIN_FEED.slice();
    if (svState.index >= svState.feed.length) svState.index = 0;
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
  if (svIsEmbedMode(svState.mode) && svState.embedId) {
    svState.lastEmbed = { mode: svState.mode, id: svState.embedId };
    svWriteEmbedId(svState.embedId);
    svWriteMode(svState.mode);
  }
  /* 立刻清空 iframe，防止后台漏声 */
  svClearEmbedFrame();
  svSetPanelOpen(false);
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
} catch (_) {}
