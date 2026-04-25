// ==UserScript==
// @name         Годжи — TightVNC
// @namespace    http://tampermonkey.net/
// @version      2.0
// @match        https://godji.cloud/*
// @match        https://*.godji.cloud/*
// @exclude      https://godji.cloud/tv/*
// @exclude      https://*.godji.cloud/tv/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(function(){
'use strict';

var PROXY = 'http://localhost:6080';
var PANEL_KEY = 'godji_vnc_open';

// ── Утилиты в стиле ERP ───────────────────────────────────
function hasSidebar(){
    return !!document.querySelector('.Sidebar_footer__1BA98');
}

function toast(msg, ok){
    var old = document.getElementById('gj-vnc-toast');
    if(old) old.remove();
    var t = document.createElement('div');
    t.id = 'gj-vnc-toast';
    t.style.cssText = [
        'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
        'z-index:9999999','pointer-events:none',
        'background:var(--mantine-color-body,#1a1b2e)',
        'border:1px solid '+(ok?'rgba(74,222,128,.3)':'rgba(239,68,68,.3)'),
        'border-radius:8px','padding:10px 18px',
        'font-size:13px','font-family:var(--mantine-font-family,inherit)',
        'color:'+(ok?'#4ade80':'#f87171'),
        'display:flex','align-items:center','gap:8px',
        'box-shadow:0 4px 20px rgba(0,0,0,.4)',
        'transition:opacity .3s',
    ].join(';');
    t.innerHTML = (ok
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    ) + '<span>' + msg + '</span>';
    document.body.appendChild(t);
    setTimeout(function(){
        t.style.opacity = '0';
        setTimeout(function(){ if(t.parentNode) t.remove(); }, 300);
    }, 2500);
}

// ── Панель ────────────────────────────────────────────────
var _panel = null;
var _panelOpen = false;

function buildPanel(){
    if(_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'gj-vnc-panel';
    _panel.style.cssText = [
        'position:fixed','top:0','right:0',
        'width:300px','height:100vh',
        'background:var(--mantine-color-body,#1a1b2e)',
        'border-left:1px solid var(--mantine-color-default-border,rgba(255,255,255,0.1))',
        'box-shadow:-4px 0 24px rgba(0,0,0,.5)',
        'z-index:999990',
        'font-family:var(--mantine-font-family,inherit)',
        'display:flex','flex-direction:column',
        'transform:translateX(100%)','transition:transform .25s ease',
    ].join(';');

    // Шапка
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--mantine-color-default-border,rgba(255,255,255,0.08));flex-shrink:0;';

    var hdrL = document.createElement('div');
    hdrL.style.cssText = 'display:flex;align-items:center;gap:10px;';

    var ico = document.createElement('div');
    ico.style.cssText = 'width:30px;height:30px;background:var(--mantine-color-gg_primary-filled,#cc0001);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    ico.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

    var title = document.createElement('span');
    title.style.cssText = 'font-size:14px;font-weight:700;color:var(--mantine-color-white,#e8eaf0);';
    title.textContent = 'TightVNC';

    hdrL.appendChild(ico); hdrL.appendChild(title);

    var hdrR = document.createElement('div');
    hdrR.style.cssText = 'display:flex;align-items:center;gap:6px;';

    var refreshBtn = mkIconBtn('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', 'Обновить');
    refreshBtn.addEventListener('click', function(){ loadList(); });

    var closeBtn = mkIconBtn('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>', 'Закрыть');
    closeBtn.addEventListener('click', closePanel);

    hdrR.appendChild(refreshBtn); hdrR.appendChild(closeBtn);
    hdr.appendChild(hdrL); hdr.appendChild(hdrR);
    _panel.appendChild(hdr);

    // Статус
    var statusEl = document.createElement('div');
    statusEl.id = 'gj-vnc-status';
    statusEl.style.cssText = 'padding:8px 16px;font-size:11px;color:rgba(255,255,255,0.3);border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;';
    statusEl.textContent = 'Проверка сервера…';
    _panel.appendChild(statusEl);

    // Список
    var listEl = document.createElement('div');
    listEl.id = 'gj-vnc-list';
    listEl.style.cssText = 'flex:1;overflow-y:auto;padding:10px;';
    listEl.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:24px;font-size:13px;">Загрузка…</div>';
    _panel.appendChild(listEl);

    // Скроллбар
    var style = document.createElement('style');
    style.textContent = '#gj-vnc-list::-webkit-scrollbar{width:4px}#gj-vnc-list::-webkit-scrollbar-track{background:transparent}#gj-vnc-list::-webkit-scrollbar-thumb{background:rgba(204,0,1,.3);border-radius:2px}';
    document.head.appendChild(style);

    document.body.appendChild(_panel);

    // Закрыть по клику снаружи
    document.addEventListener('click', function(e){
        if(_panelOpen && _panel && !_panel.contains(e.target)){
            var btn = document.getElementById('gj-vnc-sidebar-btn');
            if(btn && btn.contains(e.target)) return;
            closePanel();
        }
    });

    // Автообновление
    setInterval(function(){
        if(_panelOpen) loadList();
    }, 15000);
}

