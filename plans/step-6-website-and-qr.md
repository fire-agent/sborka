# Этап 1: Конфиг, бэкенд и витрина сайта

## 1. Обновление config.json

**Файл:** `public/config.json`
**Изменения:** добавить новые поля в JSON

```
{
  "companyName": "...",
  "title": "...",
  "tagline": "Краткое описание/слоган",
  "address": "Город, улица, дом",
  "workHours": "Пн-Пт 9:00–18:00, Сб 10:00–15:00",
  "telegramUrl": "https://t.me/...",
  "whatsappUrl": "https://wa.me/...",
  "advantages": [
    {
      "title": "Быстро",
      "text": "Выезд мастера в течение часа"
    },
    {
      "title": "Гарантия",
      "text": "36 месяцев на все работы"
    },
    {
      "title": "Качество",
      "text": "Только оригинальные материалы"
    }
  ],
  "colors": { ... },
  "contacts": { ... },
  "services": [ ... ]
}
```

**Строка:** после строки 4 (после subtitle)

---

## 2. Бэкенд валидация (server/index.js)

**Файл:** `server/index.js`
**Функция:** обработчик `/api/admin/config` POST (строка 935)

**Изменения:**
1. Добавить валидацию новых полей:
   - tagline: string, max 200 символов
   - address: string, max 300 символов
   - workHours: string, max 200 символов
   - telegramUrl: string, max 500, опционально
   - whatsappUrl: string, max 500, опционально
   - advantages: массив длиной 3, каждый элемент: { title: string(100), text: string(200) }

2. Обновить `mergeConfig()` для сохранения новых полей

**Строка:** 935–948 (обработчик POST)

---

## 3. Обновление витрины (public/index.html)

**Файл:** `public/index.html`

### 3.1. Header (строка 10–16)
**Добавить иконки мессенджеров:**
```html
<div class="messaging" id="headerMessaging" hidden>
  <a href="#" class="messaging-btn telegram-icon" title="Telegram"></a>
  <a href="#" class="messaging-btn whatsapp-icon" title="WhatsApp"></a>
</div>
```

### 3.2. Hero-секция (после заголовка, строка 22)
**Добавить после `</p>`:**
```html
<section class="hero">
  <div class="hero-inner">
    <h1 id="heroTitle"></h1>
    <p id="heroTagline" class="hero-tagline"></p>
    <button type="button" class="cta-button" id="ctaButton">Оставить заявку</button>
  </div>
</section>
```

### 3.3.Advantages секция (перед прайсом, после Hero)
**Добавить:**
```html
<section class="advantages-section">
  <h2>Наши преимущества</h2>
  <div class="advantages-grid" id="advantagesGrid">
    <!-- 3 карточки через JS -->
  </div>
</section>
```

### 3.4. Прайс-лист (существующий)
**Существующий блок с сервисами** - оставить, добавить кнопку "Смотреть прайс" для скролла к форме

### 3.5. Footer (строка 78–81)
**Дополнить подвал:**
```html
<footer class="site-footer">
  <div class="footer-address" id="footerAddress" hidden></div>
  <div class="footer-hours" id="footerHours" hidden></div>
  <div id="footerContacts" class="footer-contacts" hidden></div>
  <button type="button" id="installBtn" class="install-app-btn">Установить как приложение</button>
  <p class="disclaimer">...</p>
</footer>
```

**Строка для правки:** 78

---

## 4. Обновление styles.css

**Файл:** `public/styles.css`
**Новые стили:**

1. Header messaging (строка 64 после .header-phone)
```css
.header-phone {
  color: #fff;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.messaging {
  display: flex;
  gap: 8px;
}
.messaging-btn {
  width: 32px;
  height: 32px;
  background-size: contain;
  background-repeat: no-repeat;
  opacity: 0.9;
}
.messaging-btn.telegram-icon { background-image: url('data:image/svg+xml;...'); }
.messaging-btn.whatsapp-icon { background-image: url('data:image/svg+xml;...'); }
```

