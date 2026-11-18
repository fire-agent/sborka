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

        el.searchInput.addEventListener('input', debounce(onSearchChange, 400));
        el.logoutBtn.addEventListener('click', onLogout);
        el.loadMoreBtn.addEventListener('click', onLoadMore);
        el.lightboxClose.addEventListener('click', closeLightbox);
        el.lightbox.addEventListener('click', function (event) {
            if (event.target === el.lightbox) {
                closeLightbox();
            }
        });

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
})();