function mkIconBtn(svg, title){
    var b = document.createElement('button');
    b.title = title;
    b.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:5px 8px;color:rgba(255,255,255,0.5);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s;line-height:0;';
    b.innerHTML = svg;
    b.addEventListener('mouseenter', function(){ b.style.background='rgba(255,255,255,0.1)'; b.style.color='rgba(255,255,255,0.9)'; });
    b.addEventListener('mouseleave', function(){ b.style.background='rgba(255,255,255,0.06)'; b.style.color='rgba(255,255,255,0.5)'; });
    return b;
}

function openPanel(){
    buildPanel();
    _panel.style.transform = 'translateX(0)';
    _panelOpen = true;
    updateSidebarBtn(true);
    loadList();
}

function closePanel(){
    if(_panel) _panel.style.transform = 'translateX(100%)';
    _panelOpen = false;
    updateSidebarBtn(false);
}

function togglePanel(){
    _panelOpen ? closePanel() : openPanel();
}

// ── Загрузка списка ПК ────────────────────────────────────
function loadList(){
    var listEl = document.getElementById('gj-vnc-list');
    var statusEl = document.getElementById('gj-vnc-status');
    if(!listEl) return;

    fetch(PROXY + '/status')
        .then(function(r){ return r.json(); })
        .then(function(data){
            if(statusEl){
                var cnt = Object.keys(data).length;
                statusEl.innerHTML = '<span style="color:#4ade80;">● Сервер работает</span> · ПК: ' + cnt;
            }

            listEl.innerHTML = '';
            var keys = Object.keys(data).sort(function(a,b){ return parseInt(a)-parseInt(b); });

            if(!keys.length){
                listEl.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:24px;font-size:13px;">Нет ПК в конфиге</div>';
                return;
            }

            keys.forEach(function(name){
                var pc = data[name];
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.07);margin-bottom:6px;background:rgba(255,255,255,0.03);transition:border-color .15s,background .15s;cursor:default;';
                row.addEventListener('mouseenter', function(){ row.style.borderColor='rgba(204,0,1,.3)'; row.style.background='rgba(204,0,1,.05)'; });
                row.addEventListener('mouseleave', function(){ row.style.borderColor='rgba(255,255,255,.07)'; row.style.background='rgba(255,255,255,.03)'; });

                var pcIco = document.createElement('div');
                pcIco.style.cssText = 'width:32px;height:32px;border-radius:7px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:rgba(255,255,255,0.4);';
                pcIco.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

                var info = document.createElement('div');
                info.style.cssText = 'flex:1;min-width:0;';
                info.innerHTML = '<div style="font-size:13px;font-weight:600;color:var(--mantine-color-white,#e8eaf0);">ПК ' + name + '</div>'
                    + '<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:1px;">' + (pc.ip||'') + '</div>';

                var openBtn = document.createElement('button');
                openBtn.style.cssText = 'background:var(--mantine-color-gg_primary-filled,#cc0001);color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;transition:opacity .15s;flex-shrink:0;display:flex;align-items:center;gap:5px;';
                openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Открыть';
                openBtn.addEventListener('mouseenter', function(){ openBtn.style.opacity='.85'; });
                openBtn.addEventListener('mouseleave', function(){ openBtn.style.opacity='1'; });

                openBtn.addEventListener('click', function(){
                    openBtn.disabled = true;
                    openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin .7s linear infinite"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
                    fetch(PROXY + '/connect?pc=' + name)
                        .then(function(r){ return r.json(); })
                        .then(function(res){
                            if(res.error) throw new Error(res.error);
                            toast('TightVNC открыт для ПК ' + name, true);
                            openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
                            setTimeout(function(){
                                openBtn.disabled = false;
                                openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Открыть';
                            }, 2000);
                        })
                        .catch(function(e){
                            toast(e.message || 'Ошибка', false);
                            openBtn.disabled = false;
                            openBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>Открыть';
                        });
                });

                row.appendChild(pcIco); row.appendChild(info); row.appendChild(openBtn);
                listEl.appendChild(row);
            });
        })
        .catch(function(){
            if(statusEl) statusEl.innerHTML = '<span style="color:#f87171;">● Сервер недоступен</span> — запустите vnc_server.py';
            listEl.innerHTML = '<div style="color:rgba(239,68,68,.6);text-align:center;padding:24px;font-size:13px;">Сервер не запущен<br><span style="color:rgba(255,255,255,0.2);font-size:11px;margin-top:4px;display:block;">Запустите vnc_server.py</span></div>';
        });
}

