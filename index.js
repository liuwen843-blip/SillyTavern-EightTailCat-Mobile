import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';

/**
 * 八条猫 · 移动触屏宿主层
 * - 容器强制挂 document.body（全屏可拖、不被 overflow:hidden 裁切）
 * - 默认显示；侧边栏可一键召唤到屏幕中央
 * - 尺寸贴合猫咪，禁止 100vw/100vh 挡点击
 * - 拖拽仅响应 iframe 内手指手势 postMessage，无全局追光标
 */

const MODULE = 'EightTailCat-Pet-Mobile';
const OVERLAY_ID = 'pet-container-mobile';
const FRAME_ID = 'eighttailcat-frame-mobile';
const SETTINGS_ID = 'eighttailcat-mobile-settings';
const DOCK_ID = 'eighttailcat-mobile-dock';
const FALLBACK_ID = 'eighttailcat-mobile-fallback';
const VISIBLE_LS_KEY = 'EightTailCat-Pet-Mobile.visible';
const DOCK_TOP_LS_KEY = 'EightTailCat-Pet-Mobile.dockTop';
const EDGE_PAD = 10;

const defaultSettings = {
  visible: true,
  left: null,
  top: null,
};

function safeCall(fn) {
  try { return fn(); } catch (err) {
    console.warn('[EightTailCat-Pet-Mobile]', err);
    return undefined;
  }
}

