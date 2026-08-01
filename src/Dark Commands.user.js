// ==UserScript==
// @name         Dark Commands
// @namespace    https://github.com/
// @version      1.4.8
// @author       Dark Rebel
// @description  GPT Time/Rank hide, Chegada de Comandos, Salvar Tropas, AutoLoad, Login Diário
// @match        https://*.grepolis.com/game/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @updateURL    https://github.com/darkytcho/darkcommands/releases/latest/download/DarkCommands.obs.user.js
// @downloadURL  https://github.com/darkytcho/darkcommands/releases/latest/download/DarkCommands.obs.user.js
// ==/UserScript==

(function () {
    'use strict';

    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // ========================
    // Constantes
    // ========================
    const MS_PER_SEC = 1000;
    const SEC_PER_MIN = 60;
    const SEC_PER_HOUR = 3600;
    const SEC_PER_DAY = 86400;
    const HALF_DAY_SEC = 43200;
    const RADIX = 10;
    const RESYNC_INTERVAL = 300;
    const VISUAL_WARN_SEC = 900;
    const SOUND_WARN_SEC = 120;
    const VERSION = '1.4.9';

    // ========================
    // Audio (alertas sonoros)
    // ========================
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

    // ========================
    // Configurações (preferências salvas)
    // ========================
    function _storageGet(key, def) {
        try { if (typeof GM_getValue === 'function') return GM_getValue(key, def); } catch (e) {}
        try { let v = localStorage.getItem('dark_cmds_' + key); return v === null ? def : v; } catch (e) {}
        return def;
    }

    function _storageSet(key, val) {
        try { if (typeof GM_setValue === 'function') { GM_setValue(key, val); return; } } catch (e) {}
        try { localStorage.setItem('dark_cmds_' + key, val); } catch (e) {}
    }

    function _loadOpts() {
        try { return JSON.parse(_storageGet('dark_ct_opts', '{}')); } catch (e) { return {}; }
    }

    let OPTIONS = (function () {
        let s = _loadOpts();
        return {
            hideGPT: s.hideGPT !== undefined ? s.hideGPT : true,
            actBoxes: s.actBoxes !== undefined ? s.actBoxes : false,
            cmdArrival: s.cmdArrival !== undefined ? s.cmdArrival : true,
            saveTroops: s.saveTroops !== undefined ? s.saveTroops : true,
            autoLoad: s.autoLoad !== undefined ? s.autoLoad : false,
            loginDiario: s.loginDiario !== undefined ? s.loginDiario : true
        };
    })();

    function saveOpts() {
        try { _storageSet('dark_ct_opts', JSON.stringify(OPTIONS)); } catch (e) { console.warn('[DarkCmds] saveOpts:', e.message); }
    }

    function _migrateOpts() {
        try {
            let prev = _storageGet('dark_ct_version', '');
            if (prev === VERSION) return;
            if (OPTIONS.saveTroops === false && !_gptBotDetected()) {
                OPTIONS.saveTroops = true;
                saveOpts();
            }
            _storageSet('dark_ct_version', VERSION);
        } catch (e) { console.warn('[DarkCmds] migrate:', e.message); }
    }

    // ========================
    // CSS
    // ========================
    function addStyles() {
        $('<style id="dark_ct_styles">' +
            '@keyframes dark_hap_pulse { 0% { color:#ff2222; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } 25% { color:#ff0000; opacity:1; text-shadow:0 0 12px #ffffff,0 0 20px #ffffff; transform:translateX(-50%) scale(1.3); } 50% { color:#ff4444; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } 75% { color:#ff0000; opacity:1; text-shadow:0 0 12px #ffffff,0 0 20px #ffffff; transform:translateX(-50%) scale(1.3); } 100% { color:#ff2222; opacity:1; text-shadow:0 0 6px #ffffff; transform:translateX(-50%) scale(1); } } ' +
            '        .dark_hap_warning { animation:dark_hap_pulse 2s infinite; font-size:13px !important; } ' +

            '.dark_ct_modal { position:fixed; top:0; left:0; width:100%; height:100%; z-index:99999; display:flex; align-items:center; justify-content:center; } ' +
            '.dark_ct_overlay { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); } ' +
            '.dark_ct_box { position:relative; width:560px; max-width:94vw; max-height:88vh; background:#2a1a0e; border:2px solid #8b6914; border-radius:8px; padding:20px; box-sizing:border-box; overflow-y:auto; color:#fc6; font-family:Arial,sans-serif; font-size:13px; box-shadow:0 8px 24px rgba(0,0,0,0.6); } ' +
            '.dark_ct_head { position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; margin:-20px -20px 14px; padding:10px 14px; background:linear-gradient(180deg,#3a2a10,#241707); border-bottom:2px solid #8b6914; border-radius:6px 6px 0 0; } ' +
            '.dark_ct_title { flex:1; display:flex; align-items:center; gap:8px; font-size:14px; font-weight:bold; color:#fc6; text-shadow:0 1px 2px rgba(0,0,0,0.6); user-select:none; } ' +
            '.dark_ct_version { font-size:10px; color:#b8942f; font-weight:normal; } ' +
            '.dark_ct_headcenter { position:absolute; left:0; right:0; text-align:center; pointer-events:none; font-size:13px; font-weight:bold; color:#b8942f; letter-spacing:1px; text-transform:uppercase; white-space:nowrap; user-select:none; } ' +
            '.dark_ct_headright { flex:1; display:flex; justify-content:flex-end; } ' +
            '.dark_ct_tabs { display:flex; background:#1a1a1a; border:1px solid #8b6914; border-radius:6px; padding:2px; } ' +
            '.dark_ct_tab { padding:5px 16px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; transition:background 0.15s,color 0.15s; } ' +
            '.dark_ct_tab.on { background:#d4a017; color:#2a1a0e; } ' +
            '.dark_ct_tab.off { background:transparent; color:#997; } ' +
            '.dark_ct_section { font-size:13px; font-weight:bold; color:#d4a017; margin:12px 0 4px; padding-bottom:4px; border-bottom:1px solid rgba(139,105,20,0.4); } ' +
            '.dark_ct_section:first-child { margin-top:0; } ' +
            '.dark_ct_row { display:flex; align-items:flex-start; justify-content:space-between; margin:8px 0; padding:6px; border-radius:4px; cursor:pointer; } ' +
            '.dark_ct_row:hover { background:rgba(255,255,255,0.08); } ' +
            '.dark_ct_info { flex:1; margin-right:10px; text-align:left; } ' +
            '.dark_ct_label { font-size:12px; font-weight:bold; color:#fc6; margin-bottom:2px; display:flex; align-items:center; gap:6px; } ' +
            '.dark_ct_desc { font-size:10px; color:#aaa; line-height:1.3; } ' +
            '.dark_ct_badge { font-size:9px; font-weight:normal; color:#2ecc71; border:1px solid #2ecc71; border-radius:3px; padding:0 4px; line-height:1.4; } ' +
            '.dark_ct_badge_beta { color:#f39c12; border-color:#f39c12; } ' +
            '.dark_ct_cb { width:16px; height:16px; border:2px solid #8b6914; border-radius:3px; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; transition:background 0.15s,border-color 0.15s; } ' +
            '.dark_ct_cb.off { background:#1a1a1a; } ' +
            '.dark_ct_cb.on { background:#4CAF50; border-color:#4CAF50; } ' +
            '.dark_ct_check { color:white; font-size:11px; font-weight:bold; line-height:1; } ' +
            '.dark_ct_row.dark_ct_disabled { opacity:0.5; } ' +
            '.dark_ct_row.dark_ct_disabled .dark_ct_cb { border-color:#555; background:#2a2a2a; } ' +
            '.dark_ct_btnbar { display:flex; gap:10px; justify-content:center; margin-top:14px; } ' +
            '.dark_ct_btn { cursor:pointer; padding:6px 16px; border-radius:4px; font-size:12px; font-weight:bold; color:#fff; } ' +
            '.dark_ct_btn.dark_ct_closebtn { background:#8b6914; } ' +
            '.dark_ct_btn.dark_ct_closebtn:hover { background:#a67c1a; } ' +
            '.dark_ct_btn.dark_ct_danger { background:#c0392b; } ' +
            '.dark_ct_btn.dark_ct_danger:hover { background:#e74c3c; } ' +
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
            '.dark_arrival { margin-left:8px; font-size:14px; color:#13487e; font-weight:bold; white-space:nowrap; vertical-align:middle; } ' +
            '#toolbar_activity_commands_list { min-width:280px !important; } ' +
            '#toolbar_activity_commands_list .details_wrapper { overflow:visible !important; } ' +

            '</style>').appendTo('head');
    }

    function addBarButton() {
        if ($('#dark_ct_btn_bar').length) return;
        let bar = $('<div id="dark_ct_btn_bar" class="dark_ct_btn_bar"><button id="dark_ct_gear" title="Configurar Dark Commands">\u2699</button></div>');
        bar.appendTo('body');
        bar.on('click', '#dark_ct_gear', function () {
            if ($('#dark_ct_modal').length) { $('#dark_ct_modal').remove(); return; }
            openSettings();
        });
    }

    function _buildRow(key, label, desc, badge, badgeCls) {
        let on = OPTIONS[key];
        let $row = $('<div class="dark_ct_row" data-key="' + key + '"></div>');
        let $label = $('<div class="dark_ct_label">' + label + '</div>');
        if (badge) $label.append('<span class="dark_ct_badge' + (badgeCls ? ' ' + badgeCls : '') + '">' + badge + '</span>');
        let $info = $('<div class="dark_ct_info"></div>').append($label, '<div class="dark_ct_desc">' + desc + '</div>');
        let $cb = $('<div class="dark_ct_cb ' + (on ? 'on' : 'off') + '"><div class="dark_ct_check" style="display:' + (on ? '' : 'none') + '">\u2713</div></div>');
        $row.append($info, $cb);
        $row.on('click', function () {
            if (_sessionForced[key]) return;
            OPTIONS[key] = !OPTIONS[key];
            _setRowState($row, OPTIONS[key]);
            saveOpts();
            applyFeature(key);
        });
        return $row;
    }

    function _setRowState($row, on) {
        let $cb = $row.find('.dark_ct_cb');
        $cb.toggleClass('on', !!on).toggleClass('off', !on);
        $cb.find('.dark_ct_check').css('display', on ? '' : 'none');
    }

    function openSettings() {
        if ($('#dark_ct_modal').length) return;

        const modal = $('<div id="dark_ct_modal" class="dark_ct_modal"></div>');
        const overlay = $('<div class="dark_ct_overlay"></div>');
        const box = $('<div class="dark_ct_box"></div>');

        const head = $('<div class="dark_ct_head"></div>');
        const title = $('<div class="dark_ct_title">Dark Commands <span class="dark_ct_version">v' + VERSION + '</span></div>');
        const center = $('<div class="dark_ct_headcenter">Configura\u00e7\u00f5es</div>');
        head.append(title, center);

        const painel = $('<div class="dark_ct_pane"></div>');
        painel.append('<div class="dark_ct_section">Comandos</div>');
        painel.append(_buildRow('hideGPT', 'Ocultar GPT Time/Rank', 'Remove os hor\u00e1rios e ranks do GPT da lista de comandos.'));
        painel.append(_buildRow('cmdArrival', 'Chegada de Comandos', 'Exibe o hor\u00e1rio de chegada ao lado de cada comando na lista.'));
        painel.append(_buildRow('actBoxes', 'Caixas de com\u00e9rcio e ataque', 'Reativa as caixas de com\u00e9rcio e ataque da lista de comandos. Desative se usar DIO Tools.'));
        painel.append(_buildRow('saveTroops', 'Salvar Tropas', 'Salva a composi\u00e7\u00e3o de tropas (ataque ou apoio) e permite restaur\u00e1-la depois. Desative se usar GPT-Bot-BR.'));
        painel.append(_buildRow('autoLoad', 'AutoLoad', 'Adiciona o bot\u00e3o Auto na janela de comandos, que preenche as tropas dispon\u00edveis (terrestres, navais e m\u00edticas) e calcula os transportadores. Em janelas de ataque ignora unidades de defesa; em janelas de apoio ignora unidades de ataque.', 'Beta', 'dark_ct_badge_beta'));
        painel.append(_buildRow('loginDiario', 'Login Di\u00e1rio', 'Mostra no \u00edcone de login a contagem regressiva para o reset di\u00e1rio do servidor, com alerta sonoro e visual nos \u00faltimos minutos.'));

        const btnRestaurar = $('<div class="dark_ct_btn dark_ct_danger">Restaurar Padr\u00f5es</div>');
        const btnFechar = $('<div class="dark_ct_btn dark_ct_closebtn">Fechar</div>');
        const botoes = $('<div class="dark_ct_btnbar"></div>').append(btnRestaurar, btnFechar);

        box.append(head, painel, botoes);
        modal.append(overlay, box).appendTo('body');

        _syncPanelState();

        function fechar() { modal.remove(); }
        overlay.on('click', fechar);
        btnFechar.on('click', fechar);

        btnRestaurar.on('click', function () {
            const confirmModal = $('<div class="dark_ct_modal" style="z-index:100000;"></div>');
            const confirmOverlay = $('<div class="dark_ct_overlay" style="background:rgba(0,0,0,0.7);"></div>');
            const confirmBox = $('<div style="position:relative;background:#2a1a0e;border:2px solid #c0392b;border-radius:8px;padding:20px;max-width:340px;color:#fc6;font-family:Arial,sans-serif;font-size:13px;text-align:center;"></div>');
            const confirmTitulo = $('<div style="font-size:14px;font-weight:bold;margin-bottom:10px;color:#e74c3c;">Restaurar Padr\u00f5es?</div>');
            const confirmTxt = $('<div style="font-size:12px;color:#aaa;line-height:1.5;margin-bottom:16px;">Isso vai restabelecer todas as op\u00e7\u00f5es do Dark Commands.<br><br>Suas configura\u00e7\u00f5es atuais ser\u00e3o perdidas.</div>');
            const confirmBtns = $('<div style="display:flex;gap:10px;justify-content:center;"></div>');
            const btnSim = $('<div class="dark_ct_btn dark_ct_danger">Sim, restaurar</div>');
            const btnNao = $('<div class="dark_ct_btn dark_ct_closebtn">Cancelar</div>');
            confirmBtns.append(btnSim, btnNao);
            confirmBox.append(confirmTitulo, confirmTxt, confirmBtns);
            confirmModal.append(confirmOverlay, confirmBox).appendTo('body');
            function fecharConfirm() { confirmModal.remove(); }
            confirmOverlay.on('click', fecharConfirm);
            btnNao.on('click', fecharConfirm);
            btnSim.on('click', function () {
                const defaults = { hideGPT: true, actBoxes: false, cmdArrival: true, saveTroops: true, autoLoad: false, loginDiario: true };
                for (let k in defaults) {
                    if (OPTIONS[k] !== defaults[k]) { OPTIONS[k] = defaults[k]; applyFeature(k); }
                }
                saveOpts();
                _syncPanelState();
                confirmModal.remove();
                try { uw.HumanMessage.success('Configura\u00e7\u00f5es restauradas'); } catch (e) {}
            });
        });

        $(document).off('keydown.dark_ct_panel').on('keydown.dark_ct_panel', function (e) {
            if (e.key === 'Escape') $('#dark_ct_modal').remove();
        });
    }

    // ========================
    // Detecção de conflitos
    // ========================
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

    let _sessionForced = {};

    function _updateConflictRow(dataKey, detectFn, disabledMsg, normalMsg) {
        let detected = detectFn();
        let forced = _sessionForced[dataKey];
        let disabled = detected || forced;
        let $row = $('.dark_ct_row[data-key="' + dataKey + '"]');
        if (!$row.length) return;
        let $cb = $row.find('.dark_ct_cb');
        let $desc = $row.find('.dark_ct_desc');
        if (disabled) {
            $row.addClass('dark_ct_disabled');
            $cb.removeClass('on').addClass('off');
            $cb.find('.dark_ct_check').css('display', 'none');
            $cb.css({ opacity: 0.4, pointerEvents: 'none' });
            $desc.text(forced && !detected ? disabledMsg + ' \u2014 recarregue para reativar' : disabledMsg);
        } else {
            $row.removeClass('dark_ct_disabled');
            $cb.css({ opacity: '', pointerEvents: '' });
            _setRowState($row, !!OPTIONS[dataKey]);
            $desc.text(normalMsg);
        }
    }

    let _updateSaveTroopsRow = function () { _updateConflictRow('saveTroops', _gptBotDetected, 'Desativado \u2014 GPT-Bot detectado', 'Salva a composi\u00e7\u00e3o de tropas (ataque ou apoio) e permite restaur\u00e1-la depois. Desative se usar GPT-Bot-BR.'); };
    let _updateActBoxesRow = function () { _updateConflictRow('actBoxes', _hasDioTools, 'Desativado \u2014 DIO Tools detectado', 'Reativa as caixas de com\u00e9rcio e ataque da lista de comandos. Desative se usar DIO Tools.'); };

    function _trackConflict(detectFn, optionKey, updateRowFn) {
        return function () {
            setInterval(function () {
                let detected = detectFn();
                if (detected && !_sessionForced[optionKey]) {
                    _sessionForced[optionKey] = true;
                    if (OPTIONS[optionKey]) {
                        OPTIONS[optionKey] = false;
                        applyFeature(optionKey);
                    }
                }
                updateRowFn();
            }, 3000);
        };
    }

    let _trackGptBot = _trackConflict(_gptBotDetected, 'saveTroops', _updateSaveTroopsRow);
    let _trackDioTools = _trackConflict(_hasDioTools, 'actBoxes', _updateActBoxesRow);

    function _syncPanelState() {
        $('.dark_ct_row').each(function () {
            let key = $(this).data('key');
            if (key === undefined) return;
            _setRowState($(this), !!OPTIONS[key]);
        });
        _updateSaveTroopsRow();
        _updateActBoxesRow();
    }

    function _allInputsEmpty(wndID) {
        let empty = true;
        $(wndID + ' input.unit_input').each(function () { if ($(this).val()) empty = false; });
        return empty;
    }

    function _getFormType(wndID) {
        let $form = $(wndID + ' .send_units_form');
        if ($form.hasClass('tab_type_attack')) return 'attack';
        if ($form.hasClass('tab_type_support')) return 'support';
        return 'unknown';
    }

    function _savedKey(wndID) {
        return wndID.replace(/[^a-z0-9]/g, '_') + '_' + _getFormType(wndID);
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
        actBoxes: { on: function () { if (!_hasDioTools()) ActivityBoxes.activate(); }, off: function () { ActivityBoxes.deactivate(); } }
    };

    function applyFeature(key) {
        let f = FEATURES[key];
        if (f) f[OPTIONS[key] ? 'on' : 'off']();
    }

    function applyAll() {
        for (let k in OPTIONS) applyFeature(k);
    }

    // ========================
    // Server Time
    // ========================
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

    // ========================
    // Login Diário (countdown)
    // ========================
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

    // ========================
    // Chegada de Comandos
    // ========================
    let CommandArrival = {
        _observer: null, _observerTarget: null, _active: false, _reconnectTimer: null, _raf: null,
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
            CommandArrival._startReconnect();
        },
        deactivate: function () {
            CommandArrival._active = false;
            $(document).off('ajaxComplete.dark_ct_arrival');
            if (CommandArrival._observer) { CommandArrival._observer.disconnect(); CommandArrival._observer = null; }
            CommandArrival._observerTarget = null;
            if (CommandArrival._raf && window.cancelAnimationFrame) cancelAnimationFrame(CommandArrival._raf);
            CommandArrival._raf = null;
            if (CommandArrival._reconnectTimer) { clearInterval(CommandArrival._reconnectTimer); CommandArrival._reconnectTimer = null; }
            $('.dark_arrival').remove();
        },
        _appendTimestamp: function (commandId) {
            let cmdStr = commandId.toString();
            let list = document.querySelectorAll('#toolbar_activity_commands_list > div > div.content > div');
            for (let i = list.length - 1; i >= 0; i--) {
                let id = list[i].getAttribute('id');
                if (!id) continue;
                let parts = id.split('_');
                let last = parts[parts.length - 1];
                if (last === cmdStr || (parts.length > 1 && parts[1] === cmdStr)) {
                    CommandArrival._insert(list[i]);
                    return;
                }
            }
        },
        _scheduleProcess: function () {
            if (CommandArrival._raf) return;
            CommandArrival._raf = requestAnimationFrame(function () {
                CommandArrival._raf = null;
                CommandArrival._process();
            });
        },
        _process: function () {
            if (!CommandArrival._active) return;
            let list = document.querySelectorAll('#toolbar_activity_commands_list > div > div.content > div');
            for (let i = 0; i < list.length; i++) {
                if (list[i].getAttribute('data-timestamp')) CommandArrival._insert(list[i]);
            }
        },
        _startObserver: function () {
            let target = document.querySelector('#toolbar_activity_commands_list');
            if (!target) { setTimeout(CommandArrival._startObserver, 500); return; }
            if (CommandArrival._observer) CommandArrival._observer.disconnect();
            CommandArrival._observerTarget = target;
            CommandArrival._observer = new MutationObserver(function () { CommandArrival._scheduleProcess(); });
            CommandArrival._observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-timestamp'], characterData: true });
        },
        _startReconnect: function () {
            if (CommandArrival._reconnectTimer) clearInterval(CommandArrival._reconnectTimer);
            CommandArrival._reconnectTimer = setInterval(function () {
                if (!CommandArrival._active) { clearInterval(CommandArrival._reconnectTimer); CommandArrival._reconnectTimer = null; return; }
                let target = document.querySelector('#toolbar_activity_commands_list');
                if (!target || !CommandArrival._observerTarget || CommandArrival._observerTarget !== target || !document.contains(CommandArrival._observerTarget)) {
                    CommandArrival._startObserver();
                }
                CommandArrival._scheduleProcess();
            }, 1000);
        },
        _insert: function (item) {
            try {
                let ts = item.getAttribute('data-timestamp');
                if (!ts) return;
                let wrapper = item.querySelector('.details_wrapper');
                if (!wrapper) return;
                let timeStr = CommandArrival._toTime(ts);
                let existing = wrapper.querySelector('.dark_arrival');
                if (existing) {
                    if (existing.textContent !== timeStr) existing.textContent = timeStr;
                    return;
                }
                let node = document.createElement('span');
                node.className = 'dark_arrival';
                node.textContent = timeStr;
                let timeDiv = wrapper.querySelector('.time');
                if (timeDiv) {
                    if (timeDiv.nextSibling) timeDiv.parentNode.insertBefore(node, timeDiv.nextSibling);
                    else timeDiv.parentNode.appendChild(node);
                } else {
                    wrapper.appendChild(node);
                }
            } catch (e) { console.warn('[DarkCmds] _insert:', e.message); }
        },
        _toTime: function (ts) {
            let d = new Date(parseInt(ts, RADIX) * MS_PER_SEC);
            let h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
            return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }
    };

    // ========================
    // Salvar Tropas
    // ========================
    let SaveTroops = {
        _saved: {}, _timers: {}, _restoring: false, _active: false, _observers: {}, _windowType: {},
        activate: function () {
            SaveTroops._active = true;
            SaveTroops._setupTabObserver();
        },
        deactivate: function () {
            SaveTroops._active = false;
            $('.dark_dur_save_wrap').remove();
            for (let k in SaveTroops._timers) { clearInterval(SaveTroops._timers[k]); }
            for (let k in SaveTroops._observers) { SaveTroops._observers[k].disconnect(); }
            SaveTroops._timers = {}; SaveTroops._observers = {}; SaveTroops._saved = {}; SaveTroops._windowType = {};
        },
        _setupTabObserver: function () {
            document.querySelectorAll('.attack_support_window').forEach(function (el) {
                let pid = el.parentElement.id;
                if (!pid || SaveTroops._observers[pid]) return;
                let debounce = null;
                SaveTroops._observers[pid] = new MutationObserver(function (mutations) {
                    if (!SaveTroops._active || !OPTIONS.saveTroops) return;
                    let relevant = false;
                    for (let m of mutations) { if (m.type === 'childList') { relevant = true; break; } }
                    if (!relevant) return;
                    if (debounce) return;
                    debounce = setTimeout(function () { debounce = null; }, 500);
                    let wndID = '#' + pid + ' ';
                    let $nu = _getUnitsContainer(wndID);
                    if ($nu.length && !$nu.find('.dark_dur_save_wrap').length) SaveTroops.add(wndID);
                });
                SaveTroops._observers[pid].observe(el, { childList: true, subtree: true });
            });
        },
        add: function (wndID) {
            console.log('[DarkCmds] SaveTroops.add wndID:', JSON.stringify(wndID), 'active:', SaveTroops._active, 'opts:', OPTIONS.saveTroops);
            if (!SaveTroops._active || !OPTIONS.saveTroops) return;
            try {
                SaveTroops._setupTabObserver();
                if ($(wndID).length !== 1) {
                    document.querySelectorAll('.attack_support_window').forEach(function (el) {
                        if (el.querySelector('.dark_dur_save_wrap')) return;
                        let pid = el.parentElement.id;
                        SaveTroops.add('#' + pid);
                    });
                    return;
                }
                let key = wndID.replace(/[^a-z0-9]/g, '_');
                let $nu = _getUnitsContainer(wndID);
                if (!$nu.length) {
                    if (SaveTroops._timers[key]) return;
                    let tries = 0;
                    SaveTroops._timers[key] = setInterval(function () {
                        if (!$(wndID).length || !OPTIONS.saveTroops || ++tries > 30) { clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key]; return; }
                        let $c = _getUnitsContainer(wndID);
                        if (!$c.length) return;
                        clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key];
                        SaveTroops.add(wndID);
                    }, 300);
                    return;
                }
                let $btn = $nu.find('.dark_dur_save_btn');
                let $status = $nu.find('.dark_dur_save_status');
                if (!$nu.find('.dark_dur_save_wrap').length) {
                    $nu.append('<div class="dark_dur_save_wrap active"><button type="button" class="dark_dur_save_btn active"><span class="dark_track"></span></button><div class="dark_dur_save_text"><span class="dark_dur_save_label">Salvar Tropas</span><span class="dark_dur_save_status" style="color:green">Ativado</span></div></div>');
                    $btn = $nu.find('.dark_dur_save_btn');
                    $status = $nu.find('.dark_dur_save_status');
                    $btn.off('.dark_save').on('click.dark_save', function () {
                        $(this).toggleClass('active');
                        if (!$(this).hasClass('active')) {
                            delete SaveTroops._saved[_savedKey(wndID)];
                            $status.text('Desativado').css('color', 'red');
                        } else {
                            SaveTroops._saveUnits(wndID);
                            $status.text('Ativado').css('color', 'green');
                        }
                    });
                }
                SaveTroops._initSaveUI(wndID, $btn);
            } catch (e) { console.error('[DarkCmds] SaveTroops error:', e); }
        },
        _initSaveUI: function (wndID, $btn) {
            let key = wndID.replace(/[^a-z0-9]/g, '_');
            console.log('[DarkCmds] _initSaveUI wndID:', JSON.stringify(wndID), 'key:', key);
            if (SaveTroops._timers[key]) { clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key]; }
            let tries = 0, stable = 0, lastType = null;
            SaveTroops._timers[key] = setInterval(function () {
                if (!$(wndID).length || ++tries > 50) { clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key]; return; }
                let type = _getFormType(wndID);
                if (type !== 'attack' && type !== 'support') { lastType = type; stable = 0; return; }
                if (type === lastType) stable++; else stable = 1;
                lastType = type;
                let prevType = SaveTroops._windowType[wndID];
                if (prevType && prevType !== type) {
                    delete SaveTroops._saved[key + '_' + prevType];
                    delete SaveTroops._saved[_savedKey(wndID)];
                    console.log('[DarkCmds] aba trocou:', prevType, '->', type, 'saves limpos');
                }
                SaveTroops._windowType[wndID] = type;
                if (!$(wndID + ' input.unit_input').length) return;
                if (stable < 2) return;
                clearInterval(SaveTroops._timers[key]); delete SaveTroops._timers[key];
                if (SaveTroops._saved[_savedKey(wndID)] && _allInputsEmpty(wndID)) SaveTroops._restoreUnits(wndID);
                $(wndID + ' input.unit_input').off('.dark_save').on('keyup.dark_save change.dark_save input.dark_save', function () {
                    if ($btn.hasClass('active')) SaveTroops._saveUnits(wndID);
                    if (!SaveTroops._saved[_savedKey(wndID)] || !Object.keys(SaveTroops._saved[_savedKey(wndID)]).length) return;
                    if (_allInputsEmpty(wndID)) SaveTroops._restoreUnits(wndID);
                });
                let $sendBtn = $(wndID + ' .button[onclick*="sendUnits"]');
                if (!$sendBtn.length) $sendBtn = $(wndID + ' #btn_attack_town');
                $sendBtn.off('.dark_save').on('click.dark_save', function () {
                    SaveTroops._saveUnits(wndID);
                    SaveTroops._onSendRestore(wndID);
                });
            }, 200);
        },
        _saveUnits: function (wndID) {
            let btn = document.querySelector(wndID + ' .dark_dur_save_btn');
            console.log('[DarkCmds] _saveUnits wndID:', JSON.stringify(wndID), 'btn:', !!btn, 'active:', btn ? btn.classList.contains('active') : false);
            if (btn && btn.classList.contains('active')) {
                let units = {};
                $(wndID + ' input.unit_input').each(function () {
                    let val = $(this).val();
                    console.log('[DarkCmds] _saveUnits input:', this.name, '=', val);
                    if (val && parseInt(val, RADIX) > 0) units[this.name] = val;
                });
                console.log('[DarkCmds] _saveUnits result:', JSON.stringify(units));
                if (Object.keys(units).length) SaveTroops._saved[_savedKey(wndID)] = units;
            }
        },
        _onSendRestore: function (wndID) {
            let tries = 0;
            let check = setInterval(function () {
                if (++tries > 15) { clearInterval(check); return; }
                if (!$(wndID + ' input.unit_input').length) return;
                let saved = SaveTroops._saved[_savedKey(wndID)];
                if (!saved || !Object.keys(saved).length) { clearInterval(check); return; }
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
                let saved = SaveTroops._saved[_savedKey(wndID)];
                console.log('[DarkCmds] _restoreUnits wndID:', JSON.stringify(wndID), 'key:', _savedKey(wndID), 'saved:', JSON.stringify(saved));
                if (!saved) return;
                for (let unit in saved) {
                    let val = saved[unit];
                    let $input = $(wndID + ' input[name="' + unit + '"]');
                    console.log('[DarkCmds] _restoreUnits unit:', unit, 'val:', val, 'input found:', $input.length);
                    if (val && $input.length) $input.val(val).trigger('keyup');
                }
            } catch (e) { console.warn('[DarkCmds] _restoreUnits:', e.message); } finally { SaveTroops._restoring = false; }
        }
    };

    function _unitClass(ud) {
        if (!ud) return 'balanced';
        if (ud.unit_function === 'function_off') return 'attack';
        if (ud.unit_function === 'function_def') return 'defense';
        return 'balanced';
    }

    // ========================
    // AutoLoad
    // ========================
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
                let formType = _getFormType(wndID);
                let skipped = 0;

                let landUnits = [], totalPop = 0;

                function fillInput(uid, count) { $(wndID + ' input[name="' + uid + '"]').val(count); }

                $(wndID + ' input.unit_input').each(function () {
                    let uid = this.name;
                    if (uid === 'big_transporter' || uid === 'small_transporter' || uid === 'none') return;
                    let cnt = uCount(uid);
                    if (cnt <= 0) return;
                    let ud = gd[uid];
            if (!ud) return;
            let cls = _unitClass(ud);
            if (formType === 'attack' && cls === 'defense') { skipped++; return; }
            if (formType === 'support' && cls === 'attack') { skipped++; return; }
            if (ud.is_naval) {
                        fillInput(uid, uid === 'colony_ship' ? 1 : cnt);
                    } else if (ud.flying) {
                        fillInput(uid, cnt);
                    } else {
                        let pop = ud.population || ud.pop || 1;
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

                if (skipped > 0) console.log('[DarkCmds] AutoLoad (' + formType + '): ' + skipped + ' unidade(s) ignorada(s) por perfil ' + (formType === 'attack' ? 'defesa' : 'ataque'));

                $(wndID + ' input.unit_input').each(function () {
                    $(this).trigger('keyup').trigger('change');
                    try { this.dispatchEvent(new Event('input', { bubbles: true })); } catch (ef) {}
                });
            } catch (e) { console.error('[DarkCmds] AutoLoad error:', e); }
        }
    };

    // ========================
    // ActivityBoxes (Caixas de comércio e ataque)
    // ========================
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

    // ========================
    // AJAX-based window detection
    // ========================
    function ajaxObserver() {
        $(document).ajaxComplete(function (e, xhr, opt) {
            try {
                let parsed = new URL(opt.url, window.location.origin);
                let path = parsed.pathname.replace('/game/', '');
                let actionType = parsed.searchParams.get('action') || '';
                if (path !== 'town_info') return;
                if (actionType === 'attack' || actionType === 'support' || actionType === 'attack_support' || actionType === 'send_units') {
                    TownTabHandler();
                }
            } catch (e) { console.warn('[DarkCmds] ajaxObserver:', e.message); }
        });
    }

    function TownTabHandler() {
        try {
            let wndArray = uw.GPWindowMgr.getAll ? uw.GPWindowMgr.getAll() : uw.GPWindowMgr.getByType(uw.GPWindowMgr.TYPE_TOWN);
            for (let e of wndArray) {
                let wndID = '#gpwnd_' + e.getID() + ' ';
                let $wnd = $(wndID);
                if (!$wnd.length) {
                    wndID = '#gpwnd_' + (e.getID() + 1) + ' ';
                    $wnd = $(wndID);
                }
                if (!$wnd.length) continue;
                if (OPTIONS.saveTroops) SaveTroops.add(wndID);
                if (OPTIONS.autoLoad) AutoLoad.add(wndID);
            }
        } catch (e) { console.error('[DarkCmds] TownTabHandler error:', e); }
    }

    // ========================
    // Inicialização
    // ========================
    function init() {
        if (typeof jQuery === 'undefined' || !uw.Game || !uw.GPWindowMgr) {
            setTimeout(init, 500);
            return;
        }
        addStyles();
        addBarButton();
        ajaxObserver();
        _migrateOpts();
        _trackGptBot();
        _trackDioTools();
        applyAll();
    }

    init();
})();
