# -*- coding: utf-8 -*-
"""One-shot adapter: pet.html for SillyTavern iframe runtime."""
from pathlib import Path

p = Path(r"f:\job-site\sillytavern-extension\EightTailCat-Pet\pet.html")
text = p.read_text(encoding="utf-8")

repls = []


def sub(old, new, label):
    if old not in text:
        raise SystemExit("MISSING: " + label)
    return text.replace(old, new, 1)


text = sub(
    """  <!-- 由 main.py 本地 HTTP 注入：__PET_FS_ROOT__ / __PET_HTTP_BASE__ -->
  <script src="/__pet_runtime.js"></script>
  <style>
""",
    """  <!-- 酒馆 iframe：由 index.js 挂载；桌宠独立运行时仍可忽略本脚本 -->
  <script>
    (function () {
      try {
        if (window.parent && window.parent !== window && window.parent.SillyTavern) {
          window.__PET_ST_MODE__ = true;
          window.SillyTavern = window.parent.SillyTavern;
        }
      } catch (_) {}
    })();
  </script>
  <style>
""",
    "runtime script",
)

text = sub(
    """    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      /* 桌宠窗必须全透明，避免与 Alpha 边缘混出白边/亮色虚影 */
      background: transparent !important;
      user-select: none;
      -webkit-user-select: none;
    }
""",
    """    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      /* 桌宠窗必须全透明，避免与 Alpha 边缘混出白边/亮色虚影 */
      background: transparent !important;
      user-select: none;
      -webkit-user-select: none;
    }

    html.st-extension-host,
    html.st-extension-host body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent !important;
    }
""",
    "html body css",
)

text = sub(
    """    #stage {
      position: relative;
      width: 100%;
      height: 100%;
    }

    /* ---------- 宠物 ---------- */
    #pet {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(340px, 72vw);
      transform: translate(-50%, -50%);
      z-index: 10;
      touch-action: none;
      overflow: visible;
    }
""",
    """    #stage {
      position: relative;
      width: 100%;
      height: 100%;
    }

    html.st-extension-host #stage {
      width: 100%;
      height: 100%;
    }

    /* ---------- 宠物 ---------- */
    #pet {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(340px, 72vw);
      transform: translate(-50%, -50%);
      z-index: 10;
      touch-action: none;
      overflow: visible;
    }

    html.st-extension-host #pet {
      position: absolute;
      z-index: 10;
    }
""",
    "stage pet css",
)

text = text.replace(
    '<img id="cat" src="cat1.png" alt="八条猫" draggable="false" />',
    '<img id="cat" src="assets/cat1.png" alt="八条猫" draggable="false" />',
    1,
)
text = text.replace('cat.src = "cat2.png"', 'cat.src = "assets/cat2.png"')
text = text.replace('cat.src = "cat1.png"', 'cat.src = "assets/cat1.png"')
text = text.replace('fetch("data/kaomoji.json"', 'fetch("data/kaomoji.json"')

text = sub(
    """          <label class="field"><span>酒馆本地地址（右键 ✨ 抓取用）</span>
            <input type="text" id="cfg-tavern-base" placeholder="http://127.0.0.1:8000" />
          </label>
          <p class="field-hint">独立桌宠会优先探测此地址；抓不到消息时会尝试读取剪贴板中刚复制的酒馆对话。</p>
""",
    """          <div class="toggle-row">
            <span>评价生成优先用酒馆当前模型</span>
            <label class="switch">
              <input type="checkbox" id="opt-tavern-generate" checked />
              <span class="slider"></span>
            </label>
          </div>
          <p class="field-hint">插件模式：右键 ✨ 直接读 SillyTavern.getContext().chat。开启后复用酒馆已选连接生成吐槽；关闭则走下方独立 Endpoint（SiliconFlow / OpenAI）。</p>
          <label class="field"><span>酒馆本地地址（独立桌宠探测用）</span>
            <input type="text" id="cfg-tavern-base" placeholder="http://127.0.0.1:8000" />
          </label>
          <p class="field-hint">仅独立桌宠需要填写。插件已内嵌在酒馆页面时会直连 getContext()，不必探测此地址。</p>
""",
    "tavern settings html",
)

text = sub(
    """        tavernBaseUrl: "http://127.0.0.1:8000",
""",
    """        tavernBaseUrl: "http://127.0.0.1:8000",
        tavernGenerateMode: "tavern",
""",
    "default tavernGenerateMode",
)