function readVisibleFromLocal() {
  try {
    const raw = localStorage.getItem(VISIBLE_LS_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch (_) {}
  return null; /* 无值 → 默认显示 */
}

function writeVisibleToLocal(visible) {
  try { localStorage.setItem(VISIBLE_LS_KEY, visible ? '1' : '0'); } catch (_) {}
}

function readDockTopFromLocal() {
  try {
    const n = parseFloat(localStorage.getItem(DOCK_TOP_LS_KEY));
    if (!isNaN(n)) return n;
  } catch (_) {}
  return null;
}

function writeDockTopToLocal(top) {
  try { localStorage.setItem(DOCK_TOP_LS_KEY, String(top)); } catch (_) {}
}

function ensureSettings() {
  try {
    if (!extension_settings[MODULE]) {
      extension_settings[MODULE] = Object.assign({}, defaultSettings);
    }
    const s = extension_settings[MODULE];
    const fromLs = readVisibleFromLocal();
    if (typeof s.visible !== 'boolean') {
      s.visible = fromLs == null ? true : fromLs;
    }
    /* 首次安装：强制可见，避免历史脏数据导致「消失唤不回」 */
    if (fromLs == null && s.visible !== true) {
      s.visible = true;
    }
    writeVisibleToLocal(!!s.visible);
    return s;
  } catch (_) {
    return Object.assign({}, defaultSettings);
  }
}

function getExtBase() {
  try {
    let href = new URL('./', import.meta.url).href;
    if (href.slice(-1) !== '/') href += '/';
    return href;
  } catch (_) {
    return '/scripts/extensions/third-party/EightTailCat-Pet-Mobile/';
  }
}

function getExtensionFolderName() {
  try {
    const path = new URL('./', import.meta.url).pathname || '';
    const parts = path.split('/').filter(Boolean);
    if (parts.length) return decodeURIComponent(parts[parts.length - 1]);
  } catch (_) {}
  return MODULE;
}

function readOverlayPos(el) {
  const x = parseFloat(el.dataset.posX);
  const y = parseFloat(el.dataset.posY);
  if (!isNaN(x) && !isNaN(y)) return { left: x, top: y };
  return { left: 0, top: EDGE_PAD };
}

/** 全视口边界：禁止任何局部容器 getBoundingClientRect / offsetParent */
function clampOverlayPos(el, left, top) {
  const w = (el && el.offsetWidth) || 160;
  const h = (el && el.offsetHeight) || 200;
  const vw = window.innerWidth || document.documentElement.clientWidth || w;
  const vh = window.innerHeight || document.documentElement.clientHeight || h;
  const maxL = Math.max(0, vw - w);
  const minT = EDGE_PAD;
  const maxT = Math.max(minT, vh - h - EDGE_PAD);
  let x = Number(left);
  let y = Number(top);
  if (isNaN(x)) x = Math.max(0, vw - w - 16);
  if (isNaN(y)) y = Math.max(minT, Math.round((vh - h) / 2));
  x = Math.min(maxL, Math.max(0, x));
  y = Math.min(maxT, Math.max(minT, y));
  return { left: x, top: y, w: w, h: h };
}

function setOverlayPos(el, left, top) {
  if (!el) return { left: 0, top: EDGE_PAD };
  const pos = clampOverlayPos(el, left, top);
  el.style.transition = 'none';
  el.style.willChange = 'transform';
  el.style.setProperty('left', '0px', 'important');
  el.style.setProperty('top', '0px', 'important');
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'translate3d(' + pos.left + 'px,' + pos.top + 'px,0)';
  el.dataset.posX = String(pos.left);
  el.dataset.posY = String(pos.top);
  return pos;
}

let overlayRaf = 0;
let pendingLeft = 0;
let pendingTop = 0;
let pendingEl = null;

function scheduleOverlayPos(el, left, top) {
  pendingEl = el;
  pendingLeft = left;
  pendingTop = top;
  if (overlayRaf) return;
  overlayRaf = requestAnimationFrame(function () {
    overlayRaf = 0;
    if (pendingEl) setOverlayPos(pendingEl, pendingLeft, pendingTop);
  });
}

/** 默认：屏幕正中偏右安全位 */
function defaultRightCenterPos(el) {
  const w = (el && el.offsetWidth) || 160;
  const h = (el && el.offsetHeight) || 200;
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  return {
    left: Math.max(0, vw - w - 16),
    top: Math.max(EDGE_PAD, Math.round((vh - h) / 2)),
  };
}

function centerPos(el) {
  const w = (el && el.offsetWidth) || 160;
  const h = (el && el.offsetHeight) || 200;
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  return {
    left: Math.max(0, Math.round((vw - w) / 2)),
    top: Math.max(EDGE_PAD, Math.round((vh - h) / 2)),
  };
}

function applySavedOrDefaultPos(el) {
  const s = ensureSettings();
  const def = defaultRightCenterPos(el);
  const left = s.left == null ? def.left : s.left;
  const top = s.top == null ? def.top : s.top;
  return setOverlayPos(el, left, top);
}

function savePos(left, top) {
  const s = ensureSettings();
  s.left = left;
  s.top = top;
  safeCall(function () { saveSettingsDebounced(); });
}

/** 强制挂到 body + 可见性兜底样式 */
function ensureOverlayOnBody(el) {
  if (!el) return el;
  try {
    if (el.parentElement !== document.body) document.body.appendChild(el);
  } catch (_) {}
  try {
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('z-index', '9999', 'important');
    el.style.setProperty('left', '0px', 'important');
    el.style.setProperty('top', '0px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    /* 父层不拦截：由 iframe / fallback 自己接收事件 */
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
    if (!el.classList.contains('eighttailcat-hidden')) {
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
    }
  } catch (_) {}
  return el;
}

function forceShowStyles(el) {
  if (!el) return;
  el.classList.remove('eighttailcat-hidden');
  el.style.setProperty('display', 'block', 'important');
  el.style.setProperty('visibility', 'visible', 'important');
  el.style.setProperty('opacity', '1', 'important');
}

function ensureFallbackFace(overlay) {
  let face = document.getElementById(FALLBACK_ID);
  if (face) return face;
  face = document.createElement('div');
  face.id = FALLBACK_ID;
  face.setAttribute('aria-hidden', 'true');
  face.textContent = '🐱';
  face.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-size:72px',
    'line-height:1',
    'pointer-events:none',
    'z-index:0',
    'user-select:none',
    'background:rgba(255,255,255,0.08)',
    'border-radius:20px',
    'border:2px dashed rgba(91,141,239,0.45)',
  ].join(';');
  overlay.appendChild(face);
  return face;
}

function pointFromMessage(data) {
  const sx = data.screenX != null ? Number(data.screenX) : NaN;
  const sy = data.screenY != null ? Number(data.screenY) : NaN;
  if (!isNaN(sx) && !isNaN(sy)) return { x: sx, y: sy };
  const cx = data.clientX != null ? Number(data.clientX) : NaN;
  const cy = data.clientY != null ? Number(data.clientY) : NaN;
  if (!isNaN(cx) && !isNaN(cy)) return { x: cx, y: cy };
  return { x: 0, y: 0 };
}

function setPetVisible(visible, opts) {
  opts = opts || {};
  const overlay = document.getElementById(OVERLAY_ID) ||
    (opts.mountIfNeeded ? mountOverlay(getExtBase()) : null);
  const s = ensureSettings();
  s.visible = !!visible;
  writeVisibleToLocal(!!visible);
  if (!opts.skipSave) safeCall(function () { saveSettingsDebounced(); });
  if (overlay) {
    ensureOverlayOnBody(overlay);
    if (visible) {
      forceShowStyles(overlay);
      if (opts.center) {
        const c = centerPos(overlay);
        setOverlayPos(overlay, c.left, c.top);
        savePos(c.left, c.top);
      } else {
        try { applySavedOrDefaultPos(overlay); } catch (_) {}
      }
    } else {
      overlay.classList.add('eighttailcat-hidden');
    }
  }
  syncDock();
  syncToggleButtonLabel();
}

/** 显示并瞬移到屏幕正中央（侧边栏「显示桌宠」专用） */
function showPetCentered() {
  const overlay = mountOverlay(getExtBase());
  ensureOverlayOnBody(overlay);
  forceShowStyles(overlay);
  setPetVisible(true, { mountIfNeeded: true, center: true, skipSave: false });
  /* 再保险：显式居中一次（等布局算完） */
  requestAnimationFrame(function () {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    forceShowStyles(el);
    const c = centerPos(el);
    setOverlayPos(el, c.left, c.top);
    savePos(c.left, c.top);
  });
}

function mountOverlay(base) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return ensureOverlayOnBody(overlay);

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('aria-label', '八条猫桌宠 (移动触屏版)');
  overlay.style.touchAction = 'none';
  overlay.style.willChange = 'transform';
  overlay.style.width = 'min(160px, 42vw)';
  overlay.style.height = 'min(200px, 42vw)';

  ensureFallbackFace(overlay);

  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.title = '八条猫桌宠 (移动触屏版)';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  iframe.style.cssText = 'position:relative;z-index:1;display:block;width:100%;height:100%;border:0;background:transparent;pointer-events:auto;';
  iframe.src = (base || getExtBase()) + 'index.html';
  iframe.addEventListener('load', function () {
    const face = document.getElementById(FALLBACK_ID);
    if (face) face.style.opacity = '0.15';
  });
  iframe.addEventListener('error', function () {
    const face = document.getElementById(FALLBACK_ID);
    if (face) face.style.opacity = '1';
  });
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  ensureOverlayOnBody(overlay);

  const s = ensureSettings();
  if (s.visible) forceShowStyles(overlay);
  else overlay.classList.add('eighttailcat-hidden');

  /* 等一帧再定位，避免 offsetWidth=0 导致坐标异常 */
  requestAnimationFrame(function () {
    applySavedOrDefaultPos(overlay);
  });
  writeVisibleToLocal(!!s.visible);

  let dragging = false;
  let startSX = 0;
  let startSY = 0;
  let originL = 0;
  let originT = 0;

  window.addEventListener('message', function (ev) {
    const data = ev && ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'eighttailcat-drag-start') {
      ensureOverlayOnBody(overlay);
      dragging = true;
      overlay.classList.add('is-dragging');
      overlay.style.transition = 'none';
      const p = pointFromMessage(data);
      startSX = p.x;
      startSY = p.y;
      const cur = readOverlayPos(overlay);
      originL = cur.left;
      originT = cur.top;
    } else if (data.type === 'eighttailcat-drag-move' && dragging) {
      const p = pointFromMessage(data);
      scheduleOverlayPos(overlay, originL + (p.x - startSX), originT + (p.y - startSY));
    } else if (data.type === 'eighttailcat-drag-end') {
      dragging = false;
      overlay.classList.remove('is-dragging');
      if (overlayRaf) {
        cancelAnimationFrame(overlayRaf);
        overlayRaf = 0;
        setOverlayPos(overlay, pendingLeft, pendingTop);
      }
      const pos = readOverlayPos(overlay);
      const clamped = setOverlayPos(overlay, pos.left, pos.top);
      savePos(clamped.left, clamped.top);
      overlay.style.willChange = 'auto';
    } else if (data.type === 'eighttailcat-hide') {
      setPetVisible(false);
    } else if (data.type === 'eighttailcat-show') {
      showPetCentered();
    } else if (data.type === 'eighttailcat-expand') {
      overlay.classList.toggle('eighttailcat-expanded', !!data.on);
      if (data.on) {
        const c = centerPos(overlay);
        setOverlayPos(overlay, c.left, Math.max(EDGE_PAD, window.innerHeight - (overlay.offsetHeight || 360) - EDGE_PAD));
      } else {
        applySavedOrDefaultPos(overlay);
      }
    } else if (data.type === 'eighttailcat-open-settings') {
      openPetSettings();
    } else if (data.type === 'eighttailcat-toggle-visible') {
      togglePet();
    }
  }, { passive: true });

  window.addEventListener('resize', function () {
    const cur = readOverlayPos(overlay);
    setOverlayPos(overlay, cur.left, cur.top);
    clampDockPosition();
  });

  syncDock();
  return overlay;
}

