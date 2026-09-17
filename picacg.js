/**
 * 八条猫 · PicACG（哔咔漫画）独立阅读模块
 * - 登录 / Token 本地保存
 * - HMAC-SHA256 签名 + CORS 代理
 * - 搜索 / 热门 / 章节 / 条漫瀑布流阅读器
 */

const PICA_ROOT_ID = 'picacg-main-container';
const PICA_STYLE_ID = 'eight-tail-picacg-style-v5';
const PICA_TOKEN_LS = 'picacg_user_token';
const PICA_API_BASE = 'https://picaapi.picacomic.com/';
/* 通用逆向静态密钥（开源客户端通用） */
const PICA_API_KEY = 'C69BAF41DA5ABD1FFEDC6D2FEA56B';
const PICA_SECRET = '~d}$Q7$eIni=V)9\\RK/P.RM4;9[7|@/CA}b~OW!3?EV`:<>M7pddUBL5n|0/*Cn';

let picaState = {
  open: false,
  view: 'login', /* login | browse | detail | reader */
  token: '',
  loading: false,
  comics: [],
  detail: null,
  eps: [],
  bookId: '',
  epOrder: 1,
  epTitle: '',
  pages: [],
  chromeVisible: true,
  keyword: '',
};

function picaGetToken() {
  try {
    return String(localStorage.getItem(PICA_TOKEN_LS) || '').trim();
  } catch (_) {
    return '';
  }
}

function picaSaveToken(token) {
  const t = String(token || '').trim();
  if (!t) return false;
  try {
    localStorage.setItem(PICA_TOKEN_LS, t);
    picaState.token = t;
    return true;
  } catch (_) {
    return false;
  }
}

function picaClearToken() {
  try { localStorage.removeItem(PICA_TOKEN_LS); } catch (_) {}
  picaState.token = '';
}

function picaNonce() {
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  } catch (_) {
    return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 32);
  }
}

async function picaHmacSha256Hex(secret, message) {
  if (window.crypto && window.crypto.subtle) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig), function (b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }
  /* 无 SubtleCrypto 时动态加载 CryptoJS */
  await picaEnsureCryptoJs();
  return window.CryptoJS.HmacSHA256(message, secret).toString(window.CryptoJS.enc.Hex);
}

function picaEnsureCryptoJs() {
  if (window.CryptoJS && window.CryptoJS.HmacSHA256) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js';
    s.onload = function () { resolve(); };
    s.onerror = function () { reject(new Error('CryptoJS 加载失败')); };
    document.head.appendChild(s);
  });
}

/**
 * 生成哔咔请求头（HMAC-SHA256）
 * @param {string} pathOrUrl 相对路径或完整 URL
 * @param {string} method GET/POST
 * @param {string} token authorization
 */
