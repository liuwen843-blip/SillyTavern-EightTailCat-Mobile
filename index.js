import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';

const MODULE = 'EightTailCat-Pet-Mobile';
const OVERLAY_ID = 'pet-container-mobile';
const FRAME_ID = 'eighttailcat-frame-mobile';
const SETTINGS_ID = 'eighttailcat-mobile-settings';
const DOCK_ID = 'eighttailcat-mobile-dock';
const VISIBLE_LS_KEY = 'EightTailCat-Pet-Mobile.visible';
const DOCK_TOP_LS_KEY = 'EightTailCat-Pet-Mobile.dockTop';
/** 垂直安全边距：上/下各 10px */
const EDGE_PAD = 10;

const defaultSettings = {
  visible: true,
  left: null,
  top: null,
};

function readVisibleFromLocal() {
  try {
    const raw = localStorage.getItem(VISIBLE_LS_KEY);
    if (raw === '0' || raw === 'false') return false;
    if (raw === '1' || raw === 'true') return true;
  } catch (_) {}
  return null;
}

function writeVisibleToLocal(visible) {
  try {
    localStorage.setItem(VISIBLE_LS_KEY, visible ? '1' : '0');
  } catch (_) {}
}

function readDockTopFromLocal() {
  try {
    const n = parseFloat(localStorage.getItem(DOCK_TOP_LS_KEY));
    if (!isNaN(n)) return n;
  } catch (_) {}
  return null;
}

function writeDockTopToLocal(top) {
  try {
    localStorage.setItem(DOCK_TOP_LS_KEY, String(top));
  } catch (_) {}
}

function ensureSettings() {
  if (!extension_settings[MODULE]) {
    extension_settings[MODULE] = Object.assign({}, defaultSettings);
  }
  const s = extension_settings[MODULE];
  const fromLs = readVisibleFromLocal();
  if (typeof s.visible !== 'boolean') {
    s.visible = fromLs == null ? true : fromLs;
  } else {
    writeVisibleToLocal(!!s.visible);
  }
  return s;
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
  const l = parseFloat(el.style.left);
  const t = parseFloat(el.style.top);
  return {
    left: isNaN(l) ? 0 : l,
    top: isNaN(t) ? EDGE_PAD : t,
  };
}

/**
 * 视口全屏边界：
 * 水平 0 ~ innerWidth - petWidth
 * 垂直 EDGE_PAD ~ innerHeight - petHeight - EDGE_PAD
 */
function clampOverlayPos(el, left, top) {
  const w = el.offsetWidth || 280;
  const h = el.offsetHeight || 360;
  /* 必须用浏览器视口，禁止任何局部容器尺寸 */
  const vw = window.innerWidth || document.documentElement.clientWidth || w;
  const vh = window.innerHeight || document.documentElement.clientHeight || h;
  const maxL = Math.max(0, vw - w);
  const minT = EDGE_PAD;
  const maxT = Math.max(minT, vh - h - EDGE_PAD);
  let x = Number(left);
  let y = Number(top);
  if (isNaN(x)) x = 0;
  if (isNaN(y)) y = minT;
  x = Math.min(maxL, Math.max(0, x));
  y = Math.min(maxT, Math.max(minT, y));
  return { left: x, top: y, w: w, h: h };
}


