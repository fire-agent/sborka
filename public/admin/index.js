(function () {
    'use strict';

    var CONFIG_URL = '../config.json';
    var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    var CONFIG_ERROR_TEXT = 'Не удалось загрузить настройки (config.json).';
    var PAGE_LIMIT = 20;

    var STATUSES = [
        { value: 'new', label: 'Новая' },
        { value: 'in_progress', label: 'В работе' },
        { value: 'done', label: 'Выполнена' },
        { value: 'cancelled', label: 'Отклонена' }
    ];

    var state = {
        status: '',
        search: '',
        offset: 0,
        total: 0,
        items: [],
        loading: false,
        hasMore: false
    };

    var clientsState = {
        search: '',
        offset: 0,
        total: 0,
        items: [],
        loading: false,
        hasMore: false,
        loaded: false
    };

    var settingsLoaded = false;
    var notificationsLoaded = false;

    var el = {};

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        el.companyName = document.getElementById('companyName');
        el.configError = document.getElementById('configError');
        el.appError = document.getElementById('appError');
        el.searchInput = document.getElementById('searchInput');
        el.statusTabs = document.getElementById('statusTabs');
        el.summary = document.getElementById('summary');
        el.requestsList = document.getElementById('requestsList');
        el.emptyState = document.getElementById('emptyState');
        el.loadMoreBtn = document.getElementById('loadMoreBtn');
        el.logoutBtn = document.getElementById('logoutBtn');
        el.lightbox = document.getElementById('lightbox');
        el.lightboxImg = document.getElementById('lightboxImg');
        el.lightboxClose = document.getElementById('lightboxClose');
        el.adminTabs = document.getElementById('adminTabs');
        el.clientSearch = document.getElementById('clientSearch');
        el.clientsSummary = document.getElementById('clientsSummary');
        el.clientsList = document.getElementById('clientsList');
        el.clientsEmpty = document.getElementById('clientsEmpty');
        el.clientsLoadMore = document.getElementById('clientsLoadMore');
        el.exportClientsCsv = document.getElementById('exportClientsCsv');
        el.cfgCompanyName = document.getElementById('cfgCompanyName');
        el.cfgTitle = document.getElementById('cfgTitle');
        el.cfgColorPrimary = document.getElementById('cfgColorPrimary');
        el.cfgColorPrimaryHex = document.getElementById('cfgColorPrimaryHex');
        el.cfgColorAccent = document.getElementById('cfgColorAccent');
        el.cfgColorAccentHex = document.getElementById('cfgColorAccentHex');
        el.cfgPhone = document.getElementById('cfgPhone');
        el.cfgTelegram = document.getElementById('cfgTelegram');
        el.cfgWhatsapp = document.getElementById('cfgWhatsapp');
        el.cfgMax = document.getElementById('cfgMax');
        el.cfgLogoPreview = document.getElementById('cfgLogoPreview');
        el.cfgLogoFile = document.getElementById('cfgLogoFile');
        el.cfgLogoUpload = document.getElementById('cfgLogoUpload');
        el.cfgLogoDelete = document.getElementById('cfgLogoDelete');
        el.cfgServicesList = document.getElementById('cfgServicesList');
        el.cfgAddService = document.getElementById('cfgAddService');
        el.cfgSaveBtn = document.getElementById('cfgSaveBtn');
        el.cfgSaveStatus = document.getElementById('cfgSaveStatus');
        el.cfgTagline = document.getElementById('cfgTagline');
        el.cfgAddress = document.getElementById('cfgAddress');
        el.cfgWorkHours = document.getElementById('cfgWorkHours');
        el.cfgAdvantagesList = document.getElementById('cfgAdvantagesList');
        el.cfgAddAdvantage = document.getElementById('cfgAddAdvantage');
        el.cfgTheme = document.getElementById('cfgTheme');
        el.qrImage = document.getElementById('qrImage');
        el.generateQrBtn = document.getElementById('generateQrBtn');
        el.downloadPng = document.getElementById('downloadPng');
        el.downloadSvg = document.getElementById('downloadSvg');
        el.notifTelegram = document.getElementById('notifTelegram');
        el.notifMax = document.getElementById('notifMax');
        el.notifWhatsapp = document.getElementById('notifWhatsapp');
        el.testTelegram = document.getElementById('testTelegram');
        el.testMax = document.getElementById('testMax');
        el.testWhatsapp = document.getElementById('testWhatsapp');
        el.testTelegramStatus = document.getElementById('testTelegramStatus');
        el.testMaxStatus = document.getElementById('testMaxStatus');
        el.testWhatsappStatus = document.getElementById('testWhatsappStatus');
        el.deeplinkTelegram = document.getElementById('deeplinkTelegram');
        el.deeplinkMax = document.getElementById('deeplinkMax');
        el.deeplinkTelegramStatus = document.getElementById('deeplinkTelegramStatus');
        el.deeplinkMaxStatus = document.getElementById('deeplinkMaxStatus');
        el.manualTelegramToken = document.getElementById('manualTelegramToken');
        el.manualTelegramChatId = document.getElementById('manualTelegramChatId');
        el.manualMaxToken = document.getElementById('manualMaxToken');
        el.manualMaxChatId = document.getElementById('manualMaxChatId');
        el.saveManualTelegram = document.getElementById('saveManualTelegram');
        el.saveManualMax = document.getElementById('saveManualMax');
        el.saveNotifBtn = document.getElementById('saveNotifBtn');
        el.saveNotifStatus = document.getElementById('saveNotifStatus');
        el.currentPassword = document.getElementById('currentPassword');
        el.newPassword = document.getElementById('newPassword');
        el.confirmPassword = document.getElementById('confirmPassword');
        el.changePasswordBtn = document.getElementById('changePasswordBtn');
        el.passwordStatus = document.getElementById('passwordStatus');

        el.searchInput.addEventListener('input', debounce(onSearchChange, 400));
        el.logoutBtn.addEventListener('click', onLogout);
        el.loadMoreBtn.addEventListener('click', onLoadMore);
        el.lightboxClose.addEventListener('click', closeLightbox);
        el.lightbox.addEventListener('click', function (event) {
            if (event.target === el.lightbox) {
                closeLightbox();
            }
        });

        el.adminTabs.addEventListener('click', onTabClick);
        el.clientSearch.addEventListener('input', debounce(onClientSearch, 400));
        el.clientsLoadMore.addEventListener('click', loadClients);
        el.exportClientsCsv.addEventListener('click', exportClientsCsv);
        el.cfgAddService.addEventListener('click', function () {
            addServiceRow(null);
        });
        el.cfgAddAdvantage.addEventListener('click', function () {
            addAdvantageRow(null);
        });
        el.generateQrBtn.addEventListener('click', generateAndRenderQR);
        el.cfgLogoUpload.addEventListener('click', onLogoUpload);
        el.cfgLogoDelete.addEventListener('click', onLogoDelete);
        el.cfgSaveBtn.addEventListener('click', onSaveSettings);
        el.saveNotifBtn.addEventListener('click', onSaveNotifications);
        el.changePasswordBtn.addEventListener('click', onChangePassword);
        el.testTelegram.addEventListener('click', function () { sendTestNotification('telegram'); });
        el.testMax.addEventListener('click', function () { sendTestNotification('max'); });
        el.testWhatsapp.addEventListener('click', function () { sendTestNotification('whatsapp'); });
        el.deeplinkTelegram.addEventListener('click', function () { startDeepLink('telegram'); });
        el.deeplinkMax.addEventListener('click', function () { startDeepLink('max'); });
        el.saveManualTelegram.addEventListener('click', function () { saveManualCredentials('telegram'); });
        el.saveManualMax.addEventListener('click', function () { saveManualCredentials('max'); });
        setupColorSync();
        setupAdminPhoneMask();

        renderStatusTabs();
        loadConfig();
        loadRequests();
    }

    // ---------- Утилиты ----------

    function debounce(fn, wait) {
        var timer = null;
        return function () {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(fn, wait);
        };
    }

    function str(value) {
        return (typeof value === 'string') ? value.trim() : '';
    }

    function formatDate(iso) {
        var date = new Date(iso);
        if (isNaN(date.getTime())) {
            return iso;
        }
        try {
            return date.toLocaleString('ru-RU');
        } catch (e) {
            return date.toISOString();
        }
    }

    function formatPrice(value) {
        if (value === null || value === undefined || value === '') {
            return '';
        }
        var n = Number(value);
        if (!Number.isFinite(n)) {
            return String(value);
        }
        try {
            return n.toLocaleString('ru-RU');
        } catch (e) {
            return String(value);
        }
    }

    // ---------- Настройки config.json ----------

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

    function applyConfig(config) {
        var companyName = str(config.companyName);
        if (companyName) {
            el.companyName.textContent = companyName;
            document.title = 'Кабинет менеджера — ' + companyName;
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

    // ---------- Рендер фильтров ----------

    function renderStatusTabs() {
        el.statusTabs.addEventListener('click', function (event) {
            var tab = event.target.closest('.status-tab');
            if (!tab) {
                return;
            }
            state.status = tab.getAttribute('data-status') || '';
            highlightTabs();
            resetAndLoad();
        });
    }

    function highlightTabs() {
        var tabs = el.statusTabs.querySelectorAll('.status-tab');
        for (var i = 0; i < tabs.length; i++) {
            var active = (tabs[i].getAttribute('data-status') || '') === state.status;
            tabs[i].classList.toggle('is-active', active);
        }
    }

    function onSearchChange() {
        state.search = str(el.searchInput.value);
        resetAndLoad();
    }

    function resetAndLoad() {
        state.offset = 0;
        state.items = [];
        state.total = 0;
        state.hasMore = false;
        renderEmpty();
        loadRequests();
    }

    function onLoadMore() {
        loadRequests();
    }

    // ---------- Загрузка заявок ----------

    function loadRequests() {
        if (state.loading) {
            return;
        }
        state.loading = true;
        hideAppError();
        el.loadMoreBtn.hidden = true;

        var params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        params.set('offset', String(state.offset));
        if (state.status) {
            params.set('status', state.status);
        }
        if (state.search) {
            params.set('search', state.search);
        }

        fetch('/api/admin/requests?' + params.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                state.loading = false;

                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }

                if (!result.data || result.data.ok !== true) {
                    var error = (result.data && result.data.error) || 'Не удалось загрузить заявки.';
                    showAppError(error);
                    return;
                }

                var items = Array.isArray(result.data.items) ? result.data.items : [];
                var total = Number(result.data.total) || 0;

                if (state.offset === 0) {
                    state.items = items;
                } else {
                    state.items = state.items.concat(items);
                }

                state.total = total;
                state.offset = state.items.length;
                state.hasMore = state.items.length < state.total;

                renderList();
            })
            .catch(function () {
                state.loading = false;
                showAppError('Не удалось загрузить заявки. Проверьте соединение.');
            });
    }

    function renderList() {
        el.requestsList.innerHTML = '';

        if (state.items.length === 0) {
            el.emptyState.hidden = false;
            el.summary.hidden = true;
            el.loadMoreBtn.hidden = true;
            return;
        }

        el.emptyState.hidden = true;
        el.summary.hidden = false;

        var phoneCounts = computePhoneCounts();
        for (var i = 0; i < state.items.length; i++) {
            el.requestsList.appendChild(buildCard(state.items[i], phoneCounts));
        }

        el.loadMoreBtn.hidden = !state.hasMore;
        renderSummary();
        loadSummary();
    }

    function renderEmpty() {
        el.requestsList.innerHTML = '';
        el.emptyState.hidden = true;
        el.summary.hidden = true;
        el.loadMoreBtn.hidden = true;
    }

    // ---------- Карточка заявки ----------

    function buildCard(item, phoneCounts) {
        var card = document.createElement('article');
        card.className = 'request-card';
        card.setAttribute('data-id', item.id);

        // Верхняя строка
        var top = document.createElement('div');
        top.className = 'request-top';

        var meta = document.createElement('div');
        meta.className = 'request-meta';

        var idLine = document.createElement('div');
        idLine.className = 'request-id';
        idLine.textContent = 'Заявка №' + item.id;

        var dateLine = document.createElement('div');
        dateLine.className = 'request-date';
        dateLine.textContent = formatDate(item.createdAt);

        meta.appendChild(idLine);
        meta.appendChild(dateLine);

        var badge = document.createElement('span');
        badge.className = 'status-badge';
        badge.setAttribute('data-status', item.status);
        badge.textContent = statusLabel(item.status);

        top.appendChild(meta);
        top.appendChild(badge);
        card.appendChild(top);

        // Услуга и цена
        var service = document.createElement('div');
        service.className = 'request-service';
        service.textContent = item.service || 'Услуга не указана';

        card.appendChild(service);

        if (item.priceFrom !== null && item.priceFrom !== undefined && item.priceFrom !== '') {
            var price = document.createElement('div');
            price.className = 'request-price';
            price.textContent = 'Ориентировочно от ' + formatPrice(item.priceFrom) + ' ₽';
            card.appendChild(price);
        }

        // Контакт
        var contact = document.createElement('div');
        contact.className = 'request-contact';
        if (item.name) {
            var nameSpan = document.createElement('span');
            nameSpan.className = 'request-name';
            nameSpan.textContent = item.name;
            contact.appendChild(nameSpan);
            contact.appendChild(document.createTextNode(' · '));
        }
        var phoneLink = document.createElement('a');
        phoneLink.href = 'tel:' + phoneForTel(item.phone);
        phoneLink.textContent = item.phone;
        contact.appendChild(phoneLink);

        if (phoneCounts && (phoneCounts[item.phone] || 0) > 1) {
            var repeatBadge = document.createElement('span');
            repeatBadge.className = 'repeat-badge';
            repeatBadge.textContent = 'Повторный';
            contact.appendChild(document.createTextNode(' '));
            contact.appendChild(repeatBadge);
        }
        card.appendChild(contact);

        // Мессенджеры
        card.appendChild(buildMessengerLinks(item));

        // Описание
        if (item.description) {
            var desc = document.createElement('div');
            desc.className = 'request-description';
            desc.textContent = item.description;
            card.appendChild(desc);
        }

        // Цена и скидка
        card.appendChild(buildPricingSection(item));

        // Фото
        if (item.photoCount > 0) {
            card.appendChild(buildPhotos(item));
        }

        // Смена статуса
        card.appendChild(buildStatusActions(item));

        // Удаление
        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Удалить заявку';
        deleteBtn.addEventListener('click', function () {
            onDelete(item);
        });
        card.appendChild(deleteBtn);

        return card;
    }

    function buildPhotos(item) {
        var wrapper = document.createElement('div');
        wrapper.className = 'photos';

        for (var i = 0; i < item.photos.length; i++) {
            var photo = item.photos[i];
            var img = document.createElement('img');
            img.className = 'photo-thumb';
            img.loading = 'lazy';
            img.alt = 'Фото ' + (i + 1);
            img.src = '/api/admin/photos?file=' + encodeURIComponent(photo.fileName);
            img.addEventListener('click', function () {
                openLightbox(this.src);
            });
            wrapper.appendChild(img);
        }

        return wrapper;
    }

    function buildStatusActions(item) {
        var wrapper = document.createElement('div');
        wrapper.className = 'status-actions';

        for (var i = 0; i < STATUSES.length; i++) {
            var status = STATUSES[i];
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'status-btn';
            if (item.status === status.value) {
                btn.classList.add('is-active');
            }
            btn.textContent = status.label;
            btn.addEventListener('click', function (s) {
                return function () {
                    onChangeStatus(item, s);
                };
            }(status.value));
            wrapper.appendChild(btn);
        }

        return wrapper;
    }

    function statusLabel(value) {
        for (var i = 0; i < STATUSES.length; i++) {
            if (STATUSES[i].value === value) {
                return STATUSES[i].label;
            }
        }
        return value;
    }

    function phoneForTel(phone) {
        return String(phone || '').replace(/[^\d+]/g, '');
    }

    function computePhoneCounts() {
        var counts = {};
        for (var i = 0; i < state.items.length; i++) {
            var phone = String(state.items[i].phone || '');
            counts[phone] = (counts[phone] || 0) + 1;
        }
        return counts;
    }

    function buildMessengerLinks(item) {
        var wrapper = document.createElement('div');
        wrapper.className = 'messenger-links';

        var digits = String(item.phone || '').replace(/\D/g, '');
        if (!digits) {
            return wrapper;
        }

        var tg = document.createElement('a');
        tg.href = 'https://t.me/+' + digits;
        tg.target = '_blank';
        tg.rel = 'noopener noreferrer';
        tg.className = 'messenger-btn tg-btn';
        tg.textContent = 'Telegram';
        wrapper.appendChild(tg);

        var wa = document.createElement('a');
        wa.href = 'https://wa.me/' + digits;
        wa.target = '_blank';
        wa.rel = 'noopener noreferrer';
        wa.className = 'messenger-btn wa-btn';
        wa.textContent = 'WhatsApp';
        wrapper.appendChild(wa);

        return wrapper;
    }

    function numberOrNull(value) {
        var s = String(value === null || value === undefined ? '' : value).trim();
        if (s === '') {
            return null;
        }
        var n = Number(s);
        return Number.isFinite(n) ? n : null;
    }

    function buildPricingSection(item) {
        var details = document.createElement('details');
        details.className = 'pricing-section';

        var summary = document.createElement('summary');
        summary.textContent = 'Цена и скидка';
        details.appendChild(summary);

        var body = document.createElement('div');
        body.className = 'pricing-form';

        function field(labelText, input) {
            var wrap = document.createElement('label');
            wrap.className = 'pricing-field';
            var span = document.createElement('span');
            span.textContent = labelText;
            wrap.appendChild(span);
            wrap.appendChild(input);
            return wrap;
        }

        function numInput(value) {
            var input = document.createElement('input');
            input.type = 'number';
            input.step = '1';
            input.min = '0';
            input.value = (value === null || value === undefined) ? '' : String(value);
            return input;
        }

        var baseInput = numInput(item.basePrice);

        var discountType = document.createElement('select');
        discountType.className = 'pricing-discount-type';
        var typeOptions = [
            { value: '', label: '—' },
            { value: 'percent', label: '%' },
            { value: 'fixed', label: '₽' }
        ];
        for (var ti = 0; ti < typeOptions.length; ti++) {
            var opt = document.createElement('option');
            opt.value = typeOptions[ti].value;
            opt.textContent = typeOptions[ti].label;
            discountType.appendChild(opt);
        }
        discountType.value = item.discountType || '';

        var discountInput = numInput(item.discountValue);
        var finalInput = numInput(item.finalPrice);

        function recalc() {
            var base = Number(baseInput.value);
            if (!Number.isFinite(base) || base < 0) {
                base = 0;
            }
            var type = discountType.value;
            var discount = Number(discountInput.value);
            if (!Number.isFinite(discount) || discount < 0) {
                discount = 0;
            }
            var final = base;
            if (type === 'percent') {
                final = base - (base * discount / 100);
            } else if (type === 'fixed') {
                final = base - discount;
            }
            if (final < 0) {
                final = 0;
            }
            finalInput.value = String(Math.round(final * 100) / 100);
        }

        baseInput.addEventListener('input', recalc);
        discountType.addEventListener('change', recalc);
        discountInput.addEventListener('input', recalc);

        var note = document.createElement('textarea');
        note.rows = 2;
        note.value = item.managerNote || '';

        var saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'save-pricing-btn';
        saveBtn.textContent = 'Сохранить';
        saveBtn.addEventListener('click', function () {
            savePricing(item, {
                basePrice: numberOrNull(baseInput.value),
                discountType: discountType.value,
                discountValue: numberOrNull(discountInput.value),
                finalPrice: numberOrNull(finalInput.value),
                managerNote: note.value
            });
        });

        body.appendChild(field('Базовая цена', baseInput));
        body.appendChild(field('Тип скидки', discountType));
        body.appendChild(field('Размер скидки', discountInput));
        body.appendChild(field('Итого', finalInput));
        body.appendChild(field('Заметка менеджера', note));
        body.appendChild(saveBtn);

        details.appendChild(body);
        return details;
    }

    function savePricing(item, payload) {
        fetch('/api/admin/request/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: item.id,
                basePrice: payload.basePrice,
                discountType: payload.discountType,
                discountValue: payload.discountValue,
                finalPrice: payload.finalPrice,
                managerNote: payload.managerNote
            })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showAppError((result.data && result.data.error) || 'Не удалось сохранить данные.');
                    return;
                }
                item.basePrice = payload.basePrice;
                item.discountType = payload.discountType;
                item.discountValue = payload.discountValue;
                item.finalPrice = payload.finalPrice;
                item.managerNote = payload.managerNote;
                updateCardAfterAction(item);
            })
            .catch(function () {
                showAppError('Не удалось сохранить данные. Проверьте соединение.');
            });
    }

    function renderSummary() {
        el.summary.innerHTML = '';
        el.summary.hidden = false;

        var cards = document.createElement('div');
        cards.className = 'summary-cards';
        cards.id = 'summaryCards';
        cards.textContent = 'Загрузка сводки…';
        el.summary.appendChild(cards);

        var exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'export-btn';
        exportBtn.textContent = 'Экспорт CSV';
        exportBtn.addEventListener('click', exportCsv);
        el.summary.appendChild(exportBtn);
    }

    function loadSummary() {
        var params = new URLSearchParams();
        if (state.status) {
            params.set('status', state.status);
        }
        if (state.search) {
            params.set('search', state.search);
        }

        fetch('/api/admin/summary?' + params.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    var failedCards = document.getElementById('summaryCards');
                    if (failedCards) {
                        failedCards.textContent = 'Не удалось загрузить сводку.';
                    }
                    return;
                }
                renderSummaryCards(result.data.summary);
            })
            .catch(function () {
                var failedCards = document.getElementById('summaryCards');
                if (failedCards) {
                    failedCards.textContent = 'Не удалось загрузить сводку.';
                }
            });
    }

    function renderSummaryCards(summary) {
        var cards = document.getElementById('summaryCards');
        if (!cards) {
            return;
        }
        cards.innerHTML = '';

        var items = [
            { label: 'Новые', value: summary.countNew, className: 'summary-new' },
            { label: 'В работе', value: summary.countInProgress, className: 'summary-progress' },
            { label: 'Выполнены', value: summary.countDone, className: 'summary-done' },
            { label: 'Отклонены', value: summary.countCancelled, className: 'summary-cancelled' },
            { label: 'Всего', value: summary.total, className: 'summary-total' }
        ];

        for (var i = 0; i < items.length; i++) {
            cards.appendChild(buildSummaryCard(items[i].label, items[i].value, items[i].className));
        }
        cards.appendChild(buildSummaryCard('Выручка', formatPrice(summary.revenue) + ' ₽', 'summary-revenue'));
    }

    function buildSummaryCard(label, value, className) {
        var card = document.createElement('div');
        card.className = 'summary-card ' + (className || '');

        var valueEl = document.createElement('div');
        valueEl.className = 'summary-value';
        valueEl.textContent = String(value === null || value === undefined ? 0 : value);

        var labelEl = document.createElement('div');
        labelEl.className = 'summary-label';
        labelEl.textContent = label;

        card.appendChild(valueEl);
        card.appendChild(labelEl);
        return card;
    }

    function discountTypeLabel(value) {
        if (value === 'percent') {
            return '%';
        }
        if (value === 'fixed') {
            return '₽';
        }
        return '';
    }

    function csvCell(value) {
        var s = String(value === null || value === undefined ? '' : value);
        // Экранирование для предотвращения CSV Injection
        if (/^[=\+\-@'"]/.test(s)) {
            s = "'" + s;
        }
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function exportCsv() {
        var headers = ['ID', 'Дата', 'Имя', 'Телефон', 'Услуга', 'Цена от', 'Базовая цена', 'Скидка', 'Тип скидки', 'Итого', 'Статус', 'Заметка'];
        var rows = [headers.join(';')];

        for (var i = 0; i < state.items.length; i++) {
            var it = state.items[i];
            rows.push([
                it.id,
                it.createdAt,
                it.name,
                it.phone,
                it.service,
                it.priceFrom,
                it.basePrice,
                it.discountValue,
                discountTypeLabel(it.discountType),
                it.finalPrice,
                it.status,
                it.managerNote
            ].map(csvCell).join(';'));
        }

        var csv = '\uFEFF' + rows.join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'requests.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---------- Действия ----------

    function onChangeStatus(item, status) {
        fetch('/api/admin/requests/' + item.id + '/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: status })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showAppError((result.data && result.data.error) || 'Не удалось изменить статус.');
                    return;
                }
                item.status = status;
                updateCardAfterAction(item);
            })
            .catch(function () {
                showAppError('Не удалось изменить статус. Проверьте соединение.');
            });
    }

    function onDelete(item) {
        var sure = window.confirm('Удалить заявку №' + item.id + ' без возможности восстановления?');
        if (!sure) {
            return;
        }

        fetch('/api/admin/requests/' + item.id + '/delete', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showAppError((result.data && result.data.error) || 'Не удалось удалить заявку.');
                    return;
                }
                removeCard(item.id);
            })
            .catch(function () {
                showAppError('Не удалось удалить заявку. Проверьте соединение.');
            });
    }

    function updateCardAfterAction(item) {
        var card = el.requestsList.querySelector('.request-card[data-id="' + item.id + '"]');
        if (!card) {
            return;
        }
        var replacement = buildCard(item, computePhoneCounts());
        el.requestsList.replaceChild(replacement, card);
    }

    function removeCard(id) {
        var card = el.requestsList.querySelector('.request-card[data-id="' + id + '"]');
        if (card) {
            card.remove();
        }
        state.items = state.items.filter(function (it) { return it.id !== id; });
        state.total = Math.max(0, state.total - 1);
        if (state.items.length === 0) {
            renderList();
        } else {
            renderSummary();
            loadSummary();
            el.loadMoreBtn.hidden = !(state.items.length < state.total);
        }
    }

    function onLogout() {
        fetch('/api/admin/logout', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        })
            .then(function () {
                window.location.href = '/admin/login';
            })
            .catch(function () {
                window.location.href = '/admin/login';
            });
    }

    // ---------- Lightbox ----------

    function openLightbox(src) {
        el.lightboxImg.src = src;
        el.lightbox.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        el.lightbox.hidden = true;
        el.lightboxImg.src = '';
        document.body.style.overflow = '';
    }

    // ---------- Сообщения об ошибках ----------

    function showAppError(message) {
        el.appError.textContent = message;
        el.appError.hidden = false;
    }

    function hideAppError() {
        el.appError.textContent = '';
        el.appError.hidden = true;
    }

    // ---------- Навигация по вкладкам ----------

    function onTabClick(event) {
        var btn = event.target.closest('.admin-tab');
        if (!btn) {
            return;
        }
        activateTab(btn.getAttribute('data-tab') || 'requests');
    }

    function activateTab(name) {
        var tabs = el.adminTabs.querySelectorAll('.admin-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === name);
        }

        var sectionId = 'tab' + name.charAt(0).toUpperCase() + name.slice(1);
        var sections = document.querySelectorAll('.tab-content');
        for (var j = 0; j < sections.length; j++) {
            sections[j].hidden = (sections[j].id !== sectionId);
        }

        if (name === 'clients' && !clientsState.loaded) {
            clientsState.loaded = true;
            loadClients();
        }
        if (name === 'settings') {
            if (!settingsLoaded) {
                settingsLoaded = true;
                loadSettings();
            }
            generateAndRenderQR();
        }
        if (name === 'notifications' && !notificationsLoaded) {
            notificationsLoaded = true;
            loadNotifications();
        }
    }

    // ---------- Вкладка «Заказчики» ----------

    function onClientSearch() {
        clientsState.search = str(el.clientSearch.value);
        resetClients();
    }

    function resetClients() {
        clientsState.offset = 0;
        clientsState.items = [];
        clientsState.total = 0;
        clientsState.hasMore = false;
        el.clientsList.innerHTML = '';
        el.clientsEmpty.hidden = true;
        el.clientsSummary.hidden = true;
        loadClients();
    }

    function loadClients() {
        if (clientsState.loading) {
            return;
        }
        clientsState.loading = true;
        el.clientsLoadMore.hidden = true;

        var params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        params.set('offset', String(clientsState.offset));
        if (clientsState.search) {
            params.set('search', clientsState.search);
        }

        fetch('/api/admin/clients?' + params.toString(), {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                clientsState.loading = false;

                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }

                if (!result.data || result.data.ok !== true) {
                    el.clientsEmpty.textContent = (result.data && result.data.error) || 'Не удалось загрузить клиентов.';
                    el.clientsEmpty.hidden = false;
                    return;
                }

                var items = Array.isArray(result.data.items) ? result.data.items : [];
                clientsState.total = Number(result.data.total) || 0;

                if (clientsState.offset === 0) {
                    clientsState.items = items;
                } else {
                    clientsState.items = clientsState.items.concat(items);
                }

                clientsState.offset = clientsState.items.length;
                clientsState.hasMore = clientsState.items.length < clientsState.total;

                renderClients();
            })
            .catch(function () {
                clientsState.loading = false;
                el.clientsEmpty.textContent = 'Не удалось загрузить клиентов. Проверьте соединение.';
                el.clientsEmpty.hidden = false;
            });
    }

    function renderClients() {
        el.clientsList.innerHTML = '';

        if (clientsState.items.length === 0) {
            el.clientsEmpty.textContent = 'Клиентов не найдено.';
            el.clientsEmpty.hidden = false;
            el.clientsSummary.hidden = true;
            el.clientsLoadMore.hidden = true;
            return;
        }

        el.clientsEmpty.hidden = true;
        el.clientsSummary.hidden = false;
        el.clientsSummary.textContent = 'Клиентов: ' + clientsState.total;

        for (var i = 0; i < clientsState.items.length; i++) {
            el.clientsList.appendChild(buildClientCard(clientsState.items[i]));
        }

        el.clientsLoadMore.hidden = !clientsState.hasMore;
    }

    function buildClientCard(client) {
        var card = document.createElement('article');
        card.className = 'client-card';

        var top = document.createElement('div');
        top.className = 'client-top';

        var name = document.createElement('div');
        name.className = 'client-name';
        name.textContent = client.name || 'Без имени';
        top.appendChild(name);

        var phone = document.createElement('a');
        phone.className = 'client-phone';
        phone.href = 'tel:' + phoneForTel(client.phone);
        phone.textContent = client.phone;
        top.appendChild(phone);

        card.appendChild(top);

        var stats = document.createElement('div');
        stats.className = 'client-stats';

        var count = document.createElement('div');
        count.textContent = 'Обращений: ' + (client.requestCount || 0);
        stats.appendChild(count);

        var spent = document.createElement('div');
        spent.textContent = 'Сумма: ' + formatPrice(client.totalSpent) + ' ₽';
        stats.appendChild(spent);

        card.appendChild(stats);

        var dates = document.createElement('div');
        dates.className = 'client-dates';

        var first = document.createElement('div');
        first.textContent = 'Первое: ' + formatDate(client.firstRequestAt);
        dates.appendChild(first);

        var last = document.createElement('div');
        last.textContent = 'Последнее: ' + formatDate(client.lastRequestAt);
        dates.appendChild(last);

        card.appendChild(dates);
        card.appendChild(buildMessengerLinks({ phone: client.phone }));

        return card;
    }

    function exportClientsCsv() {
        var headers = ['Телефон', 'Имя', 'Кол-во заявок', 'Сумма', 'Первое обращение', 'Последнее обращение'];
        var rows = [headers.join(';')];

        for (var i = 0; i < clientsState.items.length; i++) {
            var c = clientsState.items[i];
            rows.push([
                c.phone,
                c.name,
                c.requestCount,
                c.totalSpent,
                c.firstRequestAt,
                c.lastRequestAt
            ].map(csvCell).join(';'));
        }

        var csv = '\uFEFF' + rows.join('\r\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'clients.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ---------- Вкладка «Настройки витрины» ----------

    // Убирает из строки всё, кроме цифр
    function extractDigits(value) {
        return String(value === undefined || value === null ? '' : value).replace(/\D/g, '');
    }

    // Позиция курсора после указанного количества цифр в отформатированной строке
    function findCaretForDigits(formatted, digitCount) {
        var seen = 0;
        for (var i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
                if (seen === digitCount) {
                    return i;
                }
                seen++;
            }
        }
        return formatted.length;
    }

    // Форматирует строку из цифр в прогрессивную маску +7 (XXX) XXX-XX-XX
    function formatPhoneMask(rawDigits) {
        var digits = extractDigits(rawDigits);
        if (!digits) {
            return '';
        }

        // 8 → 7; 9 или любая другая цифра (кроме 7) → добавляем 7 в начало
        if (digits[0] === '8') {
            digits = '7' + digits.slice(1);
        } else if (digits[0] !== '7') {
            digits = '7' + digits;
        }

        // Ограничиваем длину 11 цифрами (максимум для российского номера)
        digits = digits.slice(0, 11);

        var rest = digits.slice(1);
        var result = '+7';
        if (rest.length === 0) {
            return result;
        }

        result += ' (' + rest.slice(0, 3);
        if (rest.length > 3) {
            result += ') ' + rest.slice(3, 6);
        }
        if (rest.length > 6) {
            result += '-' + rest.slice(6, 8);
        }
        if (rest.length > 8) {
            result += '-' + rest.slice(8, 10);
        }
        return result;
    }

    function onCfgPhoneInput() {
        var value = el.cfgPhone.value;
        var caret = el.cfgPhone.selectionStart;
        var digitsBeforeCaret = extractDigits(value.slice(0, caret)).length;

        var rawDigits = extractDigits(value);
        // Если ввод начался не с 7 и не с 8, форматтер добавит ведущую 7 —
        // учитываем её, чтобы курсор остался после тех же введённых цифр.
        var addsLeadingSeven = Boolean(rawDigits && rawDigits[0] !== '7' && rawDigits[0] !== '8');

        var formatted = formatPhoneMask(value);
        el.cfgPhone.value = formatted;

        var targetDigits = digitsBeforeCaret + (addsLeadingSeven ? 1 : 0);
        var newCaret = findCaretForDigits(formatted, targetDigits);
        el.cfgPhone.setSelectionRange(newCaret, newCaret);
    }

    function onCfgPhonePaste(event) {
        event.preventDefault();
        var text = '';
        try {
            text = (event.clipboardData || window.clipboardData).getData('text');
        } catch (e) {
            // Игнорируем недоступный буфер обмена
        }
        el.cfgPhone.value = formatPhoneMask(text);
        var end = el.cfgPhone.value.length;
        el.cfgPhone.setSelectionRange(end, end);
    }

    function onCfgPhoneFocus() {
        if (!el.cfgPhone.value) {
            el.cfgPhone.value = '+7 (';
        }
    }

    function onCfgPhoneBlur() {
        var value = el.cfgPhone.value.trim();
        if (value === '+7 (' || value === '+7') {
            el.cfgPhone.value = '';
        }
    }

    function setupAdminPhoneMask() {
        el.cfgPhone.addEventListener('input', onCfgPhoneInput);
        el.cfgPhone.addEventListener('paste', onCfgPhonePaste);
        el.cfgPhone.addEventListener('focus', onCfgPhoneFocus);
        el.cfgPhone.addEventListener('blur', onCfgPhoneBlur);
    }

    function loadSettings() {
        fetch('/api/admin/config', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showSettingsStatus('Не удалось загрузить настройки.', false);
                    return;
                }
                fillSettingsForm(result.data.config);
            })
            .catch(function () {
                showSettingsStatus('Не удалось загрузить настройки.', false);
            });
    }

    function fillSettingsForm(config) {
        var cfg = config || {};

        el.cfgCompanyName.value = cfg.companyName || '';
        el.cfgTitle.value = cfg.title || '';

        var colors = (cfg.colors && typeof cfg.colors === 'object') ? cfg.colors : {};
        var primary = colors.primary || '#319795';
        var accent = colors.accent || '#4fd1c5';

        el.cfgColorPrimaryHex.value = primary;
        el.cfgColorAccentHex.value = accent;
        el.cfgColorPrimary.value = normalizeHexForColorInput(primary);
        el.cfgColorAccent.value = normalizeHexForColorInput(accent);

        var contacts = (cfg.contacts && typeof cfg.contacts === 'object') ? cfg.contacts : {};
        el.cfgPhone.value = contacts.phone || '';
        el.cfgTelegram.value = contacts.telegram || '';
        el.cfgWhatsapp.value = contacts.whatsapp || '';
        el.cfgMax.value = contacts.max || '';

        el.cfgTagline.value = cfg.tagline || '';
        el.cfgAddress.value = cfg.address || '';
        el.cfgWorkHours.value = cfg.workHours || '';
        renderAdvantageRows(cfg.advantages || []);
        renderServiceRows(cfg.services || []);
        updateLogoPreview();
        el.cfgTheme.value = cfg.theme || '';
    }

    function renderAdvantageRows(advantages) {
        el.cfgAdvantagesList.innerHTML = '';
        var list = Array.isArray(advantages) ? advantages : [];
        list.slice(0, 3).forEach(function (adv) {
            addAdvantageRow(adv);
        });
        updateAdvantageButton();
    }

    function addAdvantageRow(advantage) {
        var advantageCount = el.cfgAdvantagesList.querySelectorAll('.advantage-row').length;
        if (advantageCount >= 3) {
            return;
        }

        var row = document.createElement('div');
        row.className = 'advantage-row';

        var titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'advantage-title';
        titleInput.placeholder = 'Название';
        titleInput.value = (advantage && advantage.title) || '';

        var textInput = document.createElement('textarea');
        textInput.rows = 2;
        textInput.className = 'advantage-text';
        textInput.placeholder = 'Описание';
        textInput.value = (advantage && advantage.text) || '';

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'advantage-remove-btn';
        removeBtn.textContent = 'Удалить';
        removeBtn.addEventListener('click', function () {
            row.remove();
            updateAdvantageButton();
        });

        row.appendChild(titleInput);
        row.appendChild(textInput);
        row.appendChild(removeBtn);
        el.cfgAdvantagesList.appendChild(row);
        updateAdvantageButton();
    }

    function updateAdvantageButton() {
        var advantageCount = el.cfgAdvantagesList.querySelectorAll('.advantage-row').length;
        el.cfgAddAdvantage.hidden = (advantageCount >= 3);
    }

    function getAdvantagesFromForm() {
        var rows = el.cfgAdvantagesList.querySelectorAll('.advantage-row');
        var result = [];
        for (var i = 0; i < rows.length; i++) {
            var titleInput = rows[i].querySelector('.advantage-title');
            var textInput = rows[i].querySelector('.advantage-text');
            var title = str(titleInput.value);
            var text = str(textInput.value);
            if (title || text) {
                result.push({ title: title, text: text });
            }
        }
        return result;
    }

    function normalizeHexForColorInput(value) {
        var v = str(value);
        if (/^#([0-9a-fA-F]{3})$/.test(v)) {
            return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
        }
        if (COLOR_RE.test(v)) {
            return v;
        }
        return '#000000';
    }

    function setupColorSync() {
        syncColorPair(el.cfgColorPrimary, el.cfgColorPrimaryHex);
        syncColorPair(el.cfgColorAccent, el.cfgColorAccentHex);
    }

    function syncColorPair(colorInput, hexInput) {
        colorInput.addEventListener('input', function () {
            hexInput.value = colorInput.value;
        });
        hexInput.addEventListener('input', function () {
            var v = str(hexInput.value);
            if (COLOR_RE.test(v)) {
                colorInput.value = normalizeHexForColorInput(v);
            }
        });
    }

    function renderServiceRows(services) {
        el.cfgServicesList.innerHTML = '';
        var list = Array.isArray(services) ? services : [];
        for (var i = 0; i < list.length; i++) {
            addServiceRow(list[i]);
        }
    }

    function addServiceRow(service) {
        var row = document.createElement('div');
        row.className = 'service-row';

        var nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'service-name';
        nameInput.placeholder = 'Название услуги';
        nameInput.value = (service && service.name) ? service.name : '';

        var priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.className = 'service-price';
        priceInput.placeholder = 'Цена от, ₽';
        priceInput.min = '0';
        priceInput.step = '1';
        priceInput.value = (service && service.priceFrom !== undefined && service.priceFrom !== null)
            ? String(service.priceFrom)
            : '';

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'service-remove-btn';
        removeBtn.textContent = 'Удалить';
        removeBtn.addEventListener('click', function () {
            row.remove();
        });

        row.appendChild(nameInput);
        row.appendChild(priceInput);
        row.appendChild(removeBtn);
        el.cfgServicesList.appendChild(row);
    }

    function updateLogoPreview() {
        el.cfgLogoPreview.onerror = function () {
            el.cfgLogoPreview.hidden = true;
        };
        el.cfgLogoPreview.hidden = false;
        el.cfgLogoPreview.src = '/api/logo?t=' + Date.now();
    }

    function onLogoUpload() {
        var file = el.cfgLogoFile.files && el.cfgLogoFile.files[0];
        if (!file) {
            showSettingsStatus('Выберите файл логотипа.', false);
            return;
        }

        var formData = new FormData();
        formData.append('logo', file);

        fetch('/api/admin/logo', {
            method: 'POST',
            body: formData
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showSettingsStatus((result.data && result.data.error) || 'Не удалось загрузить логотип.', false);
                    return;
                }
                el.cfgLogoFile.value = '';
                updateLogoPreview();
                showSettingsStatus('✓ Логотип обновлён', true);
            })
            .catch(function () {
                showSettingsStatus('Не удалось загрузить логотип. Проверьте соединение.', false);
            });
    }

    function onLogoDelete() {
        fetch('/api/admin/logo/delete', {
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showSettingsStatus((result.data && result.data.error) || 'Не удалось удалить логотип.', false);
                    return;
                }
                el.cfgLogoPreview.hidden = true;
                el.cfgLogoPreview.removeAttribute('src');
                showSettingsStatus('✓ Логотип удалён', true);
            })
            .catch(function () {
                showSettingsStatus('Не удалось удалить логотип. Проверьте соединение.', false);
            });
    }

    function onSaveSettings() {
        // Визуальный отклик на кнопке
        var originalText = el.cfgSaveBtn.textContent;
        el.cfgSaveBtn.textContent = 'Сохраняем...';
        el.cfgSaveBtn.disabled = true;

        var services = [];
        var rows = el.cfgServicesList.querySelectorAll('.service-row');

        for (var i = 0; i < rows.length; i++) {
            var nameInput = rows[i].querySelector('.service-name');
            var priceInput = rows[i].querySelector('.service-price');
            var name = str(nameInput.value);
            var priceRaw = str(priceInput.value);

            if (name === '' && priceRaw === '') {
                continue;
            }

            services.push({
                name: name,
                priceFrom: priceRaw === '' ? 0 : Number(priceRaw)
            });
        }

        var payload = {
            companyName: el.cfgCompanyName.value,
            title: el.cfgTitle.value,
            theme: el.cfgTheme.value,
            tagline: el.cfgTagline.value,
            address: el.cfgAddress.value,
            workHours: el.cfgWorkHours.value,
            colors: {
                primary: el.cfgColorPrimaryHex.value,
                accent: el.cfgColorAccentHex.value
            },
            telegramUrl: el.cfgTelegram.value,
            whatsappUrl: el.cfgWhatsapp.value,
            contacts: {
                phone: el.cfgPhone.value,
                telegram: el.cfgTelegram.value,
                whatsapp: el.cfgWhatsapp.value,
                max: el.cfgMax.value
            },
            advantages: getAdvantagesFromForm(),
            services: services
        };

        fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    el.cfgSaveBtn.textContent = originalText;
                    el.cfgSaveBtn.disabled = false;
                    showSettingsStatus((result.data && result.data.error) || 'Не удалось сохранить настройки.', false);
                    return;
                }
                // Показываем успех на кнопке
                el.cfgSaveBtn.textContent = 'Сохранено ✓';
                setTimeout(function () {
                    el.cfgSaveBtn.textContent = originalText;
                    el.cfgSaveBtn.disabled = false;
                }, 2000);
                
                showSettingsStatus('✓ Настройки успешно сохранены!', true);
                showToast('✓ Настройки успешно сохранены!', true);
                loadConfig();
            })
            .catch(function () {
                el.cfgSaveBtn.textContent = originalText;
                el.cfgSaveBtn.disabled = false;
                showSettingsStatus('Не удалось сохранить настройки. Проверьте соединение.', false);
            });
    }

    function showToast(message, isSuccess) {
        var toast = document.createElement('div');
        toast.className = 'toast-banner';
        if (isSuccess) {
            toast.classList.add('success');
        } else {
            toast.classList.add('error');
        }
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function () {
            toast.classList.add('show');
        }, 10);

        setTimeout(function () {
            toast.classList.remove('show');
            setTimeout(function () {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    function showSettingsStatus(message, ok) {
        el.cfgSaveStatus.textContent = message;
        el.cfgSaveStatus.className = 'save-status ' + (ok ? 'ok' : 'fail');
        if (ok) {
            setTimeout(function () {
                el.cfgSaveStatus.textContent = '';
            }, 3000);
        }
    }

    // ---------- Вкладка «Уведомления и доступ» ----------

    function loadNotifications() {
        fetch('/api/admin/config', {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            cache: 'no-store'
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    return;
                }
                var notifications = (result.data.config && result.data.config.notifications) || {};
                el.notifTelegram.checked = notifications.telegram === true;
                el.notifMax.checked = notifications.max === true;
                el.notifWhatsapp.checked = notifications.whatsapp === true;
            })
            .catch(function () {
                // Не критично: чекбоксы останутся в состоянии по умолчанию.
            });
    }

    function onSaveNotifications() {
        var payload = {
            telegram: el.notifTelegram.checked,
            max: el.notifMax.checked,
            whatsapp: el.notifWhatsapp.checked
        };

        fetch('/api/admin/config/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showNotifStatus((result.data && result.data.error) || 'Не удалось сохранить настройки.', false);
                    return;
                }
                showNotifStatus('✓ Сохранено', true);
            })
            .catch(function () {
                showNotifStatus('Не удалось сохранить настройки. Проверьте соединение.', false);
            });
    }

    function showNotifStatus(message, ok) {
        el.saveNotifStatus.textContent = message;
        el.saveNotifStatus.className = 'save-status ' + (ok ? 'ok' : 'fail');
        if (ok) {
            setTimeout(function () {
                el.saveNotifStatus.textContent = '';
            }, 3000);
        }
    }

    function sendTestNotification(channel) {
        var statusEl = channel === 'telegram' ? el.testTelegramStatus
            : channel === 'max' ? el.testMaxStatus : el.testWhatsappStatus;

        statusEl.textContent = 'Отправка…';
        statusEl.className = 'test-status';

        fetch('/api/admin/notifications/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (result.data && result.data.ok === true) {
                    statusEl.textContent = '✓ Отправлено';
                    statusEl.className = 'test-status ok';
                } else {
                    statusEl.textContent = (result.data && result.data.error) || 'Не удалось отправить тест.';
                    statusEl.className = 'test-status fail';
                }
            })
            .catch(function () {
                statusEl.textContent = 'Не удалось отправить тест. Проверьте соединение.';
                statusEl.className = 'test-status fail';
            });
    }

    function deeplinkStatusEl(channel) {
        return channel === 'telegram' ? el.deeplinkTelegramStatus : el.deeplinkMaxStatus;
    }

    function setDeeplinkStatus(channel, message, ok) {
        var statusEl = deeplinkStatusEl(channel);
        statusEl.textContent = message;
        statusEl.className = 'test-status ' + (ok ? 'ok' : 'fail');
    }

    function startDeepLink(channel) {
        setDeeplinkStatus(channel, 'Генерация ссылки…', false);

        fetch('/api/admin/deeplink/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    setDeeplinkStatus(channel, (result.data && result.data.error) || 'Не удалось создать ссылку.', false);
                    return;
                }

                var code = result.data.code;
                var deepLink = result.data.deepLink;
                // Сначала открываем окно, потом делаем fetch, чтобы не блокировалось в Safari
                var botWindow = window.open('', '_blank');
                if (botWindow) {
                    botWindow.location.href = deepLink;
                } else {
                    window.location.href = deepLink;
                }
                setDeeplinkStatus(channel, 'Откройте бота и нажмите START…', false);

                pollDeepLink(channel, code, Date.now());
            })
            .catch(function () {
                setDeeplinkStatus(channel, 'Не удалось создать ссылку. Проверьте соединение.', false);
            });
    }

    function pollDeepLink(channel, code, startedAt) {
        var timeoutMs = 5 * 60 * 1000;
        var intervalMs = 2000;
        var timer = setInterval(function () {
            if (Date.now() - startedAt > timeoutMs) {
                clearInterval(timer);
                setDeeplinkStatus(channel, 'Время истекло', false);
                return;
            }

            fetch('/api/admin/deeplink/poll?code=' + encodeURIComponent(code), {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            })
                .then(function (response) {
                    return response.json().catch(function () {
                        return { ok: false };
                    }).then(function (data) {
                        return { status: response.status, data: data };
                    });
                })
                .then(function (result) {
                    if (result.status === 401) {
                        clearInterval(timer);
                        window.location.href = '/admin/login';
                        return;
                    }
                    if (!result.data || result.data.ok !== true) {
                        clearInterval(timer);
                        setDeeplinkStatus(channel, (result.data && result.data.error) || 'Ошибка проверки подключения.', false);
                        return;
                    }
                    if (result.data.connected === true) {
                        clearInterval(timer);
                        setDeeplinkStatus(channel, '✓ Подключено', true);
                        loadNotifications();
                    }
                })
                .catch(function () {
                    // Сетевые ошибки игнорируем: повторим на следующем шаге опроса.
                });
        }, intervalMs);
    }

    function saveManualCredentials(channel) {
        var token = channel === 'telegram' ? el.manualTelegramToken.value : el.manualMaxToken.value;
        var chatId = channel === 'telegram' ? el.manualTelegramChatId.value : el.manualMaxChatId.value;
        var statusEl = deeplinkStatusEl(channel);

        if (!token.trim() || !chatId.trim()) {
            setDeeplinkStatus(channel, 'Заполните Bot Token и Chat ID.', false);
            return;
        }

        statusEl.textContent = 'Сохранение…';
        statusEl.className = 'test-status';

        fetch('/api/admin/manual-credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel, token: token.trim(), chatId: chatId.trim() })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    setDeeplinkStatus(channel, (result.data && result.data.error) || 'Не удалось сохранить настройки.', false);
                    return;
                }
                setDeeplinkStatus(channel, '✓ Сохранено', true);
                loadNotifications();
            })
            .catch(function () {
                setDeeplinkStatus(channel, 'Не удалось сохранить настройки. Проверьте соединение.', false);
            });
    }

    function onChangePassword() {
        var currentPassword = el.currentPassword.value;
        var newPassword = el.newPassword.value;
        var confirmPassword = el.confirmPassword.value;

        if (newPassword !== confirmPassword) {
            showPasswordStatus('Пароли не совпадают.', false);
            return;
        }
        if (newPassword.length < 6) {
            showPasswordStatus('Новый пароль должен быть не короче 6 символов.', false);
            return;
        }

        fetch('/api/admin/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        })
            .then(function (response) {
                return response.json().catch(function () {
                    return { ok: false, error: 'Не удалось обработать ответ сервера.' };
                }).then(function (data) {
                    return { status: response.status, data: data };
                });
            })
            .then(function (result) {
                if (result.status === 401) {
                    window.location.href = '/admin/login';
                    return;
                }
                if (!result.data || result.data.ok !== true) {
                    showPasswordStatus((result.data && result.data.error) || 'Не удалось сменить пароль.', false);
                    return;
                }
                el.currentPassword.value = '';
                el.newPassword.value = '';
                el.confirmPassword.value = '';
                showPasswordStatus('✓ Пароль изменён', true);
            })
            .catch(function () {
                showPasswordStatus('Не удалось сменить пароль. Проверьте соединение.', false);
            });
    }

    function showPasswordStatus(message, ok) {
        el.passwordStatus.textContent = message;
        el.passwordStatus.className = 'save-status ' + (ok ? 'ok' : 'fail');
        if (ok) {
            setTimeout(function () {
                el.passwordStatus.textContent = '';
            }, 3000);
        }
    }

    function generateAndRenderQR() {
        var url = window.location.origin;
        var qrGen = new window.QRCodeGenerator();
        var result = qrGen.generate(url, 512);

        el.qrImage.src = result.png;

        el.downloadPng.href = result.png;
        el.downloadPng.download = 'qr-code.png';
        el.downloadPng.hidden = false;

        var svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
        var svgUrl = URL.createObjectURL(svgBlob);
        el.downloadSvg.href = svgUrl;
        el.downloadSvg.download = 'qr-code.svg';
        el.downloadSvg.hidden = false;
    }
})();
