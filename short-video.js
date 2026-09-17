/**
 * 酒馆宿主层 · 内嵌抖音风上下滑短视频
 * 挂在 document.body，不离开当前页、不 iframe 外站
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_API_LS_KEY = 'eight_tail_short_video_custom_api';
const SV_MUTED_LS_KEY = 'eight_tail_short_video_muted';

/** 开源/公共 CDN 示例片源（可跨域播放，免抖音 iframe） */
const SV_BUILTIN_FEED = [
  {
    id: 'g1',
    title: 'For Bigger Blazes',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  },
  {
    id: 'g2',
    title: 'For Bigger Escapes',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  },
  {
    id: 'g3',
    title: 'For Bigger Fun',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  },
  {
    id: 'g4',
    title: 'For Bigger Joyrides',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  },
  {
    id: 'g5',
    title: 'For Bigger Meltdowns',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  },
  {
    id: 'g6',
    title: 'Subaru Outback',
    author: '@sample',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
  },
  {
    id: 'g7',
    title: 'Elephants Dream',
    author: '@blender',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
  },
  {
    id: 'g8',
    title: 'Sintel Trailer',
    author: '@blender',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
  },
];

let svState = {
  index: 0,
  feed: SV_BUILTIN_FEED.slice(),
  muted: true,
  liked: Object.create(null),
  swipeY0: 0,
  swipeT0: 0,
  swiping: false,
  open: false,
  preloadVideo: null,
};

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

  /* 直接是视频文件 */
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
    console.warn('[EightTailCat-ShortVideo] 自定义源加载失败，回退内置列表', err);
  }
  return SV_BUILTIN_FEED.slice();
}

function svEnsureStyle() {
  if (document.getElementById('eight-tail-sv-style')) return;
  const style = document.createElement('style');
  style.id = 'eight-tail-sv-style';
  style.textContent = `
#eight-tail-short-video-root{
  position:fixed!important;inset:0!important;z-index:99999!important;
  display:none;flex-direction:column;background:#000;
  pointer-events:auto!important;touch-action:none;
  font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
  color:#fff;user-select:none;-webkit-user-select:none;
}
#eight-tail-short-video-root.is-open{display:flex!important;}
#eight-tail-sv-close{
  position:fixed!important;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));
  z-index:100002!important;width:40px;height:40px;border:0;border-radius:50%;
  background:rgba(0,0,0,.45);color:#fff;font-size:22px;line-height:1;
  display:flex!important;align-items:center;justify-content:center;
  pointer-events:auto!important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;
}
#eight-tail-sv-stage{position:relative;flex:1;min-height:0;width:100%;overflow:hidden;background:#000;}
#eight-tail-sv-video{
  position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;
  pointer-events:auto;
}
#eight-tail-sv-tap{position:absolute;inset:0;z-index:2;background:transparent;}
#eight-tail-sv-rail{
  position:absolute;right:10px;bottom:120px;z-index:5;display:flex;flex-direction:column;
  align-items:center;gap:18px;pointer-events:auto;
}
.etc-sv-rail-btn{
  width:48px;min-height:48px;border:0;border-radius:50%;background:rgba(0,0,0,.35);
  color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;font-size:11px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  pointer-events:auto!important;cursor:pointer;padding:6px 0;
}
.etc-sv-rail-btn .ico{font-size:22px;line-height:1;}
.etc-sv-rail-btn.is-on{color:#ff4d6d;}
#eight-tail-sv-avatar{
  width:48px;height:48px;border-radius:50%;border:2px solid #fff;background:
  linear-gradient(145deg,#5b8def,#2db89a);display:flex;align-items:center;justify-content:center;
  font-size:22px;pointer-events:none;
}
#eight-tail-sv-meta{
  position:absolute;left:14px;right:72px;bottom:88px;z-index:4;pointer-events:none;
  text-shadow:0 1px 4px rgba(0,0,0,.65);
}
#eight-tail-sv-author{font-weight:700;font-size:15px;margin-bottom:6px;}
#eight-tail-sv-title{font-size:13px;opacity:.92;line-height:1.4;max-height:3.2em;overflow:hidden;}
#eight-tail-sv-hint{
  position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);z-index:3;
  font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s;
  background:rgba(0,0,0,.45);padding:8px 14px;border-radius:999px;
}
#eight-tail-sv-hint.show{opacity:1;}
#eight-tail-sv-bar{
  flex:0 0 auto;padding:8px 12px calc(10px + env(safe-area-inset-bottom));
  background:rgba(10,10,14,.92);border-top:1px solid rgba(255,255,255,.08);
  display:flex;flex-direction:column;gap:6px;pointer-events:auto;z-index:6;
}
#eight-tail-sv-bar label{font-size:11px;opacity:.75;}
#eight-tail-sv-api{
  width:100%;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.08);color:#fff;padding:8px 10px;font-size:12px;
  outline:none;
}
#eight-tail-sv-actions{display:flex;gap:8px;}
#eight-tail-sv-actions button{
  flex:1;border:0;border-radius:10px;padding:8px 10px;font-size:12px;font-weight:700;
  cursor:pointer;pointer-events:auto!important;
}
#eight-tail-sv-apply{background:#5b8def;color:#fff;}
#eight-tail-sv-reset{background:rgba(255,255,255,.12);color:#fff;}
#eight-tail-sv-status{font-size:11px;opacity:.7;min-height:14px;}
`;
  document.head.appendChild(style);
}

