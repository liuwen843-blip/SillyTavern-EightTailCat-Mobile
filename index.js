import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';

const MODULE = 'EightTailCat-Pet-Mobile';
const OVERLAY_ID = 'pet-container-mobile';
const FRAME_ID = 'eighttailcat-frame-mobile';
const SETTINGS_ID = 'eighttailcat-mobile-settings';
const DOCK_ID = 'eighttailcat-mobile-dock';
const VISIBLE_LS_KEY = 'EightTailCat-Pet-Mobile.visible';
const TOP_SAFE = 50;

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
    return new URL('./', import.meta.url).href;
  } catch (_) {
    return './';
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
    top: isNaN(t) ? TOP_SAFE : t,
  };
}

function clampOverlayPos(el, left, top) {
  const w = el.offsetWidth || 280;
  const h = el.offsetHeight || 360;
  const maxL = Math.max(0, window.innerWidth - w);
  const minT = TOP_SAFE;
  const maxT = Math.max(minT, window.innerHeight - h);
  let x = Number(left);
  let y = Number(top);
  if (isNaN(x)) x = 0;
  if (isNaN(y)) y = minT;
  x = Math.min(maxL, Math.max(0, x));
  y = Math.min(maxT, Math.max(minT, y));
  return { left: x, top: y, w, h };
}

/** 使用 translate3d 定位，拖拽时无 transition，保证跟手 */
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
  const defT = Math.max(TOP_SAFE, window.innerHeight - h - 8);
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
  return setOverlayPos(el, Math.max(0, (window.innerWidth - def.w) / 2), Math.max(TOP_SAFE, window.innerHeight - def.h - 8));
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
  const cx = data.clientX != null ? Number(data.clientX) : NaN;
  const cy = data.clientY != null ? Number(data.clientY) : NaN;
  if (!isNaN(cx) && !isNaN(cy)) return { x: cx, y: cy };
  return {
    x: Number(data.screenX) || 0,
    y: Number(data.screenY) || 0,
  };
}

function mountOverlay(base) {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;

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
  /* 使用移动端深度适配后的 index.html */
  iframe.src = (base || getExtBase()) + 'index.html';
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

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

/** 右缘常驻极小猫爪：一键收起/展开桌宠 */
function ensureDock() {
  let dock = document.getElementById(DOCK_ID);
  if (dock) return dock;
  dock = document.createElement('button');
  dock.id = DOCK_ID;
  dock.type = 'button';
  dock.setAttribute('aria-label', '显示或隐藏八条猫');
  dock.title = '显示 / 隐藏桌宠';
  dock.innerHTML = '<span aria-hidden="true">🐾</span>';
  dock.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    togglePet();
  });
  document.body.appendChild(dock);
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
  mountOverlay(getExtBase());
  ensureDock();
  scheduleSettingsInjection();

  try {
    if (eventSource && event_types && event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, function () {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);
        injectSettingsDrawer().catch(function () {});
        ensureDock();
        syncDock();
      });
    }
  } catch (_) {}
});
