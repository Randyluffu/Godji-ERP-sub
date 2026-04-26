// ==UserScript==
// @name         Годжи — TightVNC
// @namespace    http://tampermonkey.net/
// @version      3.0
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

// ── Карта комнат (как на ТВ-карте) ───────────────────────
// Каждая комната — позиция и список ПК
// x,y,w,h в % от размера всплывашки (400x520)
var MAP_W = 400, MAP_H = 460;
var ROOMS = [
    // [name, x, y, w, h, [pcs...]]
    ['Q',  270, 10,  120, 90,  ['10','11','12','13']],
    ['W',  270, 108, 120, 90,  ['14','15','16','17']],
    ['E',  270, 206, 120, 60,  ['08','09']],
    ['R',  270, 274, 120, 50,  ['TV1']],
    ['L',  10,  80,  130, 130, ['01','02','03','04','05']],
    ['V',  148, 160, 110, 110, ['06','07','41']],
    ['T',  270, 330, 120, 90,  ['18','19','20','21','22']],
    ['Y',  148, 280, 110, 170, ['23','24','25','26','27','28','29']],
    ['X',  10,  240, 130, 170, ['33','34','35','36','37','38','39','40']],
    ['O',  148, 10,  110, 140, ['30','31','32']],
];

// ── Тост ─────────────────────────────────────────────────
function toast(msg, ok){
    var old = document.getElementById('gj-vnc-toast');
    if(old) old.remove();
    var t = document.createElement('div');
    t.id = 'gj-vnc-toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999999;pointer-events:none;'
        + 'background:var(--mantine-color-body,#1a1b2e);border:1px solid '+(ok?'rgba(74,222,128,.3)':'rgba(239,68,68,.3)')
        + ';border-radius:8px;padding:10px 18px;font-size:13px;font-family:var(--mantine-font-family,inherit);'
        + 'color:'+(ok?'#4ade80':'#f87171')+';display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);';
    t.innerHTML = (ok
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    ) + '<span>' + msg + '</span>';
    document.body.appendChild(t);
    setTimeout(function(){ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(function(){if(t.parentNode)t.remove();},300); }, 2500);
}

// ── Всплывашка с картой ───────────────────────────────────
var _popup = null;
var _popupOpen = false;
var _pcData = {};

function togglePopup(anchor){
    if(_popupOpen){ closePopup(); return; }
    openPopup(anchor);
}

function openPopup(anchor){
    closePopup();
    _popupOpen = true;
    updateSidebarBtn(true);

    var popup = document.createElement('div');
    _popup = popup;
    popup.id = 'gj-vnc-popup';

    // Позиционируем справа от сайдбара (280px) под кнопкой
    var btnRect = anchor.getBoundingClientRect();
    popup.style.cssText = [
        'position:fixed',
        'left:288px',
        'top:'+(btnRect.top-10)+'px',
        'width:'+MAP_W+'px',
        'z-index:99990',
        'background:var(--mantine-color-body,#1a1b2e)',
        'border:1px solid rgba(255,255,255,0.1)',
        'border-radius:12px',
        'box-shadow:0 8px 32px rgba(0,0,0,.6)',
        'font-family:var(--mantine-font-family,inherit)',
        'overflow:hidden',
        'display:flex',
        'flex-direction:column',
    ].join(';');

    // Шапка
    var hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px 10px;border-bottom:1px solid rgba(255,255,255,0.07);flex-shrink:0;';

    var hdrL = document.createElement('div');
    hdrL.style.cssText = 'display:flex;align-items:center;gap:8px;';
    var hIco = document.createElement('div');
    hIco.style.cssText = 'width:26px;height:26px;background:var(--mantine-color-gg_primary-filled,#cc0001);border-radius:6px;display:flex;align-items:center;justify-content:center;';
    hIco.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
    var hTxt = document.createElement('span');
    hTxt.style.cssText = 'font-size:13px;font-weight:700;color:var(--mantine-color-white,#e8eaf0);';
    hTxt.textContent = 'Просмотр экрана';
    hdrL.appendChild(hIco); hdrL.appendChild(hTxt);

    var statusDot = document.createElement('span');
    statusDot.id = 'gj-vnc-status-dot';
    statusDot.style.cssText = 'font-size:11px;color:rgba(255,255,255,.3);';
    statusDot.textContent = '●  проверка…';

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.35);cursor:pointer;font-size:18px;line-height:1;padding:0;';
    closeBtn.textContent = '×';
    closeBtn.onclick = closePopup;

    hdr.appendChild(hdrL); hdr.appendChild(statusDot); hdr.appendChild(closeBtn);
    popup.appendChild(hdr);

    // Карта
    var mapWrap = document.createElement('div');
    mapWrap.style.cssText = 'position:relative;width:'+MAP_W+'px;height:'+MAP_H+'px;flex-shrink:0;';
    mapWrap.id = 'gj-vnc-map';
    popup.appendChild(mapWrap);

    // Легенда
    var legend = document.createElement('div');
    legend.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid rgba(255,255,255,.06);font-size:10px;color:rgba(255,255,255,.35);flex-shrink:0;';
    legend.innerHTML = '<span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(204,0,1,.35);border:1px solid rgba(204,0,1,.6);display:inline-block;"></span>Доступен</span>'
        + '<span style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:3px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);display:inline-block;"></span>Нет в конфиге</span>';
    popup.appendChild(legend);

    document.body.appendChild(popup);

    // Подгоняем если выходит за низ экрана
    var pRect = popup.getBoundingClientRect();
    if(pRect.bottom > window.innerHeight - 10){
        popup.style.top = Math.max(10, window.innerHeight - pRect.height - 10) + 'px';
    }

    // Закрытие по клику снаружи
    setTimeout(function(){
        document.addEventListener('click', outsideClose);
    }, 0);

    // Загружаем данные ПК
    loadPCData(mapWrap, statusDot);
}

