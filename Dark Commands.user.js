// ==UserScript==
// @name         Dark Commands
// @namespace    https://github.com/
// @version      1.4.1
// @author       Dark Rebel
// @description  GPT Time/Rank hide, Chegada de Comandos, Salvar Tropas, AutoLoad, Login Diário, Happening
// @match        https://*.grepolis.com/game/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @updateURL   https://github.com/darkytcho/darkcommands/releases/latest/download/Dark.Commands.min.user.js
// @downloadURL https://github.com/darkytcho/darkcommands/releases/latest/download/Dark.Commands.min.user.js
// ==/UserScript==

(function () {
    'use strict';

    let uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const MS_PER_SEC = 1000;
    const SEC_PER_MIN = 60;
    const SEC_PER_HOUR = 3600;
    const SEC_PER_DAY = 86400;
    const HALF_DAY_SEC = 43200;
    const RADIX = 10;
    const RESYNC_INTERVAL = 300;
    const VISUAL_WARN_SEC = 900;
    const SOUND_WARN_SEC = 120;
    const HAPPENING_TIMES = [36000, 79200];
    const VERSION = '1.4.1';

    let _audioCtx = null;

    function _unlockAudio() {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (_audioCtx.state === 'suspended') _audioCtx.resume();
    }
    $(document).one('click touchstart', _unlockAudio);

    function _playTick($icon, isTock) {
        if (!_audioCtx) return;
        if (_audioCtx.state !== 'running') return;
        let osc = _audioCtx.createOscillator();
        let gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.value = isTock ? 1600 : 1200;
        gain.gain.setValueAtTime(0.35, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(_audioCtx.currentTime + 0.05);
    }

    function _loadOpts() {
        try { return JSON.parse(GM_getValue('dark_ct_opts', '{}')); } catch (e) { return {}; }
    }

    let OPTIONS = (function () {
        let s = _loadOpts();
        return {
            hideGPT: s.hideGPT !== undefined ? s.hideGPT : true,
            actBoxes: s.actBoxes !== undefined ? s.actBoxes : false,
            cmdArrival: s.cmdArrival !== undefined ? s.cmdArrival : true,
            saveTroops: s.saveTroops !== undefined ? s.saveTroops : false,
            autoLoad: s.autoLoad !== undefined ? s.autoLoad : true,
            loginDiario: s.loginDiario !== undefined ? s.loginDiario : true,
            happening: s.happening !== undefined ? s.happening : true
        };
    })();

    function saveOpts() {
        try { GM_setValue('dark_ct_opts', JSON.stringify(OPTIONS)); } catch (e) { console.warn('[DarkCmds] saveOpts:', e.message); }
    }

    function _loadPanelPos() {
        try { return JSON.parse(GM_getValue('dark_ct_panel_pos', 'null')); } catch (e) { return null; }
    }

    function _savePanelPos(left, top) {
        try { GM_setValue('dark_ct_panel_pos', JSON.stringify({ left: Math.round(left), top: Math.round(top) })); } catch (e) {}
    }

    // ---- CSS ----
    function addStyles() {
        $('<style id="dark_ct_styles">' +
            '@keyframes dark_hap_pulse { 0% { color:#ff2222; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } 25% { color:#ff0000; opacity:1; text-shadow:0 0 12px #ffffff,0 0 20px #ffffff; transform:translateX(-50%) scale(1.3); } 50% { color:#ff4444; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } 75% { color:#ff0000; opacity:1; text-shadow:0 0 12px #ffffff,0 0 20px #ffffff; transform:translateX(-50%) scale(1.3); } 100% { color:#ff2222; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } } ' +
            '        .dark_hap_warning { animation:dark_hap_pulse 2s infinite; font-size:13px !important; } ' +

            '.dark_ct_settings { position:fixed; z-index:10000; width:320px; min-height:200px; background:linear-gradient(135deg,#1a1612 0%,#2d2519 100%); border:1px solid #5a4a32; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.6); padding:0; color:#C4B998; font-family:Arial,sans-serif; font-size:12px; } ' +
            '.dark_ct_settings .dark_ct_header { position:relative; padding:8px 12px; background:linear-gradient(180deg,#3d3224 0%,#2d2519 100%); border-bottom:1px solid #5a4a32; border-radius:8px 8px 0 0; font-size:14px; font-weight:bold; color:#FFD700; cursor:move; } ' +
            '.dark_ct_settings .dark_ct_close { position:absolute; top:50%; right:8px; transform:translateY(-50%); width:26px; height:26px; color:#8a7a62; font-size:18px; font-weight:bold; cursor:pointer; text-align:center; line-height:26px; border-radius:4px; } ' +
            '.dark_ct_settings .dark_ct_close:hover { color:#FFD700; background:rgba(255,255,255,0.1); } ' +
            '.dark_ct_settings .dark_ct_body { padding:8px 12px 12px; } ' +
            '.dark_ct_row { display:flex; align-items:center; justify-content:space-between; padding:6px 0; border-bottom:1px solid rgba(90,74,50,0.4); } ' +
            '.dark_ct_row:last-child { border-bottom:none; } ' +
            '.dark_ct_label { flex:1; font-size:12px; text-align:left; } ' +
            '.dark_ct_desc { font-size:10px; color:#8a7a62; margin-top:1px; text-align:left; } ' +
            '.dark_ct_row.dark_ct_disabled { opacity:0.55; } ' +
            '.dark_ct_row.dark_ct_disabled .dark_ct_label { text-decoration:line-through; } ' +
            '.dark_ct_toggle { position:relative; width:44px; height:22px; flex-shrink:0; margin-left:8px; cursor:pointer; background:#3d3224; border-radius:11px; border:1px solid #5a4a32; transition:background 0.2s; } ' +
            '.dark_ct_toggle.on { background:#4a7a3a; border-color:#5a9a4a; } ' +
            '.dark_ct_toggle .dark_ct_knob { position:absolute; top:1px; left:1px; width:18px; height:18px; background:#C4B998; border-radius:50%; transition:left 0.2s; } ' +
            '.dark_ct_toggle.on .dark_ct_knob { left:23px; } ' +
            '.dark_ct_btn_bar { position:fixed; bottom:10px; left:10px; z-index:9999; } ' +
            '.dark_ct_btn_bar button { display:block; width:36px; height:36px; margin-bottom:4px; background:linear-gradient(180deg,#3d3224,#2d2519); border:1px solid #5a4a32; border-radius:6px; color:#FFD700; font-size:16px; cursor:pointer; line-height:1; padding:0; } ' +
            '.dark_ct_btn_bar button:hover { background:#5a4a30; } ' +
            // Salvar Tropas toggle
            '.attack_support_window .dark_dur_save_wrap { display:flex; align-items:center; gap:10px; padding:0; margin-left:auto; } ' +
            '.attack_support_window .dark_dur_save_btn { display:inline-flex; align-items:center; cursor:pointer; background:none; border:none; padding:0; margin:0; } ' +
            '.attack_support_window .dark_dur_save_btn .dark_track { position:relative; width:36px; height:20px; border-radius:10px; background:#3a3020; border:1px solid rgba(100,80,40,0.6); box-sizing:border-box; flex-shrink:0; } ' +
            '.attack_support_window .dark_dur_save_btn .dark_track::after { content:""; position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#6b5b4a; transition:left 0.15s, background 0.15s; } ' +
            '.attack_support_window .dark_dur_save_btn.active .dark_track { background:#5a4a30; border-color:rgba(120,100,60,0.7); } ' +
            '.attack_support_window .dark_dur_save_btn.active .dark_track::after { left:18px; background:#FFD700; } ' +
            '.attack_support_window .dark_dur_save_text { flex:1; min-width:0; } ' +
            '.attack_support_window .dark_dur_save_label { display:block; font-weight:bold; font-size:12px; color:#1c1814; } ' +
            '.attack_support_window .dark_dur_save_status { display:block; font-size:10px; font-weight:bold; margin-top:1px; } ' +
            '.dark_autoload_wrap { display:inline-flex; align-items:center; margin-left:8px; } ' +
            '.dark_autoload_btn { cursor:pointer; padding:3px 10px; font-size:11px; font-weight:bold; background:#5a4a30; color:#FFD700; border:1px solid rgba(120,100,60,0.7); border-radius:3px; } ' +
            '.dark_autoload_btn:hover { background:#6a5a40; } ' +
            '.dark_arrival { margin-left:10px; font-size:12px; color:#13487e; font-weight:bold; } ' +

            '</style>').appendTo('head');
    }

    function addBarButton() {
        if ($('#dark_ct_btn_bar').length) return;
        let bar = $('<div id="dark_ct_btn_bar" class="dark_ct_btn_bar"><button id="dark_ct_gear" title="Configurar Dark Commands">\u2699</button></div>');
        bar.appendTo('body');
        bar.on('click', '#dark_ct_gear', function () {
            let $panel = $('#dark_ct_panel');
            if ($panel.length) {
                $panel.toggle();
                if ($panel.is(':visible')) _syncPanelState();
                return;
            }
            openSettings();
        });
    }

    function openSettings() {
        let $panel = $('#dark_ct_panel');
        if ($panel.length) {
            $panel.show();
            _syncPanelState();
            return;
        }

        let savedPos = _loadPanelPos();
        let left, top;
        if (savedPos) {
            left = savedPos.left;
            top = savedPos.top;
        } else {
            left = Math.max(0, Math.round((window.innerWidth - 320) / 2));
            top = Math.max(0, Math.round((window.innerHeight - 400) / 2));
        }

        let panel = $('<div id="dark_ct_panel" class="dark_ct_settings">').css({ left: left + 'px', top: top + 'px' });

        let rows = [
            { key: 'hideGPT', label: 'Ocultar GPT Time/Rank', desc: 'Remove gpt-time e gpt-rank da lista de comandos' },
            { key: 'actBoxes', label: 'Caixas de com\u00e9rcio e ataque', desc: 'Mantenha desativado se usar DIO Tools' },
            { key: 'cmdArrival', label: 'Chegada de Comandos', desc: 'Mostra hor\u00e1rio de chegada na lista de comandos' },
            { key: 'saveTroops', label: 'Salvar Tropas', desc: 'Mantenha desativado se usar GPT-Bot-BR' },
            { key: 'autoLoad', label: 'AutoLoad', desc: 'Bot\u00e3o Auto para preencher tropas dispon\u00edveis' },
            { key: 'loginDiario', label: 'Login Di\u00e1rio', desc: 'Contagem regressiva para reset do servidor no \u00edcone' },
            { key: 'happening', label: 'Happening', desc: 'Contagem regressiva 10h/22h no \u00edcone da copa' }
        ];

        let html = `<div class="dark_ct_header"><span>Dark Commands v${VERSION}</span><span class="dark_ct_close">\u2716</span></div><div class="dark_ct_body">
${rows.map(function (r) {
    var on = OPTIONS[r.key] ? ' on' : '';
    var st = OPTIONS[r.key] ? 'Ativado' : 'Desativado';
    var sc = OPTIONS[r.key] ? '#4a7a3a' : '#8a7a62';
    return '<div class="dark_ct_row" data-key="' + r.key + '"><div><div class="dark_ct_label">' + r.label + '</div><div class="dark_ct_desc">' + r.desc + '</div></div><div style="display:flex;align-items:center;gap:6px;"><span class="dark_ct_status" style="font-size:10px;font-weight:bold;color:' + sc + '">' + st + '</span><div class="dark_ct_toggle' + on + '"><div class="dark_ct_knob"></div></div></div></div>';
}).join('')}
</div>`;

        panel.html(html).appendTo('body');
        _updateSaveTroopsRow();
        _updateActBoxesRow();

        panel.on('click', '.dark_ct_close', function () { panel.hide(); });
        panel.on('click', '.dark_ct_toggle', function () {
            let key = $(this).closest('.dark_ct_row').data('key');
            OPTIONS[key] = !OPTIONS[key];
            $(this).toggleClass('on');
            let $status = $(this).closest('.dark_ct_row').find('.dark_ct_status');
            $status.text(OPTIONS[key] ? 'Ativado' : 'Desativado').css('color', OPTIONS[key] ? '#4a7a3a' : '#8a7a62');
            saveOpts();
            applyFeature(key);
        });

        $(document).on('keydown.dark_ct_panel', function (e) {
            if (e.key === 'Escape' && $('#dark_ct_panel').is(':visible')) {
                $('#dark_ct_panel').hide();
            }
        });

        let dragData = null;
        panel.on('mousedown', '.dark_ct_header', function (e) {
            dragData = { startX: e.clientX, startY: e.clientY, origLeft: left, origTop: top };
            e.preventDefault();
        });
        $(document).on('mousemove.dark_ct_drag', function (e) {
            if (!dragData) return;
            left = Math.max(0, dragData.origLeft + (e.clientX - dragData.startX));
            top = Math.max(0, dragData.origTop + (e.clientY - dragData.startY));
            panel.css({ left: left + 'px', top: top + 'px' });
        });
        $(document).on('mouseup.dark_ct_drag', function () {
            if (dragData) _savePanelPos(left, top);
            dragData = null;
        });
    }

    function _gptBotDetected() {
        return !!(
            typeof CryptoJS !== 'undefined' ||
            document.querySelector('script[src*="GPT-Bot-BR"]') ||
            document.querySelector('#salvar_tropas, .gpt-time, .gpt-rank')
        );
    }

    function _hasDioTools() {
        return !!document.querySelector('script[src*="DIO-TOOLS-David1327"]');
    }

    function _updateConflictRow(dataKey, detectFn, disabledMsg, normalMsg) {
        let disabled = detectFn();
        let $row = $('.dark_ct_row[data-key="' + dataKey + '"]');
        if (!$row.length) return;
        let $toggle = $row.find('.dark_ct_toggle');
        let $desc = $row.find('.dark_ct_desc');
        if (disabled) {
            $row.addClass('dark_ct_disabled');
            $toggle.removeClass('on').css({ opacity: 0.4, pointerEvents: 'none' });
            $desc.text(disabledMsg);
        } else {
            $row.removeClass('dark_ct_disabled');
            $toggle.css({ opacity: '', pointerEvents: '' });
            $desc.text(normalMsg);
        }
    }

    let _updateSaveTroopsRow = function () { _updateConflictRow('saveTroops', _gptBotDetected, 'Desativado \u2014 GPT-Bot detectado', 'Mantenha desativado se usar GPT-Bot-BR'); };
    let _updateActBoxesRow = function () { _updateConflictRow('actBoxes', _hasDioTools, 'Desativado \u2014 DIO Tools detectado', 'Mantenha desativado se usar DIO Tools'); };

    function _trackConflict(detectFn, optionKey, updateRowFn) {
        let tracked = false;
        return function () {
            if (tracked) return;
            tracked = true;
            function check() {
                if (detectFn()) {
                    if (OPTIONS[optionKey]) {
                        OPTIONS[optionKey] = false;
                        saveOpts();
                        applyFeature(optionKey);
                    }
                    updateRowFn();
                    return true;
                }
                return false;
            }
            if (check()) return;
            let observer = new MutationObserver(function () { if (check()) observer.disconnect(); });
            observer.observe(document.body, { childList: true, subtree: true });
        };
    }

    let _trackGptBot = _trackConflict(_gptBotDetected, 'saveTroops', _updateSaveTroopsRow);
    let _trackDioTools = _trackConflict(_hasDioTools, 'actBoxes', _updateActBoxesRow);

    function _syncPanelState() {
        $('.dark_ct_row').each(function () {
            let key = $(this).data('key');
            if (key === undefined) return;
            let on = OPTIONS[key];
            $(this).find('.dark_ct_toggle').toggleClass('on', !!on);
            $(this).find('.dark_ct_status').text(on ? 'Ativado' : 'Desativado').css('color', on ? '#4a7a3a' : '#8a7a62');
        });
        _updateSaveTroopsRow();
        _updateActBoxesRow();
    }

    function _allInputsEmpty(wndID) {
        let empty = true;
        $(wndID + ' input.unit_input').each(function () { if ($(this).val()) empty = false; });
        return empty;
    }

    function _getUnitsContainer(wndID) {
        let $nu = $(wndID + ' .naval_units');
        if (!$nu.length) $nu = $(wndID + ' .ground_units');
        return $nu;
    }

    const FEATURES = {
        hideGPT: {
            on: function () { if (!$('#dark_ct_hide_gpt').length) $('<style id="dark_ct_hide_gpt">#toolbar_activity_commands_list .gpt-time, #toolbar_activity_commands_list .gpt-rank { display:none !important; }</style>').appendTo('head'); },
            off: function () { $('#dark_ct_hide_gpt').remove(); }
        },
        cmdArrival: { on: function () { CommandArrival.activate(); }, off: function () { CommandArrival.deactivate(); } },
        saveTroops: { on: function () { if (!_gptBotDetected()) SaveTroops.activate(); }, off: function () { SaveTroops.deactivate(); } },
        autoLoad: { on: function () { AutoLoad.activate(); }, off: function () { AutoLoad.deactivate(); } },
        loginDiario: { on: function () { DailyCountdown.activate(); }, off: function () { DailyCountdown.deactivate(); } },
        happening: { on: function () { HappeningCountdown.activate(); }, off: function () { HappeningCountdown.deactivate(); } },
        actBoxes: { on: function () { if (!_hasDioTools()) ActivityBoxes.activate(); }, off: function () { ActivityBoxes.deactivate(); } }
    };

    function applyFeature(key) {
        let f = FEATURES[key];
        if (f) f[OPTIONS[key] ? 'on' : 'off']();
    }

    function applyAll() {
        for (let k in OPTIONS) applyFeature(k);
    }

    // ---- Server time ----
    function _syncServerOffset() {
        let stEl = $('.server_time_area').get(0);
        if (!stEl) return null;
        let parts = stEl.innerHTML.split(' ')[0].split(':');
        if (parts.length < 3) return null;
        let serverSec = parseInt(parts[0], RADIX)*SEC_PER_HOUR + parseInt(parts[1], RADIX)*SEC_PER_MIN + parseInt(parts[2], RADIX);
        let localSec = Math.floor(Date.now() / MS_PER_SEC) % SEC_PER_DAY;
        let offset = serverSec - localSec;
        if (offset < -HALF_DAY_SEC) offset += SEC_PER_DAY;
        if (offset > HALF_DAY_SEC) offset -= SEC_PER_DAY;
        return offset;
    }

    // ---- Login Diário ----
    function _createCountdown(config) {
        return {
            _timer: null, _warnTimer: null, _tickCount: 0, _warnPlayed: false, _offset: null, _resyncTick: 0, _visHandler: null,
            activate: function () {
                let self = this;
                if (this._timer) return;
                let tick = function () {
                    self._resyncTick = (self._resyncTick + 1) % RESYNC_INTERVAL;
                    if (self._resyncTick === 0 || self._offset === null) { let o = _syncServerOffset(); if (o !== null) self._offset = o; }
                    if (self._offset === null) return;
                    let $icon = config.$selector();
                    if (!$icon.length || (config.hiddenCheck && $icon.css('display') === 'none')) return;
                    let localSec = Math.floor(Date.now() / MS_PER_SEC) % SEC_PER_DAY;
                    let sec = ((localSec + self._offset) % SEC_PER_DAY + SEC_PER_DAY) % SEC_PER_DAY;
                    let remaining = config.calcRemaining(sec);
                    if (remaining <= 0 || remaining > SEC_PER_HOUR) { $icon.find('.dark_hap_count').remove(); self._warnPlayed = false; return; }
                    let h = Math.floor(remaining / SEC_PER_HOUR);
                    let m = Math.floor((remaining % SEC_PER_HOUR) / SEC_PER_MIN);
                    let s = remaining % SEC_PER_MIN;
                    if (h < 10) h = '0' + h;
                    if (m < 10) m = '0' + m;
                    if (s < 10) s = '0' + s;
                    let text = h + ':' + m + ':' + s;
                    let visualWarn = remaining <= VISUAL_WARN_SEC;
                    let soundWarn = remaining <= SOUND_WARN_SEC;
                    if (soundWarn && !self._warnPlayed) {
                        self._warnPlayed = true;
                        self._tickCount = 0;
                        self._warnTimer = setInterval(function () {
                            _playTick($icon, self._tickCount % 2 === 0);
                            self._tickCount++;
                            if (self._tickCount >= 6) { clearInterval(self._warnTimer); self._warnTimer = null; }
                        }, 1000);
                    } else if (!soundWarn) { self._warnPlayed = false; if (self._warnTimer) { clearInterval(self._warnTimer); self._warnTimer = null; } }
                    let $cnt = $icon.find('.dark_hap_count');
                    if (!$cnt.length) $cnt = $('<span class="dark_hap_count" style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:bold;white-space:nowrap;pointer-events:none;"></span>').appendTo($icon);
                    $cnt.text(text).toggleClass('dark_hap_warning', visualWarn);
                };
                self._timer = setInterval(tick, 1000);
                self._visHandler = function () {
                    if (!document.hidden) { self._resyncTick = 0; self._offset = null; tick(); }
                };
                document.addEventListener('visibilitychange', self._visHandler);
            },
            deactivate: function () {
                if (this._timer) { clearInterval(this._timer); this._timer = null; }
                if (this._visHandler) { document.removeEventListener('visibilitychange', this._visHandler); this._visHandler = null; }
                if (this._warnTimer) { clearInterval(this._warnTimer); this._warnTimer = null; }
                $('.dark_hap_count').remove();
            }
        };
    }

    let DailyCountdown = _createCountdown({
        $selector: function () { return $('#daily_login_icon'); },
        hiddenCheck: true,
        calcRemaining: function (sec) { return SEC_PER_DAY - sec; }
    });

    let HappeningCountdown = _createCountdown({
        $selector: function () { return $('#happening_large_icon.grepolympia.grepolympia_worldcup'); },
        hiddenCheck: false,
        calcRemaining: function (sec) {
            let targets = HAPPENING_TIMES;
            let next = Infinity;
            for (let i = 0; i < targets.length; i++) { let t = targets[i]; let cand = sec < t ? t : t + SEC_PER_DAY; if (cand < next) next = cand; }
            return next - sec;
        }
    });

    // ---- Chegada de Comandos ----
    let CommandArrival = {
        _observer: null, _active: false,
        activate: function () {
            if (CommandArrival._active) return;
            CommandArrival._active = true;
            $(document).on('ajaxComplete.dark_ct_arrival', function (e, xhr, opt) {
                try {
                    let parsed = new URL(opt.url, window.location.origin);
                    if (parsed.pathname.indexOf('town_info') === -1) return;
                    if (parsed.searchParams.get('action') !== 'send_units') return;
                    let response = JSON.parse(xhr.responseText);
                    let notifications = response.json && response.json.notifications;
                    if (!notifications) return;
                    let movements = notifications.filter(function (item) { return item.subject === 'MovementsUnits'; });
                    if (movements.length) CommandArrival._appendTimestamp(movements[0].param_id);
                } catch (e) { console.warn('[DarkCmds] CommandArrival:', e.message); }
            });
            CommandArrival._process();
            CommandArrival._startObserver();
        },
        deactivate: function () {
            CommandArrival._active = false;
            $(document).off('ajaxComplete.dark_ct_arrival');
            if (CommandArrival._observer) { CommandArrival._observer.disconnect(); CommandArrival._observer = null; }
            $('.dark_arrival').remove();
        },
        _appendTimestamp: function (commandId) {
            let list = document.querySelectorAll('#toolbar_activity_commands_list > div > div.content > div');
            for (let i = list.length - 1; i >= 0; i--) {
                let id = list[i].getAttribute('id');
                if (id) {
                    let parts = id.split('_');
                    if (parts.length > 1 && parts[1] === commandId.toString()) {
                        CommandArrival._insert(list[i]);
                        break;
                    }
                }
            }
        },
        _process: function () {
            let list = document.querySelectorAll('#toolbar_activity_commands_list > div > div.content > div');
            for (let i = 0; i < list.length; i++) {
                let ts = list[i].getAttribute('data-timestamp');
                if (ts && !list[i].querySelector('.dark_arrival')) CommandArrival._insert(list[i]);
            }
        },
        _startObserver: function () {
            let target = document.querySelector('#toolbar_activity_commands_list > div > div.content');
            if (!target) { setTimeout(CommandArrival._startObserver, 1000); return; }
            CommandArrival._observer = new MutationObserver(function () { CommandArrival._process(); });
            CommandArrival._observer.observe(target, { childList: true, subtree: true });
        },
        _insert: function (item) {
            try {
                let wrapper = item.querySelector('div > .details_wrapper');
                if (!wrapper || wrapper.querySelector('.dark_arrival')) return;
                let timeDiv = wrapper.querySelector('.time');
                let node = document.createElement('span');
                node.className = 'dark_arrival';
                node.textContent = CommandArrival._toTime(item.getAttribute('data-timestamp'));
                if (timeDiv && timeDiv.nextSibling) wrapper.insertBefore(node, timeDiv.nextSibling);
                else wrapper.appendChild(node);
            } catch (e) { console.warn('[DarkCmds] _appendTimestamp:', e.message); }
        },
        _toTime: function (ts) {
            let tzOffset = new Date().getTimezoneOffset() * 60000;
            return new Date(parseInt(ts, RADIX) * MS_PER_SEC - tzOffset).toISOString().slice(11, 19);
        }
    };

    // ---- Salvar Tropas ----
    let SaveTroops = {
        _savedUnits: {}, _timers: {}, _restoring: false, _active: false,
        activate: function () { SaveTroops._active = true; },
        deactivate: function () {
            SaveTroops._active = false;
            $('.dark_dur_save_wrap').remove();
            for (let k in SaveTroops._timers) { clearInterval(SaveTroops._timers[k]); }
            SaveTroops._timers = {}; SaveTroops._savedUnits = {};
        },
        add: function (wndID) {
            if (!SaveTroops._active || !OPTIONS.saveTroops) return;
            try {
                if ($(wndID).length !== 1) {
                    document.querySelectorAll('.attack_support_window').forEach(function (el) {
                        if (el.querySelector('.dark_dur_save_wrap')) return;
                        let pid = el.parentElement.id;
                        SaveTroops.add('#' + pid);
                    });
                    return;
                }
                let $nu = _getUnitsContainer(wndID);
                if (!$nu.length || $nu.find('.dark_dur_save_wrap').length) return;
                SaveTroops._savedUnits = {};
                $nu.append('<div class="dark_dur_save_wrap active"><button type="button" class="dark_dur_save_btn active"><span class="dark_track"></span></button><div class="dark_dur_save_text"><span class="dark_dur_save_label">Salvar Tropas</span><span class="dark_dur_save_status" style="color:green">Ativado</span></div></div>');
                let $btn = $nu.find('.dark_dur_save_btn');
                let $status = $nu.find('.dark_dur_save_status');
                $btn.on('click', function () {
                    $(this).toggleClass('active');
                    if (!$(this).hasClass('active')) {
                        SaveTroops._savedUnits = {};
                        $status.text('Desativado').css('color', 'red');
                    } else {
                        SaveTroops._saveUnits(wndID);
                        $status.text('Ativado').css('color', 'green');
                    }
                });
                SaveTroops._initSaveUI(wndID, $btn);
            } catch (e) { console.error('[DarkCmds] SaveTroops error:', e); }
        },
        _initSaveUI: function (wndID, $btn) {
            let key = wndID.replace(/[^a-z0-9]/g, '_');
            clearInterval(SaveTroops._timers[key]);
            SaveTroops._timers[key] = setInterval(function () {
                if (!$(wndID + ' input.unit_input').length) return;
                clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key];
                SaveTroops._restoreUnits(wndID);
                $(wndID + ' input.unit_input').on('keyup change input', function () {
                    if ($btn.hasClass('active')) SaveTroops._saveUnits(wndID);
                    if (!Object.keys(SaveTroops._savedUnits).length) return;
                    if (_allInputsEmpty(wndID)) SaveTroops._restoreUnits(wndID);
                });
                $(wndID + ' .button[onclick*="sendUnits"]').on('click', function () {
                    SaveTroops._saveUnits(wndID);
                    SaveTroops._onSendRestore(wndID);
                });
            }, 100);
        },
        _saveUnits: function (wndID) {
            let btn = document.querySelector(wndID + ' .dark_dur_save_btn');
            if (btn && btn.classList.contains('active')) {
                $(wndID + ' input.unit_input').each(function () {
                    let val = $(this).val();
                    if (val && parseInt(val, RADIX) > 0) SaveTroops._savedUnits[this.name] = val;
                });
            }
        },
        _onSendRestore: function (wndID) {
            let tries = 0;
            let check = setInterval(function () {
                if (++tries > 15) { clearInterval(check); return; }
                if (!$(wndID + ' input.unit_input').length) return;
                if (!Object.keys(SaveTroops._savedUnits).length) { clearInterval(check); return; }
                if (_allInputsEmpty(wndID)) {
                    clearInterval(check);
                    SaveTroops._restoreUnits(wndID);
                }
            }, 200);
        },
        _restoreUnits: function (wndID) {
            if (SaveTroops._restoring) return;
            SaveTroops._restoring = true;
            try {
                for (let unit in SaveTroops._savedUnits) {
                    let val = SaveTroops._savedUnits[unit];
                    if (val) { let $input = $(wndID + ' input[name="' + unit + '"]'); if ($input.length) $input.val(val); }
                }
                let firstKey = Object.keys(SaveTroops._savedUnits).find(function (k) { return SaveTroops._savedUnits[k]; });
                if (firstKey) { let $first = $(wndID + ' input[name="' + firstKey + '"]'); if ($first.length) $first.trigger('keyup'); }
            } catch (e) { console.warn('[DarkCmds] _restoreUnits:', e.message); } finally { SaveTroops._restoring = false; }
        }
    };

    // ---- AutoLoad ----
    let AutoLoad = {
        _pollers: {}, _active: false,
        activate: function () { AutoLoad._active = true; },
        deactivate: function () {
            AutoLoad._active = false;
            $('.dark_autoload_wrap').remove();
            for (let k in AutoLoad._pollers) { clearInterval(AutoLoad._pollers[k]); }
            AutoLoad._pollers = {};
        },
        add: function (wndID) {
            if (!AutoLoad._active) return;
            let key = wndID.replace(/[^a-z0-9]/g, '_');
            if (AutoLoad._pollers[key]) return;
            AutoLoad._pollers[key] = setInterval(function () {
                if (!$(wndID).get(0)) { clearInterval(AutoLoad._pollers[key]); delete AutoLoad._pollers[key]; return; }
                let $nu = _getUnitsContainer(wndID);
                if (!$nu.length) return;
                clearInterval(AutoLoad._pollers[key]); delete AutoLoad._pollers[key];
                if ($nu.find('.dark_autoload_wrap').length) return;
                $nu.append('<div class="dark_autoload_wrap"><button type="button" class="dark_autoload_btn" data-wnd="' + wndID + '">Auto</button></div>');
                $nu.find('.dark_autoload_btn').on('click', function () { AutoLoad._fill($(this).data('wnd')); });
            }, 200);
        },
        _fill: function (wndID) {
            try {
                let $inputs = $(wndID + ' input.unit_input'); if (!$inputs.length) return;
                let townId = uw.Game.townId; if (!townId) return;
                let iTown = uw.ITowns.getTown(parseInt(townId, RADIX));
                if (!iTown || typeof iTown.units !== 'function') return;
                let rawUnits = iTown.units();
                function uCount(uid) { let c = rawUnits[uid]; if (c != null) return parseInt(c, RADIX) || 0; if (rawUnits.get) return parseInt(rawUnits.get(uid), RADIX) || 0; return 0; }
                let gd = uw.GameData.units; if (!gd) return;

                let landUnits = [], totalPop = 0;

                function fillInput(uid, count) { $(wndID + ' input[name="' + uid + '"]').val(count); }

                $(wndID + ' input.unit_input').each(function () {
                    let uid = this.name;
                    if (uid === 'big_transporter' || uid === 'small_transporter' || uid === 'colony_ship' || uid === 'none') return;
                    if ($(this).closest('.naval_units').length) return;
                    let cnt = uCount(uid);
                    if (cnt <= 0) return;
                    let ud = gd[uid];
                    if (ud && ud.flying) {
                        fillInput(uid, cnt);
                    } else {
                        let pop = ud ? (ud.population || ud.pop || 1) : 1;
                        landUnits.push({ id: uid, pop: pop, count: cnt });
                        totalPop += cnt * pop;
                    }
                });

                if (landUnits.length > 0 && totalPop > 0) {
                    let st = gd.small_transporter, bt = gd.big_transporter;
                    let smallCap = (st && st.capacity) ? st.capacity : 0, bigCap = (bt && bt.capacity) ? bt.capacity : 0;
                    let berth = 0;
                    try { if (iTown.getResearches().get('berth') > 0 && uw.GameData.research_bonus && uw.GameData.research_bonus.berth) berth = uw.GameData.research_bonus.berth; } catch (ef) { console.warn('[DarkCmds] berth check:', ef.message); }
                    let smallCapT = smallCap + berth, bigCapT = bigCap + berth;
                    let stAvail = uCount('small_transporter'), btAvail = uCount('big_transporter');
                    let totalCapAll = btAvail * bigCapT + stAvail * smallCapT;
                    if (totalCapAll >= totalPop) {
                        let needBig = 0, needSmall = 0, left = totalPop;
                        if (stAvail > 0 && smallCapT > 0) { needSmall = Math.min(stAvail, Math.ceil(left / smallCapT)); left -= needSmall * smallCapT; if (left < 0) left = 0; }
                        if (left > 0 && btAvail > 0 && bigCapT > 0) { needBig = Math.min(btAvail, Math.ceil(left / bigCapT)); left -= needBig * bigCapT; if (left < 0) left = 0; }
                        landUnits.forEach(function (lu) { fillInput(lu.id, lu.count); });
                        if (needSmall > 0) fillInput('small_transporter', needSmall);
                        if (needBig > 0) fillInput('big_transporter', needBig);
                    } else {
                        landUnits.sort(function (a, b) { return a.pop - b.pop; });
                        let room = totalCapAll;
                        landUnits.forEach(function (lu) { let maxFit = Math.floor(room / lu.pop); let toFill = Math.min(maxFit, lu.count); if (toFill > 0) { fillInput(lu.id, toFill); room -= toFill * lu.pop; } });
                        if (stAvail > 0) fillInput('small_transporter', stAvail);
                        if (btAvail > 0) fillInput('big_transporter', btAvail);
                    }
                }

                $(wndID + ' .naval_units input.unit_input').each(function () {
                    let uid = this.name;
                    if (uid === 'big_transporter' || uid === 'small_transporter' || uid === 'none') return;
                    let maxCount = (uid === 'colony_ship') ? 1 : uCount(uid);
                    if (maxCount > 0) $(this).val(maxCount);
                });

                $(wndID + ' input.unit_input').each(function () {
                    $(this).trigger('keyup').trigger('change');
                    try { this.dispatchEvent(new Event('input', { bubbles: true })); } catch (ef) {}
                });
            } catch (e) { console.error('[DarkCmds] AutoLoad error:', e); }
        }
    };

    // ---- ActivityBoxes (Caixas de comércio e ataque) ----
    let ActivityBoxes = {
        _observer: null, _obsTimer: null, _menuTimer: null,
        activate: function () {
            try {
                let self = this;
                $('<style id="dark_ab_style" type="text/css">' +
                    '.dark_ab_disp {display: block !important; z-index: 5000 !important;}' +
                    '.dark_ab_commands { height: 0px; overflow: visible!important; }' +
                    '.dark_ab_menu {margin:6px 22px 2px 5px;height:11px;display:block;position:relative;}' +
                    '.dark_ab_handle {cursor:-webkit-grab; width:100%;height:11px;position:absolute;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAALCAYAAABLcGxfAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAUUlEQVQoz82PIQ7AMAwDHam/mg2H99biwWi/mpaSgXYgUtiOnWRwNpIXXtx9k5R6A/BgJfUG4P4MUreIQAUjeU6Nu6TUf/qhT42HpNTLSeXTA8/hO9nqHM5nAAAAAElFTkSuQmCC)}' +
                    '.dark_ab_back {right:-18px;margin-top:-1px;width:16px;height:12px;position:absolute;background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAYAAABr5z2BAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAhUlEQVQoz6WQwQ2EQAwDvStK4EEB18W6CwqgNgrgQQ++Lq4AyuADaLUkEej8ixTbkwCGSC54qK6Ze5KrEfj1AnLdapkBQFLxApLXWmmTNHpUKcKLgk5fPvA2y9DMg1WWvGc1d39IzjXJRVD7A5qfpCJpAjCYBGdi9HGLNj9ZjnQjeKu/CXZRWzfKHsl5pwAAAABJRU5ErkJggg==)}' +
                    '#toolbar_activity_commands_list .dark_ab_menu {visibility: hidden; display: none;}' +
                    '.dropdown-list .item_no_results, .dropdown-list.ui-draggable>div {cursor:text!important;}' +
                    '#toolbar_activity_commands_list .unit_movements .details_wrapper, #toolbar_activity_commands_list .unit_movements .icon { visibility: visible }' +
                    '#toolbar_activity_commands_list .cancel { display: none !important; }' +
                    '#toolbar_activity_commands_list .js-dropdown-list:hover>.dark_ab_menu { display: block !important; visibility: visible; }' +
                    '</style>').appendTo('head');

                self._setupObserver();
                self._setupMenu();

                $('#toolbar_activity_commands').on('dblclick.dc_ab', function () { self._destroy(); });
            } catch (e) { console.error('[DarkCmds] ActivityBoxes error:', e); }
        },
        _setupObserver: function () {
            try {
                let self = this;
                if (self._observer) return;
                let tbCmd = document.querySelector('#toolbar_activity_commands_list');
                if (!tbCmd) {
                    if (this._obsTimer) clearTimeout(this._obsTimer);
                    this._obsTimer = setTimeout(function () { self._setupObserver(); }, 1000);
                    return;
                }
                self._observer = new MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (tbCmd.style.display !== "none" || !tbCmd.classList.contains('dark_ab_commands')) return;
                        $('#toolbar_activity_commands').trigger('mouseenter');
                    });
                });
                self._observer.observe(tbCmd, { attributes: true, childList: true, subtree: true });
                try { $.Observer(uw.GameEvents.command.send_unit).subscribe('DC_AB_TOOLBAR', function () {
                    if (!tbCmd.classList.contains('dark_ab_commands')) return;
                    $('#toolbar_activity_commands').trigger('mouseenter');
                }); } catch (e) {}
            } catch (e) { console.error('[DarkCmds] _setupObserver error:', e); }
        },
        _setupMenu: function () {
            try {
                let self = this;
                let $cmdBox = $('#toolbar_activity_commands_list .sandy-box');
                if (!$cmdBox.length) {
                    if (this._menuTimer) clearTimeout(this._menuTimer);
                    this._menuTimer = setTimeout(function () { self._setupMenu(); }, 1000);
                    return;
                }
                if ($('#dark_ab_cmd_menu').length == 0) {
                    $cmdBox.append('<div id="dark_ab_cmd_menu" class="dark_ab_menu"><div id="dark_ab_cmd_handle" class="dark_ab_handle"></div><a class="dark_ab_back"></a></div>');
                    $('#dark_ab_cmd_menu .dark_ab_back').on('click', function () { self._destroy(); });
                }
                $cmdBox.draggable({
                    cursor: "move",
                    handle: ".dark_ab_handle",
                    start: function () {
                        $("#dark_ab_cmd_style").remove();
                        $('#toolbar_activity_commands_list').addClass("dark_ab_disp").addClass("dark_ab_commands");
                        let pos = $cmdBox.position();
                        if (pos.left === 0 && pos.top === 0) $cmdBox[0].style.setProperty('top', '40px', 'important');
                        $(".dark_ab_handle").css({ cursor: "grabbing" });
                    },
                    stop: function () {
                        $(".dark_ab_handle").css({ cursor: "grab" });
                        let pos = $cmdBox.position();
                        $('<style id="dark_ab_cmd_style" type="text/css">#toolbar_activity_commands_list .sandy-box {left: ' + pos.left + 'px !important; top: ' + pos.top + 'px !important;}</style>').appendTo('head');
                    }
                });
            } catch (e) { console.error('[DarkCmds] _setupMenu error:', e); }
        },
        deactivate: function () {
            $('#dark_ab_style, #dark_ab_cmd_style').remove();
            $('#dark_ab_cmd_menu').remove();
            if (this._observer) { this._observer.disconnect(); this._observer = null; }
            if (this._obsTimer) { clearTimeout(this._obsTimer); this._obsTimer = null; }
            if (this._menuTimer) { clearTimeout(this._menuTimer); this._menuTimer = null; }
            try { $.Observer(uw.GameEvents.command.send_unit).unsubscribe('DC_AB_TOOLBAR'); } catch (e) {}
            $('#toolbar_activity_commands_list .sandy-box').draggable('destroy');
            $('#toolbar_activity_commands').off('dblclick.dc_ab');
        },
        _destroy: function () {
            $("#dark_ab_cmd_menu").parent().parent().removeClass("dark_ab_disp");
            $('#toolbar_activity_commands_list').removeClass("dark_ab_commands");
            let el = document.getElementById("toolbar_activity_commands_list");
            if (el) el.style.display = "none";
            $('<style id="dark_ab_cmd_style" type="text/css">#toolbar_activity_commands_list .sandy-box {left:initial !important; top:initial !important; }</style>').appendTo('head');
            $('#toolbar_activity_commands_list .cancel').click();
            $("#dark_ab_cmd_style").remove();
        }
    };

    // ---- AJAX-based window detection ----
    function ajaxObserver() {
        $(document).ajaxComplete(function (e, xhr, opt) {
            try {
                let parsed = new URL(opt.url, window.location.origin);
                let path = parsed.pathname.replace('/game/', '');
                let actionType = parsed.searchParams.get('action') || '';
                if (path !== 'town_info') return;
                if (actionType === 'attack' || actionType === 'support') {
                    TownTabHandler();
                }
            } catch (e) { console.warn('[DarkCmds] ajaxObserver:', e.message); }
        });
    }

    function TownTabHandler() {
        try {
            let wndArray = uw.GPWindowMgr.getByType(uw.GPWindowMgr.TYPE_TOWN);
            for (let e of wndArray) {
                    let wndID = '#gpwnd_' + e.getID() + ' ';
                    if (!$(wndID).get(0)) wndID = '#gpwnd_' + (e.getID() + 1) + ' ';
                    if (OPTIONS.saveTroops) SaveTroops.add(wndID);
                    if (OPTIONS.autoLoad) AutoLoad.add(wndID);
                }
        } catch (e) { console.error('[DarkCmds] TownTabHandler error:', e); }
    }

    // ---- Init ----
    function init() {
        if (typeof jQuery === 'undefined' || !uw.Game || !uw.GPWindowMgr) {
            setTimeout(init, 500);
            return;
        }
        addStyles();
        addBarButton();
        ajaxObserver();
        _trackGptBot();
        _trackDioTools();
        applyAll();
    }

    init();
})();
