// ==UserScript==
// @name         ChatGPT Classic Model Selector
// @namespace    https://github.com/tampermonkey-scripts
// @version      12.0.1
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

  function pressEsc() {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch {}
  }

  function findTrigger() {
    try {
      for (const el of document.querySelectorAll('button.__composer-pill, button[class*="composer-pill"]')) return el;

      const kw = ['深入', 'deep', 'auto', 'instant', 'thinking', 'pro', 'o3', '5.'];
      const exclude = ['个人资料', 'profile', '菜单', 'menu', '打开', '下载', '设置'];
      for (const el of document.querySelectorAll('button, [role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.3 || r.left < 250 || r.width < 20 || r.width > 220) continue;
        const txt = norm(el.innerText || '');
        const aria = norm(el.getAttribute('aria-label') || '');
        const full = txt + ' ' + aria;
        if (exclude.some(ex => full.includes(ex))) continue;
        if (txt.length > 24) continue;
        if (kw.some(k => txt.includes(k))) return el;
      }
    } catch {}
    return null;
  }

  function snapshot() {
    const s = new Set();
    try { for (const el of document.body.children) s.add(el); } catch {}
    return s;
  }

  function findNew(old) {
    try {
      for (const el of document.body.children) {
        if (!old.has(el) && el.id !== 'cgpt-classic-selector-host' && el.id !== 'cgpt-cls-depth-bar') {
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

  function readQuickMenu(popover) {
    const result = { mainItems: [], configEl: null };
    if (!popover) return result;
    try {
      for (const el of popover.querySelectorAll('[role="menuitemradio"]')) {
        const r = el.getBoundingClientRect();
        if (r.width < 15 || r.height < 10) continue;
        const raw = (el.innerText || '').trim();
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        const name = (lines[0] || '').replace(/^•\s*/, '').trim();
        if (!name) continue;
        const desc = lines.slice(1).map(l => l.replace(/^•\s*/, '').trim()).join(' ');
        result.mainItems.push({ name, desc, el, raw });
      }

      for (const el of popover.querySelectorAll('[role="menuitem"]')) {
        const t = norm(el.innerText || '');
        if (t.includes('配置') || t.includes('configure') || t.includes('config')) {
          result.configEl = el;
          break;
        }
      }
    } catch {}
    return result;
  }

  function findConfigPanel() {
    try {
      for (const el of document.body.children) {
        if (el.id === 'cgpt-classic-selector-host' || el.id === 'cgpt-cls-depth-bar') continue;
        const cs = getComputedStyle(el);
        if ((cs.position === 'fixed' || cs.position === 'absolute') && cs.display !== 'none') {
          const txt = el.innerText || '';
          if ((txt.includes('模型') || txt.toLowerCase().includes('model')) && el.querySelector('[role="combobox"]')) {
            const r = el.getBoundingClientRect();
            if (r.width > 200 && r.height > 100) return el;
          }
        }
      }
    } catch {}
    return null;
  }

  function readVersion(panel) {
    try {
      const cb = panel?.querySelector('[role="combobox"][aria-labelledby="model-selection-label"]');
      if (cb) return (cb.textContent || '').replace(/[^\w.]/g, '').trim();
    } catch {}
    return '';
  }

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

  async function openAndReadQuickMenu() {
    const trig = findTrigger();
    if (!trig) return null;

    const origStyle = trig.getAttribute('style') || '';
    trig.style.setProperty('opacity', '1', 'important');
    trig.style.setProperty('position', 'static', 'important');
    trig.style.setProperty('width', 'auto', 'important');
    trig.style.setProperty('height', 'auto', 'important');
    trig.style.setProperty('overflow', 'visible', 'important');

    const snap = snapshot();
    simClick(trig);
    await sleep(50);
    trig.setAttribute('style', origStyle);

    const popover = await waitNew(snap);
    if (!popover) return null;

    return { popover, ...readQuickMenu(popover) };
  }

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

  async function openConfigPanel() {
    const menuData = await openAndReadQuickMenu();
    if (!menuData) return null;
    return openConfigViaMenu(menuData);
  }

  async function closeConfig() {
    try {
      const panel = findConfigPanel();
      if (panel) {
        for (const b of panel.querySelectorAll('button')) {
          const r = b.getBoundingClientRect();
          if (r.width > 5 && r.width < 50 && r.height > 5 && r.height < 50) {
            const t = (b.innerText || '').trim();
            if (!t || t === '×' || t === 'X') {
              simClick(b);
              await sleep(100);
              return;
            }
          }
        }
      }
    } catch {}
    pressEsc();
    await sleep(100);
    pressEsc();
    await sleep(100);
  }

  async function doSelectModel(targetText, isLegacy, legacyVersion, legacyMode) {
    try {
      if (!isLegacy) {
        const data = await openAndReadQuickMenu();
        if (!data?.popover) return false;
        const target = data.mainItems.find(i => norm(i.name) === norm(targetText) || norm(i.raw).includes(norm(targetText)));
        if (target) {
          simClick(target.el);
          await sleep(200);
          return true;
        }
        pressEsc();
        return false;
      }

      const data = await openAndReadQuickMenu();
      if (!data) return false;
      const configPanel = await openConfigViaMenu(data);
      if (!configPanel) {
        pressEsc();
        return false;
      }

      const cb = configPanel.querySelector('[role="combobox"][aria-labelledby="model-selection-label"]');
      if (!cb) {
        await closeConfig();
        return false;
      }

      const curVer = readVersion(configPanel);
      if (curVer !== legacyVersion) {
        const snap = snapshot();
        simClick(cb);
        await sleep(400);
        const dd = findNew(snap);
        let found = false;
        const findV = node => {
          if (found) return;
          for (const child of (node.children || [])) {
            const t = (child.textContent || '').trim();
            if (t === legacyVersion && child.children.length <= 1) {
              const r = child.getBoundingClientRect();
              if (r.width > 10 && r.height > 10) {
                simClick(child);
                found = true;
                return;
              }
            }
            findV(child);
          }
        };
        if (dd) findV(dd);
        if (!found) {
          pressEsc();
          await closeConfig();
          return false;
        }
        await sleep(300);
      }

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
    } catch (err) {
      console.warn('[CLS] doSelect:', err);
      pressEsc();
      try { await closeConfig(); } catch {}
      return false;
    }
  }

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
.trig{position:fixed;pointer-events:auto;cursor:pointer;user-select:none;display:inline-flex;align-items:center;gap:4px;padding:5px 13px;border-radius:10px;border:none;background:transparent;color:var(--fg);font-size:18px;font-weight:400;line-height:1.5;white-space:nowrap;font-family:inherit}
.trig:hover{background:var(--hov)}
.trig .pre{margin-right:2px}.trig .car{margin-left:1px;opacity:.45;display:inline-flex;align-items:center}.trig .car svg{width:20px;height:20px;fill:currentColor}.trig .lbl{opacity:.55}
.bd{display:none;position:fixed;inset:0;z-index:1;pointer-events:auto}.bd.on{display:block}
.mn{position:fixed;z-index:2;pointer-events:auto;min-width:260px;max-width:320px;max-height:70vh;overflow-y:auto;border-radius:14px;border:1px solid var(--bdr);background:var(--bg);box-shadow:var(--shd);padding:6px 0;font-size:15px;color:var(--fg);font-family:inherit;display:none}
.mn.vis{display:block}.mh{padding:10px 16px 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--fg2)}
.mi{display:flex;align-items:center;padding:9px 16px;cursor:pointer}.mi:hover{background:var(--hov)}
.mi .ic{flex:1;min-width:0}.mi .nm{font-size:15px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mi .ds{font-size:12px;color:var(--fg2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mi .ck{margin-left:8px;color:var(--acc);font-size:16px;flex-shrink:0}.mi .ar{margin-left:8px;opacity:.4;font-size:12px;flex-shrink:0}.dv{height:1px;background:var(--bdr);margin:4px 12px}
.sb{position:fixed;z-index:3;pointer-events:none;min-width:240px;max-width:300px;max-height:60vh;overflow-y:auto;border-radius:12px;border:1px solid var(--bdr);background:var(--bg);box-shadow:var(--shd);padding:6px 0;display:none;font-size:15px;color:var(--fg);font-family:inherit}
.sb.vis{display:block;pointer-events:auto}
.tt{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:9px 18px;border-radius:10px;background:var(--tbg);color:var(--tfg);font-size:13px;font-weight:500;box-shadow:var(--shd);pointer-events:auto;opacity:0;transition:opacity .2s;z-index:4;max-width:380px;text-align:center;font-family:inherit}
.tt.on{opacity:1}
</style>
<button class="trig" type="button"><span class="pre">ChatGPT</span><span class="lbl"></span><span class="car"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M4.22 5.97a.75.75 0 0 1 1.06 0L8 8.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.03a.75.75 0 0 1 0-1.06z"/></svg></span></button>
<div class="bd"></div><div class="mn"></div><div class="sb"></div><div class="tt"></div>`;
    return {
      host,
      shadow,
      btn: shadow.querySelector('.trig'),
      lbl: shadow.querySelector('.lbl'),
      bd: shadow.querySelector('.bd'),
      menu: shadow.querySelector('.mn'),
      sub: shadow.querySelector('.sb'),
      toast: shadow.querySelector('.tt'),
    };
  }

  function init() {
    try {
      if (document.getElementById('cgpt-classic-selector-host')) return;
      const ui = buildUI();

      const hideStyle = document.createElement('style');
      hideStyle.textContent = `
        button.__composer-pill, button[class*="composer-pill"] {
          opacity: 0 !important;
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(hideStyle);

      const THINKING_DEPTHS = {
        Thinking: [
          { label: '快速', value: '快速' },
          { label: '标准', value: '标准' },
          { label: '进阶', value: '进阶' },
          { label: '深入', value: '深入' },
        ],
        Pro: [
          { label: '标准', value: '标准' },
          { label: '进阶', value: '进阶' },
        ],
      };

      let depthBarEl = null;
      let currentDepth = localStorage.getItem('cgpt-cls-depth') || '标准';
      let menuOpen = false;
      let currentModel = localStorage.getItem(STORAGE_MODEL) || '';
      let toastTm;
      let resizeTimer;

      const esc = s => {
        const d = document.createElement('span');
        d.textContent = s || '';
        return d.innerHTML;
      };

      const showToast = msg => {
        ui.toast.textContent = msg;
        ui.toast.classList.add('on');
        clearTimeout(toastTm);
        toastTm = setTimeout(() => ui.toast.classList.remove('on'), TOAST_MS);
      };

      const createDepthBar = () => {
        depthBarEl?.remove();
        depthBarEl = document.createElement('div');
        depthBarEl.id = 'cgpt-cls-depth-bar';
        document.body.appendChild(depthBarEl);

        if (!document.getElementById('cgpt-cls-depth-style')) {
          const depthStyle = document.createElement('style');
          depthStyle.id = 'cgpt-cls-depth-style';
          depthStyle.textContent = `
            #cgpt-cls-depth-bar{position:fixed;z-index:99998;display:none;justify-content:center;gap:6px;padding:6px 0;font-family:ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,Arial,sans-serif}
            #cgpt-cls-depth-bar.vis{display:flex}
            #cgpt-cls-depth-bar .dp{padding:4px 14px;border-radius:16px;border:1.5px solid #d0d7de;background:transparent;color:#555;font-size:13px;font-weight:500;cursor:pointer;transition:none;font-family:inherit;line-height:1.4}
            #cgpt-cls-depth-bar .dp:hover{border-color:#4a90d9;color:#4a90d9}
            #cgpt-cls-depth-bar .dp.act{background:#4a90d9;border-color:#4a90d9;color:#fff}
            html.dark #cgpt-cls-depth-bar .dp{border-color:#555;color:#aaa}
            html.dark #cgpt-cls-depth-bar .dp:hover{border-color:#6aafff;color:#6aafff}
            html.dark #cgpt-cls-depth-bar .dp.act{background:#4a90d9;border-color:#4a90d9;color:#fff}
          `;
          document.head.appendChild(depthStyle);
        }
      };

      const positionDepthBar = () => {
        if (!depthBarEl) return;
        try {
          const composer = document.querySelector('[class*="composer"], form[class*="stretch"], [id*="composer"]');
          if (!composer) return;
          const r = composer.getBoundingClientRect();
          depthBarEl.style.left = r.left + 'px';
          depthBarEl.style.width = r.width + 'px';
          depthBarEl.style.top = (r.bottom + 4) + 'px';
        } catch {}
      };

      const switchThinkingDepth = async depthValue => {
        try {
          const panel = await openConfigPanel();
          if (!panel) return;
          const cbs = panel.querySelectorAll('[role="combobox"]');
          let depthCb = null;
          for (const cb of cbs) {
            const lbl = cb.getAttribute('aria-labelledby') || '';
            if (lbl !== 'model-selection-label') {
              depthCb = cb;
              break;
            }
          }
          if (!depthCb) {
            await closeConfig();
            return;
          }

          const snap = snapshot();
          simClick(depthCb);
          await sleep(400);
          const dd = findNew(snap);
          const findVal = node => {
            for (const child of (node.children || [])) {
              const t = (child.textContent || '').trim();
              if (t === depthValue && child.children.length <= 1) {
                const r = child.getBoundingClientRect();
                if (r.width > 10 && r.height > 10) {
                  simClick(child);
                  return true;
                }
              }
              if (findVal(child)) return true;
            }
            return false;
          };
          if (dd) findVal(dd);
          await sleep(200);
          await closeConfig();
        } catch (err) {
          console.warn('[CLS] switchDepth:', err);
          try { await closeConfig(); } catch {}
        }
      };

      const updateDepthBar = () => {
        if (!depthBarEl) return;
        const cur = norm(currentModel);
        let mode = null;
        if (cur.includes('thinking')) mode = 'Thinking';
        else if (cur.includes('pro')) mode = 'Pro';

        if (!mode) {
          depthBarEl.classList.remove('vis');
          return;
        }

        const depths = THINKING_DEPTHS[mode] || [];
        depthBarEl.innerHTML = depths.map(d => `<button class="dp${d.value === currentDepth ? ' act' : ''}" data-val="${esc(d.value)}">${esc(d.label)}</button>`).join('');
        depthBarEl.classList.add('vis');
        positionDepthBar();
        depthBarEl.querySelectorAll('.dp').forEach(btn => {
          btn.addEventListener('click', async () => {
            currentDepth = btn.dataset.val;
            localStorage.setItem('cgpt-cls-depth', currentDepth);
            updateDepthBar();
            await switchThinkingDepth(currentDepth);
          });
        });
      };

      const setModel = name => {
        currentModel = name || '';
        ui.lbl.textContent = currentModel;
        localStorage.setItem(STORAGE_MODEL, currentModel);
        updateDepthBar();
      };

      createDepthBar();
      if (currentModel) setModel(currentModel);
      setTimeout(updateDepthBar, 2000);
      setInterval(() => {
        if (depthBarEl?.classList.contains('vis')) positionDepthBar();
      }, 2000);

      const syncTheme = () => {
        try {
          const dk = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.style.colorScheme === 'dark';
          ui.host.classList.toggle('dark', dk);
        } catch {}
      };
      syncTheme();
      try { new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] }); } catch {}

      const autoPos = () => {
        try {
          const nav = document.querySelector('nav, [class*="sidebar"], [class*="Sidebar"]');
          let leftOffset = 16;
          if (nav) {
            const r = nav.getBoundingClientRect();
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

      const debouncedPos = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(autoPos, 100);
      };
      window.addEventListener('resize', debouncedPos);
      try {
        new MutationObserver(debouncedPos).observe(document.body, { childList: true, subtree: false });
        const navEl = document.querySelector('nav');
        if (navEl) new MutationObserver(debouncedPos).observe(navEl, { attributes: true, attributeFilter: ['class', 'style'] });
        if (navEl?.parentElement) new MutationObserver(debouncedPos).observe(navEl.parentElement, { attributes: true, childList: true, attributeFilter: ['class', 'style'] });
      } catch {}

      const closeMenu = () => {
        menuOpen = false;
        ui.bd.classList.remove('on');
        ui.menu.classList.remove('vis');
        ui.sub.classList.remove('vis');
        ui.menu.innerHTML = '';
        ui.sub.innerHTML = '';
      };

      const posMenu = () => {
        autoPos();
        const br = ui.btn.getBoundingClientRect();
        let l = br.left;
        let t = br.bottom + 6;
        if (l + 310 > window.innerWidth) l = window.innerWidth - 318;
        if (l < 4) l = 4;
        if (t + 300 > window.innerHeight) t = br.top - 310;
        ui.menu.style.left = l + 'px';
        ui.menu.style.top = t + 'px';
      };

      const LATEST_VER = '5.5';
      const MAIN_MODELS = [
        { mode: 'Instant', menuLabel: 'Auto', desc: '兼顾速度与思考', btnLabel: LATEST_VER },
        { mode: 'Thinking', menuLabel: 'Thinking', desc: '适用于解答复杂问题', btnLabel: LATEST_VER + ' Thinking' },
        { mode: 'Pro', menuLabel: 'Pro', desc: '研究级智能模型', btnLabel: LATEST_VER + ' Pro' },
      ];

      const LEGACY_MODELS = [
        { name: 'GPT-5.4 Thinking', ver: '5.4', mode: 'Thinking', btn: '5.4 Thinking' },
        { name: 'GPT-5.4 Pro', ver: '5.4', mode: 'Pro', btn: '5.4 Pro' },
        { sep: true },
        { name: 'GPT-5.3', ver: '5.3', mode: 'Instant', btn: '5.3' },
        { sep: true },
        { name: 'GPT-5.2', ver: '5.2', mode: 'Instant', btn: '5.2' },
        { name: 'GPT-5.2 Thinking', ver: '5.2', mode: 'Thinking', btn: '5.2 Thinking' },
        { name: 'GPT-5.2 Pro', ver: '5.2', mode: 'Pro', btn: '5.2 Pro' },
        { sep: true },
        { name: 'GPT-4.5', ver: '4.5', mode: 'Instant', btn: '4.5' },
        { sep: true },
        { name: 'o3', ver: 'o3', mode: '', btn: 'o3', desc: '传统推理模型' },
      ];

      const renderMenu = () => {
        const cur = norm(currentModel);
        let html = `<div class="mh">Latest · ${LATEST_VER}</div>`;

        for (const m of MAIN_MODELS) {
          const isA = norm(m.btnLabel) === cur || (m.mode === 'Instant' && (cur === norm(LATEST_VER) || cur === 'auto' || cur === ''));
          html += `<div class="mi mi-main" data-mode="${esc(m.mode)}" data-ver="${LATEST_VER}" data-btn="${esc(m.btnLabel)}"><div class="ic"><div class="nm">${esc(m.menuLabel)}</div><div class="ds">${esc(m.desc)}</div></div>${isA ? '<span class="ck">✓</span>' : ''}</div>`;
        }

        html += '<div class="dv"></div>';
        html += '<div class="mi lt"><div class="ic"><div class="nm">传统模型</div><div class="ds">Legacy models</div></div><span class="ar">▸</span></div>';
        ui.menu.innerHTML = html;

        ui.menu.querySelectorAll('.mi-main').forEach(el => {
          el.addEventListener('click', () => {
            const mode = el.dataset.mode;
            const ver = el.dataset.ver;
            const btn = el.dataset.btn;
            setTimeout(async () => {
              closeMenu();
              const ok = await doSelectModel(mode, true, ver, mode);
              if (ok) setModel(btn);
              else showToast('切换失败');
            }, 50);
          });
        });

        const lt = ui.menu.querySelector('.lt');
        if (!lt) return;

        let sh = '';
        for (const item of LEGACY_MODELS) {
          if (item.sep) {
            sh += '<div class="dv"></div>';
            continue;
          }
          const isA = norm(item.btn) === cur;
          sh += `<div class="mi mi-leg" data-ver="${esc(item.ver)}" data-mode="${esc(item.mode)}" data-btn="${esc(item.btn)}"><div class="ic"><div class="nm">${esc(item.name)}</div>${item.desc ? `<div class="ds">${esc(item.desc)}</div>` : ''}</div>${isA ? '<span class="ck">✓</span>' : ''}</div>`;
        }
        ui.sub.innerHTML = sh;

        ui.sub.querySelectorAll('.mi-leg').forEach(el => {
          el.addEventListener('click', () => {
            const ver = el.dataset.ver;
            const mode = el.dataset.mode;
            const btn = el.dataset.btn;
            setTimeout(async () => {
              closeMenu();
              const ok = await doSelectModel(btn, true, ver, mode);
              if (ok) setModel(btn);
              else showToast('切换失败，该模型可能不可用');
            }, 50);
          });
        });

        let subHideTimer = null;
        const showSub = () => {
          clearTimeout(subHideTimer);
          const lr = lt.getBoundingClientRect();
          let sl = lr.right + 4;
          let st = lr.top;
          if (sl + 270 > window.innerWidth) sl = lr.left - 274;
          if (st + ui.sub.scrollHeight > window.innerHeight) st = Math.max(4, window.innerHeight - ui.sub.scrollHeight - 10);
          ui.sub.style.left = sl + 'px';
          ui.sub.style.top = st + 'px';
          ui.sub.classList.add('vis');
        };
        const hideSub = () => {
          subHideTimer = setTimeout(() => ui.sub.classList.remove('vis'), 400);
        };
        lt.addEventListener('mouseenter', showSub);
        lt.addEventListener('mouseleave', hideSub);
        ui.sub.addEventListener('mouseenter', () => clearTimeout(subHideTimer));
        ui.sub.addEventListener('mouseleave', hideSub);
      };

      const toggleMenu = () => {
        if (menuOpen) {
          closeMenu();
          return;
        }
        menuOpen = true;
        ui.bd.classList.add('on');
        posMenu();
        renderMenu();
        ui.menu.classList.add('vis');
      };

      ui.btn.addEventListener('click', e => {
        e.preventDefault();
        toggleMenu();
      });
      ui.bd.addEventListener('click', closeMenu);
    } catch (err) {
      console.error('[CLS] init:', err);
    }
  }

  const go = () => setTimeout(init, 1500);
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go);
})();
