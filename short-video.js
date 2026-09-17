/**
 * 酒馆宿主层 · 全屏沉浸短视频（抖音风上下滑）
 * - 挂 document.body，z-index 压过桌宠
 * - 原生 <video>，无外站 iframe
 * - 换源栏默认折叠，不挡画面
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_STYLE_ID = 'eight-tail-sv-style-v2';
const SV_API_LS_KEY = 'eight_tail_short_video_custom_api';
const SV_MUTED_LS_KEY = 'eight_tail_short_video_muted';
const SV_SWIPE_PX = 40;

/**
 * 国内 CDN / 开放公共测试 MP4（直链、免嵌站）
 * 优先七牛/DCloud 等国内节点，开箱即可出画
 */
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
};

function svReadMuted() {
  try {
    const v = localStorage.getItem(SV_MUTED_LS_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch (_) {}
  return true; /* 默认静音，保证自动播放 */
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
  /* 清掉旧版样式节点，避免冲突 */
  try {
    const old = document.getElementById('eight-tail-sv-style');
    if (old) old.remove();
  } catch (_) {}

  style.textContent = `
#eight-tail-short-video-root {
  position: fixed !important;
  inset: 0 !important;
  left: 0 !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100dvh !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #000 !important;
  z-index: 100002 !important;
  display: none !important;
  flex-direction: column !important;
  overflow: hidden !important;
  pointer-events: auto !important;
  touch-action: none !important;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #fff;
  user-select: none;
  -webkit-user-select: none;
  box-sizing: border-box !important;
  transform: none !important;
  border: 0 !important;
  border-radius: 0 !important;
}
#eight-tail-short-video-root.is-open {
  display: flex !important;
}
#eight-tail-short-video-root,
#eight-tail-short-video-root * {
  pointer-events: auto !important;
  box-sizing: border-box;
}
#eight-tail-sv-toolbar {
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 20 !important;
  display: flex !important;
  align-items: flex-start !important;
  justify-content: flex-end !important;
  gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px 12px !important;
  background: linear-gradient(180deg, rgba(0,0,0,.55), transparent) !important;
  pointer-events: auto !important;
}
#eight-tail-sv-gear,
#eight-tail-sv-close {
  width: 42px !important;
  height: 42px !important;
  border: 0 !important;
  border-radius: 50% !important;
  background: rgba(255,255,255,.22) !important;
  color: #fff !important;
  font-size: 20px !important;
  line-height: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
  pointer-events: auto !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
  flex-shrink: 0 !important;
}
#eight-tail-sv-close {
  background: rgba(239, 68, 68, .88) !important;
  font-size: 26px !important;
  font-weight: 700 !important;
}
#eight-tail-sv-stage {
  position: relative !important;
  flex: 1 1 auto !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  background: #000 !important;
  pointer-events: auto !important;
  touch-action: none !important;
}
#eight-tail-sv-video {
  position: absolute !important;
  inset: 0 !important;
  flex: 1 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  background: #000 !important;
  pointer-events: none !important; /* 手势由 stage 接管 */
}
#eight-tail-sv-hint {
  position: absolute;
  left: 50%;
  top: 45%;
  transform: translate(-50%, -50%);
  z-index: 6;
  font-size: 14px;
  opacity: 0;
  pointer-events: none !important;
  transition: opacity .18s;
  background: rgba(0,0,0,.5);
  padding: 8px 16px;
  border-radius: 999px;
}
#eight-tail-sv-hint.show { opacity: 1; }
#eight-tail-sv-rail {
  position: absolute !important;
  right: 10px !important;
  bottom: max(100px, calc(18% + env(safe-area-inset-bottom))) !important;
  z-index: 8 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  gap: 16px !important;
  pointer-events: auto !important;
}
.etc-sv-rail-btn {
  width: 48px !important;
  min-height: 48px !important;
  border: 0 !important;
  border-radius: 50% !important;
  background: rgba(0,0,0,.4) !important;
  color: #fff !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 2px !important;
  font-size: 11px !important;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  pointer-events: auto !important;
  cursor: pointer !important;
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
  position: absolute;
  left: 14px; right: 72px;
  bottom: max(72px, calc(12% + env(safe-area-inset-bottom)));
  z-index: 7;
  pointer-events: none !important;
  text-shadow: 0 1px 4px rgba(0,0,0,.7);
}
#eight-tail-sv-author { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
#eight-tail-sv-title { font-size: 13px; opacity: .92; line-height: 1.4; max-height: 3.2em; overflow: hidden; }
#eight-tail-sv-panel {
  position: absolute !important;
  left: 0 !important; right: 0 !important; bottom: 0 !important;
  z-index: 15 !important;
  display: none !important;
  flex-direction: column !important;
  gap: 8px !important;
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) !important;
  background: rgba(10,10,14,.94) !important;
  border-top: 1px solid rgba(255,255,255,.1) !important;
  pointer-events: auto !important;
}
#eight-tail-short-video-root.panel-open #eight-tail-sv-panel {
  display: flex !important;
}
#eight-tail-sv-panel label { font-size: 11px; opacity: .75; pointer-events: none !important; }
#eight-tail-sv-api {
  width: 100% !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255,255,255,.2) !important;
  background: rgba(255,255,255,.1) !important;
  color: #fff !important;
  padding: 10px 12px !important;
  font-size: 13px !important;
  outline: none !important;
  pointer-events: auto !important;
  -webkit-user-select: text !important;
  user-select: text !important;
}
#eight-tail-sv-actions { display: flex; gap: 8px; }
#eight-tail-sv-actions button {
  flex: 1 !important;
  border: 0 !important;
  border-radius: 10px !important;
  padding: 10px !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  pointer-events: auto !important;
}
#eight-tail-sv-apply { background: #5b8def !important; color: #fff !important; }
#eight-tail-sv-reset { background: rgba(255,255,255,.14) !important; color: #fff !important; }
#eight-tail-sv-status { font-size: 11px; opacity: .7; min-height: 14px; pointer-events: none !important; }
`;
}

function svForceRootCss(root) {
  if (!root) return;
  const css = {
    position: 'fixed',
    inset: '0',
    left: '0',
    top: '0',
    right: '0',
    bottom: '0',
    width: '100vw',
    height: '100dvh',
    background: '#000',
    zIndex: '100002',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    pointerEvents: 'auto',
    margin: '0',
    padding: '0',
    transform: 'none',
    border: '0',
    borderRadius: '0',
    maxWidth: 'none',
    maxHeight: 'none',
  };
  Object.keys(css).forEach(function (k) {
    try { root.style.setProperty(k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }), css[k], 'important'); } catch (_) {}
  });
  /* 上面 camel→kebab 对 inset 等 OK；显式再写一遍关键项 */
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
  if (root && root.dataset.svVersion === '2') {
    svForceRootCss(root);
    return root;
  }
  if (root) {
    try { root.remove(); } catch (_) {}
  }

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.dataset.svVersion = '2';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '短视频');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="eight-tail-sv-toolbar">',
    '  <button type="button" id="eight-tail-sv-gear" title="换源设置" aria-label="换源设置">⚙</button>',
    '  <button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭短视频">×</button>',
    '</div>',
    '<div id="eight-tail-sv-stage">',
    '  <video id="eight-tail-sv-video" playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="true" loop preload="auto"></video>',
    '  <div id="eight-tail-sv-hint">暂停</div>',
    '  <div id="eight-tail-sv-rail">',
    '    <div id="eight-tail-sv-avatar" aria-hidden="true">🐱</div>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-like"><span class="ico">♡</span><span class="n">赞</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-mute"><span class="ico">🔇</span><span class="n">静音</span></button>',
    '  </div>',
    '  <div id="eight-tail-sv-meta">',
    '    <div id="eight-tail-sv-author">@sample</div>',
    '    <div id="eight-tail-sv-title">短视频</div>',
    '  </div>',
    '</div>',
    '<div id="eight-tail-sv-panel">',
    '  <label for="eight-tail-sv-api">自定义视频源 / API（JSON 数组或 mp4 直链）</label>',
    '  <input id="eight-tail-sv-api" type="url" inputmode="url" placeholder="https://.../api 或 https://.../a.mp4" autocomplete="off" />',
    '  <div id="eight-tail-sv-actions">',
    '    <button type="button" id="eight-tail-sv-apply">应用源</button>',
    '    <button type="button" id="eight-tail-sv-reset">恢复内置</button>',
    '  </div>',
    '  <div id="eight-tail-sv-status">上下滑动切换 · 点屏幕播放/暂停</div>',
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
    status: root.querySelector('#eight-tail-sv-status'),
    stage: root.querySelector('#eight-tail-sv-stage'),
    panel: root.querySelector('#eight-tail-sv-panel'),
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
  if (!item || !els.video) return;
  if (els.author) els.author.textContent = item.author || '@sample';
  if (els.title) els.title.textContent = item.title || '';
  const liked = !!svState.liked[item.id || item.url];
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
    if (n) n.textContent = svState.muted ? '静音' : '声音';
  }
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