async function getPicacgHeaders(pathOrUrl, method, token) {
  const m = String(method || 'GET').toUpperCase();
  let path = String(pathOrUrl || '');
  if (path.indexOf(PICA_API_BASE) === 0) path = path.slice(PICA_API_BASE.length);
  path = path.replace(/^\//, '');
  /* 签名只用 path?query，不含 host */
  const pathForSign = path.split('#')[0];
  const time = Math.floor(Date.now() / 1000).toString();
  const nonce = picaNonce();
  const raw = (pathForSign + time + nonce + m + PICA_API_KEY).toLowerCase();
  const signature = await picaHmacSha256Hex(PICA_SECRET, raw);
  const headers = {
    'api-key': PICA_API_KEY,
    accept: 'application/vnd.picacomic.com.v1+json',
    'app-channel': '2',
    'app-version': '2.2.1.3.3.4',
    'app-uuid': 'defaultUuid',
    'app-platform': 'android',
    'app-build-version': '45',
    'User-Agent': 'okhttp/3.8.1',
    'image-quality': 'original',
    time: time,
    nonce: nonce,
    signature: signature,
    'Content-Type': 'application/json; charset=UTF-8',
  };
  const auth = String(token || picaState.token || picaGetToken() || '').trim();
  if (auth) headers.authorization = auth;
  return headers;
}

async function picaFetchJson(path, method, body) {
  const m = String(method || 'GET').toUpperCase();
  const rel = String(path || '').replace(/^\//, '');
  const targetUrl = PICA_API_BASE + rel;
  const headers = await getPicacgHeaders(rel, m, picaState.token || picaGetToken());
  const bodyStr = body != null ? JSON.stringify(body) : null;

  const attempts = [
    {
      name: 'corsproxy',
      run: async function () {
        const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(targetUrl), {
          method: m,
          headers: headers,
          body: bodyStr,
          credentials: 'omit',
          cache: 'no-store',
          mode: 'cors',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      },
    },
    {
      name: 'direct',
      run: async function () {
        const res = await fetch(targetUrl, {
          method: m,
          headers: headers,
          body: bodyStr,
          credentials: 'omit',
          cache: 'no-store',
          mode: 'cors',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      },
    },
  ];

  /* GET 才尝试 allorigins（无法可靠转发自定义头，仅作兜底） */
  if (m === 'GET') {
    attempts.push({
      name: 'allorigins',
      run: async function () {
        const res = await fetch(
          'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl),
          {
            method: 'GET',
            headers: headers,
            credentials: 'omit',
            cache: 'no-store',
            mode: 'cors',
          }
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      },
    });
  }

  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const data = await attempts[i].run();
      if (data && typeof data === 'object') return data;
    } catch (e) {
      lastErr = e;
      console.warn('[PicACG] 代理失败:', attempts[i].name, e);
    }
  }
  throw lastErr || new Error('全部代理失败');
}

function picaFileUrl(file) {
  if (!file) return '';
  if (typeof file === 'string') return file;
  const path = String(file.path || (file.media && file.media.path) || '').replace(/^\//, '');
  let server = String(
    file.fileServer ||
    (file.media && file.media.fileServer) ||
    'https://storage1.picacomic.com'
  ).replace(/\/$/, '');
  if (!path) return '';
  if (/\/static$/i.test(server)) return server + '/' + path;
  if (path.indexOf('static/') === 0) return server + '/' + path;
  return server + '/static/' + path;
}

function picaEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function picaGetRoot() {
  return document.getElementById(PICA_ROOT_ID) ||
    document.getElementById('picacg-modal-container') ||
    document.getElementById('eight-tail-picacg-root');
}

function picaHideVideoLayer() {
  try {
    if (typeof window.hideVideoAppForPicacg === 'function') {
      window.hideVideoAppForPicacg();
      return;
    }
  } catch (_) {}
  try {
    if (typeof window.pauseMuteShortVideoPlayer === 'function') {
      window.pauseMuteShortVideoPlayer();
    }
  } catch (_) {}
  try {
    const videoRoot = document.getElementById('video-app-container') ||
      document.getElementById('eight-tail-short-video-root');
    if (!videoRoot) return;
    videoRoot.classList.add('picacg-hidden');
    videoRoot.style.setProperty('display', 'none', 'important');
    videoRoot.style.setProperty('pointer-events', 'none', 'important');
    const video = videoRoot.querySelector('#eight-tail-sv-video');
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.muted = true; } catch (_) {}
      try { video.removeAttribute('src'); video.load(); } catch (_) {}
    }
    const embed = videoRoot.querySelector('#eight-tail-sv-embed');
    if (embed) {
      try { embed.src = 'about:blank'; } catch (_) {}
    }
  } catch (_) {}
}

function picaRestoreVideoLayer() {
  try {
    if (typeof window.showVideoAppAfterPicacg === 'function') {
      window.showVideoAppAfterPicacg();
      return;
    }
  } catch (_) {}
  try {
    const videoRoot = document.getElementById('video-app-container') ||
      document.getElementById('eight-tail-short-video-root');
    if (!videoRoot) return;
    videoRoot.classList.remove('picacg-hidden');
    if (videoRoot.classList.contains('is-open')) {
      videoRoot.style.setProperty('display', 'flex', 'important');
      videoRoot.style.setProperty('pointer-events', 'auto', 'important');
      videoRoot.style.setProperty('visibility', 'visible', 'important');
      videoRoot.style.setProperty('z-index', '100002', 'important');
    }
  } catch (_) {}
}

function picaEnsureStyle() {
  let style = document.getElementById(PICA_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = PICA_STYLE_ID;
    document.head.appendChild(style);
  }
  ['eight-tail-picacg-style-v1', 'eight-tail-picacg-style-v2', 'eight-tail-picacg-style-v3', 'eight-tail-picacg-style-v4'].forEach(function (id) {
    try {
      const n = document.getElementById(id);
      if (n) n.remove();
    } catch (_) {}
  });
  style.textContent = `
#picacg-main-container,
#picacg-modal-container,
#eight-tail-picacg-root {
  position: fixed !important;
  inset: 0 !important;
  z-index: 100050 !important;
  display: none !important;
  flex-direction: column !important;
  background: #0a0a0a !important;
  color: #ffe8f2 !important;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
  box-sizing: border-box !important;
}
#picacg-main-container,
#picacg-main-container *,
#picacg-modal-container,
#picacg-modal-container *,
#eight-tail-picacg-root,
#eight-tail-picacg-root * {
  box-sizing: border-box;
  pointer-events: auto !important;
}
#picacg-main-container.is-open,
#picacg-modal-container.is-open,
#eight-tail-picacg-root.is-open { display: flex !important; }

.picacg-top-bar,
.picacg-header,
#pica-topbar {
  position: relative !important;
  z-index: 100055 !important;
  flex: 0 0 auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px !important;
  background: #141014 !important;
  border-bottom: 1px solid rgba(255,120,180,.22) !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
}
.picacg-top-bar .pica-title,
.picacg-header .pica-title,
#pica-topbar .pica-title {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  font-size: 15px !important;
  font-weight: 800 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  pointer-events: none !important;
}
.picacg-top-actions {
  display: flex !important;
  flex: 0 0 auto !important;
  gap: 8px !important;
  align-items: center !important;
  position: relative !important;
  z-index: 100056 !important;
  pointer-events: auto !important;
}
.picacg-top-bar button,
.picacg-header button,
.picacg-top-bar .action-btn,
#pica-topbar button,
.picacg-top-actions button {
  position: relative !important;
  z-index: 100056 !important;
  flex: 0 0 auto !important;
  min-width: 44px !important;
  height: 44px !important;
  border: 0 !important;
  border-radius: 12px !important;
  padding: 0 12px !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  background: rgba(255,255,255,.14) !important;
  color: #fff !important;
  cursor: pointer !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
  -webkit-tap-highlight-color: transparent !important;
}
#picacg-auth-btn,
#pica-btn-account {
  cursor: pointer !important;
  pointer-events: auto !important;
  position: relative !important;
  z-index: 100030 !important;
  background: linear-gradient(135deg, #f5c542, #e6a817) !important;
  color: #2a1a00 !important;
  box-shadow: 0 2px 10px rgba(245, 197, 66, 0.35) !important;
}
#picacg-auth-modal {
  pointer-events: auto !important;
  z-index: 999999 !important;
}
#picacg-auth-modal * {
  pointer-events: auto !important;
}
.picacg-top-bar button.primary,
#pica-topbar button.primary,
.picacg-top-actions button.primary {
  background: linear-gradient(135deg, #ff6b9d, #e91e63) !important;
  color: #fff !important;
}
#pica-body {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  position: relative !important;
  z-index: 1 !important;
  background: #0a0a0a !important;
}
.pica-panel {
  position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 14px 14px 28px; display: none; z-index: 1;
  background: #0a0a0a;
}
.pica-panel.is-on { display: block; }
.pica-login-overlay {
  display: none !important;
  position: absolute !important;
  inset: 0 !important;
  z-index: 100060 !important;
  background: rgba(0, 0, 0, 0.82) !important;
  align-items: flex-start !important;
  justify-content: center !important;
  padding: 64px 14px 24px !important;
  overflow-y: auto !important;
  pointer-events: auto !important;
  -webkit-overflow-scrolling: touch !important;
}
.pica-login-overlay.is-open {
  display: flex !important;
}
.pica-login-sheet {
  width: min(420px, 100%) !important;
  margin: 0 auto !important;
  background: #1a1018 !important;
  border: 1px solid rgba(255,140,180,.35) !important;
  border-radius: 18px !important;
  padding: 16px !important;
  box-shadow: 0 18px 40px rgba(0,0,0,.7) !important;
  pointer-events: auto !important;
  position: relative !important;
  z-index: 100061 !important;
}
.pica-login-sheet h4 { margin: 0 0 10px; font-size: 15px; }
.pica-card {
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,140,180,.18);
  border-radius: 16px; padding: 14px; margin-bottom: 12px;
}
.pica-card h4 { margin: 0 0 8px; font-size: 14px; }
.pica-hint { font-size: 12px; opacity: .72; line-height: 1.55; margin: 8px 0 0; }
.pica-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.pica-field span { font-size: 12px; opacity: .8; }
.pica-field input, .pica-search-row input {
  width: 100%; border: 1px solid rgba(255,255,255,.2); border-radius: 12px;
  background: rgba(255,255,255,.1); color: #fff; padding: 11px 12px; font-size: 14px;
  outline: none; pointer-events: auto !important; touch-action: manipulation !important;
  -webkit-user-select: text !important; user-select: text !important;
}
.pica-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.pica-actions button, .pica-search-row button, .pica-tabs button {
  border: 0; border-radius: 12px; padding: 10px 14px; font-size: 13px; font-weight: 800;
  cursor: pointer; color: #fff; background: rgba(255,255,255,.14);
  pointer-events: auto !important; touch-action: manipulation !important;
}
.pica-actions button.primary, .pica-search-row button.primary { background: linear-gradient(135deg, #ff6b9d, #e91e63); }
.pica-search-row { display: flex; gap: 8px; margin-bottom: 10px; }
.pica-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.pica-tabs button.is-on { outline: 2px solid rgba(255,255,255,.85); background: rgba(233,30,99,.45); }
.pica-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
}
@media (min-width: 720px) { .pica-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.pica-comic {
  border: 0; border-radius: 14px; overflow: hidden; padding: 0; text-align: left;
  background: rgba(255,255,255,.08); color: #fff; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
}
.pica-comic:active { transform: scale(0.98); }
.pica-comic-cover {
  width: 100%; aspect-ratio: 3/4; background: #1a0a12; overflow: hidden;
}
.pica-comic-cover img {
  width: 100%; height: 100%; object-fit: cover; display: block; border: 0;
}
.pica-comic-meta { padding: 8px 9px 10px; }
.pica-comic-meta .t {
  font-size: 12px; font-weight: 700; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.pica-comic-meta .s { font-size: 10px; opacity: .55; margin-top: 4px; }
.pica-status {
  margin: 8px 0 12px; font-size: 12px; opacity: .75; min-height: 1.2em;
}
.pica-detail-head {
  display: flex; gap: 12px; margin-bottom: 14px;
}
.pica-detail-cover {
  width: 110px; flex: 0 0 auto; border-radius: 12px; overflow: hidden;
  aspect-ratio: 3/4; background: #1a0a12;
}
.pica-detail-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pica-detail-info { flex: 1; min-width: 0; }
.pica-detail-info h3 { margin: 0 0 6px; font-size: 16px; line-height: 1.35; }
.pica-detail-info p { margin: 0; font-size: 12px; opacity: .7; line-height: 1.5; }
.pica-ep-list { display: flex; flex-direction: column; gap: 8px; }
.pica-ep-btn {
  border: 0; border-radius: 12px; padding: 12px 14px; text-align: left;
  background: rgba(255,255,255,.1); color: #fff; font-size: 13px; font-weight: 700;
  cursor: pointer;
}
.pica-reader {
  position: absolute; inset: 0; display: none; flex-direction: column;
  background: #000; overflow: hidden; z-index: 2;
}
.pica-reader.is-on { display: flex; }
.pica-reader-chrome {
  position: absolute; left: 0; right: 0; top: 0; z-index: 8;
  display: flex; align-items: center; gap: 8px;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,.75), transparent);
  transition: opacity .2s, transform .2s;
}
.pica-reader-chrome.is-hide { opacity: 0; pointer-events: none; transform: translateY(-8px); }
.pica-reader-chrome .pica-title { flex: 1; font-size: 13px; font-weight: 700; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pica-reader-chrome button {
  border: 0; border-radius: 12px; padding: 8px 12px; font-size: 13px; font-weight: 700;
  background: rgba(255,255,255,.18); color: #fff; cursor: pointer;
}
.pica-reader-progress {
  position: absolute; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 8; height: 4px; border-radius: 999px; background: rgba(255,255,255,.18);
  overflow: hidden; transition: opacity .2s;
}
.pica-reader-progress.is-hide { opacity: 0; pointer-events: none; }
.pica-reader-progress > i {
  display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #ff6b9d, #e91e63);
}
.pica-reader-stream {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  display: flex; flex-direction: column; align-items: stretch;
  touch-action: pan-y; background: #000;
}
.pica-reader-stream img {
  width: 100%; height: auto; display: block; background: #111; border: 0;
}
.pica-reader-tapzone {
  position: absolute; left: 22%; right: 22%; top: 18%; bottom: 18%; z-index: 4;
  background: transparent;
}
`;
}

function picaBuildDom() {
  picaEnsureStyle();
  let root = picaGetRoot();
  if (root && root.dataset.picaVersion === '5' && root.id === PICA_ROOT_ID) return root;
  if (root) {
    try { root.remove(); } catch (_) {}
  }
  /* 清理旧 id 节点 */
  ['picacg-modal-container', 'eight-tail-picacg-root'].forEach(function (id) {
    try {
      const legacy = document.getElementById(id);
      if (legacy) legacy.remove();
    } catch (_) {}
  });
  root = document.createElement('div');
  root.id = PICA_ROOT_ID;
  root.dataset.picaVersion = '5';
  root.className = 'picacg-main-container';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'PicACG 哔咔漫画');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="pica-topbar" class="picacg-top-bar picacg-header">',
    '  <button type="button" id="pica-btn-back" class="action-btn" title="返回" aria-label="返回">←</button>',
    '  <div class="pica-title" id="pica-heading">PicACG 哔咔</div>',
    '  <div class="picacg-top-actions">',
    '    <button type="button" id="picacg-auth-btn" class="action-btn" title="登录 / Token" aria-label="登录配置"',
    '      style="cursor:pointer;pointer-events:auto!important;position:relative;z-index:100030!important;"',
    '      onclick="window.showPicacgLoginModal(event)">🔑</button>',
    '    <button type="button" id="pica-btn-close" class="action-btn primary" title="关闭" aria-label="关闭"',
    '      onclick="return window.__picaCloseApp && window.__picaCloseApp(event)">✕</button>',
    '  </div>',
    '</div>',
    '<div id="pica-body">',
    '  <div class="pica-panel is-on" id="pica-panel-browse">',
    '    <div class="pica-search-row">',
    '      <input id="pica-search-input" type="search" enterkeyhint="search" placeholder="关键词搜索漫画…" />',
    '      <button type="button" class="primary" id="pica-btn-search">搜索</button>',
    '    </div>',
    '    <div class="pica-tabs" role="tablist">',
    '      <button type="button" data-tab="hot" class="is-on">每日推荐 / 热门</button>',
    '      <button type="button" data-tab="search">搜索结果</button>',
    '    </div>',
    '    <div class="pica-status" id="pica-browse-status">准备中…</div>',
    '    <div class="pica-grid" id="pica-comic-grid"></div>',
    '  </div>',
    '  <div class="pica-panel" id="pica-panel-detail">',
    '    <div class="pica-detail-head">',
    '      <div class="pica-detail-cover"><img id="pica-detail-cover" alt="" referrerpolicy="no-referrer" /></div>',
    '      <div class="pica-detail-info">',
    '        <h3 id="pica-detail-title">—</h3>',
    '        <p id="pica-detail-meta">—</p>',
    '      </div>',
    '    </div>',
    '    <div class="pica-status" id="pica-detail-status"></div>',
    '    <div class="pica-ep-list" id="pica-ep-list"></div>',
    '  </div>',
    '  <div class="pica-reader" id="pica-panel-reader">',
    '    <div class="pica-reader-chrome" id="pica-reader-chrome">',
    '      <button type="button" id="pica-reader-back">← 返回</button>',
    '      <div class="pica-title" id="pica-reader-title">阅读中</div>',
    '    </div>',
    '    <div class="pica-reader-tapzone" id="pica-reader-tap" title="点击显示/隐藏控件"></div>',
    '    <div class="pica-reader-stream" id="pica-reader-stream"></div>',
    '    <div class="pica-reader-progress" id="pica-reader-progress"><i id="pica-reader-bar"></i></div>',
    '  </div>',
    '  <div id="pica-login-overlay" class="pica-login-overlay" aria-label="PicACG 登录">',
    '    <div class="pica-login-sheet" role="dialog">',
    '      <h4>🔑 PicACG 登录 / Token</h4>',
    '      <div class="pica-field"><span>邮箱 / 账号</span><input id="pica-email" type="text" autocomplete="username" placeholder="邮箱或用户名" /></div>',
    '      <div class="pica-field"><span>密码</span><input id="pica-password" type="password" autocomplete="current-password" placeholder="密码" /></div>',
    '      <div class="pica-field"><span>或手动粘贴 Token</span><input id="pica-overlay-token" type="text" autocomplete="off" spellcheck="false" placeholder="粘贴已有 Token" /></div>',
    '      <div class="pica-actions">',
    '        <button type="button" class="primary" id="pica-btn-login">登录 / 保存</button>',
    '        <button type="button" id="pica-btn-test">测试连接</button>',
    '        <button type="button" id="pica-btn-clear">清除 Token</button>',
    '        <button type="button" id="pica-btn-login-dismiss">关闭</button>',
    '      </div>',
    '      <p class="pica-hint">Token 保存于本地浏览器，仅用于向哔咔接口请求章节与漫画切片。</p>',
    '      <p class="pica-status" id="pica-login-status"></p>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('');
  document.body.appendChild(root);
  picaBindUi(root);
  return root;
}

function picaEls(root) {
  root = root || picaGetRoot();
  if (!root) return {};
  return {
    root: root,
    heading: root.querySelector('#pica-heading'),
    back: root.querySelector('#pica-btn-back'),
    account: root.querySelector('#picacg-auth-btn') || root.querySelector('#pica-btn-account'),
    close: root.querySelector('#pica-btn-close'),
    topbar: root.querySelector('#pica-topbar'),
    loginOverlay: root.querySelector('#pica-login-overlay'),
    loginDismiss: root.querySelector('#pica-btn-login-dismiss'),
    panelBrowse: root.querySelector('#pica-panel-browse'),
    panelDetail: root.querySelector('#pica-panel-detail'),
    panelReader: root.querySelector('#pica-panel-reader'),
    email: root.querySelector('#pica-email'),
    password: root.querySelector('#pica-password'),
    tokenInput: root.querySelector('#pica-overlay-token') || root.querySelector('#pica-token-input'),
    btnLogin: root.querySelector('#pica-btn-login'),
    btnTest: root.querySelector('#pica-btn-test'),
    btnClear: root.querySelector('#pica-btn-clear'),
    loginStatus: root.querySelector('#pica-login-status'),
    searchInput: root.querySelector('#pica-search-input'),
    btnSearch: root.querySelector('#pica-btn-search'),
    browseStatus: root.querySelector('#pica-browse-status'),
    grid: root.querySelector('#pica-comic-grid'),
    detailCover: root.querySelector('#pica-detail-cover'),
    detailTitle: root.querySelector('#pica-detail-title'),
    detailMeta: root.querySelector('#pica-detail-meta'),
    detailStatus: root.querySelector('#pica-detail-status'),
    epList: root.querySelector('#pica-ep-list'),
    readerChrome: root.querySelector('#pica-reader-chrome'),
    readerBack: root.querySelector('#pica-reader-back'),
    readerTitle: root.querySelector('#pica-reader-title'),
    readerStream: root.querySelector('#pica-reader-stream'),
    readerProgress: root.querySelector('#pica-reader-progress'),
    readerBar: root.querySelector('#pica-reader-bar'),
    readerTap: root.querySelector('#pica-reader-tap'),
  };
}

function picaSetStatus(el, text) {
  if (el) el.textContent = text || '';
}

function picaShowToast(msg) {
  try {
    if (typeof window.showToast === 'function') {
      window.showToast(String(msg || ''), 1800);
      return;
    }
  } catch (_) {}
  const els = picaEls();
  if (els.browseStatus) picaSetStatus(els.browseStatus, msg);
  if (els.loginStatus) picaSetStatus(els.loginStatus, msg);
}

function picaShowLoginOverlay(on) {
  const els = picaEls();
  if (!els.loginOverlay) return;
  const show = !!on;
  els.loginOverlay.classList.toggle('is-open', show);
  if (show) {
    if (els.tokenInput) {
      try { els.tokenInput.value = picaGetToken(); } catch (_) {}
    }
    picaSetStatus(els.loginStatus, picaGetToken() ? '已保存 Token，可测试或重新登录' : '请登录或粘贴 Token');
    setTimeout(function () {
      try {
        const focusEl = (els.email && !els.email.value) ? els.email : els.tokenInput;
        if (focusEl) focusEl.focus();
      } catch (_) {}
    }, 40);
  }
}

function picaSetView(view) {
  if (view === 'login') {
    picaShowLoginOverlay(true);
    return;
  }
  picaState.view = view;
  const els = picaEls();
  if (!els.root) return;
  picaShowLoginOverlay(false);
  const map = {
    browse: els.panelBrowse,
    detail: els.panelDetail,
    reader: els.panelReader,
  };
  Object.keys(map).forEach(function (k) {
    const panel = map[k];
    if (!panel) return;
    if (k === 'reader') panel.classList.toggle('is-on', view === 'reader');
    else panel.classList.toggle('is-on', view === k);
  });
  const titles = {
    browse: 'PicACG 哔咔',
    detail: '漫画详情',
    reader: picaState.epTitle || '阅读器',
  };
  if (els.heading) els.heading.textContent = titles[view] || 'PicACG';
  if (els.back) els.back.style.visibility = view === 'browse' ? 'hidden' : 'visible';
  if (els.root) {
    els.root.classList.toggle('reader-mode', view === 'reader');
  }
}

function picaRenderComics(list) {
  const els = picaEls();
  if (!els.grid) return;
  els.grid.innerHTML = '';
  if (!list || !list.length) {
    els.grid.innerHTML = '<div style="grid-column:1/-1;opacity:.65;padding:24px;text-align:center;font-size:13px;">暂无结果</div>';
    return;
  }
  list.forEach(function (comic) {
    const id = comic._id || comic.id || '';
    const title = comic.title || '未命名';
    const author = (comic.author || (comic.chineseTeam) || '') + '';
    const cover = picaFileUrl(comic.thumb || comic.cover);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pica-comic';
    btn.dataset.id = id;
    btn.innerHTML =
      '<div class="pica-comic-cover"><img alt="" loading="lazy" referrerpolicy="no-referrer" src="' +
      picaEsc(cover) + '" /></div>' +
      '<div class="pica-comic-meta"><div class="t">' + picaEsc(title) + '</div>' +
      '<div class="s">' + picaEsc(author || '哔咔') + '</div></div>';
    els.grid.appendChild(btn);
  });
}

function picaNormalizeComics(data) {
  const docs =
    (data && data.data && data.data.comics && data.data.comics.docs) ||
    (data && data.data && data.data.comics) ||
    (data && data.comics && data.comics.docs) ||
    [];
  return Array.isArray(docs) ? docs : [];
}

async function picaLogin(email, password) {
  const data = await picaFetchJson('auth/sign-in', 'POST', {
    email: String(email || '').trim(),
    password: String(password || ''),
  });
  const token = (data && data.data && data.data.token) || (data && data.token) || '';
  if (!token) {
    const msg = (data && (data.message || data.msg)) || '登录失败：未返回 token';
    throw new Error(msg);
  }
  picaSaveToken(token);
  return token;
}

async function picaTestConnection() {
  const token = picaState.token || picaGetToken();
  if (!token) throw new Error('尚未保存 Token');
  picaState.token = token;
  const data = await picaFetchJson('users/profile', 'GET');
  if (data && (data.code === 200 || data.data)) return data;
  throw new Error((data && data.message) || '测试失败');
}

async function picaLoadHot() {
  const els = picaEls();
  picaSetStatus(els.browseStatus, '加载热门 / 推荐…');
  try {
    let data = null;
    try {
      data = await picaFetchJson('comics?page=1&s=dd', 'GET');
    } catch (_) {
      data = await picaFetchJson('comics/random', 'GET');
    }
    const list = picaNormalizeComics(data);
    if (!list.length && data && data.data && Array.isArray(data.data.comics)) {
      picaState.comics = data.data.comics;
    } else {
      picaState.comics = list;
    }
    picaRenderComics(picaState.comics);
    picaSetStatus(els.browseStatus, '热门 · ' + picaState.comics.length + ' 部');
  } catch (e) {
    picaSetStatus(els.browseStatus, '加载失败：' + (e && e.message ? e.message : e));
    picaRenderComics([]);
  }
}

async function picaSearch(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) {
    picaShowToast('请输入关键词');
    return;
  }
  picaState.keyword = kw;
  const els = picaEls();
  picaSetStatus(els.browseStatus, '搜索中：' + kw);
  try {
    const data = await picaFetchJson(
      'comics/search?page=1&q=' + encodeURIComponent(kw),
      'GET'
    );
    picaState.comics = picaNormalizeComics(data);
    picaRenderComics(picaState.comics);
    picaSetStatus(els.browseStatus, '搜索「' + kw + '」· ' + picaState.comics.length + ' 部');
    const tabs = els.root && els.root.querySelectorAll('.pica-tabs button');
    if (tabs) {
      for (let i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-tab') === 'search');
      }
    }
  } catch (e) {
    picaSetStatus(els.browseStatus, '搜索失败：' + (e && e.message ? e.message : e));
  }
}

async function picaOpenDetail(bookId) {
  const id = String(bookId || '').trim();
  if (!id) return;
  picaState.bookId = id;
  picaSetView('detail');
  const els = picaEls();
  picaSetStatus(els.detailStatus, '加载详情…');
  if (els.epList) els.epList.innerHTML = '';
  try {
    const detailRes = await picaFetchJson('comics/' + encodeURIComponent(id), 'GET');
    const comic = (detailRes && detailRes.data && detailRes.data.comic) || detailRes.data || {};
    picaState.detail = comic;
    if (els.detailTitle) els.detailTitle.textContent = comic.title || '未命名';
    if (els.detailMeta) {
      els.detailMeta.textContent =
        (comic.author ? '作者：' + comic.author + ' · ' : '') +
        (comic.chineseTeam ? comic.chineseTeam + ' · ' : '') +
        (comic.pagesCount != null ? comic.pagesCount + ' 页 · ' : '') +
        (comic.epsCount != null ? comic.epsCount + ' 话' : '');
    }
    if (els.detailCover) {
      els.detailCover.src = picaFileUrl(comic.thumb);
      els.detailCover.setAttribute('referrerpolicy', 'no-referrer');
    }
    if (els.heading) els.heading.textContent = comic.title || '漫画详情';

    const epsRes = await picaFetchJson('comics/' + encodeURIComponent(id) + '/eps?page=1', 'GET');
    const docs =
      (epsRes && epsRes.data && epsRes.data.eps && epsRes.data.eps.docs) ||
      (epsRes && epsRes.data && epsRes.data.eps) ||
      [];
    picaState.eps = Array.isArray(docs) ? docs : [];
    if (els.epList) {
      els.epList.innerHTML = '';
      picaState.eps.forEach(function (ep) {
        const order = ep.order != null ? ep.order : ep.ep;
        const title = ep.title || ('第 ' + order + ' 话');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pica-ep-btn';
        btn.dataset.order = String(order);
        btn.textContent = title;
        els.epList.appendChild(btn);
      });
    }
    picaSetStatus(els.detailStatus, picaState.eps.length ? ('共 ' + picaState.eps.length + ' 话') : '暂无章节');
  } catch (e) {
    picaSetStatus(els.detailStatus, '详情失败：' + (e && e.message ? e.message : e));
  }
}

function picaSetReaderChrome(visible) {
  picaState.chromeVisible = !!visible;
  const els = picaEls();
  if (els.readerChrome) els.readerChrome.classList.toggle('is-hide', !visible);
  if (els.readerProgress) els.readerProgress.classList.toggle('is-hide', !visible);
}

async function picaOpenReader(bookId, order, title) {
  const id = String(bookId || picaState.bookId || '').trim();
  const epOrder = Number(order) || 1;
  if (!id) return;
  picaState.bookId = id;
  picaState.epOrder = epOrder;
  picaState.epTitle = title || ('第 ' + epOrder + ' 话');
  picaSetView('reader');
  picaSetReaderChrome(true);
  const els = picaEls();
  if (els.readerTitle) els.readerTitle.textContent = picaState.epTitle;
  if (els.readerStream) {
    els.readerStream.innerHTML = '<div style="padding:40px;text-align:center;opacity:.7;">加载页面中…</div>';
  }
  if (els.readerBar) els.readerBar.style.width = '0%';

  try {
    const allPages = [];
    let page = 1;
    let pagesTotal = 1;
    do {
      const res = await picaFetchJson(
        'comics/' + encodeURIComponent(id) + '/order/' + encodeURIComponent(epOrder) + '/pages?page=' + page,
        'GET'
      );
      const pagesObj = (res && res.data && res.data.pages) || {};
      const docs = pagesObj.docs || [];
      pagesTotal = Number(pagesObj.pages) || 1;
      for (let i = 0; i < docs.length; i++) {
        const media = docs[i] && (docs[i].media || docs[i]);
        const url = picaFileUrl(media);
        if (url) allPages.push(url);
      }
      page += 1;
    } while (page <= pagesTotal && page <= 40);

    picaState.pages = allPages;
    if (!els.readerStream) return;
    els.readerStream.innerHTML = '';
    if (!allPages.length) {
      els.readerStream.innerHTML = '<div style="padding:40px;text-align:center;opacity:.7;">本章暂无图片</div>';
      return;
    }
    allPages.forEach(function (url, idx) {
      const img = document.createElement('img');
      img.alt = 'p' + (idx + 1);
      img.loading = 'lazy';
      img.decoding = 'async';
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.src = url;
      els.readerStream.appendChild(img);
    });
    picaBindReaderScroll(els.readerStream);
  } catch (e) {
    if (els.readerStream) {
      els.readerStream.innerHTML =
        '<div style="padding:40px;text-align:center;opacity:.8;">加载失败：' +
        picaEsc(e && e.message ? e.message : e) + '</div>';
    }
  }
}

function picaBindReaderScroll(stream) {
  if (!stream || stream.dataset.scrollBound === '1') return;
  stream.dataset.scrollBound = '1';
  stream.addEventListener('scroll', function () {
    const els = picaEls();
    if (!els.readerBar || !stream) return;
    const max = Math.max(1, stream.scrollHeight - stream.clientHeight);
    const pct = Math.min(100, Math.round((stream.scrollTop / max) * 100));
    els.readerBar.style.width = pct + '%';
  }, { passive: true });
}

function picaGoBack() {
  if (picaState.view === 'reader') {
    picaSetView('detail');
    return;
  }
  if (picaState.view === 'detail') {
    picaSetView('browse');
  }
}

function picaBindUi(root) {
  if (root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const els = picaEls(root);

  function stop(e) {
    try { e.stopPropagation(); } catch (_) {}
  }

  /* 冒泡阶段拦截：不挡子元素点击，只阻止冒泡到短视频层 */
  ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'click', 'wheel'].forEach(function (evName) {
    root.addEventListener(evName, function (e) {
      stop(e);
    }, { passive: true });
  });

  if (els.topbar) {
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'click'].forEach(function (evName) {
      els.topbar.addEventListener(evName, function (e) {
        stop(e);
      }, { passive: true });
    });
  }
  if (els.loginOverlay) {
    ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'click'].forEach(function (evName) {
      els.loginOverlay.addEventListener(evName, function (e) {
        stop(e);
      }, { passive: true });
    });
    els.loginOverlay.addEventListener('click', function (e) {
      if (e.target === els.loginOverlay) {
        e.preventDefault();
        stop(e);
        /* 无 Token 时不允许点遮罩关掉 */
        if (picaGetToken()) picaShowLoginOverlay(false);
      }
    });
  }

  if (els.close) {
    els.close.addEventListener('click', function (e) {
      e.preventDefault(); stop(e); closePicacgApp();
    });
  }
  if (els.back) {
    els.back.addEventListener('click', function (e) {
      e.preventDefault(); stop(e); picaGoBack();
    });
  }
  if (els.account) {
    els.account.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      if (typeof window.showPicacgLoginModal === 'function') {
        window.showPicacgLoginModal(e);
      } else {
        picaShowLoginOverlay(true);
      }
    });
  }
  if (els.loginDismiss) {
    els.loginDismiss.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      if (!picaGetToken()) {
        picaSetStatus(els.loginStatus, '请先登录或粘贴 Token');
        return;
      }
      picaShowLoginOverlay(false);
    });
  }
  if (els.btnLogin) {
    els.btnLogin.addEventListener('click', async function (e) {
      e.preventDefault(); stop(e);
      const manual = els.tokenInput && els.tokenInput.value.trim();
      const email = els.email && els.email.value.trim();
      const password = els.password && els.password.value;
      picaSetStatus(els.loginStatus, '处理中…');
      try {
        if (manual) {
          picaSaveToken(manual);
          picaSetStatus(els.loginStatus, 'Token 已保存');
          picaShowToast('Token 已保存');
          picaShowLoginOverlay(false);
          picaSetView('browse');
          await picaLoadHot();
          return;
        }
        if (!email || !password) {
          picaSetStatus(els.loginStatus, '请填写账号密码，或粘贴 Token');
          return;
        }
        await picaLogin(email, password);
        picaSetStatus(els.loginStatus, '登录成功');
        picaShowToast('登录成功');
        picaShowLoginOverlay(false);
        picaSetView('browse');
        await picaLoadHot();
      } catch (err) {
        picaSetStatus(els.loginStatus, '失败：' + (err && err.message ? err.message : err));
      }
    });
  }
  if (els.btnTest) {
    els.btnTest.addEventListener('click', async function (e) {
      e.preventDefault(); stop(e);
      const manual = els.tokenInput && els.tokenInput.value.trim();
      if (manual) picaSaveToken(manual);
      picaSetStatus(els.loginStatus, '测试连接中…');
      try {
        const data = await picaTestConnection();
        const name =
          (data && data.data && data.data.user && (data.data.user.name || data.data.user.email)) ||
          '已连接';
        picaSetStatus(els.loginStatus, '连接成功 · ' + name);
        picaShowToast('测试连接成功');
      } catch (err) {
        picaSetStatus(els.loginStatus, '测试失败：' + (err && err.message ? err.message : err));
      }
    });
  }
  if (els.btnClear) {
    els.btnClear.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      picaClearToken();
      if (els.tokenInput) els.tokenInput.value = '';
      picaSetStatus(els.loginStatus, '已清除 Token');
      picaShowLoginOverlay(true);
    });
  }
  if (els.btnSearch) {
    els.btnSearch.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      picaSearch(els.searchInput && els.searchInput.value);
    });
  }
  if (els.searchInput) {
    els.searchInput.addEventListener('keydown', function (e) {
      stop(e);
      if (e.key === 'Enter') {
        e.preventDefault();
        picaSearch(els.searchInput.value);
      }
    });
  }
  if (els.root) {
    const tabs = els.root.querySelector('.pica-tabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        const btn = e.target && e.target.closest ? e.target.closest('button[data-tab]') : null;
        if (!btn) return;
        e.preventDefault(); stop(e);
        const tab = btn.getAttribute('data-tab');
        const all = tabs.querySelectorAll('button');
        for (let i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === btn);
        if (tab === 'hot') picaLoadHot();
        else if (tab === 'search') {
          if (picaState.keyword) picaSearch(picaState.keyword);
          else if (els.searchInput) els.searchInput.focus();
        }
      });
    }
  }
  if (els.grid) {
    els.grid.addEventListener('click', function (e) {
      const card = e.target && e.target.closest ? e.target.closest('.pica-comic') : null;
      if (!card) return;
      e.preventDefault(); stop(e);
      picaOpenDetail(card.getAttribute('data-id'));
    });
  }
  if (els.epList) {
    els.epList.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest ? e.target.closest('.pica-ep-btn') : null;
      if (!btn) return;
      e.preventDefault(); stop(e);
      picaOpenReader(picaState.bookId, btn.getAttribute('data-order'), btn.textContent);
    });
  }
  if (els.readerBack) {
    els.readerBack.addEventListener('click', function (e) {
      e.preventDefault(); stop(e); picaGoBack();
    });
  }
  if (els.readerTap) {
    els.readerTap.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      picaSetReaderChrome(!picaState.chromeVisible);
    });
  }
}

