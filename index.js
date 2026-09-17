import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';

const MODULE = 'EightTailCat-Pet-Mobile';
const OVERLAY_ID = 'pet-container-mobile';
const FRAME_ID = 'eighttailcat-frame-mobile';
const SETTINGS_ID = 'eighttailcat-mobile-settings';
const FAB_ID = 'eighttailcat-mobile-fab';
const VISIBLE_LS_KEY = 'EightTailCat-Pet-Mobile.visible';

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
  } else if (fromLs != null && s.visible !== fromLs) {
    /* 以 extension_settings 为准，回写 localStorage */
    writeVisibleToLocal(!!s.visible);
  }
  return s;
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
  syncFabVisibility();
  syncToggleButtonLabel();
}

function savePos(left, top) {
  const s = ensureSettings();
  s.left = left;
  s.top = top;
  saveSettingsDebounced();
}

function getExtBase() {
  try {
    return new URL('./', import.meta.url).href;
  } catch (_) {
    return './';
  }
}

/** 从安装路径推断扩展目录名，兼容第三方 / 用户目录不同文件夹名 */
function getExtensionFolderName() {
  try {
    const path = new URL('./', import.meta.url).pathname || '';
    const parts = path.split('/').filter(Boolean);
    if (parts.length) return decodeURIComponent(parts[parts.length - 1]);
  } catch (_) {}
  return MODULE;
}

function clampOverlay(el) {
  const w = el.offsetWidth || 294;
  const h = el.offsetHeight || 392;
  const maxL = Math.max(0, window.innerWidth - w);
  const maxT = Math.max(0, window.innerHeight - h);
  let left = parseFloat(el.style.left);
  let top = parseFloat(el.style.top);
  if (isNaN(left)) left = 0;
  if (isNaN(top)) top = 0;
  left = Math.min(maxL, Math.max(0, left));
  top = Math.min(maxT, Math.max(0, top));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  return { left, top };
}

function defaultBottomRight(el) {
  const w = el.classList.contains('eighttailcat-expanded')
    ? Math.min(520, window.innerWidth * 0.96)
    : Math.min(294, window.innerWidth * 0.7);
  const h = el.classList.contains('eighttailcat-expanded')
    ? Math.min(720, window.innerHeight * 0.8)
    : Math.min(392, window.innerHeight * 0.55);
  const defL = Math.max(0, window.innerWidth - w - 12);
  const defT = Math.max(0, window.innerHeight - h - 12);
  return { left: defL, top: defT, w, h };
}

function applySavedPos(el) {
  const s = ensureSettings();
  const def = defaultBottomRight(el);
  el.style.left = (s.left == null ? def.left : s.left) + 'px';
  el.style.top = (s.top == null ? def.top : s.top) + 'px';
  clampOverlay(el);
}

function placeExpandedSheet(el) {
  const def = defaultBottomRight(el);
  el.style.left = Math.max(0, (window.innerWidth - def.w) / 2) + 'px';
  el.style.top = Math.max(0, window.innerHeight - def.h - 8) + 'px';
  clampOverlay(el);
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

  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.title = '八条猫桌宠 (移动触屏版)';
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
  iframe.src = (base || getExtBase()) + 'pet.html';
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
      const p = pointFromMessage(data);
      startSX = p.x;
      startSY = p.y;
      originL = parseFloat(overlay.style.left) || 0;
      originT = parseFloat(overlay.style.top) || 0;
    } else if (data.type === 'eighttailcat-drag-move' && dragging) {
      const p = pointFromMessage(data);
      overlay.style.left = originL + (p.x - startSX) + 'px';
      overlay.style.top = originT + (p.y - startSY) + 'px';
      clampOverlay(overlay);
    } else if (data.type === 'eighttailcat-drag-end') {
      dragging = false;
      const pos = clampOverlay(overlay);
      savePos(pos.left, pos.top);
    } else if (data.type === 'eighttailcat-hide') {
      setPetVisible(false);
    } else if (data.type === 'eighttailcat-show') {
      setPetVisible(true);
    } else if (data.type === 'eighttailcat-expand') {
      overlay.classList.toggle('eighttailcat-expanded', !!data.on);
      if (data.on) placeExpandedSheet(overlay);
      else applySavedPos(overlay);
      clampOverlay(overlay);
    } else if (data.type === 'eighttailcat-open-settings') {
      openPetSettings();
    }
  });

  window.addEventListener('resize', function () {
    clampOverlay(overlay);
  });

  syncFabVisibility();
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
      <p class="margin0">移动触屏版桌宠。隐藏后可在此处或右下角按钮重新显示。</p>
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
    '#extensions_settings .extensions_block',
    '#extensions_settings2 .extensions_block',
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
  const visible = ensureSettings().visible;
  btn.textContent = visible ? '隐藏桌宠' : '显示桌宠';
}

async function loadSettingsHtml() {
  const folder = getExtensionFolderName();
  const paths = [
    'third-party/' + folder,
    'third-party/' + MODULE,
    folder,
    MODULE,
  ];
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
  if (!document.getElementById(SETTINGS_ID)) {
    $root.append(SETTINGS_FALLBACK);
  }
  settingsInjected = !!document.getElementById(SETTINGS_ID);
  bindSettingsButtons($root);
  if (settingsInjected) {
    console.info('[EightTailCat-Pet-Mobile] 已注入扩展设置抽屉');
  }
  return settingsInjected;
}

function scheduleSettingsInjection() {
  let tries = 0;
  const maxTries = 40;
  const tick = async function () {
    tries += 1;
    try {
      const ok = await injectSettingsDrawer();
      if (ok) return;
    } catch (err) {
      console.warn('[EightTailCat-Pet-Mobile] 设置抽屉注入失败', err);
    }
    if (tries < maxTries) {
      setTimeout(tick, tries < 10 ? 400 : 1000);
    } else {
      console.warn('[EightTailCat-Pet-Mobile] 多次重试仍未找到扩展设置容器，已挂载右下角召唤按钮兜底');
      ensureFab();
    }
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
    setTimeout(function () {
      try { obs.disconnect(); } catch (_) {}
    }, 60000);
  } catch (_) {}
}

function ensureFab() {
  let fab = document.getElementById(FAB_ID);
  if (fab) return fab;
  fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.setAttribute('aria-label', '显示八条猫桌宠');
  fab.title = '显示八条猫桌宠';
  fab.textContent = '🐱';
  fab.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    showPetOnly();
    try { openPetSettings(); } catch (_) {}
  });
  document.body.appendChild(fab);
  syncFabVisibility();
  return fab;
}

function syncFabVisibility() {
  const fab = document.getElementById(FAB_ID) || ensureFab();
  const visible = ensureSettings().visible;
  const overlay = document.getElementById(OVERLAY_ID);
  const hidden = !visible || (overlay && overlay.classList.contains('eighttailcat-hidden'));
  fab.classList.toggle('is-visible', !!hidden);
}

jQuery(async function () {
  ensureSettings();
  writeVisibleToLocal(!!ensureSettings().visible);
  mountOverlay(getExtBase());
  ensureFab();
  scheduleSettingsInjection();

  try {
    if (eventSource && event_types && event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, function () {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);
        injectSettingsDrawer().catch(function () {});
        ensureFab();
        syncFabVisibility();
      });
    }
  } catch (_) {}
});
