import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced, event_types, eventSource } from '../../../../script.js';

const MODULE = 'EightTailCat-Pet-Mobile';
const OVERLAY_ID = 'pet-container-mobile';
const FRAME_ID = 'eighttailcat-frame-mobile';

const defaultSettings = {
  visible: true,
  left: null,
  top: null,
};

function ensureSettings() {
  if (!extension_settings[MODULE]) {
    extension_settings[MODULE] = Object.assign({}, defaultSettings);
  }
  const s = extension_settings[MODULE];
  if (typeof s.visible !== 'boolean') s.visible = true;
  return s;
}

function savePos(left, top) {
  const s = ensureSettings();
  s.left = left;
  s.top = top;
  saveSettingsDebounced();
}

function clampOverlay(el) {
  const w = el.offsetWidth || 294;
  const h = el.offsetHeight || 392;
  const maxL = Math.max(8, window.innerWidth - w - 8);
  const maxT = Math.max(8, window.innerHeight - h - 8);
  let left = parseFloat(el.style.left) || 0;
  let top = parseFloat(el.style.top) || 0;
  left = Math.min(maxL, Math.max(8, left));
  top = Math.min(maxT, Math.max(8, top));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  return { left, top };
}

/** 默认贴靠右下角，避开手机键盘区域 */
function defaultBottomRight(el) {
  const w = el.classList.contains('eighttailcat-expanded')
    ? Math.min(520, window.innerWidth * 0.96)
    : Math.min(294, window.innerWidth * 0.7);
  const h = el.classList.contains('eighttailcat-expanded')
    ? Math.min(720, window.innerHeight * 0.8)
    : Math.min(392, window.innerHeight * 0.55);
  const defL = Math.max(8, window.innerWidth - w - 12);
  const defT = Math.max(8, window.innerHeight - h - 12);
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
  el.style.left = Math.max(8, (window.innerWidth - def.w) / 2) + 'px';
  el.style.top = Math.max(8, window.innerHeight - def.h - 8) + 'px';
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
  iframe.src = base + 'pet.html';
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  const s = ensureSettings();
  overlay.classList.toggle('eighttailcat-hidden', !s.visible);
  applySavedPos(overlay);

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
      overlay.classList.add('eighttailcat-hidden');
      ensureSettings().visible = false;
      saveSettingsDebounced();
    } else if (data.type === 'eighttailcat-show') {
      overlay.classList.remove('eighttailcat-hidden');
      ensureSettings().visible = true;
      saveSettingsDebounced();
    } else if (data.type === 'eighttailcat-expand') {
      overlay.classList.toggle('eighttailcat-expanded', !!data.on);
      if (data.on) placeExpandedSheet(overlay);
      else applySavedPos(overlay);
      clampOverlay(overlay);
    } else if (data.type === 'eighttailcat-open-settings') {
      const win = iframe.contentWindow;
      if (win && typeof win.openSettings === 'function') win.openSettings();
    }
  });

  window.addEventListener('resize', function () {
    clampOverlay(overlay);
  });

  return overlay;
}

function togglePet() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  const hide = !overlay.classList.contains('eighttailcat-hidden');
  overlay.classList.toggle('eighttailcat-hidden', hide);
  ensureSettings().visible = !hide;
  saveSettingsDebounced();
}

function openPetSettings() {
  const overlay = document.getElementById(OVERLAY_ID);
  const iframe = document.getElementById(FRAME_ID);
  if (overlay) overlay.classList.remove('eighttailcat-hidden');
  ensureSettings().visible = true;
  saveSettingsDebounced();
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
      <p class="margin0">移动触屏版桌宠默认贴靠右下角。详细人设、投喂与词库仍在半透明面板里。</p>
      <div class="eighttailcat-actions">
        <div id="eighttailcat-mobile-open-panel" class="menu_button menu_button_icon">打开八条猫面板</div>
        <div id="eighttailcat-mobile-toggle-pet" class="menu_button menu_button_icon">显示 / 隐藏桌宠</div>
      </div>
    </div>
  </div>
</div>`;

jQuery(document).ready(async function () {
  ensureSettings();
  const base = new URL('./', import.meta.url).href;
  mountOverlay(base);

  try {
    let html = SETTINGS_FALLBACK;
    try {
      const ctx = window.SillyTavern && SillyTavern.getContext && SillyTavern.getContext();
      if (ctx && typeof ctx.renderExtensionTemplateAsync === 'function') {
        html = await ctx.renderExtensionTemplateAsync('third-party/EightTailCat-Pet-Mobile', 'settings');
      }
    } catch (_) {}
    const $root = $('#extensions_settings2').length ? $('#extensions_settings2') : $('#extensions_settings');
    $root.append(html);
    $('#eighttailcat-mobile-open-panel').on('click', openPetSettings);
    $('#eighttailcat-mobile-toggle-pet').on('click', togglePet);
  } catch (err) {
    console.warn('[EightTailCat-Pet-Mobile] 设置抽屉注入失败', err);
  }

  try {
    if (eventSource && event_types && event_types.APP_READY) {
      eventSource.on(event_types.APP_READY, function () {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);
      });
    }
  } catch (_) {}
});