/** 使用 translate3d 定位，拖拽时强制无 transition，保证跟手 */
function setOverlayPos(el, left, top) {
  const pos = clampOverlayPos(el, left, top);
  el.style.transition = 'none';
  el.style.willChange = 'transform';
  el.style.left = '0px';
  el.style.top = '0px';
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

function defaultBottomRight(el) {
  const w = el.classList.contains('eighttailcat-expanded')
    ? Math.min(520, window.innerWidth * 0.96)
    : Math.min(280, window.innerWidth * 0.72);
  const h = el.classList.contains('eighttailcat-expanded')
    ? Math.min(720, window.innerHeight * 0.8)
    : Math.min(360, window.innerHeight * 0.55);
  const defL = Math.max(0, window.innerWidth - w - 8);
  const defT = Math.max(EDGE_PAD, window.innerHeight - h - EDGE_PAD);
  return { left: defL, top: defT, w, h };
}

function applySavedPos(el) {
  const s = ensureSettings();
  const def = defaultBottomRight(el);
  const left = s.left == null ? def.left : s.left;
  const top = s.top == null ? def.top : s.top;
  return setOverlayPos(el, left, top);
}

function placeExpandedSheet(el) {
  const def = defaultBottomRight(el);
  return setOverlayPos(
    el,
    Math.max(0, (window.innerWidth - def.w) / 2),
    Math.max(EDGE_PAD, window.innerHeight - def.h - EDGE_PAD)
  );
}

function savePos(left, top) {
  const s = ensureSettings();
  s.left = left;
  s.top = top;
  saveSettingsDebounced();
}

function setPetVisible(visible, opts) {
  opts = opts || {};
  const overlay = document.getElementById(OVERLAY_ID) || (opts.mountIfNeeded ? mountOverlay(getExtBase()) : null);
  const s = ensureSettings();
  s.visible = !!visible;
  writeVisibleToLocal(!!visible);
  if (!opts.skipSave) saveSettingsDebounced();
  if (overlay) {
    overlay.classList.toggle('eighttailcat-hidden', !visible);
    if (visible) {
      try { applySavedPos(overlay); } catch (_) {}
    }
  }
  syncDock();
  syncToggleButtonLabel();
}

function pointFromMessage(data) {
  /* 优先 screenX/Y：跨 iframe 时 clientX 只相对 iframe，screen 差值才能稳定映射到宿主视口 */
  const sx = data.screenX != null ? Number(data.screenX) : NaN;
  const sy = data.screenY != null ? Number(data.screenY) : NaN;
  if (!isNaN(sx) && !isNaN(sy)) return { x: sx, y: sy };
  const cx = data.clientX != null ? Number(data.clientX) : NaN;
  const cy = data.clientY != null ? Number(data.clientY) : NaN;
  if (!isNaN(cx) && !isNaN(cy)) return { x: cx, y: cy };
  return { x: 0, y: 0 };
}


/** 强制桌宠容器挂在 document.body，脱离酒馆 overflow:hidden 父级 */
function ensureOverlayOnBody(el) {
  if (!el) return el;
  try {
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  } catch (_) {}
  try {
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('z-index', '9999', 'important');
    el.style.setProperty('left', '0px', 'important');
    el.style.setProperty('top', '0px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('pointer-events', 'auto', 'important');
    el.style.setProperty('transition', 'none', 'important');
  } catch (_) {}
  return el;
}

function mountOverlay(base) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    return ensureOverlayOnBody(overlay);
  }

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('aria-label', '八条猫桌宠 (移动触屏版)');
  overlay.style.touchAction = 'none';
  overlay.style.willChange = 'transform';

  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.title = '八条猫桌宠 (移动触屏版)';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  iframe.src = (base || getExtBase()) + 'index.html';
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  ensureOverlayOnBody(overlay);

  const s = ensureSettings();
  overlay.classList.toggle('eighttailcat-hidden', !s.visible);
  applySavedPos(overlay);
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
      setPetVisible(true);
    } else if (data.type === 'eighttailcat-expand') {
      overlay.classList.toggle('eighttailcat-expanded', !!data.on);
      if (data.on) placeExpandedSheet(overlay);
      else applySavedPos(overlay);
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
  const hide = !overlay.classList.contains('eighttailcat-hidden');
  setPetVisible(!hide);
}