function svPlayCurrent() {
  const item = svCurrent();
  const els = svEls();
  if (!item || !els.video) return;
  svUpdateChrome();
  const v = els.video;
  v.muted = !!svState.muted;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.setAttribute('x5-playsinline', '');
  if (v.getAttribute('src') !== item.url && v.src !== item.url) {
    v.src = item.url;
    try { v.load(); } catch (_) {}
  }
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch(function () {
      v.muted = true;
      svState.muted = true;
      svWriteMuted(true);
      svUpdateChrome();
      v.play().catch(function () {
        svSetStatus('播放失败，请上滑换下一条或检查网络');
      });
    });
  }
  svPreloadNext();
  svSetStatus((svState.index + 1) + ' / ' + svState.feed.length + ' · 上滑下一条 · 点按暂停');
}

function svGo(delta) {
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

function svTogglePlay() {
  const v = svEls().video;
  if (!v) return;
  if (v.paused) {
    v.play().catch(function () {});
    svShowHint('播放');
  } else {
    v.pause();
    svShowHint('暂停');
  }
}

function svToggleMute() {
  svState.muted = !svState.muted;
  svWriteMuted(svState.muted);
  const v = svEls().video;
  if (v) {
    v.muted = svState.muted;
    if (!svState.muted) v.play().catch(function () {});
  }
  svUpdateChrome();
  svShowHint(svState.muted ? '已静音' : '已开声音');
}

function svToggleLike() {
  const item = svCurrent();
  if (!item) return;
  const key = item.id || item.url;
  svState.liked[key] = !svState.liked[key];
  svUpdateChrome();
}

function svSetPanelOpen(on) {
  svState.panelOpen = !!on;
  const root = svGetRoot();
  if (root) root.classList.toggle('panel-open', svState.panelOpen);
}

function svBindUi(root) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const els = svEls(root);

  function stop(e) {
    try {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    } catch (_) {}
  }

  if (els.close) {
    ['click', 'touchend'].forEach(function (evName) {
      els.close.addEventListener(evName, function (e) {
        stop(e);
        closeShortVideoPlayer();
      }, { passive: false });
    });
  }

  if (els.gear) {
    els.gear.addEventListener('click', function (e) {
      stop(e);
      svSetPanelOpen(!svState.panelOpen);
    });
    els.gear.addEventListener('touchend', function (e) {
      stop(e);
      svSetPanelOpen(!svState.panelOpen);
    }, { passive: false });
  }

  if (els.like) {
    els.like.addEventListener('click', function (e) { stop(e); svToggleLike(); });
    els.like.addEventListener('touchend', function (e) { stop(e); svToggleLike(); }, { passive: false });
  }
  if (els.mute) {
    els.mute.addEventListener('click', function (e) { stop(e); svToggleMute(); });
    els.mute.addEventListener('touchend', function (e) { stop(e); svToggleMute(); }, { passive: false });
  }

  if (els.apply) {
    els.apply.addEventListener('click', async function (e) {
      stop(e);
      const url = els.api ? els.api.value.trim() : '';
      svWriteCustomApi(url);
      svSetStatus('正在加载自定义源…');
      svState.feed = await svLoadFeedFromApi(url);
      svState.index = 0;
      svPlayCurrent();
      svSetPanelOpen(false);
    });
  }
  if (els.reset) {
    els.reset.addEventListener('click', function (e) {
      stop(e);
      if (els.api) els.api.value = '';
      svWriteCustomApi('');
      svState.feed = SV_BUILTIN_FEED.slice();
      svState.index = 0;
      svPlayCurrent();
      svSetStatus('已恢复内置片源');
      svSetPanelOpen(false);
    });
  }

  const stage = els.stage;
  if (stage) {
    stage.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      /* 点在侧栏按钮上不记滑动 */
      const t = e.target;
      if (t && t.closest && (t.closest('#eight-tail-sv-rail') || t.closest('#eight-tail-sv-toolbar') || t.closest('#eight-tail-sv-panel'))) {
        return;
      }
      svState.moved = false;
      svState.startY = e.touches[0].clientY;
      svState.startX = e.touches[0].clientX;
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches.length) return;
      const dy = e.touches[0].clientY - svState.startY;
      const dx = e.touches[0].clientX - svState.startX;
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) svState.moved = true;
      /* 纵向滑动时阻止页面滚动 */
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        try { e.preventDefault(); } catch (_) {}
      }
    }, { passive: false });

    stage.addEventListener('touchend', function (e) {
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      const target = e.target;
      if (target && target.closest && (target.closest('#eight-tail-sv-rail') || target.closest('#eight-tail-sv-toolbar') || target.closest('#eight-tail-sv-panel'))) {
        return;
      }
      const dy = t.clientY - svState.startY;
      if (Math.abs(dy) >= SV_SWIPE_PX) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        if (dy < 0) svGo(1);   /* 上滑 → 下一条 */
        else svGo(-1);         /* 下滑 → 上一条 */
        return;
      }
      /* 单击中央：播放/暂停 */
      if (!svState.moved) {
        try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
        svTogglePlay();
      }
    }, { passive: false });

    stage.addEventListener('click', function (e) {
      const target = e.target;
      if (target && target.closest && (target.closest('#eight-tail-sv-rail') || target.closest('#eight-tail-sv-toolbar') || target.closest('#eight-tail-sv-panel'))) {
        return;
      }
      /* 移动端已由 touchend 处理；桌面单击 */
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      e.stopPropagation();
      svTogglePlay();
    });

    stage.addEventListener('wheel', function (e) {
      if (!svState.open) return;
      e.preventDefault();
      if (e.deltaY > 24) svGo(1);
      else if (e.deltaY < -24) svGo(-1);
    }, { passive: false });
  }

  root.addEventListener('pointerdown', function (e) { e.stopPropagation(); }, true);
  root.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { capture: true, passive: true });
}

