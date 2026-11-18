(function () {
    'use strict';

    var CONFIG_URL = '../config.json';
    var API_URL = '/api/admin/login';
    var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    var CONFIG_ERROR_TEXT = 'Не удалось загрузить настройки (config.json).';

    var el = {};

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        el.form = document.getElementById('loginForm');
        el.password = document.getElementById('password');
        el.submitBtn = document.getElementById('submitBtn');
        el.formError = document.getElementById('formError');
        el.configError = document.getElementById('configError');
        el.companyName = document.getElementById('companyName');

        el.form.addEventListener('submit', onSubmit);

        loadConfig();
    }

    // ---------- Настройки (config.json) ----------

    function loadConfig() {
        fetch(CONFIG_URL, { cache: 'no-cache' })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (config) {
                if (!config || typeof config !== 'object' || Array.isArray(config)) {
                    throw new Error('Неверный формат config.json');
                }
                applyConfig(config);
            })
            .catch(function () {
                showConfigError();
            });
    }

    function showConfigError() {
        el.configError.textContent = CONFIG_ERROR_TEXT;
        el.configError.hidden = false;
    }

    function str(value) {
        return (typeof value === 'string') ? value.trim() : '';
    }

    function applyConfig(config) {
        var companyName = str(config.companyName);
        if (companyName) {
            el.companyName.textContent = companyName;
        }

        var colors = (config.colors && typeof config.colors === 'object') ? config.colors : {};
        var primary = str(colors.primary);
        var accent = str(colors.accent);
        var root = document.documentElement;

        if (COLOR_RE.test(primary)) {
            root.style.setProperty('--primary', primary);
        }
        if (COLOR_RE.test(accent)) {
            root.style.setProperty('--accent', accent);
        }
    }

    // ---------- Отправка формы ----------

    function onSubmit(event) {
        event.preventDefault();

        var password = el.password.value;
        if (!password) {
            showError('Введите пароль.');
            el.password.focus();
            return;
        }

        setLoading(true);
        hideError();

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.data && result.data.ok) {
                    window.location.href = '/admin';
                    return;
                }
                var message = (result.data && result.data.error) ? result.data.error : 'Неверный пароль.';
                showError(message);
                setLoading(false);
                if (result.status !== 429) {
                    el.password.value = '';
                    el.password.focus();
                }
            })
            .catch(function () {
                showError('Не удалось отправить запрос. Проверьте подключение.');
                setLoading(false);
            });
    }

    function setLoading(loading) {
        el.submitBtn.disabled = loading;
        el.submitBtn.textContent = loading ? 'Проверяем…' : 'Войти';
    }

    function showError(message) {
        el.formError.textContent = message;
        el.formError.hidden = false;
    }

    function hideError() {
        el.formError.textContent = '';
        el.formError.hidden = true;
    }
})();
