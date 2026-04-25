// ==UserScript==
// @name         Годжи — TightVNC
// @namespace    http://tampermonkey.net/
// @version      2.1
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
        'position:fixed','top:0',
        'left:280px',  // сразу за сайдбаром (280px — ширина сайдбара ERP)
        'width:360px','height:100vh',
        'background:var(--mantine-color-body,#1a1b2e)',
        'border-right:1px solid var(--mantine-color-default-border,rgba(255,255,255,0.1))',
        'box-shadow:4px 0 24px rgba(0,0,0,.5)',
        'z-index:999990',
        'font-family:var(--mantine-font-family,inherit)',
        'display:flex','flex-direction:column',
        'transform:translateX(-110%)','transition:transform .25s ease',
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
    if(_panel) _panel.style.transform = 'translateX(-110%)';
    _panelOpen = false;
    updateSidebarBtn(false);
}

function togglePanel(){
    _panelOpen ? closePanel() : openPanel();
}

// ── Карта посадки ПК ─────────────────────────────────────
// Схема комнат и расположение ПК (соответствует реальной карте клуба)
var ROOMS = [
    { name:'Q',  pcs:['10','11','12','13'] },
    { name:'W',  pcs:['14','15','16','17'] },
    { name:'E',  pcs:['08','09'] },
    { name:'R',  pcs:['TV1'] },
    { name:'L',  pcs:['01','02','03','04','05'] },
    { name:'V',  pcs:['06','07','41'] },
    { name:'T',  pcs:['18','19','20','21','22'] },
    { name:'Y',  pcs:['23','24','25','26','27','28','29'] },
    { name:'X',  pcs:['33','34','35','36','37','38','39','40'] },
    { name:'O',  pcs:['30','31','32'] },
];

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
            renderMap(listEl, data);
        })
        .catch(function(){
            if(statusEl) statusEl.innerHTML = '<span style="color:#f87171;">● Сервер недоступен</span> — запустите vnc_server.py';
            listEl.innerHTML = '<div style="color:rgba(239,68,68,.6);text-align:center;padding:24px;font-size:13px;">Сервер не запущен<br><span style="color:rgba(255,255,255,0.2);font-size:11px;margin-top:4px;display:block;">Запустите vnc_server.py</span></div>';
        });
}

function renderMap(listEl, data){
    listEl.innerHTML = '';

    if(!Object.keys(data).length){
        listEl.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:24px;font-size:13px;">Нет ПК в конфиге</div>';
        return;
    }

    // Подсказка
    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.25);text-align:center;padding:4px 0 10px;';
    hint.textContent = 'Нажмите на ПК для подключения';
    listEl.appendChild(hint);

    ROOMS.forEach(function(room){
        // Показываем комнату только если есть хотя бы один ПК из неё в данных
        var hasAny = room.pcs.some(function(name){
            return data[name] || data[String(parseInt(name))] || data[name.toLowerCase()];
        });
        if(!hasAny) return;

        var roomWrap = document.createElement('div');
        roomWrap.style.cssText = 'margin-bottom:10px;';

        // Название комнаты
        var roomLbl = document.createElement('div');
        roomLbl.style.cssText = 'font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;padding:0 2px;';
        roomLbl.textContent = 'Комната ' + room.name;
        roomWrap.appendChild(roomLbl);

        // Сетка ПК
        var grid = document.createElement('div');
        grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px;';

        room.pcs.forEach(function(pcName){
            // Ищем в данных по имени (может быть числовым или строковым)
            var pc = data[pcName] || data[String(parseInt(pcName))] || data[pcName.toLowerCase()];
            var available = !!pc;

            var cell = document.createElement('button');
            cell.style.cssText = [
                'width:44px','height:44px',
                'border-radius:8px',
                'border:1px solid ' + (available ? 'rgba(204,0,1,.4)' : 'rgba(255,255,255,.08)'),
                'background:' + (available ? 'rgba(204,0,1,.12)' : 'rgba(255,255,255,.04)'),
                'color:' + (available ? '#fff' : 'rgba(255,255,255,.25)'),
                'font-size:11px','font-weight:700',
                'cursor:' + (available ? 'pointer' : 'default'),
                'display:flex','flex-direction:column','align-items:center','justify-content:center',
                'gap:2px',
                'transition:background .15s,border-color .15s,transform .1s',
                'font-family:inherit',
            ].join(';');

            var numEl = document.createElement('span');
            numEl.style.cssText = 'font-size:12px;font-weight:800;line-height:1;';
            numEl.textContent = pcName;

            var dotEl = document.createElement('span');
            dotEl.style.cssText = 'width:5px;height:5px;border-radius:50%;background:' + (available ? '#4ade80' : 'rgba(255,255,255,.2)') + ';';

            cell.appendChild(numEl);
            cell.appendChild(dotEl);

            if(available){
                cell.addEventListener('mouseenter', function(){
                    cell.style.background = 'rgba(204,0,1,.25)';
                    cell.style.borderColor = 'rgba(204,0,1,.7)';
                    cell.style.transform = 'scale(1.06)';
                });
                cell.addEventListener('mouseleave', function(){
                    cell.style.background = 'rgba(204,0,1,.12)';
                    cell.style.borderColor = 'rgba(204,0,1,.4)';
                    cell.style.transform = '';
                });
                cell.addEventListener('click', function(){ connectPC(pcName, cell); });
            }

            grid.appendChild(cell);
        });

        roomWrap.appendChild(grid);
        listEl.appendChild(roomWrap);
    });
}

function connectPC(name, cell){
    var prev = cell.innerHTML;
    cell.disabled = true;
    cell.style.opacity = '.6';
    fetch(PROXY + '/connect?pc=' + name)
        .then(function(r){ return r.json(); })
        .then(function(res){
            if(res.error) throw new Error(res.error);
            toast('TightVNC открыт для ПК ' + name, true);
            cell.style.borderColor = 'rgba(74,222,128,.6)';
            cell.style.background = 'rgba(74,222,128,.12)';
            setTimeout(function(){
                cell.disabled = false;
                cell.style.opacity = '';
                cell.style.borderColor = 'rgba(204,0,1,.4)';
                cell.style.background = 'rgba(204,0,1,.12)';
            }, 2000);
        })
        .catch(function(e){
            toast(e.message || 'Ошибка', false);
            cell.disabled = false;
            cell.style.opacity = '';
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
    lbl.textContent = 'Просмотр экрана';
    body.appendChild(lbl);

    btn.appendChild(sec); btn.appendChild(body);

    btn.addEventListener('click', function(e){
        e.stopPropagation();
        togglePanel();
    });

    // Вставляем сразу после godji-search-btn (Поиск клиента)
    var searchBtn = sb.querySelector('#godji-search-btn');
    if(searchBtn && searchBtn.nextSibling){
        sb.insertBefore(btn, searchBtn.nextSibling);
    } else if(searchBtn){
        sb.appendChild(btn);
    } else {
        // Фоллбэк — после последнего нативного NavLink
        var nativeLinks = Array.from(sb.querySelectorAll('a.mantine-NavLink-root:not([id^="godji"]):not([id^="gj"])'));
        var last = nativeLinks[nativeLinks.length - 1];
        if(last && last.nextSibling) sb.insertBefore(btn, last.nextSibling);
        else sb.appendChild(btn);
    }
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
