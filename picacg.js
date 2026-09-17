/**
 * 八条猫 · 漫画 Manga（MangaDex 开放源）
 * - 原生 CORS：直接 fetch https://api.mangadex.org
 * - 中文可用资源优先（zh / zh-hk）
 * - 搜索 / 热门 / 章节 / 竖向瀑布流阅读
 *
 * 兼容旧入口：openPicacgApp / closePicacgApp 等仍可用。
 */

const PICA_ROOT_ID = 'picacg-main-container';
const PICA_STYLE_ID = 'eight-tail-manga-style-v1';
const MD_API = 'https://api.mangadex.org';
const MD_COVERS = 'https://uploads.mangadex.org/covers';
/* 默认 API 不返回 pornographic，必须显式声明全部 contentRating */
const MD_CONTENT_RATINGS = [
  'contentRating[]=safe',
  'contentRating[]=suggestive',
  'contentRating[]=erotica',
  'contentRating[]=pornographic',
].join('&');
/* MangaDex Format 标签：Doujinshi（同人本） */
const MD_TAG_DOUJINSHI = 'b29d6a3d-1569-4e7a-8caf-7557bc92cd5d';
let mdDoujinshiTagId = MD_TAG_DOUJINSHI;

let picaState = {
  open: false,
  view: 'browse', /* browse | detail | reader */
  loading: false,
  comics: [],
  detail: null,
  eps: [],
  bookId: '',
  chapterId: '',
  epTitle: '',
  pages: [],
  chromeVisible: true,
  keyword: '',
};

function picaEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function picaFormatError(err, context) {
  const raw = err && err.message != null ? String(err.message) : String(err || '未知错误');
  const prefix = context || '请求失败';
  if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(raw)) {
    return prefix + '：网络异常（' + raw + '）';
  }
  if (/HTTP\s*\d+/i.test(raw)) return prefix + '：' + raw;
  return prefix + '：' + raw;
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
    const videoRoot =
      document.getElementById('video-app-container') ||
      document.getElementById('eight-tail-short-video-root');
    if (!videoRoot) return;
    videoRoot.classList.add('picacg-hidden');
    videoRoot.style.setProperty('display', 'none', 'important');
    videoRoot.style.setProperty('pointer-events', 'none', 'important');
    const video = videoRoot.querySelector('video');
    if (video) {
      try { video.pause(); } catch (_) {}
      try { video.muted = true; } catch (_) {}
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
    const videoRoot =
      document.getElementById('video-app-container') ||
      document.getElementById('eight-tail-short-video-root');
    if (!videoRoot) return;
    videoRoot.classList.remove('picacg-hidden');
  } catch (_) {}
}

