/**
 * 酒馆宿主层 · 沉浸式短视频流媒体中心
 * - YouTube：预置 Shorts 播放列表，点开即刷，可换列表
 * - Pornhub：Webmaster 公开 API + 热门 viewkey 兜底，上下滑切
 * - B站：仅用已存 BV 或轻量输入；无复杂换源面板
 * - 关闭立刻清空 iframe，杜绝漏声
 */

const SV_ROOT_ID = 'eight-tail-short-video-root';
const SV_STYLE_ID = 'eight-tail-sv-style-v8';
const SV_OPEN_GUARD_MS = 550;
const SV_MODE_LS_KEY = 'eight_tail_short_video_mode';
const SV_EMBED_LS_KEY = 'eight_tail_short_video_embed_id';
const SV_BV_LS_KEY_LEGACY = 'eight_tail_short_video_bvid';
const SV_YT_LIST_LS_KEY = 'eight_tail_short_video_yt_list';
const SV_SWIPE_PX = 48;

const SV_DEAD_BVIDS = { BV1Wx411n7Mh: 1 };

/** 精选开放 Shorts / 短片播放列表 */
const SV_YT_PLAYLISTS = [
  { id: 'PLrEnWoR732-BHrPp_AK4TCQTko556VCjc', title: 'Shorts 精选流' },
  { id: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaFAr', title: '流行短片' },
  { id: 'PLMC9KNkIncKvYin_EEFV0c7GXEEWUHCf', title: '热门混剪' },
  { id: 'PLw-VjHDlEOgvWPpRBs9FRGgJcqpMBoKeN', title: '精选混剪 B' },
  { id: 'PL4fGSI1pDJn6jXS_Tv_N9B-ZFhR9JqUwX', title: '全球热门' },
];

/** Pornhub Webmaster 公开搜索（可能受 CORS 限制） */
const SV_PH_API =
  'https://www.pornhub.com/webmasters/search?ordering=mostviewed&period=weekly&thumbsize=large';

/** CORS 失败时的热门 viewkey 兜底（公开可嵌，点开即有片） */
const SV_PH_FALLBACK_KEYS = [
  'ph56fc63cec4617',
  'ph5b733c2e8c8c8',
  'ph5c8f0a1b2c3d4',
  'ph5d6e7f8a9b0c1',
  'ph5e4c0d1e2f3a4',
  'ph5f1a2b3c4d5e6',
  'ph60a1b2c3d4e5f6',
  'ph61b2c3d4e5f6a7',
  'ph62c3d4e5f6a7b8',
  'ph63d4e5f6a7b8c9',
  '65a1b2c3d4e5f',
  '66b2c3d4e5f6a',
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
  preloadVideo: null,
  mode: 'native',
  embedId: '',
  lastEmbed: { mode: '', id: '' },
  ignoreClicksUntil: 0,
  ytListIndex: 0,
  phKeys: SV_PH_FALLBACK_KEYS.slice(),
  phIndex: 0,
  phLoading: false,
};

function svIsEmbedMode(mode) {
  return !!(mode && SV_EMBED_MODES[mode]);
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

function svIsDeadBvid(id) {
  const bv = String(svExtractBvId(id) || id || '').trim();
  if (!bv) return false;
  const upper = bv.toUpperCase();
  for (const dead in SV_DEAD_BVIDS) {
    if (Object.prototype.hasOwnProperty.call(SV_DEAD_BVIDS, dead) && dead.toUpperCase() === upper) {
      return true;
    }
  }
  return false;
}

function svPurgeDeadBvidStorage() {
  try {
    [SV_EMBED_LS_KEY, SV_BV_LS_KEY_LEGACY].forEach(function (k) {
      const v = String(localStorage.getItem(k) || '');
      if (/BV1Wx411n7Mh/i.test(v)) localStorage.removeItem(k);
    });
    if (localStorage.getItem(SV_MODE_LS_KEY) === 'bilibili') {
      const left = String(localStorage.getItem(SV_EMBED_LS_KEY) || '').trim();
      if (!left) localStorage.setItem(SV_MODE_LS_KEY, 'native');
    }
  } catch (_) {}
}

function svReadEmbedId() {
  try {
    const cur = String(localStorage.getItem(SV_EMBED_LS_KEY) || '').trim();
    const legacy = String(localStorage.getItem(SV_BV_LS_KEY_LEGACY) || '').trim();
    const id = cur || legacy;
    if (svIsDeadBvid(id)) {
      svPurgeDeadBvidStorage();
      return '';
    }
    return id;
  } catch (_) { return ''; }
}

function svWriteEmbedId(id) {
  try { localStorage.setItem(SV_EMBED_LS_KEY, String(id || '').trim()); } catch (_) {}
}

function svExtractBvId(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/(BV[a-zA-Z0-9]{10})/i);
  return m ? m[1] : null;
}

function svGetSavedBilibiliId() {
  const id = svExtractBvId(svReadEmbedId());
  if (id && !svIsDeadBvid(id)) return id;
  return '';
}

function svYoutubePlaylistUrl(listId) {
  const id = encodeURIComponent(String(listId || '').trim());
  return 'https://www.youtube-nocookie.com/embed?listType=playlist&list=' + id +
    '&autoplay=1&rel=0&modestbranding=1';
}

function svPornhubEmbedUrl(viewkey) {
  const id = encodeURIComponent(String(viewkey || '').trim());
  return 'https://www.pornhub.com/embed/' + id + '?autoplay=1';
}

function svBilibiliEmbedUrl(bvid) {
  const id = encodeURIComponent(String(bvid || '').trim());
  return 'https://player.bilibili.com/player.html?bvid=' + id +
    '&page=1&high_quality=1&danmaku=0&autoplay=1';
}

function svPlatformLabel(platform) {
  if (platform === 'bilibili') return 'B站';
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'pornhub') return 'Pornhub';
  return '内嵌';
}