export async function openPicacgApp() {
  /* 严格互斥：先彻底隐藏并清空视频层 */
  picaHideVideoLayer();
  const root = picaBuildDom();
  picaState.open = true;
  picaState.token = picaGetToken();
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  root.style.setProperty('display', 'flex', 'important');
  root.style.setProperty('z-index', '100050', 'important');
  root.style.setProperty('pointer-events', 'auto', 'important');
  root.style.setProperty('visibility', 'visible', 'important');

  picaSetView('browse');
  if (picaState.token) {
    await picaLoadHot();
  } else {
    picaShowLoginOverlay(true);
    const els = picaEls(root);
    picaSetStatus(els.browseStatus, '请先登录 PicACG');
    picaSetStatus(els.loginStatus, '请登录或粘贴 Token');
  }
}

export function closePicacgApp() {
  const root = picaGetRoot();
  const els = picaEls(root);
  if (els.readerStream) {
    try { els.readerStream.innerHTML = ''; } catch (_) {}
  }
  picaShowLoginOverlay(false);
  try {
    const authModal = document.getElementById('picacg-auth-modal');
    if (authModal) authModal.style.display = 'none';
    const authBd = document.getElementById('picacg-auth-backdrop');
    if (authBd) authBd.style.display = 'none';
  } catch (_) {}
  if (root) {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('display', 'none', 'important');
  }
  picaState.open = false;
  picaState.view = 'browse';
  /* 切回视频应用容器 */
  picaRestoreVideoLayer();
}