text = sub(
            """            tavernBaseUrl: String(
              parsed.tavernBaseUrl != null
                ? parsed.tavernBaseUrl
                : (DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000")
            ).trim() || "http://127.0.0.1:8000",
            clickerConfig: normalizeClickerConfig(parsed.clickerConfig)
""",
            """            tavernBaseUrl: String(
              parsed.tavernBaseUrl != null
                ? parsed.tavernBaseUrl
                : (DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000")
            ).trim() || "http://127.0.0.1:8000",
            tavernGenerateMode: (parsed.tavernGenerateMode === "custom") ? "custom" : "tavern",
            clickerConfig: normalizeClickerConfig(parsed.clickerConfig)
""",
            "loadStore tavernGenerateMode",
)

text = sub(
    """      function flattenWorldbookEntries(s) {
        const books = (s && s.worldbooks) || [];
        const all = [];
        for (let i = 0; i < books.length; i++) {
          const entries = books[i] && books[i].entries;
          if (!entries || !entries.length) continue;
          for (let j = 0; j < entries.length; j++) {
            const e = entries[j];
            if (!e || e.enabled === false) continue;
            if (!String(e.content || "").trim()) continue;
            all.push(e);
          }
        }
        return all;
      }
""",
    """      function flattenWorldbookEntries(s) {
        const books = (s && s.worldbooks) || [];
        const all = [];
        for (let i = 0; i < books.length; i++) {
          const entries = books[i] && books[i].entries;
          if (!entries || !entries.length) continue;
          for (let j = 0; j < entries.length; j++) {
            const e = entries[j];
            if (!e || e.enabled === false) continue;
            if (!String(e.content || "").trim()) continue;
            all.push(e);
          }
        }
        try {
          const extra = collectTavernLoreEntries();
          for (let k = 0; k < extra.length; k++) all.push(extra[k]);
        } catch (_) {}
        return all;
      }
""",
    "flattenWorldbookEntries",
)

text = sub(
    """      async function fetchTavernChatContext(storeRef) {
        const s = storeRef || loadStore();
        const base = String(s.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000").trim();

        try {
          const st = window.SillyTavern || (window.parent && window.parent.SillyTavern) || null;
          if (st && typeof st.getContext === "function") {
            const turns = extractTavernTurnsFromContext(st.getContext());
            const lines = formatTavernChatTurns(turns);
            if (lines.length) return { ok: true, source: "context", lines: lines };
          }
        } catch (_) {}
""",
    """      function getSillyTavernApi() {
        try {
          if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") return window.SillyTavern;
        } catch (_) {}
        try {
          if (window.parent && window.parent !== window && window.parent.SillyTavern) return window.parent.SillyTavern;
        } catch (_) {}
        return null;
      }

      function collectTavernLoreEntries() {
        const st = getSillyTavernApi();
        if (!st || typeof st.getContext !== "function") return [];
        const extra = [];
        try {
          const ctx = st.getContext();
          const wi = ctx.worldInfo || ctx.world_info || ctx.lorebook;
          let list = [];
          if (Array.isArray(wi)) list = wi;
          else if (wi && Array.isArray(wi.entries)) list = wi.entries;
          else if (wi && typeof wi === "object") list = Object.values(wi.entries || wi);
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e || e.disable || e.disabled || e.enabled === false) continue;
            const content = String(e.content || "").trim();
            if (!content) continue;
            const keys = [].concat(e.keys || e.key || []).map(String).filter(Boolean);
            extra.push({
              enabled: true,
              constant: !!(e.constant || e.alwaysActive),
              keys: keys,
              content: content.slice(0, WB_ENTRY_CONTENT_MAX)
            });
          }
          const id = ctx.characterId;
          const ch = (ctx.characters && (ctx.characters[id] || ctx.characters[ctx.characterId])) || null;
          if (ch) {
            const bits = [ch.description, ch.personality, ch.scenario, ch.data && ch.data.description]
              .map(function (x) { return String(x || "").trim(); })
              .filter(Boolean);
            if (bits.length) {
              extra.push({
                enabled: true,
                constant: true,
                keys: [],
                content: "[酒馆角色卡]\n" + bits.join("\\n").slice(0, 900)
              });
            }
          }
        } catch (_) {}
        return extra;
      }

      function notifyStHost(payload) {
        if (!window.__PET_ST_MODE__) return;
        try { window.parent.postMessage(payload, "*"); } catch (_) {}
      }

      async function generateViaSillyTavern(userPrompt, opts) {
        opts = opts || {};
        const st = getSillyTavernApi();
        if (!st || typeof st.getContext !== "function") return "";
        const ctx = st.getContext();
        const systemContent = buildSystemPromptForLlm(store, userPrompt);
        const userContent = typeof buildLlmUserPrompt === "function"
          ? buildLlmUserPrompt(userPrompt)
          : String(userPrompt || "");
        const maxChars = Math.max(20, Math.min(80, Number(opts.maxChars) || 30));
        let raw = "";
        if (typeof ctx.generateRaw === "function") {
          raw = await ctx.generateRaw({
            systemPrompt: systemContent,
            prompt: userContent
          });
        } else if (typeof ctx.generateQuietPrompt === "function") {
          raw = await ctx.generateQuietPrompt({
            quietPrompt: (systemContent.slice(0, 1200) + "\\n\\n" + userContent).slice(0, 2400)
          });
        }
        const cleaned = String(raw || "").trim().replace(/^["「『]|["」』]$/g, "");
        return cleaned ? cleaned.slice(0, maxChars) : "";
      }

      async function fetchTavernChatContext(storeRef) {
        const s = storeRef || loadStore();
        const base = String(s.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000").trim();

        try {
          const st = getSillyTavernApi();
          if (st && typeof st.getContext === "function") {
            const ctx = st.getContext();
            const currentChat = ctx.chat || [];
            const lastMessage = currentChat[currentChat.length - 1] && currentChat[currentChat.length - 1].mes;
            const turns = extractTavernTurnsFromContext(ctx);
            const lines = formatTavernChatTurns(turns);
            if (lines.length) return { ok: true, source: "context", lines: lines, lastMessage: lastMessage };
            if (lastMessage) {
              return { ok: true, source: "context", lines: [String(lastMessage)], lastMessage: lastMessage };
            }
          }
        } catch (_) {}
""",
    "fetchTavern + ST helpers",
)

