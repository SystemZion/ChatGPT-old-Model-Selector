// ==UserScript==
// @name         ChatGPT Classic Model Selector
// @namespace    https://github.com/tampermonkey-scripts
// @version      10.0.0
// @description  Restores the classic top-left model selector UI for ChatGPT
// @author       Claude
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_MODEL = 'cgpt-cls-model-v10';
  const TOAST_MS = 3500;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

  // ─── Event simulation ───────────────────────────────────────────
  function simClick(el) {
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
    } catch {}
  }

  function simHover(el) {
    if (!el) return;
    try {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, view: window };
      el.dispatchEvent(new PointerEvent('pointerover', o));
      el.dispatchEvent(new MouseEvent('mouseover', o));
      el.dispatchEvent(new MouseEvent('mouseenter', { ...o, bubbles: false }));
    } catch {}
  }

  function pressEsc() {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch {}
  }

  // ─── Find the official model trigger (composer pill or similar) ──
  function findTrigger() {
    try {
      // Strategy 1: composer-pill class
      for (const el of document.querySelectorAll('button.__composer-pill, button[class*="composer-pill"]')) {
        return el;
      }
      // Strategy 2: button with model-like text in lower half, not in sidebar
      const kw = ['深入', 'deep', 'auto', 'instant', 'thinking', 'pro', 'o3', '5.'];
      const exclude = ['个人资料', 'profile', '菜单', 'menu', '打开', '下载', '设置'];
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.3 || r.left < 250 || r.width < 20 || r.width > 200) continue;
        const txt = norm(el.innerText || '');
        const aria = norm(el.getAttribute('aria-label') || '');
        const full = txt + ' ' + aria;
        if (exclude.some(ex => full.includes(ex))) continue;
        if (txt.length > 20) continue;
        if (kw.some(k => txt.includes(k))) return el;
      }
    } catch {}
    return null;
  }

  // ─── Popover detection ─────────────────────────────────────────
  function snapshot() {
    const s = new Set();
    try { for (const el of document.body.children) s.add(el); } catch {}
    return s;
  }

  function findNew(old) {
    try {
      for (const el of document.body.children) {
        if (!old.has(el) && el.id !== 'cgpt-classic-selector-host') {
          const r = el.getBoundingClientRect();
          if (r.width > 50 && r.height > 30) return el;
        }
      }
    } catch {}
    return null;
  }

  async function waitNew(old, ms = 1600) {
    for (let t = 0; t < ms; t += 120) {
      await sleep(120);
      const p = findNew(old);
      if (p) return p;
    }
    return null;
  }

  // ─── Read items from the quick popover menu ────────────────────
  // Returns { mainItems: [{name, desc, el}], configEl: Element|null }
  function readQuickMenu(popover) {
    const result = { mainItems: [], configEl: null };
    if (!popover) return result;
    try {
      // Main model items: role="menuitemradio"
      for (const el of popover.querySelectorAll('[role="menuitemradio"]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 15 || r.height < 10) continue;
        const raw = (el.innerText || '').trim();
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        let name = lines[0].replace(/^•\s*/, '').trim();
        if (!name) continue;
        // Clean up thinking-effort markers
        const desc = lines.slice(1).map(l => l.replace(/^•\s*/, '').trim()).join(' ');
        result.mainItems.push({ name, desc, el, raw });
      }
      // Config item: role="menuitem" containing "配置" or "Configure"
      for (const el of popover.querySelectorAll('[role="menuitem"]')) {
        const t = (el.innerText || '').trim();
        if (t.includes('配置') || t.includes('onfigure') || t.includes('config')) {
          result.configEl = el;
          break;
        }
      }
    } catch {}
    return result;
  }

  // ─── Read the header label from popover (e.g. "最新 • 5.5") ────
  function readMenuVersion(popover) {
    if (!popover) return '';
    try {
      // Look for the label div (class contains __menu-label)
      const label = popover.querySelector('[class*="__menu-label"], [class*="menu-label"]');
      if (label) {
        const t = (label.innerText || '').trim();
        // Extract version: "最新 • 5.5" -> "5.5"
        const m = t.match(/(\d+\.\d+|o\d+)/);
        if (m) return m[1];
      }
    } catch {}
    return '';
  }

  // ─── Find config panel ─────────────────────────────────────────
  function findConfigPanel() {
    try {
      for (const el of document.body.children) {
        if (el.id === 'cgpt-classic-selector-host') continue;
        const cs = getComputedStyle(el);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none') {
          const txt = el.innerText || '';
          if (txt.includes('模型') && el.querySelector('[role="combobox"]')) {
            const r = el.getBoundingClientRect();
            if (r.width > 200 && r.height > 100) return el;
          }
        }
      }
    } catch {}
    return null;
  }

  // ─── Read version combobox text ────────────────────────────────
  function readVersion(panel) {
    try {
      const cb = panel?.querySelector('[role="combobox"][aria-labelledby="model-selection-label"]');
      if (cb) return (cb.textContent || '').replace(/[^\w.]/g, '').trim();
    } catch {}
    return '';
  }

  // ─── Read modes from config panel (role="radio" buttons) ───────
  function readConfigModes(panel) {
    const out = [];
    if (!panel) return out;
    try {
      for (const el of panel.querySelectorAll('[role="radio"]')) {
        const lines = (el.innerText || '').trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (lines[0]) out.push({ name: lines[0], desc: lines.slice(1).join(' '), el });
      }
    } catch {}
    return out;
  }

  // ─── Open quick menu, read content, close ──────────────────────
  // Only called when user clicks the classic selector button.
  async function openAndReadQuickMenu() {
    const trig = findTrigger();
    if (!trig) return null;

    // Temporarily unhide if hidden
    const origStyle = trig.getAttribute('style') || '';
    trig.style.setProperty('opacity', '1', 'important');
    trig.style.setProperty('position', 'static', 'important');
    trig.style.setProperty('width', 'auto', 'important');
    trig.style.setProperty('height', 'auto', 'important');
    trig.style.setProperty('overflow', 'visible', 'important');

    const snap = snapshot();
    simClick(trig);

    // Restore hiding
    await sleep(50);
    trig.setAttribute('style', origStyle);

    const popover = await waitNew(snap);
    if (!popover) return null;

    const version = readMenuVersion(popover);
    const menu = readQuickMenu(popover);

    return { popover, version, ...menu };
  }

  // ─── Open config panel via quick menu ──────────────────────────
  async function openConfigViaMenu(menuData) {
    if (!menuData?.configEl) return null;
    simClick(menuData.configEl);
    for (let t = 0; t < 2000; t += 120) {
      await sleep(120);
      const p = findConfigPanel();
      if (p) return p;
    }
    return null;
  }

  // ─── Close config panel ────────────────────────────────────────
  async function closeConfig() {
    try {
      const panel = findConfigPanel();
      if (panel) {
        for (const b of panel.querySelectorAll('button')) {
          const r = b.getBoundingClientRect();
          if (r.width > 5 && r.width < 50 && r.height > 5 && r.height < 50) {
            const t = (b.innerText || '').trim();
            if (!t || t === '×' || t === 'X') { simClick(b); await sleep(100); return; }
          }
        }
      }
    } catch {}
    pressEsc(); await sleep(100); pressEsc(); await sleep(100);
  }

  // ─── Read legacy models from config panel ──────────────────────
  // Reads current version from combobox, lists other known versions with their modes.
  // Actual version availability is verified when user tries to select.
  async function readLegacyModels(configPanel) {
    const legacy = [];
    if (!configPanel) return legacy;
    try {
      const origVer = readVersion(configPanel);
      const origModes = readConfigModes(configPanel);

      // Known version list — will be filtered by what's actually selectable
      const allVersions = ['5.5', '5.4', '5.3', '5.2', '4.5', 'o3'];
      const otherVersions = allVersions.filter(v => v !== origVer);

      // For each other version, we assume same modes as current version
      // (except o3 which is a single model). Actual availability verified at switch time.
      for (const ver of otherVersions) {
        const isNonGPT = /^o\d/.test(ver);
        const prefix = isNonGPT ? ver : `GPT-${ver}`;
        if (isNonGPT) {
          // o3 etc. — single model
          legacy.push({ name: ver, version: ver, mode: '', desc: '传统推理模型' });
        } else {
          // For numeric versions, list the same modes as current
          // (but some may not exist — user will see toast if so)
          for (const m of origModes) {
            const isInstant = norm(m.name) === 'instant';
            const displayName = isInstant ? prefix : `${prefix} ${m.name}`;
            legacy.push({ name: displayName, version: ver, mode: m.name, desc: m.desc });
          }
        }
      }
    } catch (err) {
      console.warn('[CLS] readLegacy:', err);
    }
    return legacy;
  }

  // ─── Select a model by clicking through official menu ──────────
  async function doSelectModel(targetText, isLegacy, legacyVersion, legacyMode) {
    try {
      if (!isLegacy) {
        // Main model: open quick menu, find matching item, click it
        const data = await openAndReadQuickMenu();
        if (!data?.popover) return false;
        const target = data.mainItems.find(i =>
          norm(i.name) === norm(targetText) || norm(i.raw).includes(norm(targetText))
        );
        if (target) {
          simClick(target.el);
          await sleep(200);
          return true;
        }
        pressEsc();
        return false;
      } else {
        // Legacy: open quick menu → config panel → switch version → switch mode → close
        const data = await openAndReadQuickMenu();
        if (!data) return false;
        const configPanel = await openConfigViaMenu(data);
        if (!configPanel) { pressEsc(); return false; }

        // Switch version
        const cb = configPanel.querySelector('[role="combobox"][aria-labelledby="model-selection-label"]');
        if (!cb) { await closeConfig(); return false; }

        const curVer = readVersion(configPanel);
        if (curVer !== legacyVersion) {
          const snap = snapshot();
          simClick(cb);
          await sleep(400);
          const dd = findNew(snap);
          let found = false;
          if (dd) {
            const findV = (node) => {
              if (found) return;
              for (const child of (node.children || [])) {
                const t = (child.textContent || '').trim();
                if (t === legacyVersion && child.children.length <= 1) {
                  const r = child.getBoundingClientRect();
                  if (r.width > 10 && r.height > 10) { simClick(child); found = true; return; }
                }
                findV(child);
              }
            };
            findV(dd);
          }
          if (!found) { pressEsc(); await closeConfig(); return false; }
          await sleep(300);
        }

        // Switch mode if applicable
        if (legacyMode) {
          const panel2 = findConfigPanel() || configPanel;
          const modes = readConfigModes(panel2);
          const target = modes.find(m => norm(m.name) === norm(legacyMode));
          if (target) {
            simClick(target.el);
            await sleep(200);
          }
        }

        await closeConfig();
        return true;
      }
    } catch (err) {
      console.warn('[CLS] doSelect:', err);
      pressEsc();
      try { await closeConfig(); } catch {}
      return false;
    }
  }

  // ─── Build Shadow DOM UI ────────────────────────────────────────
  function buildUI() {
    const host = document.createElement('div');
    host.id = 'cgpt-classic-selector-host';
    host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
<style>
:host{all:initial;font-family:ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol"}
*{box-sizing:border-box}
:host{--bg:#fff;--fg:#1a1a1a;--fg2:#888;--bdr:rgba(0,0,0,.08);--hov:rgba(0,0,0,.05);--shd:0 2px 12px rgba(0,0,0,.1);--acc:#10a37f;--tbg:#333;--tfg:#fff}
:host(.dark){--bg:#2b2b2b;--fg:#e8e8e8;--fg2:#888;--bdr:rgba(255,255,255,.1);--hov:rgba(255,255,255,.08);--shd:0 4px 20px rgba(0,0,0,.4);--acc:#10a37f;--tbg:#555;--tfg:#fff}
.trig{position:fixed;pointer-events:auto;cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:5px 13px;border-radius:10px;border:none;background:transparent;color:var(--fg);font-size:18px;font-weight:400;line-height:1.5;white-space:nowrap;font-family:ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol"}
.trig:hover{background:var(--hov)}
.trig .pre{margin-right:2px}
.trig .car{margin-left:1px;opacity:.45;display:inline-flex;align-items:center}
.trig .car svg{width:20px;height:20px;fill:currentColor}
.trig .lbl{opacity:.55}
.bd{display:none;position:fixed;inset:0;z-index:1;pointer-events:auto}
.bd.on{display:block}
.mn{position:fixed;z-index:2;pointer-events:auto;min-width:260px;max-width:320px;max-height:70vh;overflow-y:auto;border-radius:14px;border:1px solid var(--bdr);background:var(--bg);box-shadow:var(--shd);padding:6px 0;font-size:15px;color:var(--fg);font-family:inherit;display:none}
.mn.vis{display:block}
.mh{padding:10px 16px 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--fg2)}
.mi{display:flex;align-items:center;padding:9px 16px;cursor:pointer}
.mi:hover{background:var(--hov)}
.mi .ic{flex:1;min-width:0}
.mi .nm{font-size:15px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mi .ds{font-size:12px;color:var(--fg2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mi .ck{margin-left:8px;color:var(--acc);font-size:16px;flex-shrink:0}
.mi .ar{margin-left:8px;opacity:.4;font-size:12px;flex-shrink:0}
.dv{height:1px;background:var(--bdr);margin:4px 12px}
.sb{position:fixed;z-index:3;pointer-events:none;min-width:240px;max-width:300px;max-height:60vh;overflow-y:auto;border-radius:12px;border:1px solid var(--bdr);background:var(--bg);box-shadow:var(--shd);padding:6px 0;display:none;font-size:15px;color:var(--fg);font-family:inherit}
.sb.vis{display:block;pointer-events:auto}
.tt{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:10px;background:var(--tbg);color:var(--tfg);font-size:13px;font-weight:500;box-shadow:var(--shd);pointer-events:auto;opacity:0;transition:opacity .2s;z-index:4;max-width:380px;text-align:center;font-family:inherit}
.tt.on{opacity:1}
.ld{padding:24px 16px;text-align:center;color:var(--fg2);font-size:13px}
.ld .sp{display:inline-block;width:16px;height:16px;border:2px solid var(--bdr);border-top-color:var(--acc);border-radius:50%;animation:spin .6s linear infinite;margin-right:8px;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
<div class="trig"><span class="pre">ChatGPT</span><span class="lbl"></span><span class="car"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.22 5.97a.75.75 0 0 1 1.06 0L8 8.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.03a.75.75 0 0 1 0-1.06z"/></svg></span></div>
<div class="bd"></div><div class="mn"></div><div class="sb"></div><div class="tt"></div>`;
    return {
      host, shadow,
      btn: shadow.querySelector('.trig'), lbl: shadow.querySelector('.lbl'),
      bd: shadow.querySelector('.bd'), menu: shadow.querySelector('.mn'),
      sub: shadow.querySelector('.sb'), toast: shadow.querySelector('.tt'),
    };
  }

  // ─── Main ──────────────────────────────────────────────────────
  function init() {
    try {
      const ui = buildUI();

      // Hide the original composer pill
      const hideStyle = document.createElement('style');
      hideStyle.textContent = 'button.__composer-pill, button[class*="composer-pill"] { opacity: 0 !important; position: absolute !important; width: 1px !important; height: 1px !important; overflow: hidden !important; }';
      document.head.appendChild(hideStyle);

      let menuOpen = false;
      let currentModel = localStorage.getItem(STORAGE_MODEL) || '';
      let toastTm;
      let cachedMenuData = null; // Only caches within this session/page

      const esc = s => { const d = document.createElement('span'); d.textContent = s; return d.innerHTML; };
      const showToast = msg => { ui.toast.textContent = msg; ui.toast.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => ui.toast.classList.remove('on'), TOAST_MS); };
      const setModel = name => { currentModel = name || ''; ui.lbl.textContent = currentModel; localStorage.setItem(STORAGE_MODEL, currentModel); };
      if (currentModel) setModel(currentModel);

      // Theme
      const syncTheme = () => {
        try {
          const dk = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.style.colorScheme === 'dark';
          ui.host.classList.toggle('dark', dk);
        } catch {}
      };
      syncTheme();
      try { new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] }); } catch {}

      // Auto-position: detect sidebar and place button at top of main content area
      const autoPos = () => {
        try {
          // Find the sidebar/nav element
          const nav = document.querySelector('nav, [class*="sidebar"], [class*="Sidebar"]');
          let leftOffset = 16;
          if (nav) {
            const r = nav.getBoundingClientRect();
            // Sidebar is open if it has visible width and is on-screen
            if (r.width > 50 && r.right > 0) leftOffset = r.right + 12;
          }
          ui.btn.style.left = leftOffset + 'px';
          ui.btn.style.top = '12px';
        } catch {
          ui.btn.style.left = '16px';
          ui.btn.style.top = '12px';
        }
      };
      autoPos();

      // Re-position when sidebar toggles (watch for layout changes)
      let resizeTimer;
      const debouncedPos = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(autoPos, 100); };
      window.addEventListener('resize', debouncedPos);
      // Watch for sidebar open/close via body or main area changes
      try {
        new MutationObserver(debouncedPos).observe(document.body, { childList: true, subtree: false });
        // Also watch the nav element's attributes
        const navEl = document.querySelector('nav');
        if (navEl) new MutationObserver(debouncedPos).observe(navEl, { attributes: true, attributeFilter: ['class', 'style'] });
        // Watch parent of nav for structural changes
        if (navEl?.parentElement) new MutationObserver(debouncedPos).observe(navEl.parentElement, { attributes: true, childList: true, attributeFilter: ['class', 'style'] });
      } catch {}

      // Simple click handler (no drag)
      ui.btn.addEventListener('click', e => { e.preventDefault(); toggleMenu(); });

      // Close
      const closeMenu = () => { menuOpen = false; ui.bd.classList.remove('on'); ui.menu.classList.remove('vis'); ui.sub.classList.remove('vis'); ui.menu.innerHTML = ''; ui.sub.innerHTML = ''; };
      ui.bd.addEventListener('click', closeMenu);

      const posMenu = () => {
        autoPos(); // Ensure button is in right place first
        const br = ui.btn.getBoundingClientRect();
        let l = br.left, t = br.bottom + 6;
        if (l + 310 > window.innerWidth) l = window.innerWidth - 318;
        if (l < 4) l = 4;
        if (t + 300 > window.innerHeight) t = br.top - 310;
        ui.menu.style.left = l + 'px'; ui.menu.style.top = t + 'px';
      };

      // ── Render menu from live data ──
      const renderMenu = (mainItems, version, legacyItems) => {
        let html = '';
        if (version) html += `<div class="mh">Latest · ${esc(version)}</div>`;

        const cur = norm(currentModel);

        for (const item of mainItems) {
          const isInstant = norm(item.name) === 'instant';
          const menuLabel = isInstant ? 'Auto' : item.name;
          let btnLabel;
          if (isInstant) {
            btnLabel = version || '';
          } else if (norm(item.name) === norm(version)) {
            // Version and mode are the same (e.g. "o3") — don't duplicate
            btnLabel = item.name;
          } else {
            btnLabel = `${version ? version + ' ' : ''}${item.name}`;
          }
          const isA = norm(btnLabel) === cur || norm(item.name) === cur || (isInstant && (norm(cur) === norm(version) || norm(cur) === 'auto'));
          const chk = isA ? '<span class="ck">✓</span>' : '';
          html += `<div class="mi mi-main" data-text="${esc(item.name)}" data-btn="${esc(btnLabel)}"><div class="ic"><div class="nm">${esc(menuLabel)}</div>${item.desc ? `<div class="ds">${esc(item.desc)}</div>` : ''}</div>${chk}</div>`;
        }

        if (legacyItems && legacyItems.length) {
          html += '<div class="dv"></div>';
          html += '<div class="mi lt"><div class="ic"><div class="nm">传统模型</div><div class="ds">Legacy models</div></div><span class="ar">▸</span></div>';
        }
        ui.menu.innerHTML = html;

        // Main clicks: re-open quick menu and click matching item
        ui.menu.querySelectorAll('.mi-main').forEach(el => {
          el.addEventListener('click', () => {
            const text = el.dataset.text;
            const btn = el.dataset.btn;
            setTimeout(async () => {
              closeMenu();
              const ok = await doSelectModel(text, false, '', '');
              if (ok) setModel(btn);
              else showToast('未找到「' + text + '」');
            }, 50);
          });
        });

        // Legacy submenu
        const lt = ui.menu.querySelector('.lt');
        if (lt && legacyItems?.length) {
          let sh = '';
          let lastVer = '';
          for (const item of legacyItems) {
            if (lastVer && item.version !== lastVer) sh += '<div class="dv"></div>';
            lastVer = item.version;
            const isA = norm(item.name) === cur;
            const btnLabel = item.name.replace(/^GPT-/, '');
            sh += `<div class="mi mi-leg" data-name="${esc(item.name)}" data-btn="${esc(btnLabel)}" data-ver="${esc(item.version)}" data-mode="${esc(item.mode)}"><div class="ic"><div class="nm">${esc(item.name)}</div>${item.desc ? `<div class="ds">${esc(item.desc)}</div>` : ''}</div>${isA ? '<span class="ck">✓</span>' : ''}</div>`;
          }
          ui.sub.innerHTML = sh;
          ui.sub.querySelectorAll('.mi-leg').forEach(el => {
            el.addEventListener('click', () => {
              const name = el.dataset.name;
              const btn = el.dataset.btn;
              const ver = el.dataset.ver;
              const mode = el.dataset.mode;
              setTimeout(async () => {
                closeMenu();
                const ok = await doSelectModel(name, true, ver, mode);
                if (ok) setModel(btn);
                else showToast('未找到「' + name + '」');
              }, 50);
            });
          });

          let subHideTimer = null;
          const showSub = () => {
            clearTimeout(subHideTimer);
            const lr = lt.getBoundingClientRect();
            let sl = lr.right + 4, st = lr.top;
            if (sl + 270 > window.innerWidth) sl = lr.left - 274;
            if (st + ui.sub.scrollHeight > window.innerHeight) st = Math.max(4, window.innerHeight - ui.sub.scrollHeight - 10);
            ui.sub.style.left = sl + 'px'; ui.sub.style.top = st + 'px';
            ui.sub.classList.add('vis');
          };
          const hideSub = () => { subHideTimer = setTimeout(() => ui.sub.classList.remove('vis'), 400); };
          const cancelHide = () => clearTimeout(subHideTimer);
          lt.addEventListener('mouseenter', showSub);
          lt.addEventListener('mouseleave', hideSub);
          ui.sub.addEventListener('mouseenter', cancelHide);
          ui.sub.addEventListener('mouseleave', hideSub);
        }
      };

      // ── Toggle: open menu by reading live data ──
      const toggleMenu = async () => {
        if (menuOpen) { closeMenu(); return; }
        menuOpen = true;
        ui.bd.classList.add('on');
        posMenu();
        ui.menu.innerHTML = '<div class="ld"><span class="sp"></span>读取中…</div>';
        ui.menu.classList.add('vis');

        try {
          // Open quick menu and read main items
          const data = await openAndReadQuickMenu();
          if (!data?.popover) { closeMenu(); showToast('无法打开模型菜单'); return; }

          const version = data.version;
          const mainItems = data.mainItems.map(i => ({ name: i.name, desc: i.desc }));

          // Close quick menu
          pressEsc();
          await sleep(100);

          // Generate legacy items from known versions × current modes
          const allVersions = ['5.5', '5.4', '5.3', '5.2', '4.5', 'o3'];
          const otherVersions = allVersions.filter(v => v !== version);
          const legacyItems = [];
          for (const ver of otherVersions) {
            const isNonGPT = /^o\d/i.test(ver);
            if (isNonGPT) {
              legacyItems.push({ name: ver, version: ver, mode: '', desc: '传统推理模型' });
            } else {
              const prefix = `GPT-${ver}`;
              for (const m of mainItems) {
                const isInstant = norm(m.name) === 'instant';
                const displayName = isInstant ? prefix : `${prefix} ${m.name}`;
                legacyItems.push({ name: displayName, version: ver, mode: m.name, desc: m.desc });
              }
            }
          }

          if (!menuOpen) return;
          posMenu();
          renderMenu(mainItems, version, legacyItems);
        } catch (err) {
          console.warn('[CLS] toggleMenu:', err);
          closeMenu();
          showToast('读取模型出错');
        }
      };

    } catch (err) { console.error('[CLS] init:', err); }
  }

  const go = () => setTimeout(init, 1500);
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