export function togglePicacgApp() {
  if (picaState.open) closePicacgApp();
  else openPicacgApp();
}

export function isPicacgOpen() {
  return !!picaState.open;
}

try {
  window.openPicacgApp = openPicacgApp;
  window.closePicacgApp = closePicacgApp;
  window.togglePicacgApp = togglePicacgApp;
  window.isPicacgOpen = isPicacgOpen;

  window.loadPicacgHome = function () {
    try {
      picaLoadHot();
    } catch (_) {}
  };

  window.doPicacgSignIn = async function () {
    const modal = document.getElementById('picacg-auth-modal');
    if (!modal) return;
    const emailEl = modal.querySelector('#pica-email-input');
    const pwdEl = modal.querySelector('#pica-pwd-input');
    const email = emailEl ? emailEl.value.trim() : '';
    const password = pwdEl ? pwdEl.value : '';
    if (!email || !password) {
      alert('请填写账号密码，或粘贴 Token');
      return;
    }
    try {
      await picaLogin(email, password);
      alert('登录成功！');
      modal.style.display = 'none';
      const bd = document.getElementById('picacg-auth-backdrop');
      if (bd) bd.style.display = 'none';
      if (window.loadPicacgHome) window.loadPicacgHome();
    } catch (err) {
      alert('登录失败：' + (err && err.message ? err.message : err));
    }
  };

  window.showPicacgLoginModal = function (e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    let modal = document.getElementById('picacg-auth-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'picacg-auth-modal';
      modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1f1f23;padding:20px;border-radius:12px;z-index:999999;box-shadow:0 10px 40px rgba(0,0,0,0.8);border:1px solid #ff4d79;display:flex;flex-direction:column;gap:12px;min-width:280px;color:#fff;pointer-events:auto;';
      modal.innerHTML = `
          <h3 style="margin:0;font-size:16px;color:#ff4d79;">PicACG 账号授权</h3>
          <input id="pica-token-input" type="text" placeholder="粘贴 Token（若有）" style="padding:8px;border-radius:6px;background:#111;color:#fff;border:1px solid #444;" />
          <input id="pica-email-input" type="text" placeholder="哔咔账号 / 邮箱" style="padding:8px;border-radius:6px;background:#111;color:#fff;border:1px solid #444;" />
          <input id="pica-pwd-input" type="password" placeholder="密码" style="padding:8px;border-radius:6px;background:#111;color:#fff;border:1px solid #444;" />
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button id="pica-close-login" style="padding:6px 12px;background:#333;color:#ccc;border:none;border-radius:6px;cursor:pointer;">取消</button>
            <button id="pica-submit-login" style="padding:6px 12px;background:#ff4d79;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">保存并登录</button>
          </div>
        `;
      /* 遮罩层：点击空白关闭，但不拦截弹窗本身 */
      const backdrop = document.createElement('div');
      backdrop.id = 'picacg-auth-backdrop';
      backdrop.style.cssText = 'position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,0.55);pointer-events:auto;';
      backdrop.addEventListener('click', function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        modal.style.display = 'none';
        backdrop.style.display = 'none';
      });
      modal.addEventListener('click', function (ev) {
        if (ev) ev.stopPropagation();
      });
      document.body.appendChild(backdrop);
      document.body.appendChild(modal);

      modal.querySelector('#pica-close-login').onclick = function () {
        modal.style.display = 'none';
        const bd = document.getElementById('picacg-auth-backdrop');
        if (bd) bd.style.display = 'none';
      };
      modal.querySelector('#pica-submit-login').onclick = function () {
        const tokenEl = modal.querySelector('#pica-token-input');
        const token = tokenEl ? tokenEl.value.trim() : '';
        if (token) {
          localStorage.setItem('picacg_user_token', token);
          picaState.token = token;
          alert('Token 保存成功！');
          modal.style.display = 'none';
          const bd = document.getElementById('picacg-auth-backdrop');
          if (bd) bd.style.display = 'none';
          if (window.loadPicacgHome) window.loadPicacgHome();
        } else {
          if (window.doPicacgSignIn) window.doPicacgSignIn();
        }
      };
    }
    modal.style.display = 'flex';
    const backdrop = document.getElementById('picacg-auth-backdrop');
    if (backdrop) backdrop.style.display = 'block';
    const currentToken = localStorage.getItem('picacg_user_token') || '';
    const tokenInput = modal.querySelector('#pica-token-input');
    if (tokenInput) tokenInput.value = currentToken;
  };

  /* 兼容旧内联绑定 */
  window.__picaOpenLogin = function (e) {
    if (typeof window.showPicacgLoginModal === 'function') {
      window.showPicacgLoginModal(e);
    }
    return false;
  };
  window.__picaCloseApp = function (e) {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (_) {}
    closePicacgApp();
    return false;
  };
} catch (_) {}