2. Hero-секция (строка 100 после .hint)
```css
.hero {
  background: var(--primary);
  color: #fff;
  padding: 40px 16px;
  border-radius: 12px;
  margin: 16px 0;
}
.hero-title { font-size: 24px; margin-bottom: 12px; }
.hero-tagline { font-size: 16px; margin-bottom: 16px; opacity: 0.95; }
.cta-button {
  background: var(--accent);
  color: #fff;
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
```

3. Advantages-grid (строка 150)
```css
.advantages-section {
  padding: 24px 16px;
  background: #fff;
  border-radius: 12px;
  margin: 16px 0;
}
.advantages-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 16px;
}
.advantage-card {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
}
.advantage-card h3 { font-size: 16px; margin-bottom: 6px; }
.advantage-card p { font-size: 14px; color: #555; }
```

4. Footer (строка 300)
```css
.site-footer {
  background: #fff;
  padding: 24px 16px;
  margin-top: auto;
  border-top: 1px solid #eee;
}
.footer-address, .footer-hours {
  margin-bottom: 12px;
  font-size: 14px;
}
.install-app-btn {
  background: #319795;
  color: #fff;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  margin: 12px 0;
  cursor: pointer;
  font-size: 14px;
}
```

---

## 5. Обновление app.js

**Файл:** `public/app.js`

### 5.1. Глобальные переменные (строка 14–18)
```javascript
var el = {};
var advantages = [];
var address = '';
var workHours = '';
var telegramUrl = '';
var whatsappUrl = '';
```

### 5.2. DOM-элементы (строка 19–50)
```javascript
el.heroTitle = document.getElementById('heroTitle');
el.heroTagline = document.getElementById('heroTagline');
el.ctaButton = document.getElementById('ctaButton');
el.advantagesGrid = document.getElementById('advantagesGrid');
el.footerAddress = document.getElementById('footerAddress');
el.footerHours = document.getElementById('footerHours');
el.headerMessaging = document.getElementById('headerMessaging');
el.installBtn = document.getElementById('installBtn');
```

### 5.3. Обработчики (строка 53–61)
```javascript
el.ctaButton.addEventListener('click', scrollToForm);
el.installBtn.addEventListener('click', installPWA);
```

### 5.4. applyConfig() (строка 100+)
```javascript
function applyConfig(config) {
  // существующий код
  address = str(config.address);
  workHours = str(config.workHours);
  telegramUrl = str(config.telegramUrl);
  whatsappUrl = str(config.whatsappUrl);
  advantages = Array.isArray(config.advantages) ? config.advantages.slice(0, 3) : [];
  
  // Обновление Hero
  if (config.tagline) {
    el.heroTitle.textContent = config.title || config.companyName;
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
```

### 5.5. renderAdvantages()
```javascript
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
```

### 5.6. updateHeaderMessaging()
```javascript
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
```

### 5.7. scrollToForm()
```javascript
function scrollToForm() {
  var firstField = document.querySelector('input[type="text"], textarea');
  if (firstField) {
    firstField.scrollIntoView({ behavior: 'smooth', block: 'start' });
    firstField.focus();
  }
}
```

### 5.8. installPWA()
```javascript
var deferredPrompt;
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  deferredPrompt = e;
});

function installPWA() {
  if (!deferredPrompt) {
    // iOS/Android подсказка
    alert('Нажмите «Установить» в меню браузера');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function (choiceResult) {
    deferredPrompt = null;
  });
}
```

**Строка для правки:** 19–100+

---

## 6. Дополнительно (опционально)

### 6.1. manifest.json
**Файл:** `public/manifest.json`
**Добавить:**
```json
{
  "short_name": "Мастер",
  "name": "Название компании",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#319795"
}
```

### 6.2. service-worker.js
**Файл:** `public/service-worker.js`
**Добавить базовый кэш статики для PWA**

---

# Этап 2: Редактор в админке и генератор QR-кода