text = sub(
    """        if (!store.llmEnabled) {
          return { line: fallbackLine(fallbackPool), source: "fallback", reason: "llm_off" };
        }
        if (!store.apiEndpoint || !store.apiKey) {
          logLlmFallback("missing_config", "已开启实时生成但未填写 Endpoint 或 API Key");
          return {
            line: fallbackLine(fallbackPool),
            source: "fallback",
            hint: "未配置 Endpoint/Key，已用本地兜底"
          };
        }
""",
    """        if (!store.llmEnabled) {
          return { line: fallbackLine(fallbackPool), source: "fallback", reason: "llm_off" };
        }
        const preferTavernGen = window.__PET_ST_MODE__ && store.tavernGenerateMode !== "custom";
        const hasCustomEndpoint = !!(store.apiEndpoint && store.apiKey);
        if (preferTavernGen || (window.__PET_ST_MODE__ && !hasCustomEndpoint)) {
          try {
            const stLine = await generateViaSillyTavern(userPrompt, opts);
            if (stLine) return { line: stLine, source: "llm" };
          } catch (stErr) {
            logLlmFallback("tavern_generate", stErr && stErr.message);
          }
          if (!hasCustomEndpoint) {
            return {
              line: fallbackLine(fallbackPool),
              source: "fallback",
              hint: "酒馆生成未返回内容，且未配置独立 Endpoint"
            };
          }
        }
        if (!store.apiEndpoint || !store.apiKey) {
          logLlmFallback("missing_config", "已开启实时生成但未填写 Endpoint 或 API Key");
          return {
            line: fallbackLine(fallbackPool),
            source: "fallback",
            hint: "未配置 Endpoint/Key，已用本地兜底"
          };
        }
""",
    "resolveLine ST generate",
)

text = sub(
        """        tavernBase: document.getElementById("cfg-tavern-base"),
""",
        """        tavernBase: document.getElementById("cfg-tavern-base"),
        tavernGenerate: document.getElementById("opt-tavern-generate"),
""",
        "fields tavernGenerate",
)

