(function () {
    'use strict';

    var CONFIG_URL = '/config.json';
    var API_URL = '/api/requests';

    // Запасные данные, если config.json (или поле landing) не загрузился.
    var FALLBACK_LANDING = {
        productName: 'Готовое приложение для приёма заявок',
        niches: [
            {
                key: 'okna',
                label: 'Окна',
                demoUrl: '/okna',
                title: 'Готовый сайт + мобильное приложение и мини-CRM для мастера по ремонту окон за 1 день',
                subtitle: 'Витрина с прайсом, приём фото-заявок в Telegram и MAX, QR-визитки и учёт клиентов — запускаем под ключ за 1 день.',
                palette: { primary: '#2563eb', accent: '#3b82f6', soft: '#eff6ff', ink: '#1e3a8a' }
            },
            {
                key: 'mebel',
                label: 'Мебель',
                demoUrl: '/mebel',
                title: 'Сайт с расчётом стоимости и приёмом фото-заявок в Telegram для мебельного цеха и перетяжки',
                subtitle: 'Клиент считает стоимость, прикладывает фото и сразу отправляет заявку вам в Telegram — без звонков и потери заказов.',
                palette: { primary: '#d97706', accent: '#f59e0b', soft: '#fffbeb', ink: '#92400e' }
            },
            {
                key: 'cleaning',
                label: 'Клининг',
                demoUrl: '/cleaning',
                title: 'Сайт-витрина с прайс-листом, QR-кодом для визиток и приёмом заявок для клининга',
                subtitle: 'Клиент выбирает услугу, видит цену и отправляет заявку в один клик. QR-код на визитке ведёт сразу на витрину.',
                palette: { primary: '#0d9488', accent: '#14b8a6', soft: '#f0fdfa', ink: '#115e59' }
            }
        ],
        benefits: [
            { icon: '🔗', title: 'Свой сайт по ссылке', text: 'Получаете постоянную ссылку на свою витрину — отправляйте её клиентам в мессенджерах и соцсетях.' },
            { icon: '📲', title: 'Установка как PWA на смартфон', text: 'Сайт добавляется на главный экран телефона как приложение — работает без магазина приложений.' },
            { icon: '📸', title: 'Приём фото-заявок в Telegram и MAX в 1 клик', text: 'Клиент прикладывает до 5 фото, и заявка сразу прилетает вам в мессенджер.' },
            { icon: '🗂️', title: 'Мини-CRM со скидками', text: 'Все заявки и клиенты в одном кабинете: статусы, скидки и финальная цена заказа.' },
            { icon: '🔳', title: 'Генератор QR-кодов для визиток', text: 'QR-код ведёт прямо на вашу витрину — печатайте на визитках, машине и баннерах.' },
            { icon: '🛠️', title: 'Смена цен и логотипа с телефона', text: 'Прайс, логотип и контакты обновляются из кабинета за пару минут — без программиста.' }
        ],
        tariffs: [
            {
                key: 'light',
                label: 'Лёгкий старт',
                price: '2 900 ₽',
                priceNote: 'запуск «под ключ» + 490 ₽/мес всё включено',
                features: [
                    'Свой сайт и PWA-приложение',
                    'Хостинг и постоянная ссылка',
                    'Приём фото-заявок в Telegram и MAX',
                    'Мини-CRM и QR-визитки',
                    'Обновления и поддержка'
                ]
            },
            {
                key: 'own',
                label: 'Всё моё',
                price: '6 900 ₽',
                priceNote: 'разово с установкой на ваш хостинг без абонентской платы',
                features: [
                    'Полный код проекта',
                    'Установка на ваш сервер',
                    'Без ежемесячных платежей',
                    'Все функции комплекта',
                    'Свободная доработка'
                ]
            }
        ],
        seller: {
            name: 'ИП Мазняк Игорь Владимирович',
            inn: '272111426020',
            ogrnip: '326270000004371',
            phone: '+7 (933) 206-81-73',
            email: 'igofresh@ya.ru'
        }
    };

    var landing = null;
    var currentNiche = null;
    var currentView = 'site'; // 'site' | 'admin'

    var els = {};

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        els.brandName = document.getElementById('brandName');
        els.brandNameFooter = document.getElementById('brandNameFooter');
        els.nicheSwitcher = document.getElementById('nicheSwitcher');
        els.heroTitle = document.getElementById('heroTitle');
        els.heroSubtitle = document.getElementById('heroSubtitle');
        els.ctaOrder = document.getElementById('ctaOrder');
        els.ctaDemo = document.getElementById('ctaDemo');
        els.liveFrame = document.getElementById('liveFrame');
        els.adminCard = document.getElementById('adminCard');
        els.adminNicheName = document.getElementById('adminNicheName');
        els.adminDiscount = document.getElementById('adminDiscount');
        els.openFull = document.getElementById('openFull');
        els.benefitsGrid = document.getElementById('benefitsGrid');
        els.tariffsGrid = document.getElementById('tariffsGrid');
        els.nicheSelect = document.getElementById('niche');
        els.tariffSelect = document.getElementById('tariff');
        els.orderForm = document.getElementById('orderForm');
        els.nameInput = document.getElementById('name');
        els.contactInput = document.getElementById('contact');
        els.contactError = document.getElementById('contactError');
        els.submitBtn = document.getElementById('submitBtn');
        els.formStatus = document.getElementById('formStatus');
        els.sellerName = document.getElementById('sellerName');
        els.sellerInn = document.getElementById('sellerInn');
        els.sellerOgrnip = document.getElementById('sellerOgrnip');
        els.sellerPhone = document.getElementById('sellerPhone');
        els.sellerEmail = document.getElementById('sellerEmail');
        els.offerLink = document.getElementById('offerLink');
        els.privacyLink = document.getElementById('privacyLink');
        els.legalModal = document.getElementById('legalModal');
        els.legalTitle = document.getElementById('legalTitle');
        els.legalBody = document.getElementById('legalBody');
        els.legalClose = document.getElementById('legalClose');

        // Переключатель ниш в шапке
        els.nicheSwitcher.addEventListener('click', function (e) {
            var btn = e.target.closest('.l-niche-btn');
            if (!btn) return;
            var key = btn.getAttribute('data-niche');
            selectNiche(key, false);
        });

        // Вкладки живого макета
        document.querySelectorAll('.l-mockup-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                setView(tab.getAttribute('data-view'));
            });
        });

        // Smart phone formatting for contact input
        els.contactInput.addEventListener('input', onContactInput);

        // Отправка формы
        els.orderForm.addEventListener('submit', onSubmit);

        // Юридическое модальное окно
        els.offerLink.addEventListener('click', function () { openLegal('offer'); });
        els.privacyLink.addEventListener('click', function () { openLegal('privacy'); });
        els.legalClose.addEventListener('click', closeLegal);
        els.legalModal.querySelector('[data-close]').addEventListener('click', closeLegal);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !els.legalModal.hidden) closeLegal();
        });

        loadConfig();
    }

    // ---------- Конфигурация ----------

    function loadConfig() {
        fetch(CONFIG_URL, { cache: 'no-cache' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (config) {
                if (config && config.landing && typeof config.landing === 'object') {
                    landing = config.landing;
                } else {
                    landing = FALLBACK_LANDING;
                }
                applyLanding();
            })
            .catch(function () {
                landing = FALLBACK_LANDING;
                applyLanding();
            });
    }

    function applyLanding() {
        var productName = typeof landing.productName === 'string' && landing.productName.trim()
            ? landing.productName.trim()
            : FALLBACK_LANDING.productName;
        els.brandName.textContent = productName;
        els.brandNameFooter.textContent = productName;
        document.title = productName;

        renderNicheSwitcher();
        renderBenefits();
        renderTariffs();
        renderSeller();
        populateOrderSelects();

        var initialKey = detectNicheFromUrl() || (landing.niches[0] && landing.niches[0].key);
        selectNiche(initialKey, true);
    }

    function detectNicheFromUrl() {
        var pathname = window.location.pathname.replace(/\/+$/, '') || '/';
        var match = pathname.match(/promo-(okna|mebel|cleaning)/);
        return match ? match[1] : null;
    }

    function nicheByKey(key) {
        var list = Array.isArray(landing.niches) ? landing.niches : FALLBACK_LANDING.niches;
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === key) return list[i];
        }
        return null;
    }

    function renderNicheSwitcher() {
        var list = Array.isArray(landing.niches) ? landing.niches : FALLBACK_LANDING.niches;
        var buttons = els.nicheSwitcher.querySelectorAll('.l-niche-btn');
        buttons.forEach(function (btn) {
            var key = btn.getAttribute('data-niche');
            var niche = nicheByKey(key);
            if (niche) btn.textContent = niche.label;
        });
    }

    // ---------- Выбор ниши ----------

    function selectNiche(key, replaceUrl) {
        var niche = nicheByKey(key);
        if (!niche) niche = nicheByKey('okna');
        currentNiche = niche;

        applyPalette(niche.palette);

        els.heroTitle.textContent = niche.title;
        els.heroSubtitle.textContent = niche.subtitle;
        els.ctaDemo.setAttribute('href', niche.demoUrl);
        els.openFull.setAttribute('href', niche.demoUrl);
        els.adminNicheName.textContent = niche.label;

        if (currentView === 'site') {
            els.liveFrame.setAttribute('src', niche.demoUrl);
        }

        // Подсветка активной кнопки
        els.nicheSwitcher.querySelectorAll('.l-niche-btn').forEach(function (btn) {
            var active = btn.getAttribute('data-niche') === niche.key;
            btn.classList.toggle('is-active', active);
            if (active) btn.setAttribute('aria-current', 'true');
            else btn.removeAttribute('aria-current');
        });

        // Синхронизация селекта ниши в форме
        if (els.nicheSelect) els.nicheSelect.value = niche.key;

        if (replaceUrl) {
            try {
                var url = '/promo-' + niche.key;
                window.history.replaceState(null, '', url);
            } catch (e) {
                // не критично
            }
        }
    }

    function applyPalette(palette) {
        var root = document.documentElement;
        var p = (palette && typeof palette === 'object') ? palette : {};
        if (p.primary) root.style.setProperty('--l-primary', p.primary);
        if (p.accent) root.style.setProperty('--l-accent', p.accent);
        if (p.soft) root.style.setProperty('--l-soft', p.soft);
        if (p.ink) root.style.setProperty('--l-ink', p.ink);
    }

    // ---------- Живой макет ----------

    function setView(view) {
        currentView = view;
        var isSite = view === 'site';

        els.liveFrame.hidden = !isSite;
        els.adminCard.hidden = isSite;

        document.querySelectorAll('.l-mockup-tab').forEach(function (tab) {
            var active = tab.getAttribute('data-view') === view;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        if (isSite && currentNiche) {
            els.liveFrame.setAttribute('src', currentNiche.demoUrl);
        }
    }

    // ---------- Блок «Что входит в комплект» ----------

    function renderBenefits() {
        var list = Array.isArray(landing.benefits) ? landing.benefits : FALLBACK_LANDING.benefits;
        els.benefitsGrid.textContent = '';
        list.forEach(function (b) {
            var card = document.createElement('article');
            card.className = 'l-benefit';

            var icon = document.createElement('div');
            icon.className = 'l-benefit-icon';
            icon.textContent = b.icon || '✓';

            var title = document.createElement('h3');
            title.className = 'l-benefit-title';
            title.textContent = b.title || '';

            var text = document.createElement('p');
            text.className = 'l-benefit-text';
            text.textContent = b.text || '';

            card.appendChild(icon);
            card.appendChild(title);
            card.appendChild(text);
            els.benefitsGrid.appendChild(card);
        });
    }

    // ---------- Тарифы ----------

    function renderTariffs() {
        var list = Array.isArray(landing.tariffs) ? landing.tariffs : FALLBACK_LANDING.tariffs;
        els.tariffsGrid.textContent = '';
        list.forEach(function (t, index) {
            var card = document.createElement('article');
            card.className = 'l-tariff';
            if (index === 0) card.classList.add('is-featured');

            if (index === 0) {
                var badge = document.createElement('span');
                badge.className = 'l-tariff-badge';
                badge.textContent = 'Популярный';
                card.appendChild(badge);
            }

            var label = document.createElement('h3');
            label.className = 'l-tariff-label';
            label.textContent = t.label || '';

            var price = document.createElement('div');
            price.className = 'l-tariff-price';
            price.textContent = t.price || '';

            var note = document.createElement('p');
            note.className = 'l-tariff-note';
            note.textContent = t.priceNote || '';

            var features = document.createElement('ul');
            features.className = 'l-tariff-features';
            (Array.isArray(t.features) ? t.features : []).forEach(function (f) {
                var li = document.createElement('li');
                li.textContent = f;
                features.appendChild(li);
            });

            var select = document.createElement('button');
            select.type = 'button';
            select.className = 'l-btn l-btn-primary l-btn-block';
            select.setAttribute('data-tariff', t.key || '');
            select.textContent = 'Выбрать «' + (t.label || '') + '»';
            select.addEventListener('click', function () {
                selectTariff(t.key || '');
                document.getElementById('order').scrollIntoView({ behavior: 'smooth' });
            });

            card.appendChild(label);
            card.appendChild(price);
            card.appendChild(note);
            card.appendChild(features);
            card.appendChild(select);
            els.tariffsGrid.appendChild(card);
        });
    }

    function populateOrderSelects() {
        var niches = Array.isArray(landing.niches) ? landing.niches : FALLBACK_LANDING.niches;
        els.nicheSelect.textContent = '';
        niches.forEach(function (n) {
            var opt = document.createElement('option');
            opt.value = n.key;
            opt.textContent = n.label;
            els.nicheSelect.appendChild(opt);
        });

        var tariffs = Array.isArray(landing.tariffs) ? landing.tariffs : FALLBACK_LANDING.tariffs;
        els.tariffSelect.textContent = '';
        tariffs.forEach(function (t) {
            var opt = document.createElement('option');
            opt.value = t.key;
            opt.textContent = t.label + ' — ' + t.price;
            els.tariffSelect.appendChild(opt);
        });
    }

    function selectTariff(key) {
        els.tariffSelect.value = key;
    }

    // ---------- Продавец ----------

    function renderSeller() {
        var seller = (landing.seller && typeof landing.seller === 'object') ? landing.seller : {};
        els.sellerName.textContent = seller.name || FALLBACK_LANDING.seller.name;
        els.sellerInn.textContent = seller.inn || FALLBACK_LANDING.seller.inn;
        els.sellerOgrnip.textContent = seller.ogrnip || FALLBACK_LANDING.seller.ogrnip;
        els.sellerPhone.textContent = seller.phone || FALLBACK_LANDING.seller.phone;
        els.sellerEmail.textContent = seller.email || FALLBACK_LANDING.seller.email;
        els.sellerPhone.setAttribute('href', 'tel:' + digitsOnly(seller.phone || FALLBACK_LANDING.seller.phone));
        els.sellerEmail.setAttribute('href', 'mailto:' + (seller.email || FALLBACK_LANDING.seller.email));
    }

    function digitsOnly(value) {
        return String(value || '').replace(/[^\d+]/g, '');
    }

    // ---------- Форма заявки ----------

    function onContactInput(e) {
        var input = e.target;
        var value = input.value;
        var cursorPos = input.selectionStart;
        
        // Если есть @ или латинские буквы — это Telegram, не форматируем
        if (/@/.test(value) || /[a-zA-Z]/.test(value)) {
            return;
        }
        
        // Только цифры — форматируем как телефон
        var digits = value.replace(/\D/g, '');
        
        if (digits.length === 0) {
            return;
        }
        
        // Если начинается с 8 или 7 — заменяем на +7
        if (digits[0] === '8' || digits[0] === '7') {
            digits = '7' + digits.slice(1);
        }
        // Если начинается с 9 — добавляем +7
        else if (digits[0] === '9') {
            digits = '7' + digits;
        }
        
        // Форматируем по маске +7 (XXX) XXX-XX-XX
        var formatted = '+7';
        if (digits.length > 1) {
            formatted += ' (' + digits.slice(1, 4);
        }
        if (digits.length >= 4) {
            formatted += ') ' + digits.slice(4, 7);
        }
        if (digits.length >= 7) {
            formatted += '-' + digits.slice(7, 9);
        }
        if (digits.length >= 9) {
            formatted += '-' + digits.slice(9, 11);
        }
        
        // Обновляем значение
        var oldLen = value.length;
        input.value = formatted;
        
        // Корректируем позицию курсора
        if (cursorPos === oldLen) {
            // Курсор был в конце — оставляем в конце
            input.selectionStart = input.selectionEnd = formatted.length;
        } else {
            // Пытаемся сохранить относительную позицию
            var newPos = cursorPos + (formatted.length - oldLen);
            if (newPos < 0) newPos = 0;
            if (newPos > formatted.length) newPos = formatted.length;
            input.selectionStart = input.selectionEnd = newPos;
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        els.contactError.textContent = '';
        els.formStatus.textContent = '';
        els.formStatus.className = 'l-form-status';

        var nicheKey = els.nicheSelect.value;
        var tariffKey = els.tariffSelect.value;
        var name = els.nameInput.value.trim();
        var contact = els.contactInput.value.trim();

        if (!contact) {
            els.contactError.textContent = 'Укажите телефон или Telegram.';
            els.contactInput.focus();
            return;
        }

        var niche = nicheByKey(nicheKey);
        var tariff = tariffByKey(tariffKey);
        var nicheLabel = niche ? niche.label : nicheKey;
        var tariffLabel = tariff ? tariff.label : tariffKey;

        // Пометка для менеджера в Telegram
        var description = '[ПОКУПКА ПРИЛОЖЕНИЯ: ' + nicheLabel + ' — ' + tariffLabel + ']';
        if (name) description += ' Имя: ' + name;

        var isPhone = looksLikePhone(contact);

        var formData = new FormData();
        formData.append('purchase', '1');
        formData.append('name', name);
        if (isPhone) {
            formData.append('phone', contact);
        } else {
            formData.append('telegram', contact);
        }
        formData.append('description', description);
        // Ловушка для спам-ботов
        formData.append('website', '');

        els.submitBtn.disabled = true;
        els.submitBtn.textContent = 'Отправляем…';

        fetch(API_URL, { method: 'POST', body: formData })
            .then(function (response) {
                return response.json().catch(function () { return { ok: response.ok }; });
            })
            .then(function (result) {
                if (result && result.ok) {
                    els.formStatus.textContent = 'Заявка отправлена! Мы свяжемся с вами.';
                    els.formStatus.classList.add('is-ok');
                    els.orderForm.reset();
                } else {
                    var error = (result && result.error) ? result.error : 'Не удалось отправить заявку. Попробуйте ещё раз.';
                    els.formStatus.textContent = error;
                    els.formStatus.classList.add('is-error');
                }
            })
            .catch(function () {
                els.formStatus.textContent = 'Сетевая ошибка. Попробуйте ещё раз.';
                els.formStatus.classList.add('is-error');
            })
            .then(function () {
                els.submitBtn.disabled = false;
                els.submitBtn.textContent = 'Отправить заявку';
            });
    }

    function tariffByKey(key) {
        var list = Array.isArray(landing.tariffs) ? landing.tariffs : FALLBACK_LANDING.tariffs;
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === key) return list[i];
        }
        return null;
    }

    function looksLikePhone(value) {
        return /^\+?[0-9()\s-]{10,18}$/.test(value) && /\d/.test(value);
    }

    // ---------- Юридический блок ----------

    function openLegal(kind) {
        if (kind === 'offer') {
            els.legalTitle.textContent = 'Публичная оферта';
            els.legalBody.innerHTML = offerHtml();
        } else {
            els.legalTitle.textContent = 'Политика конфиденциальности';
            els.legalBody.innerHTML = privacyHtml();
        }
        els.legalModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeLegal() {
        els.legalModal.hidden = true;
        document.body.style.overflow = '';
    }

    function sellerText() {
        var seller = (landing.seller && typeof landing.seller === 'object') ? landing.seller : {};
        return {
            name: seller.name || FALLBACK_LANDING.seller.name,
            inn: seller.inn || FALLBACK_LANDING.seller.inn,
            ogrnip: seller.ogrnip || FALLBACK_LANDING.seller.ogrnip,
            phone: seller.phone || FALLBACK_LANDING.seller.phone,
            email: seller.email || FALLBACK_LANDING.seller.email
        };
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function offerHtml() {
        var s = sellerText();
        return [
            '<h3>1. Общие положения</h3>',
            '<p>Настоящая оферта определяет условия предоставления готового веб-приложения (PWA) для приёма заявок. Акцептом оферты является оплата выбранного тарифа.</p>',
            '<h3>2. Продавец</h3>',
            '<p>' + escapeHtml(s.name) + ', ИНН ' + escapeHtml(s.inn) + ', ОГРНИП ' + escapeHtml(s.ogrnip) + '.</p>',
            '<h3>3. Предмет договора</h3>',
            '<p>Продавец передаёт заказчику право пользования приложением и, при выборе тарифа «Всё моё», исходный код проекта для самостоятельного размещения.</p>',
            '<h3>4. Стоимость и порядок расчётов</h3>',
            '<p>Тариф «Лёгкий старт» — 2 900 ₽ разово за запуск и 490 ₽ в месяц за хостинг и поддержку. Тариф «Всё моё» — 6 900 ₽ разово, без абонентской платы.</p>',
            '<h3>5. Порядок оказания услуг</h3>',
            '<p>Запуск выполняется в течение 1 рабочего дня с момента получения необходимых материалов и контактов от заказчика.</p>',
            '<h3>6. Ответственность сторон</h3>',
            '<p>Продавец не несёт ответственности за недоступность сторонних мессенджеров и платёжных сервисов. Иные условия — в соответствии с законодательством РФ.</p>',
            '<h3>7. Реквизиты продавца</h3>',
            '<p>' + escapeHtml(s.name) + '<br>ИНН: ' + escapeHtml(s.inn) + '<br>ОГРНИП: ' + escapeHtml(s.ogrnip) + '<br>Телефон: ' + escapeHtml(s.phone) + '<br>E-mail: ' + escapeHtml(s.email) + '</p>'
        ].join('');
    }

    function privacyHtml() {
        var s = sellerText();
        return [
            '<h3>1. Общие положения</h3>',
            '<p>Настоящая Политика определяет порядок обработки персональных данных пользователей сайта и соответствует Федеральному закону от 27.07.2006 № 152-ФЗ «О персональных данных».</p>',
            '<h3>2. Оператор</h3>',
            '<p>' + escapeHtml(s.name) + ', ИНН ' + escapeHtml(s.inn) + ', ОГРНИП ' + escapeHtml(s.ogrnip) + '.</p>',
            '<h3>3. Какие данные обрабатываются</h3>',
            '<p>Имя, контактный телефон или никнейм Telegram, выбранная ниша и тариф, а также текст заявки.</p>',
            '<h3>4. Цели обработки</h3>',
            '<p>Связь с заявителем, оформление и выполнение заказа, направление информационных сообщений.</p>',
            '<h3>5. Хранение и защита</h3>',
            '<p>Данные хранятся в защищённой базе данных и не передаются третьим лицам, за исключением случаев, предусмотренных законодательством РФ.</p>',
            '<h3>6. Контакты</h3>',
            '<p>Телефон: ' + escapeHtml(s.phone) + '<br>E-mail: ' + escapeHtml(s.email) + '</p>'
        ].join('');
    }
})();