function togglePet() {
  const overlay = document.getElementById(OVERLAY_ID) || mountOverlay(getExtBase());
  ensureOverlayOnBody(overlay);
  const hidden = overlay.classList.contains('eighttailcat-hidden') || !ensureSettings().visible;
  if (hidden) {
    /* 「显示桌宠」：强制现身并瞬移到屏幕正中央 */
    showPetCentered();
  } else {
    setPetVisible(false);
  }
}

function openPetSettings() {
  showPetCentered();
  const iframe = document.getElementById(FRAME_ID);
  try {
    const win = iframe && iframe.contentWindow;
    if (win && typeof win.openSettings === 'function') {
      win.openSettings();
      return;
    }
    if (win) win.postMessage({ type: 'eighttailcat-open-settings' }, '*');
  } catch (_) {}
}

const SETTINGS_FALLBACK = `
<div id="eighttailcat-mobile-settings" class="eighttailcat-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>八条猫设置 (移动触屏版)</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <p class="margin0">可用侧边栏或屏幕右侧猫爪按钮显示/隐藏桌宠。点「显示桌宠」会立刻召唤到屏幕中央。</p>
      <div class="eighttailcat-actions">
        <div id="eighttailcat-mobile-open-panel" class="menu_button menu_button_icon">打开八条猫面板</div>
        <div id="eighttailcat-mobile-toggle-pet" class="menu_button menu_button_icon">显示桌宠</div>
      </div>
    </div>
  </div>
</div>`;

