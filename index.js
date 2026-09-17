import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';
import {
  openShortVideoPlayer,
  closeShortVideoPlayer,
  toggleShortVideoPlayer,
  isShortVideoOpen,
  pauseMuteShortVideoPlayer,
  hideVideoAppForPicacg,
  showVideoAppAfterPicacg,
} from './short-video.js';
import {
  openPicacgApp,
  closePicacgApp,
  togglePicacgApp,
  isPicacgOpen,
} from './picacg.js';

/**
 * 八条猫 · 移动触屏宿主层（强制单例）
 * - 挂载前清理一切旧容器 / 悬浮球，杜绝叠猫
 * - 统一 togglePetVisibility 控制显隐
 * - 内嵌短视频挂 document.body，不离开酒馆页
 */

const MODULE = 'EightTailCat-Pet-Mobile';
const ROOT_ID = 'eight-tail-pet-mobile-root';
const TOGGLE_ID = 'eight-tail-mobile-toggle-btn';
const FRAME_ID = 'eight-tail-mobile-frame';
const SETTINGS_ID = 'eighttailcat-mobile-settings';
const FALLBACK_ID = 'eight-tail-mobile-fallback';
const VISIBLE_LS_KEY = 'eight_tail_pet_mobile_visible';
const DOCK_TOP_LS_KEY = 'EightTailCat-Pet-Mobile.dockTop';
const EDGE_PAD = 10;

/* 兼容旧 localStorage / 旧 DOM id */
const LEGACY_VISIBLE_KEYS = [
  VISIBLE_LS_KEY,
  'EightTailCat-Pet-Mobile.visible',
];
const LEGACY_ROOT_IDS = [
  ROOT_ID,
  'pet-container-mobile',
  'eighttailcat-pet-mobile-root',
  'eighttailcat-mobile-root',
];
const LEGACY_TOGGLE_IDS = [
  TOGGLE_ID,
  'eighttailcat-mobile-dock',
  'eight-tail-mobile-dock',
];

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
  for (let i = 0; i < LEGACY_VISIBLE_KEYS.length; i++) {
    try {
      const raw = localStorage.getItem(LEGACY_VISIBLE_KEYS[i]);
      if (raw === '0' || raw === 'false') return false;
      if (raw === '1' || raw === 'true') return true;
    } catch (_) {}
  }
  return null;
}