// ── Кнопка в сайдбаре (NavLink стиль, как касса/история) ─
function createSidebarBtn(){
    if(!hasSidebar()) return;
    if(document.getElementById('gj-vnc-sidebar-btn')) return;
    var sb = document.querySelector('.Sidebar_linksInner__oTy_4');
    if(!sb) return;

    // Берём класс от нативной кнопки
    var nativeLink = document.querySelector('a[href="/bookings"]');
    var cls = nativeLink ? nativeLink.className : 'mantine-focus-auto LinksGroup_navLink__qvSOI m_f0824112 mantine-NavLink-root m_87cf2631 mantine-UnstyledButton-root';

    var btn = document.createElement('a');
    btn.id = 'gj-vnc-sidebar-btn';
    btn.className = cls;
    btn.href = 'javascript:void(0)';
    btn.title = 'TightVNC — управление ПК';
    btn.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;height:46px;padding:8px 16px 8px 12px;cursor:pointer;user-select:none;font-family:inherit;box-sizing:border-box;text-decoration:none;';

    var sec = document.createElement('span');
    sec.className = 'm_690090b5 mantine-NavLink-section';
    sec.setAttribute('data-position','left');

    var icoWrap = document.createElement('div');
    icoWrap.className = 'LinksGroup_themeIcon__E9SRO m_7341320d mantine-ThemeIcon-root';
    icoWrap.setAttribute('data-variant','filled');
    // Цвет как у оригинальных кнопок ERP
    icoWrap.style.cssText = '--ti-size:calc(1.875rem * var(--mantine-scale));--ti-bg:var(--mantine-color-gg_primary-filled,#cc0001);--ti-color:var(--mantine-color-white);--ti-bd:calc(0.0625rem * var(--mantine-scale)) solid transparent;';
    icoWrap.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
    sec.appendChild(icoWrap);

    var body = document.createElement('div');
    body.className = 'm_f07af9d2 mantine-NavLink-body';
    var lbl = document.createElement('span');
    lbl.className = 'm_1f6ac4c4 mantine-NavLink-label';
    lbl.textContent = 'TightVNC';
    body.appendChild(lbl);

    btn.appendChild(sec); btn.appendChild(body);

    btn.addEventListener('click', function(e){
        e.stopPropagation();
        togglePanel();
    });

    // Вставляем после последнего нативного NavLink
    var nativeLinks = Array.from(sb.querySelectorAll('a.mantine-NavLink-root:not([id^="godji"]):not([id^="gj"])'));
    var last = nativeLinks[nativeLinks.length - 1];
    if(last && last.nextSibling) sb.insertBefore(btn, last.nextSibling);
    else sb.appendChild(btn);
}

function updateSidebarBtn(open){
    var btn = document.getElementById('gj-vnc-sidebar-btn');
    if(!btn) return;
    if(open) btn.setAttribute('data-active','true');
    else btn.removeAttribute('data-active');
}

// ── CSS анимация spinner ───────────────────────────────────
var spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
document.head.appendChild(spinStyle);

// ── Init ──────────────────────────────────────────────────
function tryInit(){
    if(!document.querySelector('.Sidebar_linksInner__oTy_4')){
        setTimeout(tryInit, 500); return;
    }
    createSidebarBtn();
}

new MutationObserver(function(){
    if(!document.getElementById('gj-vnc-sidebar-btn')) createSidebarBtn();
}).observe(document.body||document.documentElement, {childList:true, subtree:false});

setTimeout(tryInit, 1000);
setTimeout(tryInit, 3000);

})();