function findSettingsRoot() {
  const candidates = [
    '#extensions_settings2',
    '#extensions_settings',
    '#rm_extensions_block',
    '#extensions_block',
    '.extensions_settings',
  ];
  for (let i = 0; i < candidates.length; i++) {
    try {
      const $el = $(candidates[i]);
      if ($el && $el.length) return $el.first();
    } catch (_) {}
  }
  return null;
}

function bindSettingsButtons($scope) {
  const $root = $scope && $scope.length ? $scope : $(document);

  function onOpen(e) {
    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    openPetSettings();
  }
  function onToggle(e) {
    try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
    togglePet();
  }

  $root.find('#eighttailcat-mobile-open-panel').off('click.etcMobile').on('click.etcMobile', onOpen);
  $root.find('#eighttailcat-mobile-toggle-pet').off('click.etcMobile').on('click.etcMobile', onToggle);

  /* 原生兜底（无 jQuery 时也能点） */
  const openBtn = document.getElementById('eighttailcat-mobile-open-panel');
  const togBtn = document.getElementById('eighttailcat-mobile-toggle-pet');
  if (openBtn && !openBtn.dataset.etcBound) {
    openBtn.dataset.etcBound = '1';
    openBtn.addEventListener('click', onOpen);
  }
  if (togBtn && !togBtn.dataset.etcBound) {
    togBtn.dataset.etcBound = '1';
    togBtn.addEventListener('click', onToggle);
  }
  syncToggleButtonLabel();
}