function svGetRoot() {
  return document.getElementById(SV_ROOT_ID);
}

function svBuildDom() {
  svEnsureStyle();
  let root = svGetRoot();
  if (root) return root;

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '短视频');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭短视频">×</button>',
    '<div id="eight-tail-sv-stage">',
    '  <video id="eight-tail-sv-video" playsinline webkit-playsinline loop preload="auto"></video>',
    '  <div id="eight-tail-sv-tap" aria-hidden="true"></div>',
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
    '<div id="eight-tail-sv-bar">',
    '  <label for="eight-tail-sv-api">自定义视频源 / API（返回 JSON 数组或直链 mp4）</label>',
    '  <input id="eight-tail-sv-api" type="url" placeholder="https://example.com/api/videos 或 https://.../a.mp4" autocomplete="off" />',
    '  <div id="eight-tail-sv-actions">',
    '    <button type="button" id="eight-tail-sv-apply">应用源</button>',
    '    <button type="button" id="eight-tail-sv-reset">恢复内置</button>',
    '  </div>',
    '  <div id="eight-tail-sv-status">上下滑动切换 · 单击播放/暂停</div>',
    '</div>',
  ].join('');

  document.body.appendChild(root);
  svBindUi(root);
  return root;
}

function svEls(root) {
  root = root || svGetRoot();
  if (!root) return {};
  return {
    root: root,
    video: root.querySelector('#eight-tail-sv-video'),
    tap: root.querySelector('#eight-tail-sv-tap'),
    hint: root.querySelector('#eight-tail-sv-hint'),
    like: root.querySelector('#eight-tail-sv-like'),
    mute: root.querySelector('#eight-tail-sv-mute'),
    author: root.querySelector('#eight-tail-sv-author'),
    title: root.querySelector('#eight-tail-sv-title'),
    close: root.querySelector('#eight-tail-sv-close'),
    api: root.querySelector('#eight-tail-sv-api'),
    apply: root.querySelector('#eight-tail-sv-apply'),
    reset: root.querySelector('#eight-tail-sv-reset'),
    status: root.querySelector('#eight-tail-sv-status'),
    stage: root.querySelector('#eight-tail-sv-stage'),
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
  svShowHint._t = setTimeout(function () { hint.classList.remove('show'); }, 700);
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
    els.like.querySelector('.ico').textContent = liked ? '❤' : '♡';
    els.like.querySelector('.n').textContent = liked ? '已赞' : '赞';
  }
  if (els.mute) {
    els.mute.querySelector('.ico').textContent = svState.muted ? '🔇' : '🔊';
    els.mute.querySelector('.n').textContent = svState.muted ? '静音' : '声音';
  }
}

function svPreloadNext() {
  const feed = svState.feed || [];
  if (feed.length < 2) return;
  const next = feed[(svState.index + 1) % feed.length];
  if (!next || !next.url) return;
  try {
    if (svState.preloadVideo) {
      try { svState.preloadVideo.removeAttribute('src'); svState.preloadVideo.load(); } catch (_) {}
    } else {
      svState.preloadVideo = document.createElement('video');
      svState.preloadVideo.preload = 'auto';
      svState.preloadVideo.muted = true;
      svState.preloadVideo.playsInline = true;
    }
    svState.preloadVideo.src = next.url;
    try { svState.preloadVideo.load(); } catch (_) {}
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
  if (v.src !== item.url) {
    v.src = item.url;
    try { v.load(); } catch (_) {}
  }
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch(function () {
      /* 自动播放被拦：保持静音再试一次 */
      v.muted = true;
      svState.muted = true;
      svWriteMuted(true);
      svUpdateChrome();
      v.play().catch(function () {});
    });
  }
  svPreloadNext();
  svSetStatus((svState.index + 1) + ' / ' + svState.feed.length + ' · 上下滑动切换');
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
  if (v) v.muted = svState.muted;
  svUpdateChrome();
}