export async function openShortVideoPlayer() {
  const root = svBuildDom();
  try {
    if (root.parentElement !== document.body) document.body.appendChild(root);
    else document.body.appendChild(root); /* 再 append 一次保证置顶 */
  } catch (_) {}

  svForceRootCss(root);
  svState.muted = svReadMuted();
  svSetPanelOpen(false);

  const els = svEls(root);
  if (els.api) els.api.value = svReadCustomApi();

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  svState.open = true;

  svSetStatus('加载片源中…');
  try {
    const custom = svReadCustomApi();
    svState.feed = custom ? await svLoadFeedFromApi(custom) : SV_BUILTIN_FEED.slice();
  } catch (_) {
    svState.feed = SV_BUILTIN_FEED.slice();
  }
  if (!svState.feed.length) svState.feed = SV_BUILTIN_FEED.slice();
  if (svState.index >= svState.feed.length) svState.index = 0;

  setTimeout(function () {
    svForceRootCss(root);
    svPlayCurrent();
  }, 0);
}

export function closeShortVideoPlayer() {
  const root = svGetRoot();
  const els = svEls(root);
  if (els.video) {
    try { els.video.pause(); } catch (_) {}
  }
  svSetPanelOpen(false);
  if (root) {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('display', 'none', 'important');
  }
  svState.open = false;
}

export function isShortVideoOpen() {
  return !!svState.open;
}

try {
  window.openShortVideoPlayer = openShortVideoPlayer;
  window.closeShortVideoPlayer = closeShortVideoPlayer;
  window.isShortVideoOpen = isShortVideoOpen;
} catch (_) {}