function outsideClose(e){
    if(_popup && !_popup.contains(e.target)){
        var btn = document.getElementById('gj-vnc-sidebar-btn');
        if(btn && btn.contains(e.target)) return;
        closePopup();
    }
}

function closePopup(){
    if(_popup){ _popup.remove(); _popup = null; }
    _popupOpen = false;
    updateSidebarBtn(false);
    document.removeEventListener('click', outsideClose);
}

function loadPCData(mapWrap, statusDot){
    fetch(PROXY + '/status')
        .then(function(r){ return r.json(); })
        .then(function(data){
            _pcData = data;
            var cnt = Object.keys(data).length;
            statusDot.innerHTML = '<span style="color:#4ade80;">●</span> <span style="color:rgba(255,255,255,.4);">'+cnt+' ПК</span>';
            renderMap(mapWrap, data);
        })
        .catch(function(){
            statusDot.innerHTML = '<span style="color:#f87171;">●</span> <span style="color:rgba(255,255,255,.3);">нет сервера</span>';
            renderMap(mapWrap, {});
        });
}

function renderMap(mapWrap, data){
    mapWrap.innerHTML = '';

    // Фон карты — светлый как на ТВ-карте
    mapWrap.style.background = '#dde4f0';

    ROOMS.forEach(function(room){
        var name=room[0], rx=room[1], ry=room[2], rw=room[3], rh=room[4], pcs=room[5];

        // Блок комнаты
        var roomEl = document.createElement('div');
        roomEl.style.cssText = 'position:absolute;left:'+rx+'px;top:'+ry+'px;width:'+rw+'px;height:'+rh+'px;'
            + 'background:rgba(255,255,255,0.75);border-radius:6px;border:1px solid rgba(255,255,255,0.9);'
            + 'box-shadow:inset 0 0 0 1px rgba(0,0,0,0.06);';

        // Название комнаты
        var roomLbl = document.createElement('div');
        roomLbl.style.cssText = 'position:absolute;right:5px;bottom:3px;font-size:11px;font-weight:700;'
            + 'color:rgba(0,0,0,0.2);line-height:1;';
        roomLbl.textContent = name;
        roomEl.appendChild(roomLbl);

        // Карточки ПК внутри комнаты
        var cols = Math.ceil(Math.sqrt(pcs.length));
        var cellW = Math.floor((rw - 8) / cols);
        var cellH = Math.floor((rh - 18) / Math.ceil(pcs.length / cols));

        pcs.forEach(function(pcName, idx){
            var col = idx % cols;
            var row = Math.floor(idx / cols);
            var pc = data[pcName] || data[String(parseInt(pcName))];
            var avail = !!pc;

            var cell = document.createElement('button');
            cell.style.cssText = 'position:absolute;'
                + 'left:'+(4 + col * cellW)+'px;'
                + 'top:'+(4 + row * cellH)+'px;'
                + 'width:'+(cellW - 3)+'px;'
                + 'height:'+(cellH - 3)+'px;'
                + 'border-radius:4px;'
                + 'border:1px solid '+(avail?'rgba(204,0,1,.5)':'rgba(0,0,0,.1)')+';'
                + 'background:'+(avail?'rgba(204,0,1,.18)':'rgba(255,255,255,.6)')+';'
                + 'font-size:9px;font-weight:800;'
                + 'color:'+(avail?'#8b0000':'rgba(0,0,0,.3)')+';'
                + 'cursor:'+(avail?'pointer':'default')+';'
                + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;'
                + 'transition:background .12s,transform .1s;'
                + 'font-family:inherit;padding:0;line-height:1;';

            var numSpan = document.createElement('span');
            numSpan.textContent = pcName;
            cell.appendChild(numSpan);

            if(avail){
                var dot = document.createElement('span');
                dot.style.cssText = 'width:4px;height:4px;border-radius:50%;background:#cc0001;';
                cell.appendChild(dot);

                cell.addEventListener('mouseenter', function(){
                    cell.style.background = 'rgba(204,0,1,.35)';
                    cell.style.transform = 'scale(1.08)';
                });
                cell.addEventListener('mouseleave', function(){
                    cell.style.background = 'rgba(204,0,1,.18)';
                    cell.style.transform = '';
                });
                cell.addEventListener('click', function(e){
                    e.stopPropagation();
                    connectPC(pcName, cell);
                });
            }

            roomEl.appendChild(cell);
        });

        mapWrap.appendChild(roomEl);
    });
}