function svToggleLike() {
  const item = svCurrent();
  if (!item) return;
  const key = item.id || item.url;
  svState.liked[key] = !svState.liked[key];
  svUpdateChrome();
}

function svBindUi(root) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const els = svEls(root);

  if (els.close) {
    els.close.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeShortVideoPlayer();
    });
  }
  if (els.tap) {
    els.tap.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (svState.swiping) return;
      svTogglePlay();
    });
  }
  if (els.like) {
    els.like.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      svToggleLike();
    });
  }
  if (els.mute) {
    els.mute.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      svToggleMute();
    });
  }
  if (els.apply) {
    els.apply.addEventListener('click', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      const url = els.api ? els.api.value.trim() : '';
      svWriteCustomApi(url);
      svSetStatus('正在加载自定义源…');
      svState.feed = await svLoadFeedFromApi(url);
      svState.index = 0;
      svPlayCurrent();
    });
  }
  if (els.reset) {
    els.reset.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (els.api) els.api.value = '';
      svWriteCustomApi('');
      svState.feed = SV_BUILTIN_FEED.slice();
      svState.index = 0;
      svPlayCurrent();
      svSetStatus('已恢复内置片源');
    });
  }

  const stage = els.stage;
  if (stage) {
    stage.addEventListener('touchstart', function (e) {
      if (!e.touches || !e.touches.length) return;
      svState.swiping = false;
      svState.swipeY0 = e.touches[0].clientY;
      svState.swipeT0 = Date.now();
    }, { passive: true });

    stage.addEventListener('touchmove', function (e) {
      if (!e.touches || !e.touches.length) return;
      const dy = e.touches[0].clientY - svState.swipeY0;
      if (Math.abs(dy) > 12) svState.swiping = true;
    }, { passive: true });

    stage.addEventListener('touchend', function (e) {
      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;
      const dy = t.clientY - svState.swipeY0;
      const dt = Math.max(1, Date.now() - svState.swipeT0);
      const speed = Math.abs(dy) / dt;
      if (Math.abs(dy) > 56 || (Math.abs(dy) > 36 && speed > 0.45)) {
        e.preventDefault();
        if (dy < 0) svGo(1);
        else svGo(-1);
        setTimeout(function () { svState.swiping = false; }, 80);
        return;
      }
      setTimeout(function () { svState.swiping = false; }, 80);
    }, { passive: false });

    /* 桌面滚轮也可切 */
    stage.addEventListener('wheel', function (e) {
      if (!svState.open) return;
      e.preventDefault();
      if (e.deltaY > 20) svGo(1);
      else if (e.deltaY < -20) svGo(-1);
    }, { passive: false });
  }

  /* 阻止事件冒泡到酒馆，但不阻塞主线程其它任务 */
  root.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  root.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
}

export async function openShortVideoPlayer() {
  const root = svBuildDom();
  /* 始终置顶挂 body */
  try {
    if (root.parentElement !== document.body) document.body.appendChild(root);
  } catch (_) {}

  svState.muted = svReadMuted();
  const els = svEls(root);
  if (els.api) els.api.value = svReadCustomApi();

  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  root.style.setProperty('display', 'flex', 'important');
  svState.open = true;

  svSetStatus('加载片源中…');
  try {
    svState.feed = await svLoadFeedFromApi(svReadCustomApi());
  } catch (_) {
    svState.feed = SV_BUILTIN_FEED.slice();
  }
  if (!svState.feed.length) svState.feed = SV_BUILTIN_FEED.slice();
  if (svState.index >= svState.feed.length) svState.index = 0;

  /* 微任务后播放，避免卡住当前调用栈 */
  setTimeout(function () { svPlayCurrent(); }, 0);
}

export function closeShortVideoPlayer() {
  const root = svGetRoot();
  const els = svEls(root);
  if (els.video) {
    try { els.video.pause(); } catch (_) {}
  }
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
} catch (_) {}