text = sub(
        """        if (fields.tavernBase) {
          fields.tavernBase.value = store.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000";
        }
""",
        """        if (fields.tavernBase) {
          fields.tavernBase.value = store.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000";
        }
        if (fields.tavernGenerate) {
          fields.tavernGenerate.checked = store.tavernGenerateMode !== "custom";
        }
""",
        "fillSettingsForm tavernGenerate",
)

text = sub(
          """          tavernBaseUrl: fields.tavernBase
            ? (String(fields.tavernBase.value || "").trim() || "http://127.0.0.1:8000")
            : String(store.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000").trim(),
""",
          """          tavernBaseUrl: fields.tavernBase
            ? (String(fields.tavernBase.value || "").trim() || "http://127.0.0.1:8000")
            : String(store.tavernBaseUrl || DEFAULT_SETTINGS.tavernBaseUrl || "http://127.0.0.1:8000").trim(),
          tavernGenerateMode: (fields.tavernGenerate && !fields.tavernGenerate.checked) ? "custom" : "tavern",
""",
          "persist tavernGenerateMode",
)

text = sub(
    """      function openSettingsInPage() {
        if (!settingsEl) return;
        try {
          fillSettingsForm();
        } catch (_) {}
        settingsEl.classList.add("open");
        body.classList.add("settings-open");
      }

      function openSettings() {
        if (IS_SETTINGS_WINDOW) return;
        /* Qt 客户端：优先走独立设置窗 */
        if (window.bridge && typeof window.bridge.openSettings === "function") {
""",
    """      function openSettingsInPage() {
        if (!settingsEl) return;
        try {
          fillSettingsForm();
        } catch (_) {}
        settingsEl.classList.add("open");
        body.classList.add("settings-open");
        notifyStHost({ type: "eighttailcat-expand", on: true });
      }

      function openSettings() {
        if (IS_SETTINGS_WINDOW) return;
        if (window.__PET_ST_MODE__) {
          openSettingsInPage();
          return;
        }
        /* Qt 客户端：优先走独立设置窗 */
        if (window.bridge && typeof window.bridge.openSettings === "function") {
""",
    "openSettings ST",
)

text = sub(
    """        if (settingsEl) settingsEl.classList.remove("open");
        body.classList.remove("settings-open");
      }
""",
    """        if (settingsEl) settingsEl.classList.remove("open");
        body.classList.remove("settings-open");
        notifyStHost({ type: "eighttailcat-expand", on: false });
      }
""",
    "closeSettings ST",
)

text = sub(
    """        try {
          if (window.bridge && typeof window.bridge.closePet === "function") {
            window.bridge.closePet();
            return;
          }
""",
    """        try {
          if (window.__PET_ST_MODE__) {
            notifyStHost({ type: "eighttailcat-hide" });
            return;
          }
          if (window.bridge && typeof window.bridge.closePet === "function") {
            window.bridge.closePet();
            return;
          }
""",
    "quit ST hide",
)

text = sub(
    """      pet.addEventListener("pointerdown", function (e) {
        if (state === THROWING) return;
        if (e.button === 2) return;
        if (isUiChromeTarget(e.target)) return;
        e.preventDefault();
        pet.setPointerCapture(e.pointerId);
        markActivity();
        /* 点击 / 抓取：自定义动图模式切换 clicked */
        triggerClickedVisual();

        if (state === BITING) {
          playMeow();
          registerBiteClick();
          return;
        }

        dragging = true;
        dragMoved = false;
        pet.classList.add("dragging");
        pet.classList.remove("floating");
        const c = getCenter();
        startX = e.clientX;
        startY = e.clientY;
        originX = c.x;
        originY = c.y;
        placeAt(c.x, c.y, false);
      });

      pet.addEventListener("pointermove", function (e) {
        if (state === BITING) return;
        if (!dragging || state !== IDLE) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) dragMoved = true;
        placeAt(originX + (e.clientX - startX), originY + (e.clientY - startY), false);
      });
""",
    """      pet.addEventListener("pointerdown", function (e) {
        if (state === THROWING) return;
        if (e.button === 2) return;
        if (isUiChromeTarget(e.target)) return;
        e.preventDefault();
        pet.setPointerCapture(e.pointerId);
        markActivity();
        /* 点击 / 抓取：自定义动图模式切换 clicked */
        triggerClickedVisual();

        if (state === BITING) {
          playMeow();
          registerBiteClick();
          return;
        }

        dragging = true;
        dragMoved = false;
        pet.classList.add("dragging");
        pet.classList.remove("floating");
        const c = getCenter();
        startX = e.clientX;
        startY = e.clientY;
        originX = c.x;
        originY = c.y;
        if (window.__PET_ST_MODE__) {
          notifyStHost({ type: "eighttailcat-drag-start", screenX: e.screenX, screenY: e.screenY });
        } else {
          placeAt(c.x, c.y, false);
        }
      });

      pet.addEventListener("pointermove", function (e) {
        if (state === BITING) return;
        if (!dragging || state !== IDLE) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) dragMoved = true;
        if (window.__PET_ST_MODE__) {
          notifyStHost({ type: "eighttailcat-drag-move", screenX: e.screenX, screenY: e.screenY });
          return;
        }
        placeAt(originX + (e.clientX - startX), originY + (e.clientY - startY), false);
      });
""",
    "ST overlay drag",
)