function connectPC(name, cell){
    cell.disabled = true;
    cell.style.opacity = '.5';
    fetch(PROXY + '/connect?pc=' + encodeURIComponent(name))
        .then(function(r){ return r.json(); })
        .then(function(res){
            if(res.error) throw new Error(res.error);
            toast('Просмотр экрана ПК ' + name + ' открыт', true);
            cell.style.background = 'rgba(74,222,128,.25)';
            cell.style.borderColor = 'rgba(74,222,128,.6)';
            setTimeout(function(){
                cell.disabled = false;
                cell.style.opacity = '';
                cell.style.background = 'rgba(204,0,1,.18)';
                cell.style.borderColor = 'rgba(204,0,1,.5)';
            }, 2000);
        })
        .catch(function(e){
            toast(e.message || 'Ошибка подключения', false);
            cell.disabled = false;
            cell.style.opacity = '';
        });
}

// ── Кнопка в сайдбаре ────────────────────────────────────
function getClockSection(){
    var navbar = document.querySelector('nav.mantine-AppShell-navbar');
    if(!navbar) return null;
    var sections = navbar.querySelectorAll(':scope > .mantine-AppShell-section');
    for(var i = 0; i < sections.length; i++){
        var s = sections[i];
        if(!s.classList.contains('Sidebar_footer__1BA98') &&
           !s.classList.contains('Sidebar_links__o1FyV') &&
           !s.classList.contains('Sidebar_header__dm6Ua') &&
           (s.querySelector('.Shifts_shiftsPaper__9Jml_') || s.textContent.match(/\d{2}:\d{2}/))){
            return s;
        }
    }
    return null;
}

function createSidebarBtn(){
    if(document.getElementById('gj-vnc-sidebar-btn')) return;

    var nativeLink = document.querySelector('a[href="/bookings"]') ||
                     document.querySelector('a.mantine-NavLink-root');
    var cls = nativeLink ? nativeLink.className
        : 'mantine-focus-auto LinksGroup_navLink__qvSOI m_f0824112 mantine-NavLink-root m_87cf2631 mantine-UnstyledButton-root';

    var btn = document.createElement('a');
    btn.id = 'gj-vnc-sidebar-btn';
    btn.className = cls;
    btn.href = 'javascript:void(0)';
    btn.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;height:46px;padding:8px 12px 8px 18px;cursor:pointer;user-select:none;font-family:inherit;box-sizing:border-box;text-decoration:none;';

    var sec = document.createElement('span');
    sec.className = 'm_690090b5 mantine-NavLink-section';
    sec.setAttribute('data-position','left');
    var icoWrap = document.createElement('div');
    icoWrap.className = 'LinksGroup_themeIcon__E9SRO m_7341320d mantine-ThemeIcon-root';
    icoWrap.setAttribute('data-variant','filled');
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
        togglePopup(btn);
    });

    // Вставляем под Поиск клиента (godji-search-btn), иначе перед блоком часов
    var searchBtn = document.getElementById('godji-search-btn');
    if(searchBtn && searchBtn.parentNode){
        var next = searchBtn.nextSibling;
        if(next) searchBtn.parentNode.insertBefore(btn, next);
        else searchBtn.parentNode.appendChild(btn);
        return;
    }
    // Фоллбэк — перед блоком часов в navbar
    var clockSec = getClockSection();
    if(clockSec && clockSec.parentNode){
        clockSec.parentNode.insertBefore(btn, clockSec);
    }
}

function updateSidebarBtn(open){
    var btn = document.getElementById('gj-vnc-sidebar-btn');
    if(!btn) return;
    if(open) btn.setAttribute('data-active','true');
    else btn.removeAttribute('data-active');
}

// ── Init ──────────────────────────────────────────────────
function tryInit(){
    // Ждём navbar
    if(!document.querySelector('nav.mantine-AppShell-navbar')){
        setTimeout(tryInit, 500); return;
    }
    createSidebarBtn();
}

new MutationObserver(function(){
    if(!document.getElementById('gj-vnc-sidebar-btn')) createSidebarBtn();
}).observe(document.body || document.documentElement, {childList:true, subtree:false});

setTimeout(tryInit, 1000);
setTimeout(tryInit, 2500);
setTimeout(tryInit, 5000);

})();