function openPetSettings() {
  setPetVisible(true, { mountIfNeeded: true });
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

function showPetOnly() {
  setPetVisible(true, { mountIfNeeded: true });
}

const SETTINGS_FALLBACK = `
<div id="eighttailcat-mobile-settings" class="eighttailcat-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>八条猫设置 (移动触屏版)</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <p class="margin0">可用侧边栏或屏幕右侧猫爪按钮显示/隐藏桌宠。</p>
      <div class="eighttailcat-actions">
        <div id="eighttailcat-mobile-open-panel" class="menu_button menu_button_icon">打开八条猫面板</div>
        <div id="eighttailcat-mobile-toggle-pet" class="menu_button menu_button_icon">显示 / 隐藏桌宠</div>
      </div>
    </div>
  </div>
</div>`;

function findSettingsRoot() {
  const candidates = [
    '#extensions_settings2',
    '#extensions_settings',
    '#rm_extensions_block',
  ];
  for (let i = 0; i < candidates.length; i++) {
    const $el = $(candidates[i]);
    if ($el.length) return $el.first();
  }
  return null;
}

function bindSettingsButtons($scope) {
  const $root = $scope && $scope.length ? $scope : $(document);
  $root.find('#eighttailcat-mobile-open-panel').off('click.etcMobile').on('click.etcMobile', function (e) {
    e.preventDefault();
    openPetSettings();
  });
  $root.find('#eighttailcat-mobile-toggle-pet').off('click.etcMobile').on('click.etcMobile', function (e) {
    e.preventDefault();
    togglePet();
  });
  syncToggleButtonLabel();
}

function syncToggleButtonLabel() {
  const btn = document.getElementById('eighttailcat-mobile-toggle-pet');
  if (!btn) return;
  btn.textContent = ensureSettings().visible ? '隐藏桌宠' : '显示桌宠';
}

async function loadSettingsHtml() {
  const folder = getExtensionFolderName();
  const paths = ['third-party/' + folder, 'third-party/' + MODULE, folder, MODULE];
  const ctx = window.SillyTavern && SillyTavern.getContext && SillyTavern.getContext();
  if (ctx && typeof ctx.renderExtensionTemplateAsync === 'function') {
    for (let i = 0; i < paths.length; i++) {
      try {
        const html = await ctx.renderExtensionTemplateAsync(paths[i], 'settings');
        if (html && String(html).indexOf('eighttailcat-mobile') >= 0) return String(html);
      } catch (_) {}
    }
  }
  return SETTINGS_FALLBACK;
}

let settingsInjected = false;

async function injectSettingsDrawer() {
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
}

function scheduleSettingsInjection() {
  let tries = 0;
  const tick = async function () {
    tries += 1;
    try {
      if (await injectSettingsDrawer()) return;
    } catch (err) {
      console.warn('[EightTailCat-Pet-Mobile] 设置注入失败', err);
    }
    if (tries < 40) setTimeout(tick, tries < 10 ? 400 : 1000);
  };
  tick();
  try {
    const obs = new MutationObserver(function () {
      if (settingsInjected) {
        obs.disconnect();
        return;
      }
      injectSettingsDrawer().catch(function () {});
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { try { obs.disconnect(); } catch (_) {} }, 60000);
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
    /* 默认右侧垂直居中 */
    const h = dock.offsetHeight || 42;
    applyDockTop(dock, (window.innerHeight - h) / 2);
    return;
  }
  applyDockTop(dock, saved);
}

/**
 * 右缘半圆猫爪悬浮球：42×42、可上下拖、点击显隐桌宠与侧边快捷钮
 */
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

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    startY = e.clientY;
    const cur = parseFloat(dock.dataset.dockTop);
    originTop = !isNaN(cur) ? cur : (dock.getBoundingClientRect().top);
    dock.classList.add('is-dragging');
    dock.style.transition = 'none';
    try { dock.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    applyDockTop(dock, originTop + dy);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    if (pointerId != null && e.pointerId !== pointerId) return;
    dragging = false;
    dock.classList.remove('is-dragging');
    try { dock.releasePointerCapture(e.pointerId); } catch (_) {}
    pointerId = null;
    if (moved) {
      const y = applyDockTop(dock, parseFloat(dock.dataset.dockTop));
      writeDockTopToLocal(y);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    /* 未滑动：视为点击，一键显隐猫咪 + 侧边快捷键（均在 overlay 内） */
    e.preventDefault();
    e.stopPropagation();
    togglePet();
  }

  dock.addEventListener('pointerdown', onPointerDown);
  dock.addEventListener('pointermove', onPointerMove);
  dock.addEventListener('pointerup', onPointerUp);
  dock.addEventListener('pointercancel', onPointerUp);
  /* 阻止默认 click，避免与 pointer 逻辑重复触发 */
  dock.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  document.body.appendChild(dock);

  const savedTop = readDockTopFromLocal();
  if (savedTop != null) {
    applyDockTop(dock, savedTop);
  } else {
    const h = 42;
    applyDockTop(dock, (window.innerHeight - h) / 2);
  }

  syncDock();
  return dock;
}

function syncDock() {
  const dock = document.getElementById(DOCK_ID) || ensureDock();
  const visible = ensureSettings().visible;
  dock.classList.toggle('is-collapsed', !visible);
  dock.title = visible ? '收起桌宠' : '展开桌宠';
  dock.setAttribute('aria-label', dock.title);
}

jQuery(async function () {
  ensureSettings();
  writeVisibleToLocal(!!ensureSettings().visible);
  const overlay0 = mountOverlay(getExtBase());
  ensureOverlayOnBody(overlay0);
  ensureDock();
  scheduleSettingsInjection();

  /* 防止酒馆 DOM 重排把浮层塞回 overflow:hidden 容器 */
  try {
    setInterval(function () {
      const el = document.getElementById(OVERLAY_ID);
      if (el) ensureOverlayOnBody(el);
      const dock = document.getElementById(DOCK_ID);
      if (dock && dock.parentElement !== document.body) {
        try { document.body.appendChild(dock); } catch (_) {}
      }
    }, 2000);
  } catch (_) {}

  try {
    if (eventSource && event_types && event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, function () {
        const overlay = document.getElementById(OVERLAY_ID);
        ensureOverlayOnBody(overlay || mountOverlay(getExtBase()));
        injectSettingsDrawer().catch(function () {});
        ensureDock();
        syncDock();
        clampDockPosition();
      });
    }
  } catch (_) {}
});