text = sub(
    """      function endPointer(e) {
        if (state === IDLE && dragging) {
          if (!dragMoved) enterBite(e.clientX, e.clientY);
          else {
            pet.classList.remove("dragging");
            pet.classList.add("floating");
            hideBubble();
          }
        }
        dragging = false;
        dragMoved = false;
        try { pet.releasePointerCapture(e.pointerId); } catch (_) {}
      }
""",
    """      function endPointer(e) {
        if (state === IDLE && dragging) {
          if (!dragMoved) enterBite(e.clientX, e.clientY);
          else {
            pet.classList.remove("dragging");
            pet.classList.add("floating");
            hideBubble();
          }
        }
        if (window.__PET_ST_MODE__ && dragging) {
          notifyStHost({ type: "eighttailcat-drag-end" });
        }
        dragging = false;
        dragMoved = false;
        try { pet.releasePointerCapture(e.pointerId); } catch (_) {}
      }
""",
    "endPointer ST",
)

# boot class on documentElement
text = sub(
    """      window.openSettings = openSettings;
      window.closeSettings = closeSettings;
""",
    """      window.openSettings = openSettings;
      window.closeSettings = closeSettings;

      if (window.__PET_ST_MODE__) {
        document.documentElement.classList.add("st-extension-host");
        window.addEventListener("message", function (ev) {
          const data = ev && ev.data;
          if (!data || data.type !== "eighttailcat-open-settings") return;
          try { openSettings(); } catch (_) {}
        });
      }
""",
    "export openSettings ST class",
)

text = sub(
    """        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        syncFeedTrayOverlay();
        markActivity();
      }
""",
    """        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        syncFeedTrayOverlay();
        notifyStHost({ type: "eighttailcat-expand", on: true });
        markActivity();
      }
""",
    "openFeedTray expand",
)

text = sub(
    """        syncFeedTrayOverlay();
      }

      function bindFeedTrayUi() {
""",
    """        syncFeedTrayOverlay();
        notifyStHost({ type: "eighttailcat-expand", on: false });
      }

      function bindFeedTrayUi() {
""",
    "closeFeedTray expand",
)

text = sub(
    """        setGameCanvasExpanded(true);
        if (window.bridge && window.bridge.setPetBusy) {
          try { window.bridge.setPetBusy(true); } catch (_) {}
        }
        showGameLobby();
""",
    """        setGameCanvasExpanded(true);
        notifyStHost({ type: "eighttailcat-expand", on: true });
        if (window.bridge && window.bridge.setPetBusy) {
          try { window.bridge.setPetBusy(true); } catch (_) {}
        }
        showGameLobby();
""",
    "openGame expand",
)

text = sub(
    """        setGameCanvasExpanded(false);
        if (window.bridge && window.bridge.setPetBusy) {
          try { window.bridge.setPetBusy(false); } catch (_) {}
        }
        try { reportHitRect(); } catch (_) {}
      }
""",
    """        setGameCanvasExpanded(false);
        notifyStHost({ type: "eighttailcat-expand", on: false });
        if (window.bridge && window.bridge.setPetBusy) {
          try { window.bridge.setPetBusy(false); } catch (_) {}
        }
        try { reportHitRect(); } catch (_) {}
      }
""",
    "closeGame expand",
)

p.write_text(text, encoding="utf-8")
print("patched", p.stat().st_size)