## 1. Обновление HTML админки (public/admin/index.html)

**Файл:** `public/admin/index.html`

### 1.1. Редактор новых полей (строка 70–98)
**Дополнить блок «Данные компании»:**
```html
<h2>Данные компании</h2>
<div class="settings-group">
  <label>Название компании <input type="text" id="cfgCompanyName"></label>
  <label>Заголовок <input type="text" id="cfgTitle"></label>
  <label>Подзаголовок (tagline) <textarea id="cfgTagline" rows="2"></textarea></label>
  <label>Город и адрес <input type="text" id="cfgAddress" placeholder="Город, улица, дом"></label>
  <label>График работы <textarea id="cfgWorkHours" rows="2" placeholder="Пн-Пт 9:00–18:00"></textarea></label>
  <label>Telegram <input type="url" id="cfgTelegram" placeholder="https://t.me/..."></label>
  <label>WhatsApp <input type="url" id="cfgWhatsapp" placeholder="https://wa.me/..."></label>
  <label>MAX <input type="url" id="cfgMax" placeholder="https://max.ru/..."></label>
</div>
```

**Добавить после блока «Контакты» (строка 88):**
```html
<h2>Преимущества (3 карточки)</h2>
<div id="cfgAdvantagesList" class="advantages-editor"></div>
<button type="button" id="cfgAddAdvantage" class="add-advantage-btn">+ Добавить преимущество</button>
```

### 1.2. Блок QR-кода (после блока услуг, после строки 101)
```html
<h2>QR-код для визиток и типографии</h2>
<div class="qr-generator">
  <p class="qr-hint">Генерация QR-кода для главной страницы сайта (window.location.origin)</p>
  <div class="qr-preview">
    <img id="qrImage" src="" alt="QR-код" style="max-width: 200px; margin: 16px auto; display: block;">
  </div>
  <div class="qr-actions">
    <button type="button" id="generateQrBtn" class="qr-btn">Сгенерировать QR-код</button>
    <div class="qr-downloads">
      <a href="#" id="downloadPng" class="qr-download-btn" hidden>💾 Скачать PNG (512×512)</a>
      <a href="#" id="downloadSvg" class="qr-download-btn" hidden>💾 Скачать SVG (вектор)</a>
    </div>
  </div>
</div>
```

**Строка:** добавить после блока услуг (после `<div id="cfgServicesList" class="services-editor"></div>`)

---

## 2. Обновление JS админки (public/admin/index.js)

### 2.1. DOM-элементы (строка 64–98)
```javascript
el.cfgTagline = document.getElementById('cfgTagline');
el.cfgAddress = document.getElementById('cfgAddress');
el.cfgWorkHours = document.getElementById('cfgWorkHours');
el.cfgAdvantagesList = document.getElementById('cfgAdvantagesList');
el.cfgAddAdvantage = document.getElementById('cfgAddAdvantage');
el.qrImage = document.getElementById('qrImage');
el.generateQrBtn = document.getElementById('generateQrBtn');
el.downloadPng = document.getElementById('downloadPng');
el.downloadSvg = document.getElementById('downloadSvg');
```

### 2.2. Обработчики (строка 124–139)
```javascript
el.cfgAddAdvantage.addEventListener('click', function () {
  addAdvantageRow(null);
});
el.generateQrBtn.addEventListener('click', generateAndRenderQR);
```

### 2.3. fillSettingsForm() (строка 1358)
**Обновить функцию:**
```javascript
function fillSettingsForm(config) {
  // существующий код
  el.cfgTagline.value = config.tagline || '';
  el.cfgAddress.value = config.address || '';
  el.cfgWorkHours.value = config.workHours || '';
  // telegramUrl и whatsappUrl уже заполняются
  renderAdvantageRows(config.advantages || []);
}
```