function writeVisibleToLocal(visible) {
  const v = visible ? '1' : '0';
  try { localStorage.setItem(VISIBLE_LS_KEY, v); } catch (_) {}
  try { localStorage.setItem('EightTailCat-Pet-Mobile.visible', v); } catch (_) {}
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
    if (fromLs == null && s.visible !== true) s.visible = true;
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

/** 启动/挂载前：清掉所有历史幽灵猫与悬浮球 */
function purgeGhostPets() {
  const removeAll = function (sel) {
    try {
      document.querySelectorAll(sel).forEach(function (el) {
        try { el.remove(); } catch (_) {}
      });
    } catch (_) {}
  };

  LEGACY_ROOT_IDS.forEach(function (id) { removeAll('#' + id); });
  LEGACY_TOGGLE_IDS.forEach(function (id) { removeAll('#' + id); });
  removeAll('[id^="eighttailcat-frame"]');
  removeAll('[id^="eight-tail-mobile-frame"]');
  removeAll('[id^="eighttailcat-mobile-fallback"]');
  removeAll('[id^="eight-tail-mobile-fallback"]');
  /* 兜底：带本扩展 data 标记的节点 */
  removeAll('[data-eight-tail-mobile="root"]');
  removeAll('[data-eight-tail-mobile="toggle"]');
}

function readOverlayPos(el) {
  const x = parseFloat(el.dataset.posX);
  const y = parseFloat(el.dataset.posY);
  if (!isNaN(x) && !isNaN(y)) return { left: x, top: y };
  return { left: 0, top: EDGE_PAD };
}

function clampOverlayPos(el, left, top) {
  const w = (el && el.offsetWidth) || 300;
  const h = (el && el.offsetHeight) || 400;
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

function defaultRightCenterPos(el) {
  const w = (el && el.offsetWidth) || 300;
  const h = (el && el.offsetHeight) || 400;
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  return {
    left: Math.max(0, vw - w - 16),
    top: Math.max(EDGE_PAD, Math.round((vh - h) / 2)),
  };
}

function centerPos(el) {
  const w = (el && el.offsetWidth) || 300;
  const h = (el && el.offsetHeight) || 400;
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

function getRoot() {
  return document.getElementById(ROOT_ID);
}

function isRootHidden(root) {
  if (!root) return true;
  if (root.classList.contains('eighttailcat-hidden')) return true;
  const d = (root.style && root.style.display) || '';
  if (d === 'none') return true;
  try {
    const cs = window.getComputedStyle(root);
    if (cs && cs.display === 'none') return true;
  } catch (_) {}
  return false;
}

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
    el.style.setProperty('border', '0', 'important');
    el.style.setProperty('background', 'transparent', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
    if (!el.classList.contains('eighttailcat-expanded')) {
      el.style.setProperty('width', 'min(260px, 72vw)', 'important');
      el.style.setProperty('height', 'min(300px, 58vh)', 'important');
    }
    /* 尊重显隐：隐藏时绝不再强制 display:block */
    if (isRootHidden(el) || !ensureSettings().visible) {
      el.classList.add('eighttailcat-hidden');
      el.style.setProperty('display', 'none', 'important');
    } else {
      el.classList.remove('eighttailcat-hidden');
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

/**
 * 判断 iframe 内命中点是否落在可交互桌宠元素上
 * （外层透明区域应穿透到酒馆 UI）
 */
function isPetInteractiveHit(el) {
  if (!el || !el.closest) return false;
  try {
    if (el.closest('#cat-wrap') || el.closest('#cat') || el.closest('#pet-video')) return true;
    if (el.closest('canvas.pet-canvas') || el.closest('#cat-wrap canvas')) return true;
    if (el.closest('button') || el.closest('.action-btn') || el.closest('.app-hub-btn')) return true;
    if (el.closest('#chat-spark') || el.closest('#memo-btn') || el.closest('#food-btn')) return true;
    if (el.closest('#game-btn') || el.closest('#btn-pet-quit') || el.closest('#fav-star')) return true;
    if (el.closest('#bubble.show') || el.closest('.pet-dialog-bubble')) return true;
    if (el.closest('.info-capsule-badge.show') || el.closest('.pet-countdown-capsule')) return true;
    if (el.closest('#food-reel.show')) return true;
    if (el.closest('.cfg-modal.is-open') || el.closest('#game-modal.open')) return true;
    if (el.closest('#app-hub-modal.open') || el.closest('#feed-tray-modal.open')) return true;
    if (el.closest('#memo-panel.open') || el.closest('#chat-panel.open')) return true;
    if (el.closest('.mobile-fullscreen-view')) return true;
    if (el.closest('#picacg-main-container.is-open') || el.closest('#picacg-auth-modal.is-open')) return true;
    if (el.closest('#video-app-container.is-open') || el.closest('#eight-tail-short-video-root.is-open')) return true;
  } catch (_) {}
  return false;
}

let _etcPeBound = false;
let _etcPeHoldUntil = 0;

function setIframePointerEvents(iframe, on) {
  if (!iframe) return;
  if (on) {
    iframe.classList.add('etc-pe-on');
    iframe.style.setProperty('pointer-events', 'auto', 'important');
  } else {
    iframe.classList.remove('etc-pe-on');
    iframe.style.setProperty('pointer-events', 'none', 'important');
  }
}

function hitTestPetIframe(iframe, clientX, clientY) {
  if (!iframe) return false;
  let doc = null;
  try { doc = iframe.contentDocument; } catch (_) { return true; }
  if (!doc) return false;
  const r = iframe.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
  const x = clientX - r.left;
  const y = clientY - r.top;
  let el = null;
  try { el = doc.elementFromPoint(x, y); } catch (_) { return false; }
  return isPetInteractiveHit(el);
}

/**
 * 宿主层：iframe 默认可穿透；仅当指针落在猫咪/按钮等可点区域时临时开启
 */
function setupIframeClickThrough(iframe) {
  if (!iframe || _etcPeBound) return;
  _etcPeBound = true;
  setIframePointerEvents(iframe, false);

  function syncPe(e) {
    const root = getRoot();
    const frame = document.getElementById(FRAME_ID) || iframe;
    if (!root || !frame || isRootHidden(root)) {
      setIframePointerEvents(frame, false);
      return;
    }
    /* 展开设置/全屏面板时保持可点 */
    if (root.classList.contains('eighttailcat-expanded')) {
      setIframePointerEvents(frame, true);
      return;
    }
    if (Date.now() < _etcPeHoldUntil) {
      setIframePointerEvents(frame, true);
      return;
    }
    const hit = hitTestPetIframe(frame, e.clientX, e.clientY);
    setIframePointerEvents(frame, hit);
  }

  function holdPe(e) {
    const frame = document.getElementById(FRAME_ID) || iframe;
    if (hitTestPetIframe(frame, e.clientX, e.clientY)) {
      _etcPeHoldUntil = Date.now() + 800;
      setIframePointerEvents(frame, true);
    }
  }

  document.addEventListener('pointermove', syncPe, true);
  document.addEventListener('pointerdown', holdPe, true);
  document.addEventListener('touchstart', function (e) {
    if (!e.touches || !e.touches.length) return;
    holdPe(e.touches[0]);
  }, true);
  document.addEventListener('pointerup', function () {
    _etcPeHoldUntil = 0;
  }, true);
}

function ensureFallbackFace(overlay) {
  let face = overlay.querySelector('#' + FALLBACK_ID);
  if (face) return face;
  face = document.createElement('div');
  face.id = FALLBACK_ID;
  face.setAttribute('aria-hidden', 'true');
  face.textContent = '🐱';
  face.style.cssText = [
    'position:absolute',
    'inset:0',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'font-size:72px',
    'line-height:1',
    'pointer-events:none',
    'z-index:0',
    'user-select:none',
    'background:transparent',
    'border:0',
    'outline:none',
    'box-shadow:none',
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

/**
 * 全局显隐（门按钮 / 猫爪球 / 侧边栏共用）
 * @param {boolean|undefined} forceState true=显示，false=隐藏，省略=取反
 */
function togglePetVisibility(forceState) {
  let root = getRoot();
  if (!root && (forceState === true || forceState === undefined)) {
    root = mountOverlay(getExtBase());
  }
  if (!root) return false;

  const isCurrentlyHidden = isRootHidden(root) || !ensureSettings().visible;
  const nextState = (forceState !== undefined) ? !!forceState : isCurrentlyHidden;

  const s = ensureSettings();
  s.visible = nextState;
  writeVisibleToLocal(nextState);
  safeCall(function () { saveSettingsDebounced(); });

  ensureOverlayOnBody(root);
  if (nextState) {
    forceShowStyles(root);
    try { applySavedOrDefaultPos(root); } catch (_) {}
  } else {
    root.classList.add('eighttailcat-hidden');
    root.style.setProperty('display', 'none', 'important');
  }

  syncDock();
  syncToggleButtonLabel();
  return nextState;
}

function setPetVisible(visible, opts) {
  opts = opts || {};
  if (visible && opts.mountIfNeeded && !getRoot()) mountOverlay(getExtBase());
  const shown = togglePetVisibility(!!visible);
  if (shown && opts.center) {
    const el = getRoot();
    if (el) {
      const c = centerPos(el);
      setOverlayPos(el, c.left, c.top);
      savePos(c.left, c.top);
    }
  }
}

function showPetCentered() {
  mountOverlay(getExtBase());
  togglePetVisibility(true);
  requestAnimationFrame(function () {
    const el = getRoot();
    if (!el) return;
    forceShowStyles(el);
    const c = centerPos(el);
    setOverlayPos(el, c.left, c.top);
    savePos(c.left, c.top);
  });
}

function togglePet() {
  togglePetVisibility();
}

let hostListenersBound = false;

function bindHostListenersOnce() {
  if (hostListenersBound || window.__EIGHT_TAIL_MOBILE_MSG_BOUND__) {
    hostListenersBound = true;
    return;
  }
  hostListenersBound = true;
  window.__EIGHT_TAIL_MOBILE_MSG_BOUND__ = true;

  let dragging = false;
  let startSX = 0;
  let startSY = 0;
  let originL = 0;
  let originT = 0;

  window.addEventListener('message', function (ev) {
    const data = ev && ev.data;
    if (!data || typeof data !== 'object') return;

    /* 媒体中心：桌宠 📱 只发 toggle，绝不带 Scheme */
    if (
      data.type === 'eight-tail-toggle-media-hub' ||
      data.type === 'eighttailcat-toggle-media-hub' ||
      data.type === 'eight-tail-toggle-short-video'
    ) {
      toggleShortVideoPlayer();
      return;
    }
    if (data.type === 'eight-tail-media-play') {
      const plat = data.platform;
      openShortVideoPlayer().then(function () {
        setTimeout(function () {
          try {
            if (plat === 'youtube' && typeof window.__etcPlayYoutube === 'function') {
              window.__etcPlayYoutube();
            } else if (plat === 'pornhub' && typeof window.__etcPlayPornhub === 'function') {
              window.__etcPlayPornhub();
            }
          } catch (_) {}
        }, 60);
      });
      return;
    }
    if (
      data.type === 'eight-tail-open-picacg' ||
      data.type === 'eighttailcat-open-picacg'
    ) {
      try { hideVideoAppForPicacg(); } catch (_) {}
      openPicacgApp();
      return;
    }
    if (
      data.type === 'eight-tail-close-picacg' ||
      data.type === 'eighttailcat-close-picacg'
    ) {
      closePicacgApp();
      try { showVideoAppAfterPicacg(); } catch (_) {}
      return;
    }
    if (
      data.type === 'eight-tail-open-short-video' ||
      data.type === 'eighttailcat-open-short-video' ||
      data.type === 'eight-tail-open-media-hub'
    ) {
      openShortVideoPlayer();
      return;
    }
    if (
      data.type === 'eight-tail-close-short-video' ||
      data.type === 'eighttailcat-close-short-video' ||
      data.type === 'eight-tail-close-media-hub'
    ) {
      closeShortVideoPlayer();
      return;
    }

    const root = getRoot();
    if (!root) return;

    if (data.type === 'eighttailcat-drag-start') {
      ensureOverlayOnBody(root);
      dragging = true;
      root.classList.add('is-dragging');
      root.style.transition = 'none';
      const p = pointFromMessage(data);
      startSX = p.x;
      startSY = p.y;
      const cur = readOverlayPos(root);
      originL = cur.left;
      originT = cur.top;
    } else if (data.type === 'eighttailcat-drag-move' && dragging) {
      const p = pointFromMessage(data);
      scheduleOverlayPos(root, originL + (p.x - startSX), originT + (p.y - startSY));
    } else if (data.type === 'eighttailcat-drag-end') {
      dragging = false;
      root.classList.remove('is-dragging');
      if (overlayRaf) {
        cancelAnimationFrame(overlayRaf);
        overlayRaf = 0;
        setOverlayPos(root, pendingLeft, pendingTop);
      }
      const pos = readOverlayPos(root);
      const clamped = setOverlayPos(root, pos.left, pos.top);
      savePos(clamped.left, clamped.top);
      root.style.willChange = 'auto';
    } else if (
      data.type === 'eighttailcat-hide' ||
      data.type === 'eight-tail-mobile-hide'
    ) {
      togglePetVisibility(false);
    } else if (
      data.type === 'eighttailcat-show' ||
      data.type === 'eight-tail-mobile-show'
    ) {
      showPetCentered();
    } else if (
      data.type === 'eighttailcat-toggle-visible' ||
      data.type === 'eight-tail-mobile-toggle'
    ) {
      togglePetVisibility();
    } else if (data.type === 'eighttailcat-expand') {
      root.classList.toggle('eighttailcat-expanded', !!data.on);
      if (data.on) {
        const c = centerPos(root);
        setOverlayPos(root, c.left, Math.max(EDGE_PAD, window.innerHeight - (root.offsetHeight || 360) - EDGE_PAD));
      } else {
        applySavedOrDefaultPos(root);
      }
    } else if (data.type === 'eighttailcat-open-settings') {
      openPetSettings();
    }
  }, false);

  window.addEventListener('resize', function () {
    const root = getRoot();
    if (root && !isRootHidden(root)) {
      const cur = readOverlayPos(root);
      setOverlayPos(root, cur.left, cur.top);
    }
    clampDockPosition();
  });
}

function mountOverlay(base) {
  bindHostListenersOnce();

  let overlay = getRoot();
  if (overlay) {
    /* 已有单例：确保在 body，并保证只有一个 iframe */
    ensureOverlayOnBody(overlay);
    const frames = overlay.querySelectorAll('iframe');
    for (let i = 1; i < frames.length; i++) {
      try { frames[i].remove(); } catch (_) {}
    }
    const frame0 = frames[0] || document.getElementById(FRAME_ID);
    if (frame0) {
      frame0.style.setProperty('pointer-events', 'none', 'important');
      setupIframeClickThrough(frame0);
    }
    return overlay;
  }

  /* 真正新建前再清一次幽灵，避免竞态 */
  purgeGhostPets();

  overlay = document.createElement('div');
  overlay.id = ROOT_ID;
  overlay.dataset.eightTailMobile = 'root';
  overlay.setAttribute('aria-label', '八条猫桌宠 (移动触屏版)');
  overlay.style.touchAction = 'none';
  overlay.style.willChange = 'transform';
  overlay.style.width = 'min(260px, 72vw)';
  overlay.style.height = 'min(300px, 58vh)';
  overlay.style.overflow = 'visible';
  overlay.style.border = '0';
  overlay.style.background = 'transparent';

  ensureFallbackFace(overlay);

  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.title = '八条猫桌宠 (移动触屏版)';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  iframe.style.cssText = 'position:relative;z-index:1;display:block;width:100%;height:100%;border:0;outline:none;background:transparent;pointer-events:none;overflow:visible;';
  iframe.src = (base || getExtBase()) + 'index.html';
  iframe.addEventListener('load', function () {
    const face = overlay.querySelector('#' + FALLBACK_ID);
    if (face) {
      face.style.display = 'none';
      face.style.opacity = '0';
    }
    setupIframeClickThrough(iframe);
  });
  iframe.addEventListener('error', function () {
    const face = overlay.querySelector('#' + FALLBACK_ID);
    if (face) {
      face.style.display = 'flex';
      face.style.opacity = '1';
    }
  });
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  ensureOverlayOnBody(overlay);
  setupIframeClickThrough(iframe);

  const s = ensureSettings();
  if (s.visible) forceShowStyles(overlay);
  else {
    overlay.classList.add('eighttailcat-hidden');
    overlay.style.setProperty('display', 'none', 'important');
  }

  requestAnimationFrame(function () {
    if (!isRootHidden(overlay)) applySavedOrDefaultPos(overlay);
  });
  writeVisibleToLocal(!!s.visible);
  syncDock();
  return overlay;
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
      <p class="margin0">可用侧边栏或屏幕右侧猫爪按钮显示/隐藏桌宠。点「显示桌宠」会立刻召唤到屏幕中央。门按钮🚪也会隐藏桌宠。</p>
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
    const root = getRoot();
    if (!root || isRootHidden(root)) showPetCentered();
    else togglePetVisibility(false);
  }

  $root.find('#eighttailcat-mobile-open-panel').off('click.etcMobile').on('click.etcMobile', onOpen);
  $root.find('#eighttailcat-mobile-toggle-pet').off('click.etcMobile').on('click.etcMobile', onToggle);

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
  const root = getRoot();
  const visible = !!(ensureSettings().visible && root && !isRootHidden(root));
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
  dock.style.setProperty('top', y + 'px', 'important');
  dock.style.setProperty('right', '0', 'important');
  dock.style.setProperty('bottom', 'auto', 'important');
  dock.style.setProperty('transform', 'none', 'important');
  dock.style.setProperty('display', 'flex', 'important');
  dock.style.setProperty('visibility', 'visible', 'important');
  dock.style.setProperty('opacity', '1', 'important');
  dock.style.setProperty('pointer-events', 'auto', 'important');
  dock.style.setProperty('z-index', '100001', 'important');
  dock.dataset.dockTop = String(y);
  return y;
}

function clampDockPosition() {
  const dock = document.getElementById(TOGGLE_ID);
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

function forceDockAlwaysVisible(dock) {
  if (!dock) return;
  dock.style.setProperty('display', 'flex', 'important');
  dock.style.setProperty('visibility', 'visible', 'important');
  dock.style.setProperty('opacity', '1', 'important');
  dock.style.setProperty('pointer-events', 'auto', 'important');
  dock.style.setProperty('z-index', '100001', 'important');
  dock.style.setProperty('position', 'fixed', 'important');
}

function ensureDock() {
  let dock = document.getElementById(TOGGLE_ID);
  if (dock) {
    if (dock.parentNode !== document.body) document.body.appendChild(dock);
    forceDockAlwaysVisible(dock);
    return dock;
  }

  /* 清掉旧悬浮球后再建 */
  LEGACY_TOGGLE_IDS.forEach(function (id) {
    try {
      document.querySelectorAll('#' + id).forEach(function (el) { el.remove(); });
    } catch (_) {}
  });

  dock = document.createElement('button');
  dock.id = TOGGLE_ID;
  dock.dataset.eightTailMobile = 'toggle';
  dock.type = 'button';
  dock.setAttribute('aria-label', '显示或隐藏八条猫');
  dock.title = '显示 / 隐藏桌宠';
  dock.innerHTML = '<span class="etc-dock-paw" aria-hidden="true">🐾</span>';
  forceDockAlwaysVisible(dock);

  let dragging = false;
  let moved = false;
  let startY = 0;
  let originTop = 0;
  let pointerId = null;
  let lastToggleAt = 0;

  function doToggleFromDock(e) {
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
    } catch (_) {}
    const now = Date.now();
    if (now - lastToggleAt < 320) return;
    lastToggleAt = now;
    togglePetVisibility();
  }

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
    e.stopPropagation();
  }, { passive: false });

  dock.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    applyDockTop(dock, originTop + dy);
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false });

  function endDockPointer(e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    dragging = false;
    dock.classList.remove('is-dragging');
    try { dock.releasePointerCapture(e.pointerId); } catch (_) {}
    pointerId = null;
    if (moved) {
      writeDockTopToLocal(applyDockTop(dock, parseFloat(dock.dataset.dockTop)));
      try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
      return;
    }
    doToggleFromDock(e);
  }

  dock.addEventListener('pointerup', endDockPointer);
  dock.addEventListener('pointercancel', endDockPointer);

  dock.addEventListener('click', function (e) {
    /* 未拖动时 click 再兜一次（部分 WebView pointerup 丢失） */
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    doToggleFromDock(e);
  });

  dock.addEventListener('touchend', function (e) {
    if (moved || dragging) return;
    doToggleFromDock(e);
  }, { passive: false });

  document.body.appendChild(dock);
  const savedTop = readDockTopFromLocal();
  if (savedTop != null) applyDockTop(dock, savedTop);
  else applyDockTop(dock, (window.innerHeight - 42) / 2);
  syncDock();
  return dock;
}

function syncDock() {
  const dock = document.getElementById(TOGGLE_ID) || ensureDock();
  forceDockAlwaysVisible(dock);
  const root = getRoot();
  const visible = !!(ensureSettings().visible && root && !isRootHidden(root));
  dock.classList.toggle('is-collapsed', !visible);
  dock.title = visible ? '收起桌宠' : '展开桌宠';
  dock.setAttribute('aria-label', dock.title);
}

/* ---------- 启动（全局单例锁，防脚本重复执行） ---------- */
function bootMobilePet() {
  /* 每次启动都清旧 ID 幽灵；保留当前单例 root（若有） */
  const keep = document.getElementById(ROOT_ID);
  LEGACY_ROOT_IDS.forEach(function (id) {
    if (id === ROOT_ID) return;
    try {
      document.querySelectorAll('#' + id).forEach(function (n) { n.remove(); });
    } catch (_) {}
  });
  LEGACY_TOGGLE_IDS.forEach(function (id) {
    if (id === TOGGLE_ID) return;
    try {
      document.querySelectorAll('#' + id).forEach(function (n) { n.remove(); });
    } catch (_) {}
  });
  /* 同 ID 多节点：只留第一个 */
  try {
    const roots = document.querySelectorAll('#' + ROOT_ID);
    for (let i = 1; i < roots.length; i++) roots[i].remove();
    const toggles = document.querySelectorAll('#' + TOGGLE_ID);
    for (let i = 1; i < toggles.length; i++) toggles[i].remove();
  } catch (_) {}

  if (window.__EIGHT_TAIL_MOBILE_BOOTED__ && keep && document.getElementById(ROOT_ID)) {
    ensureOverlayOnBody(document.getElementById(ROOT_ID));
    ensureDock();
    syncDock();
    bindHostListenersOnce();
    return;
  }
  window.__EIGHT_TAIL_MOBILE_BOOTED__ = true;

  if (!document.getElementById(ROOT_ID)) purgeGhostPets();
  ensureSettings();
  writeVisibleToLocal(!!ensureSettings().visible);
  bindHostListenersOnce();
  const overlay0 = mountOverlay(getExtBase());
  ensureOverlayOnBody(overlay0);
  if (ensureSettings().visible) forceShowStyles(overlay0);
  else {
    overlay0.classList.add('eighttailcat-hidden');
    overlay0.style.setProperty('display', 'none', 'important');
  }
  ensureDock();
  scheduleSettingsInjection();

  setInterval(function () {
    const el = getRoot();
    if (el) ensureOverlayOnBody(el);
    LEGACY_ROOT_IDS.forEach(function (id) {
      if (id === ROOT_ID) return;
      try {
        document.querySelectorAll('#' + id).forEach(function (n) { n.remove(); });
      } catch (_) {}
    });
    const roots = document.querySelectorAll('#' + ROOT_ID);
    for (let i = 1; i < roots.length; i++) {
      try { roots[i].remove(); } catch (_) {}
    }
    const dock = document.getElementById(TOGGLE_ID);
    if (dock) {
      if (dock.parentElement !== document.body) {
        try { document.body.appendChild(dock); } catch (_) {}
      }
      forceDockAlwaysVisible(dock);
    } else {
      ensureDock();
    }
  }, 2500);

  if (eventSource && event_types && event_types.APP_READY) {
    eventSource.on(event_types.APP_READY, function () {
      if (!getRoot()) mountOverlay(getExtBase());
      else ensureOverlayOnBody(getRoot());
      if (ensureSettings().visible) {
        const el = getRoot();
        if (el) forceShowStyles(el);
      }
      injectSettingsDrawer().catch(function () {});
      ensureDock();
      syncDock();
      clampDockPosition();
    });
  }
}

/* 暴露给调试 / 外部调用 */
try {
  window.togglePetVisibility = togglePetVisibility;
  window.__eightTailMobileToggle = togglePetVisibility;
  window.openShortVideoPlayer = openShortVideoPlayer;
  window.closeShortVideoPlayer = closeShortVideoPlayer;
  window.isShortVideoOpen = isShortVideoOpen;
  window.pauseMuteShortVideoPlayer = pauseMuteShortVideoPlayer;
  window.hideVideoAppForPicacg = hideVideoAppForPicacg;
  window.showVideoAppAfterPicacg = showVideoAppAfterPicacg;
  window.openPicacgApp = openPicacgApp;
  window.closePicacgApp = closePicacgApp;
  window.togglePicacgApp = togglePicacgApp;
  window.isPicacgOpen = isPicacgOpen;
} catch (_) {}

jQuery(async function () {
  try {
    bootMobilePet();
  } catch (err) {
    console.error('[EightTailCat-Pet-Mobile] 启动失败', err);
    try {
      purgeGhostPets();
      const el = mountOverlay(getExtBase());
      forceShowStyles(el);
      ensureOverlayOnBody(el);
      ensureDock();
    } catch (_) {}
  }
});