function syncToggleButtonLabel() {
  const btn = document.getElementById('eighttailcat-mobile-toggle-pet');
  if (!btn) return;
  const visible = !!(ensureSettings().visible &&
    document.getElementById(OVERLAY_ID) &&
    !document.getElementById(OVERLAY_ID).classList.contains('eighttailcat-hidden'));
  btn.textContent = visible ? '隐藏桌宠' : '显示桌宠';
}

async function loadSettingsHtml() {
  const folder = getExtensionFolderName();
  const paths = ['third-party/' + folder, 'third-party/' + MODULE, folder, MODULE];
  try {
    const ctx = window.SillyTavern && SillyTavern.getContext && SillyTavern.getContext();
    if (ctx && typeof ctx.renderExtensionTemplateAsync === 'function') {
      for (let i = 0; i < paths.length; i++) {
        try {
          const html = await ctx.renderExtensionTemplateAsync(paths[i], 'settings');
          if (html && String(html).indexOf('eighttailcat-mobile') >= 0) return String(html);
        } catch (_) {}
      }
    }
  } catch (_) {}
  return SETTINGS_FALLBACK;
}

let settingsInjected = false;

async function injectSettingsDrawer() {
  try {
    if (document.getElementById(SETTINGS_ID)) {
      settingsInjected = true;
      bindSettingsButtons($(document.getElementById(SETTINGS_ID)).parent());
      return true;
    }
    const $root = findSettingsRoot();
    if (!$root || !$root.length) return false;
    const html = await loadSettingsHtml();
    $root.append(html);
    if (!document.getElementById(SETTINGS_ID)) $root.append(SETTINGS_FALLBACK);
    settingsInjected = !!document.getElementById(SETTINGS_ID);
    bindSettingsButtons($root);
    return settingsInjected;
  } catch (err) {
    console.warn('[EightTailCat-Pet-Mobile] 设置注入失败', err);
    return false;
  }
}

function scheduleSettingsInjection() {
  let tries = 0;
  const tick = async function () {
    tries += 1;
    try {
      if (await injectSettingsDrawer()) return;
    } catch (_) {}
    if (tries < 50) setTimeout(tick, tries < 10 ? 400 : 1000);
  };
  tick();
  try {
    const obs = new MutationObserver(function () {
      if (settingsInjected) { obs.disconnect(); return; }
      injectSettingsDrawer().catch(function () {});
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { obs.disconnect(); } catch (_) {} }, 90000);
  } catch (_) {}
}

function clampDockTop(top, dockH) {
  const h = dockH || 42;
  const minT = EDGE_PAD;
  const maxT = Math.max(minT, window.innerHeight - h - EDGE_PAD);
  let y = Number(top);
  if (isNaN(y)) y = Math.max(minT, (window.innerHeight - h) / 2);
  return Math.min(maxT, Math.max(minT, y));
}

function applyDockTop(dock, top) {
  const y = clampDockTop(top, dock.offsetHeight || 42);
  dock.style.top = y + 'px';
  dock.style.right = '0';
  dock.style.bottom = 'auto';
  dock.style.transform = 'none';
  dock.dataset.dockTop = String(y);
  return y;
}