### 2.4. onSaveSettings() (строка 1531)
**Обновить payload:**
```javascript
var payload = {
  companyName: el.cfgCompanyName.value,
  title: el.cfgTitle.value,
  tagline: el.cfgTagline.value,
  address: el.cfgAddress.value,
  workHours: el.cfgWorkHours.value,
  telegramUrl: el.cfgTelegram.value,
  whatsappUrl: el.cfgWhatsapp.value,
  advantages: getAdvantagesFromForm(),
  colors: { ... },
  contacts: { ... },
  services: services
};
```

### 2.5. renderAdvantageRows()
```javascript
function renderAdvantageRows(advantages) {
  el.cfgAdvantagesList.innerHTML = '';
  var list = Array.isArray(advantages) ? advantages : [];
  list.slice(0, 3).forEach(function (adv) {
    addAdvantageRow(adv);
  });
  // добавить недостающие пустые
  for (var i = list.length; i < 3; i++) {
    addAdvantageRow(null);
  }
}
```

### 2.6. addAdvantageRow()
```javascript
function addAdvantageRow(advantage) {
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
  });
  
  row.appendChild(titleInput);
  row.appendChild(textInput);
  row.appendChild(removeBtn);
  el.cfgAdvantagesList.appendChild(row);
}
```

### 2.7. getAdvantagesFromForm()
```javascript
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
  // до 3 элементов
  while (result.length < 3) {
    result.push({ title: '', text: '' });
  }
  return result.slice(0, 3);
}
```

---

## 3. Генератор QR-кода

### 3.1. Локальный QR-модуль (public/admin/vendor/qr-generator.js)

**Файл:** `public/admin/vendor/qr-generator.js`

```javascript
(function () {
  'use strict';
  
  // Генерация QR-кода методом MoQr (самодостаточный алгоритм)
  function QRCodeGenerator() {}
  
  QRCodeGenerator.prototype.generate = function (data, size) {
    // Встроенный алгоритм QR-кода (см. ниже)
    // Возвращает объект: { png: base64, svg: '<svg>...</svg>' }
  };
  
  QRCodeGenerator.prototype.generateSVG = function (data, modules) {
    // Построение SVG из модулей (массив boolean[][])
    // Возвращает чистый SVG с <rect>
  };
  
  // --- Встроенный алгоритм QR-кода ---
  // Модуль 1: форматирование данных (DataEncoder)
  // Модуль 2: Reed-Solomon error correction
  // Модуль 3: размещение модулей на сетке
  // Модуль 4: маскирование и финальная сборка
  
  window.QRCodeGenerator = new QRCodeGenerator();
})();
```

### 3.2. Генерация PNG 512×512

```javascript
function generatePNG(qrModules, size) {
  var canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  var ctx = canvas.getContext('2d');
  
  // Белый фон
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  
  // Чёрные модули
  ctx.fillStyle = '#000000';
  var moduleSize = size / qrModules.length;
  
  for (var y = 0; y < qrModules.length; y++) {
    for (var x = 0; x < qrModules[y].length; x++) {
      if (qrModules[y][x]) {
        ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
      }
    }
  }
  
  return canvas.toDataURL('image/png');
}
```

### 3.3. Генерация SVG (вектор)

```javascript
function generateSVG(qrModules, size) {
  var modules = qrModules.length;
  var moduleSize = size / modules;
  
  var svg = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + modules + ' ' + modules + '">';

  for (var y = 0; y < modules; y++) {
    for (var x = 0; x < modules; x++) {
      if (qrModules[y][x]) {
        svg += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#000000"/>';
      }
    }
  }

  svg += '</svg>';
  return svg;
}
```

### 3.4. generateAndRenderQR()

```javascript
function generateAndRenderQR() {
  var url = window.location.origin;
  var qrGen = new QRCodeGenerator();
  var result = qrGen.generate(url, 512);
  
  // Показать PNG
  el.qrImage.src = result.png;
  
  // Ссылки на скачивание
  el.downloadPng.href = result.png;
  el.downloadPng.download = 'site-qr.png';
  el.downloadPng.hidden = false;
  
  // Скачивание SVG
  var svgBlob = new Blob([result.svg], { type: 'image/svg+xml' });
  var svgUrl = URL.createObjectURL(svgBlob);
  el.downloadSvg.href = svgUrl;
  el.downloadSvg.download = 'site-qr.svg';
  el.downloadSvg.hidden = false;
}
```