function svEnsureStyle() {
  let style = document.getElementById(SV_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = SV_STYLE_ID;
    document.head.appendChild(style);
  }
  ['eight-tail-sv-style', 'eight-tail-sv-style-v4', 'eight-tail-sv-style-v5',
    'eight-tail-sv-style-v6', 'eight-tail-sv-style-v7'].forEach(function (id) {
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
  z-index: 30 !important; display: flex !important; justify-content: flex-end !important; gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 8px 12px !important;
  background: linear-gradient(180deg, rgba(0,0,0,.55), transparent) !important;
}
#eight-tail-sv-close {
  width: 44px !important; height: 44px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(239, 68, 68, .92) !important; color: #fff !important; font-size: 26px !important;
  font-weight: 700 !important; display: flex !important; align-items: center !important;
  justify-content: center !important; cursor: pointer !important; box-shadow: 0 4px 14px rgba(0,0,0,.4);
}
#eight-tail-sv-apps {
  position: absolute !important; top: max(56px, calc(env(safe-area-inset-top) + 48px)) !important;
  left: 10px !important; right: 10px !important; z-index: 25 !important;
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
.etc-sv-app[data-app="bilibili"] .emoji { background: linear-gradient(160deg, #ff8fab, #fb7299); }
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
.etc-sv-rail-btn {
  width: 52px !important; min-height: 52px !important; border: 0 !important; border-radius: 50% !important;
  background: rgba(0,0,0,.45) !important; color: #fff !important; display: flex !important;
  flex-direction: column !important; align-items: center !important; justify-content: center !important;
  gap: 2px !important; font-size: 11px !important; cursor: pointer !important; padding: 6px 0 !important;
  backdrop-filter: blur(6px);
}
.etc-sv-rail-btn .ico { font-size: 20px; line-height: 1; }
.etc-sv-rail-btn.is-on { color: #ff4d6d; }
#eight-tail-sv-next {
  background: linear-gradient(145deg, #5b8def, #3d6fd8) !important;
  width: 56px !important; min-height: 56px !important; font-weight: 800 !important;
}
#eight-tail-sv-meta {
  position: absolute; left: 14px; right: 78px;
  bottom: max(72px, calc(12% + env(safe-area-inset-bottom)));
  z-index: 10; pointer-events: none !important; text-shadow: 0 1px 4px rgba(0,0,0,.75);
}
#eight-tail-sv-author { font-weight: 700; font-size: 15px; margin-bottom: 6px; }
#eight-tail-sv-title { font-size: 13px; opacity: .92; line-height: 1.4; }
#eight-tail-sv-status-bar {
  position: absolute !important; left: 12px !important; right: 12px !important;
  bottom: max(12px, env(safe-area-inset-bottom)) !important; z-index: 11 !important;
  font-size: 11px !important; opacity: .7 !important; pointer-events: none !important;
  text-align: center !important;
}
/* 彻底隐藏旧换源面板 */
#video-source-panel, #eight-tail-sv-panel, #eight-tail-sv-gear { display: none !important; }
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
  if (root && root.dataset.svVersion === '8') {
    svForceRootCss(root);
    return root;
  }
  if (root) {
    try { root.remove(); } catch (_) {}
  }

  root = document.createElement('div');
  root.id = SV_ROOT_ID;
  root.dataset.svVersion = '8';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '短视频流');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="eight-tail-sv-toolbar">',
    '  <button type="button" id="eight-tail-sv-close" title="关闭" aria-label="关闭">×</button>',
    '</div>',
    '<div id="eight-tail-sv-apps" role="toolbar" aria-label="应用入口">',
    '  <button type="button" class="etc-sv-app" data-app="bilibili"><span class="emoji">📺</span><span class="name">B站</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="youtube"><span class="emoji">▶</span><span class="name">YouTube</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="pornhub"><span class="emoji">🔥</span><span class="name">Pornhub</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="douyin" data-action="external" data-scheme="snssdk1128://feed" data-web="https://www.douyin.com/"><span class="emoji">🎵</span><span class="name">抖音</span></button>',
    '  <button type="button" class="etc-sv-app" data-app="xiaohongshu" data-action="external" data-scheme="xhsdiscover://home" data-web="https://www.xiaohongshu.com/explore"><span class="emoji">📕</span><span class="name">小红书</span></button>',
    '</div>',
    '<div id="eight-tail-sv-stage">',
    '  <video id="eight-tail-sv-video" muted autoplay loop playsinline webkit-playsinline preload="auto"></video>',
    '  <iframe id="eight-tail-sv-embed" title="内嵌播放器" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen scrolling="no" referrerpolicy="no-referrer-when-downgrade"></iframe>',
    '  <div id="eight-tail-sv-hint">暂停</div>',
    '  <div id="eight-tail-sv-rail">',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-like"><span class="ico">♡</span><span class="n">赞</span></button>',
    '    <button type="button" class="etc-sv-rail-btn" id="eight-tail-sv-mute"><span class="ico">🔇</span><span class="n">静音</span></button>',
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
    hint: root.querySelector('#eight-tail-sv-hint'),
    like: root.querySelector('#eight-tail-sv-like'),
    mute: root.querySelector('#eight-tail-sv-mute'),
    next: root.querySelector('#eight-tail-sv-next'),
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

function svUpdateChrome() {
  const item = svCurrent();
  const els = svEls();
  if (!els.root) return;

  if (svState.mode === 'youtube') {
    const pl = SV_YT_PLAYLISTS[svState.ytListIndex] || SV_YT_PLAYLISTS[0];
    if (els.author) els.author.textContent = '@YouTube';
    if (els.title) els.title.textContent = (pl && pl.title ? pl.title : 'Shorts 流') +
      (pl && pl.id ? ' · ' + pl.id.slice(0, 10) + '…' : '');
  } else if (svState.mode === 'pornhub') {
    if (els.author) els.author.textContent = '@Pornhub';
    if (els.title) {
      els.title.textContent = '热门流 · ' + (svState.phIndex + 1) + '/' +
        Math.max(1, (svState.phKeys || []).length) +
        (svState.embedId ? ' · ' + svState.embedId : '');
    }
  } else if (svState.mode === 'bilibili') {
    if (els.author) els.author.textContent = '@B站';
    if (els.title) els.title.textContent = svState.embedId ? ('B站视频 · ' + svState.embedId) : 'B站视频';
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
    if (n) {
      n.textContent = svState.mode === 'youtube' ? '换列表' :
        (svState.mode === 'pornhub' ? '下一条' : '下一条');
    }
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
    els.root.classList.remove('mode-embed', 'mode-bilibili', 'mode-youtube', 'mode-pornhub');
  }
}

function svPauseNativeVideo() {
  const els = svEls();
  if (!els.video) return;
  try { els.video.pause(); } catch (_) {}
  try { els.video.removeAttribute('src'); els.video.load(); } catch (_) {}
  els.video.style.display = 'none';
}

function svSetEmbedSrc(url, platform, id) {
  const els = svEls();
  const root = els.root;
  if (!els.embed || !root) return false;
  svPauseNativeVideo();
  try { els.embed.src = 'about:blank'; } catch (_) {}

  svState.mode = platform;
  svState.embedId = String(id || '').trim();
  svState.lastEmbed = { mode: platform, id: svState.embedId };
  svWriteMode(platform);
  if (platform === 'bilibili') svWriteEmbedId(svState.embedId);

  root.classList.remove('mode-bilibili', 'mode-youtube', 'mode-pornhub');
  root.classList.add('mode-embed', 'mode-' + platform);
  els.embed.style.display = 'block';
  els.embed.style.width = '100%';
  els.embed.style.height = '100%';
  els.embed.style.border = 'none';
  els.embed.title = svPlatformLabel(platform) + ' 播放器';
  els.embed.src = url;
  svUpdateChrome();
  return true;
}

function svSwitchToNativeMode() {
  svState.mode = 'native';
  svWriteMode('native');
  svClearEmbedFrame();
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
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
}

function svTryPlay(v) {
  if (!v) return;
  v.muted = true;
  svState.muted = true;
  const p = v.play();
  if (p && typeof p.catch === 'function') {
    p.catch(function () { svSetStatus('点屏幕播放'); });
  }
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

/* —— YouTube 自动刷流 —— */

function svLoadYoutubePlaylist(listIndex, opts) {
  opts = opts || {};
  const list = SV_YT_PLAYLISTS;
  if (!list.length) return false;
  let idx = typeof listIndex === 'number' ? listIndex : svState.ytListIndex;
  idx = ((idx % list.length) + list.length) % list.length;
  svState.ytListIndex = idx;
  const pl = list[idx];
  try { localStorage.setItem(SV_YT_LIST_LS_KEY, pl.id); } catch (_) {}
  svMarkAppActive('youtube');
  svSetEmbedSrc(svYoutubePlaylistUrl(pl.id), 'youtube', pl.id);
  svShowHint(opts.hint || 'YouTube 短视频流');
  svSetStatus('YouTube · ' + pl.title + ' · 点「换列表」或上滑切换');
  return true;
}

function svOpenYoutubeFeed() {
  let start = 0;
  try {
    const saved = localStorage.getItem(SV_YT_LIST_LS_KEY);
    if (saved) {
      const i = SV_YT_PLAYLISTS.findIndex(function (p) { return p.id === saved; });
      if (i >= 0) start = i;
    }
  } catch (_) {}
  svLoadYoutubePlaylist(start);
}

function svNextYoutubePlaylist() {
  let next = svState.ytListIndex + 1;
  if (Math.random() > 0.55) {
    next = Math.floor(Math.random() * SV_YT_PLAYLISTS.length);
  }
  if (next === svState.ytListIndex && SV_YT_PLAYLISTS.length > 1) {
    next = (svState.ytListIndex + 1) % SV_YT_PLAYLISTS.length;
  }
  svLoadYoutubePlaylist(next, { hint: '换一个列表' });
}

/* —— Pornhub 自动刷流 —— */

function svExtractPhKeysFromJson(data) {
  const keys = [];
  const seen = Object.create(null);
  function push(k) {
    const id = String(k || '').trim();
    if (!id || seen[id]) return;
    seen[id] = 1;
    keys.push(id);
  }
  let videos = [];
  if (!data) return keys;
  if (Array.isArray(data)) videos = data;
  else if (Array.isArray(data.videos)) videos = data.videos;
  else if (data.videos && Array.isArray(data.videos.video)) videos = data.videos.video;
  else if (Array.isArray(data.data)) videos = data.data;

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i] || {};
    if (v.video_id) push(v.video_id);
    if (v.vkey) push(v.vkey);
    if (v.viewkey) push(v.viewkey);
    if (v.url) {
      const m = String(v.url).match(/[?&]viewkey=([^&#]+)/i);
      if (m) push(decodeURIComponent(m[1]));
    }
  }
  return keys;
}

async function svFetchPornhubKeys() {
  const urls = [
    SV_PH_API,
    'https://www.pornhub.com/webmasters/search?ordering=mostviewed&period=monthly',
    'https://www.pornhub.com/webmasters/search?category=video&ordering=newest',
  ];
  for (let u = 0; u < urls.length; u++) {
    try {
      const res = await fetch(urls[u], {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
      });
      if (!res.ok) continue;
      const data = await res.json();
      const keys = svExtractPhKeysFromJson(data);
      if (keys.length) return keys;
    } catch (_) {}
  }
  console.warn('[EightTailCat] Pornhub API 受跨域限制，使用内置热门兜底');
  return SV_PH_FALLBACK_KEYS.slice();
}

function svPlayPornhubAt(index) {
  const keys = svState.phKeys || [];
  if (!keys.length) {
    svState.phKeys = SV_PH_FALLBACK_KEYS.slice();
  }
  const list = svState.phKeys;
  const i = ((index % list.length) + list.length) % list.length;
  svState.phIndex = i;
  const key = list[i];
  svMarkAppActive('pornhub');
  svSetEmbedSrc(svPornhubEmbedUrl(key), 'pornhub', key);
  svShowHint('Pornhub ' + (i + 1) + '/' + list.length);
  svSetStatus('Pornhub · 上下滑或点「下一条」切片');
}

async function svOpenPornhubFeed() {
  if (svState.phLoading) {
    svShowHint('加载中…');
    return;
  }
  svState.phLoading = true;
  svMarkAppActive('pornhub');
  svShowHint('拉取热门…');
  svSetStatus('正在请求 Pornhub 公开接口…');
  try {
    const keys = await svFetchPornhubKeys();
    svState.phKeys = keys.length ? keys : SV_PH_FALLBACK_KEYS.slice();
    svState.phIndex = 0;
    svPlayPornhubAt(0);
  } finally {
    svState.phLoading = false;
  }
}

function svNextPornhub(delta) {
  const d = delta == null ? 1 : delta;
  svPlayPornhubAt(svState.phIndex + d);
}

/* —— B站轻量入口 —— */

function svOpenBilibiliEntry() {
  const saved = svGetSavedBilibiliId();
  if (saved) {
    svMarkAppActive('bilibili');
    svSetEmbedSrc(svBilibiliEmbedUrl(saved), 'bilibili', saved);
    svShowHint('B站播放');
    svSetStatus('B站 · ' + saved + ' · 长按 B站图标可更换 BV');
    return;
  }
  const input = window.prompt('请输入 B 站视频链接或 BV 号（如 BV1xx411c7mD）', '');
  if (!input) return;
  const bv = svExtractBvId(input);
  if (!bv || svIsDeadBvid(bv)) {
    svShowHint('未识别有效 BV');
    return;
  }
  svWriteEmbedId(bv);
  svMarkAppActive('bilibili');
  svSetEmbedSrc(svBilibiliEmbedUrl(bv), 'bilibili', bv);
  svShowHint('B站播放');
  svSetStatus('B站 · ' + bv);
}

function svClearOrChangeBilibili() {
  svWriteEmbedId('');
  try { localStorage.removeItem(SV_BV_LS_KEY_LEGACY); } catch (_) {}
  if (svState.mode === 'bilibili') {
    svSwitchToNativeMode();
    svPlayCurrent();
  }
  const input = window.prompt('清空完成。请输入新的 B 站链接或 BV 号：', '');
  if (!input) return;
  const bv = svExtractBvId(input);
  if (!bv || svIsDeadBvid(bv)) {
    svShowHint('未识别有效 BV');
    return;
  }
  svWriteEmbedId(bv);
  svMarkAppActive('bilibili');
  svSetEmbedSrc(svBilibiliEmbedUrl(bv), 'bilibili', bv);
}

/* —— 外链 App —— */

function svLaunchExternalApp(opts) {
  opts = opts || {};
  const scheme = String(opts.scheme || '').trim();
  const web = String(opts.web || '').trim();
  const name = String(opts.name || '应用');
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
  svShowHint('正在打开 ' + name);
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
  if (app === 'bilibili') {
    svOpenBilibiliEntry();
    return;
  }
  if (app === 'youtube') {
    svOpenYoutubeFeed();
    return;
  }
  if (app === 'pornhub') {
    svOpenPornhubFeed();
  }
}

/* —— 下一条 / 滑动 —— */

function svGo(delta) {
  if (svState.mode === 'youtube') {
    if (delta > 0) svNextYoutubePlaylist();
    else svLoadYoutubePlaylist(svState.ytListIndex - 1, { hint: '上一个列表' });
    return;
  }
  if (svState.mode === 'pornhub') {
    svNextPornhub(delta > 0 ? 1 : -1);
    return;
  }
  if (svState.mode === 'bilibili') {
    svShowHint('B站请点图标更换 BV');
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
    svNextYoutubePlaylist();
    return;
  }
  if (svState.mode === 'pornhub') {
    svNextPornhub(1);
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
  svShowHint(svState.muted ? '已静音' : '已开声音');
}

function svTogglePlay() {
  if (svIsEmbedMode(svState.mode)) {
    svShowHint('请点播放器控制');
    return;
  }
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
    el.closest('button') ||
    el.closest('input') ||
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
  if (els.apps) {
    els.apps.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('.etc-sv-app') : null;
      if (!btn) return;
      e.preventDefault();
      stopBubble(e);
      /* 长按 B站 = 更换 BV：用 double-tap 时间差简化，改用 data：按住 0.7s */
      svOnAppDockClick(btn);
    });
    /* B站长按更换 */
    let biliHold = null;
    els.apps.addEventListener('pointerdown', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('.etc-sv-app[data-app="bilibili"]') : null;
      if (!btn) return;
      biliHold = setTimeout(function () {
        biliHold = null;
        svClearOrChangeBilibili();
      }, 700);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      els.apps.addEventListener(ev, function () {
        if (biliHold) { clearTimeout(biliHold); biliHold = null; }
      });
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
      if (svIsEmbedMode(svState.mode)) return;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      e.stopPropagation();
      svTogglePlay();
    });

    stage.addEventListener('wheel', function (e) {
      if (!svState.open) return;
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
  svPurgeDeadBvidStorage();
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
    if (savedMode === 'pornhub') {
      svOpenPornhubFeed();
      return;
    }
    if (savedMode === 'bilibili') {
      const bv = svGetSavedBilibiliId();
      if (bv) {
        svMarkAppActive('bilibili');
        svSetEmbedSrc(svBilibiliEmbedUrl(bv), 'bilibili', bv);
        return;
      }
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
  if (svIsEmbedMode(svState.mode) && svState.embedId) {
    svState.lastEmbed = { mode: svState.mode, id: svState.embedId };
    if (svState.mode === 'bilibili') svWriteEmbedId(svState.embedId);
    svWriteMode(svState.mode);
  }
  svClearEmbedFrame();
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
  window.__etcPlayPornhub = svOpenPornhubFeed;
} catch (_) {}