function clampDockPosition() {
  const dock = document.getElementById(DOCK_ID);
  if (!dock) return;
  const saved = dock.dataset.dockTop != null
    ? parseFloat(dock.dataset.dockTop)
    : readDockTopFromLocal();
  if (saved == null || isNaN(saved)) {
    applyDockTop(dock, (window.innerHeight - (dock.offsetHeight || 42)) / 2);
    return;
  }
  applyDockTop(dock, saved);
}

function ensureDock() {
  let dock = document.getElementById(DOCK_ID);
  if (dock) {
    if (dock.parentNode !== document.body) document.body.appendChild(dock);
    return dock;
  }

  dock = document.createElement('button');
  dock.id = DOCK_ID;
  dock.type = 'button';
  dock.setAttribute('aria-label', '显示或隐藏八条猫');
  dock.title = '显示 / 隐藏桌宠';
  dock.innerHTML = '<span class="etc-dock-paw" aria-hidden="true">🐾</span>';

  let dragging = false;
  let moved = false;
  let startY = 0;
  let originTop = 0;
  let pointerId = null;

  dock.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    startY = e.clientY;
    const cur = parseFloat(dock.dataset.dockTop);
    originTop = !isNaN(cur) ? cur : dock.getBoundingClientRect().top;
    dock.classList.add('is-dragging');
    dock.style.transition = 'none';
    try { dock.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  });

  dock.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    applyDockTop(dock, originTop + dy);
    e.preventDefault();
    e.stopPropagation();
  });

  function endDockPointer(e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    dragging = false;
    dock.classList.remove('is-dragging');
    try { dock.releasePointerCapture(e.pointerId); } catch (_) {}
    pointerId = null;
    if (moved) {
      writeDockTopToLocal(applyDockTop(dock, parseFloat(dock.dataset.dockTop)));
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    togglePet();
  }

  dock.addEventListener('pointerup', endDockPointer);
  dock.addEventListener('pointercancel', endDockPointer);
  dock.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(dock);
  const savedTop = readDockTopFromLocal();
  if (savedTop != null) applyDockTop(dock, savedTop);
  else applyDockTop(dock, (window.innerHeight - 42) / 2);
  syncDock();
  return dock;
}

function syncDock() {
  const dock = document.getElementById(DOCK_ID) || ensureDock();
  const overlay = document.getElementById(OVERLAY_ID);
  const visible = !!(ensureSettings().visible && overlay && !overlay.classList.contains('eighttailcat-hidden'));
  dock.classList.toggle('is-collapsed', !visible);
  dock.title = visible ? '收起桌宠' : '展开桌宠';
  dock.setAttribute('aria-label', dock.title);
}

/* ---------- 启动 ---------- */
jQuery(async function () {
  try {
    ensureSettings();
    writeVisibleToLocal(!!ensureSettings().visible);
    const overlay0 = mountOverlay(getExtBase());
    ensureOverlayOnBody(overlay0);
    if (ensureSettings().visible) forceShowStyles(overlay0);
    ensureDock();
    scheduleSettingsInjection();

    /* 防止酒馆 DOM 重排把浮层塞回 overflow:hidden 容器 */
    setInterval(function () {
      const el = document.getElementById(OVERLAY_ID);
      if (el) ensureOverlayOnBody(el);
      const dock = document.getElementById(DOCK_ID);
      if (dock && dock.parentElement !== document.body) {
        try { document.body.appendChild(dock); } catch (_) {}
      }
    }, 2000);

    if (eventSource && event_types && event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, function () {
        ensureOverlayOnBody(document.getElementById(OVERLAY_ID) || mountOverlay(getExtBase()));
        if (ensureSettings().visible) {
          const el = document.getElementById(OVERLAY_ID);
          if (el) forceShowStyles(el);
        }
        injectSettingsDrawer().catch(function () {});
        ensureDock();
        syncDock();
        clampDockPosition();
      });
    }
  } catch (err) {
    console.error('[EightTailCat-Pet-Mobile] 启动失败', err);
    /* 最后兜底：仍尝试挂一个可见容器 */
    try {
      const el = mountOverlay(getExtBase());
      forceShowStyles(el);
      ensureOverlayOnBody(el);
    } catch (_) {}
  }
});