**Строка:** добавить в конец файла (после 1915)

---

## 4. Строгая валидация новых полей (server/index.js)

**Файл:** `server/index.js`
**Функция:** mergeConfig() (найти, где собирается итоговый config)

**Добавить:**
```javascript
function mergeConfig(current, incoming) {
  var next = JSON.parse(JSON.stringify(current));
  
  // Tagline
  if (typeof incoming.tagline === 'string') {
    next.tagline = incoming.tagline.substring(0, 200);
  }
  
  // Address
  if (typeof incoming.address === 'string') {
    next.address = incoming.address.substring(0, 300);
  }
  
  // WorkHours
  if (typeof incoming.workHours === 'string') {
    next.workHours = incoming.workHours.substring(0, 200);
  }
  
  // Telegram/WhatsApp URLs
  if (typeof incoming.telegramUrl === 'string') {
    next.telegramUrl = incoming.telegramUrl.substring(0, 500);
  }
  if (typeof incoming.whatsappUrl === 'string') {
    next.whatsappUrl = incoming.whatsappUrl.substring(0, 500);
  }
  
  // Advantages (точно 3)
  if (Array.isArray(incoming.advantages)) {
    var advantages = incoming.advantages.slice(0, 3);
    while (advantages.length < 3) {
      advantages.push({ title: '', text: '' });
    }
    next.advantages = advantages.map(function (item) {
      return {
        title: (typeof item.title === 'string' ? item.title : '').substring(0, 100),
        text: (typeof item.text === 'string' ? item.text : '').substring(0, 200)
      };
    });
  }
  
  return next;
}
```

**Строка:** найти и обновить mergeConfig()

---

## 5. Финальная проверка

### 5.1. Ручная проверка:
1. Загрузить `/admin` → войти → вкладка «Настройки»
2. Заполнить новые поля (tagline, address, workHours, telegramUrl, whatsappUrl, 3 advantages)
3. Нажать «Сохранить» → проверить `public/config.json`
4. Обновить витрину → проверить:
   - Hero с tagline
   - Advantages grid (3 карточки)
   - Footer с адресом и графиком
   - Иконки мессенджеров в header
5. В админке сгенерировать QR-код → проверить скачивание PNG и SVG

### 5.2. Валидация SVG:
- Открыть скачанный `site-qr.svg` в текстовом редакторе
- Убедиться, что это чистый SVG без base64-картинок
- Структура: `<svg><rect>...</rect></svg>`

### 5.3. Валидация PNG:
- Открыть скачанный `site-qr.png`
- Убедиться, что размер 512×512 пикселей
- QR-код читается сканером

---

## Сводка по файлам и строкам

### Этап 1: Витрина
| Файл | Строка | Описание |
|------|--------|----------|
| `public/config.json` | +20 | Добавить tagline, address, workHours, telegramUrl, whatsappUrl, advantages[] |
| `server/index.js` | 935–948 | Валидация новых полей в mergeConfig() |
| `public/index.html` | 10–16, +22, +40, 78 | Header messaging, Hero, Advantages, Footer |
| `public/styles.css` | +64, +100, +150, +300 | Новые стили |
| `public/app.js` | 19–100+ | DOM-элементы, applyConfig(), renderAdvantages(), installPWA() |

### Этап 2: Админка + QR
| Файл | Строка | Описание |
|------|--------|----------|
| `public/admin/index.html` | 70, +101, +125 | Редактор новых полей, QR-блок |
| `public/admin/index.js` | 64, +1915 | DOM-элементы, QR-генератор |
| `public/admin/vendor/qr-generator.js` | создать | Локальный QR-модуль |
| `server/index.js` | mergeConfig() | Валидация новых полей |
