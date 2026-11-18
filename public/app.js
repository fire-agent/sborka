(function () {
    'use strict';

    var MAX_PHOTOS = 5;
    var MAX_SERVICES = 7;
    var CONFIG_URL = 'config.json';
    var API_URL = '/api/requests';
    var MAX_DIMENSION = 1600;
    var JPEG_QUALITY = 0.82;
    var CONFIG_ERROR_TEXT = 'Не удалось загрузить настройки (config.json). ' +
        'Если вы открыли файл двойным щелчком — запустите проверку по инструкции в README.';
    var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

    var photos = [];
    var photoUrls = [];
    var services = [];
    var selectedServices = [];

    var el = {};
    var advantages = [];
    var address = '';
    var workHours = '';
    var telegramUrl = '';
    var whatsappUrl = '';

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        el.name = document.getElementById('name');
        el.contact = document.getElementById('contact');
        el.contactError = document.getElementById('contactError');
        setupPhoneMask();
        el.service = document.getElementById('service');
        el.serviceField = document.getElementById('serviceField');
        el.serviceError = document.getElementById('serviceError');
        el.addServiceBtn = document.getElementById('addServiceBtn');
        el.selectedServices = document.getElementById('selectedServices');
        el.priceInfo = document.getElementById('priceInfo');
        el.description = document.getElementById('description');
        el.photoInput = document.getElementById('photoInput');
        el.counter = document.getElementById('counter');
        el.preview = document.getElementById('preview');
        el.photoErrors = document.getElementById('photoErrors');
        el.submitBtn = document.getElementById('submitBtn');
        el.agreement = document.getElementById('agreement');
        el.website = document.getElementById('website');
        el.result = document.getElementById('result');
        el.configError = document.getElementById('configError');
        el.companyName = document.getElementById('companyName');
        el.companyLogo = document.getElementById('company-logo');
        el.pageTitle = document.getElementById('pageTitle');
        el.pageTabTitle = document.getElementById('pageTabTitle');
        el.subtitle = document.getElementById('subtitle');
        el.headerPhone = document.getElementById('headerPhone');
        el.footerContacts = document.getElementById('footerContacts');
        el.heroTitle = document.getElementById('heroTitle');
        el.heroTagline = document.getElementById('heroTagline');
        el.ctaButton = document.getElementById('ctaButton');
        el.advantagesGrid = document.getElementById('advantagesGrid');
        el.footerAddress = document.getElementById('footerAddress');
        el.footerHours = document.getElementById('footerHours');
        el.headerMessaging = document.getElementById('headerMessaging');

        updateCounter();

        el.ctaButton.addEventListener('click', scrollToForm);

        el.photoInput.addEventListener('change', onFilesSelected);
        el.submitBtn.addEventListener('click', handleSubmit);
        el.service.addEventListener('change', onServiceChange);
        el.addServiceBtn.addEventListener('click', addService);

        applyDemoFromUrl();
        loadConfig();
        loadCompanyLogo();
    }

    // ---------- Настройки (config.json) ----------

    function applyDemoFromUrl() {
        try {
            var urlParams = new URLSearchParams(window.location.search);
            var demoParam = urlParams.get('demo');
            if (demoParam) {
                var demoValue = String(demoParam).trim().toLowerCase();
                if (demoValue === 'windows' || demoValue === 'furniture' || demoValue === 'cleaning') {
                    CONFIG_URL = 'configs/' + demoValue + '.json?t=' + Date.now();
                }
            }
        } catch (e) {
            // Ignore URL parsing errors
        }
    }

    function loadConfig() {
        var cacheBustedUrl = CONFIG_URL;
        if (CONFIG_URL.indexOf('?') === -1) {
            cacheBustedUrl = CONFIG_URL + '?t=' + Date.now();
        } else {
            cacheBustedUrl = CONFIG_URL + '&t=' + Date.now();
        }
        fetch(cacheBustedUrl, { cache: 'no-cache' })
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

    // Возвращает непустую строку или '' (значения не строкового типа игнорируются)
    function str(value) {
        return (typeof value === 'string') ? value.trim() : '';
    }

    // Логотип компании: показываем, только если сервер действительно отдал изображение
    function loadCompanyLogo() {
        var logo = el.companyLogo;
        logo.onload = function () {
            logo.style.display = 'inline-block';
        };
        logo.onerror = function () {
            logo.style.display = 'none';
        };
        logo.src = '/api/logo?t=' + Date.now();
    }

    function isHttpsUrl(value) {
        return typeof value === 'string' && value.indexOf('https://') === 0;
    }

    function applyConfig(config) {
        // applyConfig сам не должен ломать страницу: каждую часть применяем отдельно
        var steps = [applyTexts, applyColors, applyContacts, applyServices];
        for (var i = 0; i < steps.length; i++) {
            try {
                steps[i](config);
            } catch (e) {
                showConfigError();
            }
        }
    }

    function applyTexts(config) {
        var companyName = str(config.companyName);
        var title = str(config.title);
        var subtitle = str(config.subtitle);

        if (companyName) el.companyName.textContent = companyName;
        if (title) {
            el.pageTitle.textContent = title;
            if (el.pageTabTitle) el.pageTabTitle.textContent = title;
        }
        if (subtitle) el.subtitle.textContent = subtitle;
    }

    function applyColors(config) {
        var colors = (config.colors && typeof config.colors === 'object') ? config.colors : {};
        var root = document.documentElement;

        if (typeof colors.primary === 'string' && COLOR_RE.test(colors.primary.trim())) {
            root.style.setProperty('--primary', colors.primary.trim());
        }
        if (typeof colors.accent === 'string' && COLOR_RE.test(colors.accent.trim())) {
            root.style.setProperty('--accent', colors.accent.trim());
        }
    }

    function applyContacts(config) {
        var contacts = (config.contacts && typeof config.contacts === 'object') ? config.contacts : {};
        var phone = str(contacts.phone);
        var phoneDigits = phone.replace(/[^+\d]/g, '');

        el.headerPhone.hidden = true;
        el.footerContacts.hidden = true;
        el.footerContacts.textContent = '';

        var footerCount = 0;

        if (phone && /\d/.test(phoneDigits)) {
            el.headerPhone.textContent = phone;
            el.headerPhone.setAttribute('href', 'tel:' + phoneDigits);
            el.headerPhone.hidden = false;

            el.footerContacts.appendChild(createLink('tel:' + phoneDigits, phone, false));
            footerCount++;
        }

        var messengers = [
            { key: 'telegram', label: 'Telegram' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'max', label: 'MAX' }
        ];

        for (var i = 0; i < messengers.length; i++) {
            var link = str(contacts[messengers[i].key]);
            if (link && isHttpsUrl(link)) {
                el.footerContacts.appendChild(createLink(link, messengers[i].label, true));
                footerCount++;
            }
        }

        if (footerCount > 0) {
            el.footerContacts.hidden = false;
        }
    }

    function createLink(href, text, external) {
        var a = document.createElement('a');
        a.setAttribute('href', href);
        a.textContent = text;
        if (external) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
        }
        return a;
    }

    function formatPrice(value) {
        return 'от ' + value.toLocaleString('ru-RU') + ' ₽';
    }

    function applyServices(config) {
        services = [];
        selectedServices = [];
        if (Array.isArray(config.services)) {
            for (var i = 0; i < config.services.length; i++) {
                var item = config.services[i];
                if (!item || typeof item !== 'object') continue;
                var name = str(item.name);
                if (!name) continue;

                var price = null;
                if (typeof item.priceFrom === 'number' && isFinite(item.priceFrom) && item.priceFrom >= 0) {
                    price = Math.round(item.priceFrom);
                }
                services.push({ name: name, priceFrom: price });
            }
        }

        // Оставить только первый пункт «Выберите услугу»
        while (el.service.options.length > 1) {
            el.service.remove(1);
        }
        el.service.value = '';
        el.serviceError.textContent = '';

        if (services.length === 0) {
            el.serviceField.hidden = true;
            el.selectedServices.textContent = '';
            el.priceInfo.textContent = '';
            return;
        }

        for (var j = 0; j < services.length; j++) {
            var option = document.createElement('option');
            var s = services[j];
            option.value = String(j);
            option.textContent = (s.priceFrom === null) ? s.name : s.name + ' — ' + formatPrice(s.priceFrom);
            el.service.appendChild(option);
        }
        el.serviceField.hidden = false;
        renderSelectedServices();
    }

    function getSelectedService() {
        if (el.serviceField.hidden || el.service.value === '') return null;
        var index = parseInt(el.service.value, 10);
        return services[index] || null;
    }

    function onServiceChange() {
        el.serviceError.textContent = '';
        el.service.classList.remove('field-error');
        el.service.removeAttribute('aria-invalid');
    }

    function addService() {
        var s = getSelectedService();
        el.serviceError.textContent = '';
        el.service.classList.remove('field-error');
        el.service.removeAttribute('aria-invalid');

        if (!s) {
            el.serviceError.textContent = 'Выберите услугу из списка.';
            el.service.classList.add('field-error');
            el.service.setAttribute('aria-invalid', 'true');
            el.service.focus();
            return;
        }

        if (selectedServices.length >= MAX_SERVICES) {
            el.serviceError.textContent = 'Можно выбрать не больше ' + MAX_SERVICES + ' услуг.';
            return;
        }

        for (var i = 0; i < selectedServices.length; i++) {
            if (selectedServices[i].name === s.name) {
                el.serviceError.textContent = 'Эта услуга уже добавлена.';
                return;
            }
        }

        selectedServices.push(s);
        el.service.value = '';
        renderSelectedServices();
    }

    function removeService(index) {
        selectedServices.splice(index, 1);
        el.serviceError.textContent = '';
        renderSelectedServices();
    }

    function totalPrice() {
        var sum = 0;
        var unknown = false;
        for (var i = 0; i < selectedServices.length; i++) {
            var p = selectedServices[i].priceFrom;
            if (p === null) {
                unknown = true;
            } else {
                sum += p;
            }
        }
        return unknown ? null : sum;
    }

    function renderSelectedServices() {
        el.selectedServices.textContent = '';

        for (var i = 0; i < selectedServices.length; i++) {
            var chip = document.createElement('span');
            chip.className = 'selected-service';

            var label = document.createElement('span');
            label.textContent = selectedServices[i].name;
            chip.appendChild(label);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Удалить услугу');
            btn.textContent = String.fromCharCode(215);
            (function (idx) {
                btn.addEventListener('click', function () {
                    removeService(idx);
                });
            })(i);
            chip.appendChild(btn);

            el.selectedServices.appendChild(chip);
        }

        var total = totalPrice();
        if (selectedServices.length === 0) {
            el.priceInfo.textContent = '';
        } else if (total === null) {
            el.priceInfo.textContent = 'Итого ориентировочно: цена уточняется у мастера';
        } else {
            el.priceInfo.textContent = 'Итого ориентировочно: от ' + total.toLocaleString('ru-RU') + ' ₽';
        }
    }

    // ---------- Фото (Этап 1) ----------

    function onFilesSelected(e) {
        addFiles(e.target.files);
        e.target.value = '';
    }

    // Сжимает изображение до 1600px по длинной стороне и JPEG-качества 0.82.
    // Если сжать не удалось, возвращает исходный файл без изменений.
    function compressImage(file) {
        return new Promise(function (resolve) {
            if (!file.type.startsWith('image/')) {
                resolve(file);
                return;
            }

            var reader = new FileReader();
            reader.onload = function (e) {
                var img = new Image();
                img.onload = function () {
                    var width = img.width;
                    var height = img.height;

                    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                        if (width > height) {
                            height = Math.round((height * MAX_DIMENSION) / width);
                            width = MAX_DIMENSION;
                        } else {
                            width = Math.round((width * MAX_DIMENSION) / height);
                            height = MAX_DIMENSION;
                        }
                    }

                    var canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(function (blob) {
                        if (!blob) {
                            resolve(file);
                            return;
                        }
                        var compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', JPEG_QUALITY);
                };
                img.onerror = function () {
                    resolve(file);
                };
                img.src = e.target.result;
            };
            reader.onerror = function () {
                resolve(file);
            };
            reader.readAsDataURL(file);
        });
    }

    function addFiles(fileList) {
        var errors = [];
        var overflowShown = false;
        var candidates = [];

        for (var i = 0; i < fileList.length; i++) {
            var file = fileList[i];

            if (photos.length + candidates.length >= MAX_PHOTOS) {
                if (!overflowShown) {
                    errors.push('Можно не больше ' + MAX_PHOTOS + ' фото. Лишние файлы не добавлены.');
                    overflowShown = true;
                }
                break;
            }

            if (!file.type.startsWith('image/')) {
                errors.push('Файл не является изображением и не добавлен: ' + file.name);
                continue;
            }

            candidates.push(file);
        }

        setMessages(el.photoErrors, errors);

        if (candidates.length === 0) {
            updateCounter();
            return;
        }

        setMessages(el.photoErrors, ['Сжатие изображений…']);

        var compressed = [];
        var chain = Promise.resolve();

        candidates.forEach(function (file) {
            chain = chain.then(function () {
                return compressImage(file).then(function (result) {
                    compressed.push(result);
                });
            });
        });

        chain.then(function () {
            setMessages(el.photoErrors, errors);
            photos = photos.concat(compressed);
            renderPhotoList();
            updateCounter();
        }).catch(function () {
            var messages = errors.concat(['Не удалось обработать изображения.']);
            setMessages(el.photoErrors, messages);
            updateCounter();
        });
    }

    // Выводит список сообщений абзацами через textContent
    function setMessages(container, messages) {
        container.textContent = '';
        for (var i = 0; i < messages.length; i++) {
            var p = document.createElement('p');
            p.textContent = messages[i];
            container.appendChild(p);
        }
    }

    function renderPhotoList() {
        // Освободить ссылки, созданные при прошлой отрисовке (защита от утечки памяти)
        for (var u = 0; u < photoUrls.length; u++) {
            URL.revokeObjectURL(photoUrls[u]);
        }
        photoUrls = [];

        el.preview.textContent = '';

        photos.forEach(function (file, index) {
            var url = URL.createObjectURL(file);
            photoUrls.push(url);

            var item = document.createElement('div');
            item.className = 'preview-item';

            var img = document.createElement('img');
            img.src = url;
            img.alt = 'Фото ' + (index + 1);
            item.appendChild(img);

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'remove-btn';
            btn.setAttribute('aria-label', 'Удалить фото ' + (index + 1));
            btn.textContent = String.fromCharCode(215); // ×

            (function (idx) {
                btn.addEventListener('click', function () {
                    removePhoto(idx);
                });
            })(index);

            item.appendChild(btn);
            el.preview.appendChild(item);
        });
    }

    function removePhoto(index) {
        if (index < 0 || index >= photos.length) return;
        photos.splice(index, 1);
        el.photoErrors.textContent = '';
        renderPhotoList();
        updateCounter();
    }

    function updateCounter() {
        el.counter.textContent = 'Выбрано: ' + photos.length + ' из ' + MAX_PHOTOS;
    }

    // ---------- Маска телефона ----------

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

    function onContactInput() {
        var value = el.contact.value;
        var caret = el.contact.selectionStart;
        var digitsBeforeCaret = extractDigits(value.slice(0, caret)).length;

        var rawDigits = extractDigits(value);
        // Если ввод начался не с 7 и не с 8, форматтер добавит ведущую 7 —
        // учитываем её, чтобы курсор остался после тех же введённых цифр.
        var addsLeadingSeven = Boolean(rawDigits && rawDigits[0] !== '7' && rawDigits[0] !== '8');

        var formatted = formatPhoneMask(value);
        el.contact.value = formatted;

        var targetDigits = digitsBeforeCaret + (addsLeadingSeven ? 1 : 0);
        var newCaret = findCaretForDigits(formatted, targetDigits);
        el.contact.setSelectionRange(newCaret, newCaret);
    }

    function onContactPaste(event) {
        event.preventDefault();
        var text = '';
        try {
            text = (event.clipboardData || window.clipboardData).getData('text');
        } catch (e) {
            // Игнорируем недоступный буфер обмена
        }
        el.contact.value = formatPhoneMask(text);
        var end = el.contact.value.length;
        el.contact.setSelectionRange(end, end);
    }

    function onContactFocus() {
        if (!el.contact.value) {
            el.contact.value = '+7 (';
        }
    }

    function onContactBlur() {
        var value = el.contact.value.trim();
        if (value === '+7 (' || value === '+7') {
            el.contact.value = '';
        }
    }

    function setupPhoneMask() {
        el.contact.addEventListener('input', onContactInput);
        el.contact.addEventListener('paste', onContactPaste);
        el.contact.addEventListener('focus', onContactFocus);
        el.contact.addEventListener('blur', onContactBlur);
    }

    // ---------- Проверка формы ----------

    function isRussianPhone(value) {
        // 1. Проверка на недопустимые символы: буквы, лишние символы, второй плюс
        if ( /[^+\d()\s-]/.test(value) ) {
            return false;
        }

        // 2. Плюс — только один и только в начале
        if ( (value.match(/\+/g) || []).length > 1 ) {
            return false;
        }
        if ( value.indexOf('+') > 0 ) {
            return false;
        }

        // 3. Проверка парности скобок: 0 или 1 пара, не пустые, не вложенные
        var openIdx = value.indexOf('(');
        var closeIdx = value.indexOf(')');

        if (openIdx !== -1 || closeIdx !== -1) {
            var secondOpen = value.indexOf('(', openIdx + 1);
            var secondClose = value.indexOf(')', closeIdx + 1);
            var inner = value.substring(openIdx + 1, closeIdx);

            if (openIdx === -1 || closeIdx === -1 ||
                closeIdx < openIdx ||
                inner.length === 0 ||
                secondOpen !== -1 || secondClose !== -1) {
                return false;
            }
        }

        // 4. Убрать разрешённые разделители: пробелы, скобки, дефисы
        var cleaned = value.replace(/[\s()-]/g, '');

        // 5. Проверка длины и префикса
        if (cleaned.length === 12 && cleaned.indexOf('+7') === 0) {
            return true;
        }
        if (cleaned.length === 11 && (cleaned[0] === '7' || cleaned[0] === '8')) {
            return true;
        }

        return false;
    }

    function validate() {
        var errors = [];

        var phone = el.contact.value.trim();
        var phoneDigits = extractDigits(phone);
        if (!phone) {
            errors.push({ field: 'contact', msg: 'Укажите телефон.' });
        } else if (phoneDigits.length !== 11 || phoneDigits[0] !== '7') {
            errors.push({ field: 'contact', msg: 'Укажите российский телефон в формате +7 999 999-99-99' });
        }

        if (!el.serviceField.hidden && services.length > 0 && selectedServices.length === 0) {
            errors.push({ field: 'service', msg: 'Добавьте хотя бы одну услугу.' });
        }

        if (!el.description.value.trim()) {
            errors.push({ field: 'description', msg: 'Опишите проблему.' });
        }

        if (photos.length < 1) {
            errors.push({ field: 'photos', msg: 'Приложите от 1 до ' + MAX_PHOTOS + ' фото.' });
        }

        if (!el.agreement.checked) {
            errors.push({ field: 'agreement', msg: 'Необходимо согласие на обработку персональных данных.' });
        }

        return errors;
    }

    function clearFieldErrors() {
        el.result.textContent = '';
        el.result.className = '';
        el.contact.classList.remove('field-error');
        el.contact.removeAttribute('aria-invalid');
        el.contactError.textContent = '';
        el.service.classList.remove('field-error');
        el.service.removeAttribute('aria-invalid');
        el.serviceError.textContent = '';
        el.description.classList.remove('field-error');
        el.photoErrors.textContent = '';
    }

    function showValidationErrors(errors) {
        var messages = [];
        var firstField = null;

        for (var j = 0; j < errors.length; j++) {
            var err = errors[j];
            messages.push(err.msg);

            if (err.field === 'contact') {
                el.contact.classList.add('field-error');
                el.contact.setAttribute('aria-invalid', 'true');
                el.contactError.textContent = err.msg;
                if (!firstField) firstField = el.contact;
            } else if (err.field === 'service') {
                el.service.classList.add('field-error');
                el.service.setAttribute('aria-invalid', 'true');
                el.serviceError.textContent = err.msg;
                if (!firstField) firstField = el.service;
            } else if (err.field === 'description') {
                el.description.classList.add('field-error');
                if (!firstField) firstField = el.description;
            } else if (err.field === 'photos') {
                if (!firstField) firstField = el.photoInput;
            } else if (err.field === 'agreement') {
                if (!firstField) firstField = el.agreement;
            }
        }

        el.result.className = 'errors';
        setMessages(el.result, messages);

        if (firstField) {
            firstField.focus();
        }
    }

    function setLoading(isLoading) {
        el.submitBtn.disabled = isLoading;
        el.submitBtn.textContent = isLoading ? 'Отправка…' : 'Отправить заявку';
    }

    function resetForm() {
        el.name.value = '';
        el.contact.value = '';
        el.description.value = '';
        el.service.value = '';
        selectedServices = [];
        el.priceInfo.textContent = '';
        el.serviceError.textContent = '';
        el.contactError.textContent = '';
        renderSelectedServices();

        for (var u = 0; u < photoUrls.length; u++) {
            URL.revokeObjectURL(photoUrls[u]);
        }
        photoUrls = [];
        photos = [];
        el.preview.textContent = '';
        updateCounter();
    }

    function handleSubmit() {
        clearFieldErrors();

        var errors = validate();
        if (errors.length > 0) {
            showValidationErrors(errors);
            return;
        }

        var formData = new FormData();
        formData.append('name', el.name.value.trim());
        formData.append('phone', formatPhoneMask(el.contact.value));
        formData.append('description', el.description.value.trim());
        formData.append('website', el.website.value);

        // Отправляем параметр demo, чтобы сервер мог загрузить правильный конфиг
        if (CONFIG_URL.indexOf('configs/windows.json') !== -1) {
            formData.append('demo', 'windows');
        } else if (CONFIG_URL.indexOf('configs/furniture.json') !== -1) {
            formData.append('demo', 'furniture');
        } else if (CONFIG_URL.indexOf('configs/cleaning.json') !== -1) {
            formData.append('demo', 'cleaning');
        }

        for (var i = 0; i < selectedServices.length; i++) {
            formData.append('service', selectedServices[i].name);
        }

        for (var j = 0; j < photos.length; j++) {
            formData.append('photos', photos[j], photos[j].name);
        }

        setLoading(true);

        fetch(API_URL, {
            method: 'POST',
            body: formData
        })
            .then(function (response) {
                return response.json()
                    .then(function (data) {
                        return { ok: response.ok, status: response.status, data: data };
                    })
                    .catch(function () {
                        return { ok: response.ok, status: response.status, data: null };
                    });
            })
            .then(function (result) {
                if (result.ok) {
                    resetForm();
                    el.result.className = 'success';
                    el.result.textContent = 'Заявка отправлена. Мы свяжемся с вами в ближайшее время.';
                } else {
                    var msg = (result.data && result.data.error)
                        ? result.data.error
                        : 'Не удалось отправить заявку. Попробуйте ещё раз.';
                    el.result.className = 'errors';
                    el.result.textContent = msg;
                }
            })
            .catch(function () {
                el.result.className = 'errors';
                el.result.textContent = 'Сервер недоступен. Проверьте соединение и попробуйте ещё раз.';
            })
            .then(function () {
                setLoading(false);
            });
    }

    // ---------- Витрина сайта (website) ----------

    function renderAdvantages() {
        el.advantagesGrid.innerHTML = '';
        advantages.forEach(function (adv) {
            var card = document.createElement('div');
            card.className = 'advantage-card';
            card.innerHTML = '<h3>' + escapeHtml(adv.title) + '</h3><p>' + escapeHtml(adv.text) + '</p>';
            el.advantagesGrid.appendChild(card);
        });
        el.advantagesGrid.hidden = advantages.length === 0;
    }

    function updateHeaderMessaging() {
        var hasTelegram = telegramUrl && telegramUrl.trim() !== '';
        var hasWhatsApp = whatsappUrl && whatsappUrl.trim() !== '';

        el.headerMessaging.hidden = !hasTelegram && !hasWhatsApp;

        if (hasTelegram) {
            var tgBtn = el.headerMessaging.querySelector('.telegram-icon');
            tgBtn.href = telegramUrl;
            tgBtn.hidden = false;
        }
        if (hasWhatsApp) {
            var waBtn = el.headerMessaging.querySelector('.whatsapp-icon');
            waBtn.href = whatsappUrl;
            waBtn.hidden = false;
        }
    }

    function scrollToForm() {
        var firstField = document.querySelector('input[type="text"], textarea');
        if (firstField) {
            firstField.scrollIntoView({ behavior: 'smooth', block: 'start' });
            firstField.focus();
        }
    }

    function escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#039;');
    }

    function applyConfig(config) {
        // applyConfig сам не должен ломать страницу: каждую часть применяем отдельно
        var steps = [applyTexts, applyColors, applyContacts, applyServices, applyWebsite];
        for (var i = 0; i < steps.length; i++) {
            try {
                steps[i](config);
            } catch (e) {
                showConfigError();
            }
        }
    }

    function applyWebsite(config) {
        address = str(config.address);
        workHours = str(config.workHours);
        telegramUrl = str(config.telegramUrl);
        whatsappUrl = str(config.whatsappUrl);
        advantages = Array.isArray(config.advantages) ? config.advantages.slice(0, 3) : [];

        // Обновление Hero
        var heroTitle = str(config.title) || str(config.companyName);
        if (heroTitle) {
            el.heroTitle.textContent = heroTitle;
        }
        if (config.tagline) {
            el.heroTagline.textContent = config.tagline;
        }

        // Advantages
        renderAdvantages();

        // Footer
        if (address) {
            el.footerAddress.textContent = address;
            el.footerAddress.hidden = false;
        }
        if (workHours) {
            el.footerHours.textContent = workHours;
            el.footerHours.hidden = false;
        }

        // Header messaging
        updateHeaderMessaging();
    }

})();