function picaEnsureStyle() {
  let style = document.getElementById(PICA_STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = PICA_STYLE_ID;
    document.head.appendChild(style);
  }
  [
    'eight-tail-picacg-style-v1',
    'eight-tail-picacg-style-v2',
    'eight-tail-picacg-style-v3',
    'eight-tail-picacg-style-v4',
    'eight-tail-picacg-style-v5',
  ].forEach(function (id) {
    try {
      const n = document.getElementById(id);
      if (n) n.remove();
    } catch (_) {}
  });
  /* 清理旧授权弹窗 */
  ['picacg-auth-modal', 'picacg-auth-backdrop'].forEach(function (id) {
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
  background: #0b0c10 !important;
  color: #f2f4f8 !important;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif !important;
  pointer-events: auto !important;
  touch-action: manipulation !important;
  box-sizing: border-box !important;
}
#picacg-main-container *,
#picacg-modal-container *,
#eight-tail-picacg-root * { box-sizing: border-box; }
#picacg-main-container.is-open,
#picacg-modal-container.is-open,
#eight-tail-picacg-root.is-open { display: flex !important; }

.picacg-top-bar {
  position: relative !important;
  z-index: 5 !important;
  flex: 0 0 auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding: max(10px, env(safe-area-inset-top)) 12px 10px !important;
  background: #14161c !important;
  border-bottom: 1px solid rgba(255,255,255,.08) !important;
}
.picacg-top-bar .pica-title {
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
}
.picacg-top-bar button {
  flex: 0 0 auto !important;
  min-width: 44px !important;
  height: 44px !important;
  border: 0 !important;
  border-radius: 12px !important;
  padding: 0 12px !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  background: rgba(255,255,255,.12) !important;
  color: #fff !important;
  cursor: pointer !important;
}
.picacg-top-bar button.primary {
  background: linear-gradient(135deg, #5b8def, #3b6fd9) !important;
}

#pica-body {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  position: relative !important;
  background: #0b0c10 !important;
}
.pica-panel {
  position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 14px 14px 28px; display: none; background: #0b0c10;
}
.pica-panel.is-on { display: block; }

.pica-search-row { display: flex; gap: 8px; margin-bottom: 10px; }
.pica-search-row input {
  flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 12px;
  background: rgba(255,255,255,.08); color: #fff; padding: 11px 12px; font-size: 14px; outline: none;
}
.pica-search-row input:focus {
  border-color: #5b8def; box-shadow: 0 0 0 3px rgba(91,141,239,.22);
}
.pica-search-row button, .pica-tabs button {
  border: 0; border-radius: 12px; padding: 10px 14px; font-size: 13px; font-weight: 800;
  cursor: pointer; color: #fff; background: rgba(255,255,255,.12);
}
.pica-search-row button.primary { background: linear-gradient(135deg, #5b8def, #3b6fd9); }
.pica-tabs { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.pica-tabs button.is-on { outline: 2px solid rgba(255,255,255,.85); background: rgba(91,141,239,.45); }

.pica-status {
  margin: 8px 0 12px; font-size: 12px; opacity: .78; min-height: 1.2em;
  display: flex; align-items: center; gap: 8px;
}
.pica-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.2); border-top-color: #5b8def;
  animation: picaSpin .7s linear infinite; flex: 0 0 auto;
}
@keyframes picaSpin { to { transform: rotate(360deg); } }

.pica-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
@media (min-width: 720px) {
  .pica-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 1100px) {
  .pica-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.pica-comic {
  border: 0; border-radius: 14px; overflow: hidden; padding: 0; text-align: left;
  background: rgba(255,255,255,.06); color: #fff; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
}
.pica-comic:active { transform: scale(0.98); }
.pica-comic-cover {
  width: 100%; aspect-ratio: 3/4; background: #161820; overflow: hidden;
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

.pica-detail-head { display: flex; gap: 12px; margin-bottom: 14px; }
.pica-detail-cover {
  width: 110px; flex: 0 0 auto; border-radius: 12px; overflow: hidden;
  aspect-ratio: 3/4; background: #161820;
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
.pica-reader-chrome .pica-title {
  flex: 1; font-size: 13px; font-weight: 700; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
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
  display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #5b8def, #3b6fd9);
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
.pica-empty {
  padding: 36px 16px; text-align: center; opacity: .7; font-size: 13px; line-height: 1.5;
}
`;
}

function picaBuildDom() {
  picaEnsureStyle();
  let root = picaGetRoot();
  if (root && root.dataset.picaVersion === 'md2' && root.id === PICA_ROOT_ID) return root;
  if (root) {
    try { root.remove(); } catch (_) {}
  }
  ['picacg-modal-container', 'eight-tail-picacg-root'].forEach(function (id) {
    try {
      const legacy = document.getElementById(id);
      if (legacy) legacy.remove();
    } catch (_) {}
  });

  root = document.createElement('div');
  root.id = PICA_ROOT_ID;
  root.dataset.picaVersion = 'md2';
  root.className = 'picacg-main-container';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '漫画 Manga');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = [
    '<div id="pica-topbar" class="picacg-top-bar">',
    '  <button type="button" id="pica-btn-back" class="action-btn" title="返回" aria-label="返回">←</button>',
    '  <div class="pica-title" id="pica-heading">漫画 Manga</div>',
    '  <div class="picacg-top-actions">',
    '    <button type="button" id="pica-btn-close" class="action-btn primary" title="关闭" aria-label="关闭"',
    '      onclick="return window.__picaCloseApp && window.__picaCloseApp(event)">✕</button>',
    '  </div>',
    '</div>',
    '<div id="pica-body">',
    '  <div class="pica-panel is-on" id="pica-panel-browse">',
    '    <div class="pica-search-row">',
    '      <input id="pica-search-input" type="search" enterkeyhint="search" placeholder="搜索漫画标题…" />',
    '      <button type="button" class="primary" id="pica-btn-search">搜索</button>',
    '    </div>',
    '    <div class="pica-tabs" role="tablist">',
    '      <button type="button" data-tab="hot" class="is-on">热门推荐</button>',
    '      <button type="button" data-tab="doujin">同人本</button>',
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
    close: root.querySelector('#pica-btn-close'),
    topbar: root.querySelector('#pica-topbar'),
    panelBrowse: root.querySelector('#pica-panel-browse'),
    panelDetail: root.querySelector('#pica-panel-detail'),
    panelReader: root.querySelector('#pica-panel-reader'),
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

function picaSetStatus(el, text, loading) {
  if (!el) return;
  if (loading) {
    el.innerHTML = '<span class="pica-spinner" aria-hidden="true"></span><span>' + picaEsc(text || '加载中…') + '</span>';
  } else {
    el.textContent = text || '';
  }
}

function picaSetView(view) {
  picaState.view = view;
  const els = picaEls();
  if (!els.root) return;
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
  if (els.heading) {
    if (view === 'browse') els.heading.textContent = '漫画 Manga';
    else if (view === 'detail' && picaState.detail) {
      els.heading.textContent = picaState.detail.title || '漫画详情';
    } else if (view === 'reader') {
      els.heading.textContent = picaState.epTitle || '阅读中';
    }
  }
}

/* ---------- MangaDex API ---------- */

function mdContentRatingQs() {
  return MD_CONTENT_RATINGS;
}

function mdLangQs() {
  return (
    'availableTranslatedLanguage[]=zh' +
    '&availableTranslatedLanguage[]=zh-hk'
  );
}

/**
 * 组装 /manga 列表查询（始终带全部分级，可选标题与同人本标签）
 * @param {{title?:string,doujinOnly?:boolean,orderFollowed?:boolean}} opts
 */
function mdBuildMangaListQs(opts) {
  opts = opts || {};
  const parts = [
    'limit=20',
    mdLangQs(),
    mdContentRatingQs(),
    'includes[]=cover_art',
  ];
  if (opts.orderFollowed) parts.push('order[followedCount]=desc');
  if (opts.title) parts.push('title=' + encodeURIComponent(opts.title));
  if (opts.doujinOnly && mdDoujinshiTagId) {
    parts.push('includedTags[]=' + encodeURIComponent(mdDoujinshiTagId));
  }
  return parts.join('&');
}

async function mdEnsureDoujinshiTag() {
  if (mdDoujinshiTagId) return mdDoujinshiTagId;
  try {
    const tags = await mdFetchJson(MD_API + '/manga/tag');
    const list = (tags && tags.data) || [];
    const hit = list.find(function (t) {
      const name = t && t.attributes && t.attributes.name;
      return name && (name.en === 'Doujinshi' || name.zh === '同人志' || name['zh-hk'] === '同人誌');
    });
    if (hit && hit.id) mdDoujinshiTagId = hit.id;
  } catch (_) {}
  if (!mdDoujinshiTagId) mdDoujinshiTagId = MD_TAG_DOUJINSHI;
  return mdDoujinshiTagId;
}

async function mdFetchJson(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    mode: 'cors',
    headers: { accept: 'application/json' },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    throw new Error('非 JSON 响应 HTTP ' + res.status + (text ? '：' + text.slice(0, 100) : ''));
  }
  if (!res.ok) {
    const msg = (data && (data.message || data.result)) || ('HTTP ' + res.status);
    throw new Error(String(msg));
  }
  return data;
}

function mdPickTitle(attributes) {
  const t = (attributes && attributes.title) || {};
  return t.zh || t['zh-hk'] || t.en || t.ja || Object.values(t)[0] || '未命名';
}

function mdCoverUrl(mangaId, relationships) {
  const rels = Array.isArray(relationships) ? relationships : [];
  const cover = rels.find(function (r) { return r && r.type === 'cover_art'; });
  const fileName = cover && cover.attributes && cover.attributes.fileName;
  if (!mangaId || !fileName) return '';
  return MD_COVERS + '/' + mangaId + '/' + fileName + '.256.jpg';
}

function mdNormalizeMangaList(data) {
  const list = (data && data.data) || [];
  if (!Array.isArray(list)) return [];
  return list.map(function (item) {
    const id = item && item.id;
    const attrs = (item && item.attributes) || {};
    const title = mdPickTitle(attrs);
    const cover = mdCoverUrl(id, item.relationships);
    const status = attrs.status || '';
    const year = attrs.year || '';
    return {
      id: id,
      title: title,
      cover: cover,
      status: status,
      year: year,
      raw: item,
    };
  }).filter(function (x) { return x.id; });
}

function picaRenderComics(list) {
  const els = picaEls();
  if (!els.grid) return;
  els.grid.innerHTML = '';
  if (!list || !list.length) {
    els.grid.innerHTML = '<div class="pica-empty" style="grid-column:1/-1;">暂无漫画</div>';
    return;
  }
  list.forEach(function (comic) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pica-comic';
    btn.dataset.id = comic.id;
    btn.innerHTML =
      '<div class="pica-comic-cover">' +
      (comic.cover
        ? '<img src="' + picaEsc(comic.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
        : '') +
      '</div>' +
      '<div class="pica-comic-meta">' +
      '<div class="t">' + picaEsc(comic.title) + '</div>' +
      '<div class="s">' + picaEsc([comic.status, comic.year].filter(Boolean).join(' · ')) + '</div>' +
      '</div>';
    els.grid.appendChild(btn);
  });
}

async function picaLoadHot() {
  const els = picaEls();
  picaSetStatus(els.browseStatus, '加载热门推荐…', true);
  try {
    const qs = mdBuildMangaListQs({ orderFollowed: true });
    const data = await mdFetchJson(MD_API + '/manga?' + qs);
    picaState.comics = mdNormalizeMangaList(data);
    picaRenderComics(picaState.comics);
    picaSetStatus(els.browseStatus, '热门 · ' + picaState.comics.length + ' 部（含全部分级）', false);
  } catch (e) {
    picaSetStatus(els.browseStatus, picaFormatError(e, '热门加载失败'), false);
    picaRenderComics([]);
  }
}

async function picaLoadDoujin() {
  const els = picaEls();
  picaSetStatus(els.browseStatus, '加载同人本…', true);
  try {
    await mdEnsureDoujinshiTag();
    const qs = mdBuildMangaListQs({ orderFollowed: true, doujinOnly: true });
    const data = await mdFetchJson(MD_API + '/manga?' + qs);
    picaState.comics = mdNormalizeMangaList(data);
    picaRenderComics(picaState.comics);
    picaSetStatus(els.browseStatus, '同人本 · ' + picaState.comics.length + ' 部', false);
  } catch (e) {
    picaSetStatus(els.browseStatus, picaFormatError(e, '同人本加载失败'), false);
    picaRenderComics([]);
  }
}

async function picaSearch(keyword, opts) {
  opts = opts || {};
  const kw = String(keyword || '').trim();
  if (!kw && !opts.doujinOnly) {
    try {
      if (typeof window.showToast === 'function') window.showToast('请输入关键词', 1600);
    } catch (_) {}
    return;
  }
  picaState.keyword = kw;
  const els = picaEls();
  const label = opts.doujinOnly
    ? (kw ? ('搜索同人：「' + kw + '」') : '加载同人本…')
    : ('搜索中：' + kw);
  picaSetStatus(els.browseStatus, label, true);
  const tabs = els.root && els.root.querySelectorAll('.pica-tabs button');
  if (tabs) {
    const activeTab = opts.doujinOnly ? 'doujin' : 'search';
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-on', tabs[i].getAttribute('data-tab') === activeTab);
    }
  }
  try {
    if (opts.doujinOnly) await mdEnsureDoujinshiTag();
    const qs = mdBuildMangaListQs({
      title: kw || undefined,
      doujinOnly: !!opts.doujinOnly,
      orderFollowed: !kw,
    });
    const data = await mdFetchJson(MD_API + '/manga?' + qs);
    picaState.comics = mdNormalizeMangaList(data);
    picaRenderComics(picaState.comics);
    const tip = opts.doujinOnly
      ? ('同人' + (kw ? ('「' + kw + '」') : '') + ' · ' + picaState.comics.length + ' 部')
      : ('搜索「' + kw + '」· ' + picaState.comics.length + ' 部');
    picaSetStatus(els.browseStatus, tip, false);
  } catch (e) {
    picaSetStatus(els.browseStatus, picaFormatError(e, opts.doujinOnly ? '同人搜索失败' : '搜索失败'), false);
  }
}

async function picaOpenDetail(mangaId) {
  const id = String(mangaId || '').trim();
  if (!id) return;
  picaState.bookId = id;
  picaSetView('detail');
  const els = picaEls();
  picaSetStatus(els.detailStatus, '加载详情与章节…', true);
  if (els.epList) els.epList.innerHTML = '';

  try {
    const cached = (picaState.comics || []).find(function (c) { return c.id === id; });
    let detail = cached || null;
    if (!detail) {
      const one = await mdFetchJson(MD_API + '/manga/' + encodeURIComponent(id) + '?includes[]=cover_art');
      const normalized = mdNormalizeMangaList({ data: one && one.data ? [one.data] : [] });
      detail = normalized[0] || { id: id, title: '未命名', cover: '' };
    }
    picaState.detail = detail;
    if (els.detailTitle) els.detailTitle.textContent = detail.title || '未命名';
    if (els.detailMeta) {
      els.detailMeta.textContent =
        [detail.status, detail.year ? String(detail.year) : ''].filter(Boolean).join(' · ') || 'MangaDex';
    }
    if (els.detailCover) {
      els.detailCover.src = detail.cover || '';
      els.detailCover.setAttribute('referrerpolicy', 'no-referrer');
    }
    if (els.heading) els.heading.textContent = detail.title || '漫画详情';

    const feedQs =
      'translatedLanguage[]=zh' +
      '&translatedLanguage[]=zh-hk' +
      '&order[chapter]=asc' +
      '&limit=100' +
      '&' + mdContentRatingQs();
    const feed = await mdFetchJson(
      MD_API + '/manga/' + encodeURIComponent(id) + '/feed?' + feedQs
    );
    const chapters = Array.isArray(feed && feed.data) ? feed.data : [];
    picaState.eps = chapters.map(function (ch) {
      const attrs = (ch && ch.attributes) || {};
      const chap = attrs.chapter != null ? String(attrs.chapter) : '';
      const title = attrs.title || '';
      const label =
        (chap ? ('第 ' + chap + ' 话') : '章节') +
        (title ? (' · ' + title) : '');
      return {
        id: ch.id,
        chapter: chap,
        title: label,
        volume: attrs.volume,
        lang: attrs.translatedLanguage,
      };
    }).filter(function (x) { return x.id; });

    if (els.epList) {
      els.epList.innerHTML = '';
      if (!picaState.eps.length) {
        els.epList.innerHTML = '<div class="pica-empty">暂无中文章节</div>';
      } else {
        picaState.eps.forEach(function (ep) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pica-ep-btn';
          btn.dataset.chapterId = ep.id;
          btn.textContent = ep.title;
          els.epList.appendChild(btn);
        });
      }
    }
    picaSetStatus(
      els.detailStatus,
      picaState.eps.length ? ('共 ' + picaState.eps.length + ' 话（中文）') : '暂无中文章节',
      false
    );
  } catch (e) {
    picaSetStatus(els.detailStatus, picaFormatError(e, '详情加载失败'), false);
  }
}

function picaSetReaderChrome(visible) {
  picaState.chromeVisible = !!visible;
  const els = picaEls();
  if (els.readerChrome) els.readerChrome.classList.toggle('is-hide', !visible);
  if (els.readerProgress) els.readerProgress.classList.toggle('is-hide', !visible);
}

async function picaOpenReader(chapterId, title) {
  const cid = String(chapterId || '').trim();
  if (!cid) return;
  picaState.chapterId = cid;
  picaState.epTitle = title || '阅读中';
  picaSetView('reader');
  picaSetReaderChrome(true);
  const els = picaEls();
  if (els.readerTitle) els.readerTitle.textContent = picaState.epTitle;
  if (els.readerStream) {
    els.readerStream.innerHTML =
      '<div class="pica-empty"><span class="pica-spinner" style="display:inline-block;margin-bottom:10px;"></span><br/>加载页面中…</div>';
  }
  if (els.readerBar) els.readerBar.style.width = '0%';

  try {
    const atHome = await mdFetchJson(MD_API + '/at-home/server/' + encodeURIComponent(cid));
    const baseUrl = String((atHome && atHome.baseUrl) || '').replace(/\/$/, '');
    const chapter = (atHome && atHome.chapter) || {};
    const hash = chapter.hash || '';
    const pageFiles = Array.isArray(chapter.data) ? chapter.data : [];
    if (!baseUrl || !hash || !pageFiles.length) {
      throw new Error('章节图片列表为空');
    }
    const allPages = pageFiles.map(function (file) {
      return baseUrl + '/data/' + hash + '/' + file;
    });
    picaState.pages = allPages;
    if (!els.readerStream) return;
    els.readerStream.innerHTML = '';
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
        '<div class="pica-empty" style="word-break:break-word;">' +
        picaEsc(picaFormatError(e, '章节加载失败')) +
        '</div>';
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

  ['touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointermove', 'pointerup', 'click', 'wheel'].forEach(function (evName) {
    root.addEventListener(evName, function (e) { stop(e); }, { passive: true });
  });

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
  function isDoujinTabOn() {
    const on = root.querySelector('.pica-tabs button.is-on');
    return !!(on && on.getAttribute('data-tab') === 'doujin');
  }

  if (els.btnSearch) {
    els.btnSearch.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      picaSearch(els.searchInput && els.searchInput.value, { doujinOnly: isDoujinTabOn() });
    });
  }
  if (els.searchInput) {
    els.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        picaSearch(els.searchInput.value, { doujinOnly: isDoujinTabOn() });
      }
    });
  }

  const tabs = root.querySelectorAll('.pica-tabs button');
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      const tab = this.getAttribute('data-tab');
      for (let j = 0; j < tabs.length; j++) {
        tabs[j].classList.toggle('is-on', tabs[j] === this);
      }
      if (tab === 'hot') picaLoadHot();
      else if (tab === 'doujin') {
        const kw = els.searchInput && els.searchInput.value.trim();
        if (kw) picaSearch(kw, { doujinOnly: true });
        else picaLoadDoujin();
      } else if (tab === 'search') {
        if (picaState.keyword) picaSearch(picaState.keyword);
        else picaSetStatus(els.browseStatus, '输入关键词后搜索', false);
      }
    });
  }

  if (els.grid) {
    els.grid.addEventListener('click', function (e) {
      const card = e.target && e.target.closest && e.target.closest('.pica-comic');
      if (!card) return;
      e.preventDefault(); stop(e);
      picaOpenDetail(card.dataset.id);
    });
  }
  if (els.epList) {
    els.epList.addEventListener('click', function (e) {
      const btn = e.target && e.target.closest && e.target.closest('.pica-ep-btn');
      if (!btn) return;
      e.preventDefault(); stop(e);
      picaOpenReader(btn.dataset.chapterId, btn.textContent);
    });
  }
  if (els.readerBack) {
    els.readerBack.addEventListener('click', function (e) {
      e.preventDefault(); stop(e);
      picaSetView('detail');
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
  picaHideVideoLayer();
  const root = picaBuildDom();
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  root.style.setProperty('display', 'flex', 'important');
  root.style.setProperty('z-index', '100050', 'important');
  root.style.setProperty('pointer-events', 'auto', 'important');
  picaState.open = true;
  picaSetView('browse');
  await picaLoadHot();
}

export function closePicacgApp() {
  const root = picaGetRoot();
  const els = picaEls(root);
  if (els.readerStream) {
    try { els.readerStream.innerHTML = ''; } catch (_) {}
  }
  try {
    const authModal = document.getElementById('picacg-auth-modal');
    if (authModal) authModal.remove();
    const authBd = document.getElementById('picacg-auth-backdrop');
    if (authBd) authBd.remove();
  } catch (_) {}
  if (root) {
    root.classList.remove('is-open');
    root.setAttribute('aria-hidden', 'true');
    root.style.setProperty('display', 'none', 'important');
  }
  picaState.open = false;
  picaState.view = 'browse';
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
  window.loadPicacgHome = picaLoadHot;
  /* 旧授权入口置空，避免残留内联调用报错 */
  window.showPicacgLoginModal = function () {};
  window.doPicacgSignIn = function () {};
  window.__picaOpenLogin = function () { return false; };
  window.__picaCloseApp = function (e) {
    try {
      if (e) { e.preventDefault(); e.stopPropagation(); }
    } catch (_) {}
    closePicacgApp();
    return false;
  };
} catch (_) {}
