# Задача для ИИ-кодера: темы оформления и исправления клиентской части

Ты правишь клиентскую часть проекта. Выполни шаги по порядку, затем проверки из раздела 5 и пришли отчёт.

## Контекст
- Клиентская часть общая для 3 приложений (окна, мебель, клининг): `public/index.html`, `public/styles.css`, `public/app.js`. Приложения отличаются только файлом `public/config.json`.
- `app.js` — ванильный JS в стиле ES5 (`var`, IIFE), без сборщика и npm. Цвета из `config.colors` записываются в CSS-переменные `--primary` и `--accent` (функция `applyColors`).
- Цель: 3 темы оформления (`glass`, `bold`, `app`), тема выбирается полем `theme` в config.json. Плюс исправления: битая иконка Telegram, блок «Преимущества», который никогда не показывался, XSS в преимуществах, мёртвый дубль `applyConfig`, мелькание страницы по умолчанию до загрузки config.
- Архив `coder-pack.zip` распакован в корень проекта: `public/theme.css` и `public/fonts/*.woff2` (4 файла) уже на месте. Эти файлы не менять.

## Правила
1. Делай только правки ниже. Не переформатируй файлы и не переставляй функции. Сохрани переводы строк CRLF и отступ в 4 пробела. Стиль ES5: `var`, `function`, без стрелочных функций.
2. Не переименовывай и не удаляй id и классы в `index.html`: на них завязан `app.js`.
3. Не трогай отправку формы, валидацию, обработку фото, ловушку для ботов `#website`, загрузку логотипа `/api/logo` и ссылку `privacy.html`.
4. Никаких CDN и внешних запросов, шрифты только локальные.
5. Если в config нет `theme`, страница выглядит как раньше.
6. Перед каждой правкой проверь, нет ли уже её результата (если раньше применяли theme-pack.zip, часть правок уже сделана). Если фрагмент «Заменить на» уже есть — пропусти шаг. Если фрагмент «Найти» не находится дословно и правки нет — остановись и сообщи. Не импровизируй.

## 1. public/index.html

### 1.1 Класс загрузки
Найти:
```html
<html lang="ru">
```
Заменить на:
```html
<html lang="ru" class="is-loading">
```

### 1.2 Стили и шрифты (theme.css строго после styles.css)
Найти:
```html
    <link rel="stylesheet" href="styles.css">
```
Заменить на:
```html
    <link rel="stylesheet" href="styles.css?v=2">
    <link rel="stylesheet" href="theme.css?v=2">
    <link rel="preload" href="fonts/manrope-cyr.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="fonts/unbounded-cyr.woff2" as="font" type="font/woff2" crossorigin>
```
Без дублей: если `theme.css` или preload уже подключены, приведи блок к виду выше.

### 1.3 Версия скрипта
Найти:
```html
    <script src="app.js" defer></script>
```
Заменить на:
```html
    <script src="app.js?v=2" defer></script>
```
`?v=N` сбрасывает кэш браузера. Увеличивай N при каждом деплое изменённых css/js.

## 2. public/styles.css

### 2.1 Иконка Telegram
Старый SVG битый: вместо самолётика рисуется клякса. Правило `.messaging-btn.telegram-icon { … }` заменить целиком на:
```css
.messaging-btn.telegram-icon {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ffffff'%3E%3Cpath d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z'/%3E%3C/svg%3E");
}
```

### 2.2 Прятать страницу до применения config
Добавить в конец файла:
```css
html.is-loading body {
    visibility: hidden;
    animation: page-reveal 0s 3s forwards;
}

@keyframes page-reveal {
    to {
        visibility: visible;
    }
}
```
Зачем: в `index.html` зашиты текст «Ремонт мебели — заявка мастеру» и синий цвет, и сайты окон и клининга показывают их, пока не загрузится config.json. Если JS не сработал, страница всё равно появится через 3 с.

## 3. public/app.js

### 3.1 Список тем
Найти:
```js
    var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
```
Заменить на:
```js
    var COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    var THEMES = ['glass', 'bold', 'app'];
```

### 3.2 Ссылка на секцию преимуществ (в `init`)
Найти:
```js
        el.advantagesGrid = document.getElementById('advantagesGrid');
```
Заменить на:
```js
        el.advantagesGrid = document.getElementById('advantagesGrid');
        el.advantagesSection = document.querySelector('.advantages-section');
```

### 3.3 Применение темы (в `applyColors`)
Найти:
```js
        if (typeof colors.accent === 'string' && COLOR_RE.test(colors.accent.trim())) {
            root.style.setProperty('--accent', colors.accent.trim());
        }
```
Заменить на:
```js
        if (typeof colors.accent === 'string' && COLOR_RE.test(colors.accent.trim())) {
            root.style.setProperty('--accent', colors.accent.trim());
        }
        if (THEMES.indexOf(config.theme) !== -1) {
            root.setAttribute('data-theme', config.theme);
        }
```

### 3.4 Заменить функцию `renderAdvantages` целиком
Сейчас в ней `innerHTML` и `escapeHtml`, который в присланной версии не экранирует `& < > "` (XSS через config). Кроме того, `hidden` снимается с сетки, а не с секции, поэтому блок не показывается никогда.
```js
    function renderAdvantages() {
        el.advantagesGrid.textContent = '';
        advantages.forEach(function (adv) {
            var card = document.createElement('div');
            card.className = 'advantage-card';
            var h3 = document.createElement('h3');
            h3.textContent = str(adv && adv.title);
            var p = document.createElement('p');
            p.textContent = str(adv && adv.text);
            card.appendChild(h3);
            card.appendChild(p);
            el.advantagesGrid.appendChild(card);
        });
        el.advantagesSection.hidden = advantages.length === 0;
    }
```

### 3.5 Удалить `escapeHtml`
Удали функцию `escapeHtml` целиком вместе с пустой строкой после неё. После шага 3.4 она нигде не используется.

### 3.6 Удалить мёртвый дубль `applyConfig`
В файле два объявления `function applyConfig(config)`. Удали первое (верхнее), где `var steps = [applyTexts, applyColors, applyContacts, applyServices];` без `applyWebsite`, вместе с пустой строкой после него. Второе объявление перекрывает первое, поэтому первое никогда не выполняется. Второе не трогай.

### 3.7 Снимать `is-loading` после загрузки config (и при успехе, и при ошибке)
Найти (в `loadConfig`):
```js
            .catch(function () {
                showConfigError();
            });
```
Заменить на:
```js
            .catch(function () {
                showConfigError();
            })
            .then(function () {
                document.documentElement.classList.remove('is-loading');
            });
```

## 4. config.json каждого приложения
Добавить поле верхнего уровня, например:
```json
"theme": "bold",
```
- `glass` — сдержанная: градиент, «стекло», кнопки-пилюли (окна).
- `bold` — яркая: толстые обводки, жёсткие тени, жёлтые «наклейки» (мебель).
- `app` — как мобильное приложение: белые карточки, плитки (клининг).

Нет поля или другое значение → прежний вид. Цвета, как и раньше, берутся из `colors`.
Если config.json сохраняет или проверяет сервер либо админка — добавь `theme` в схему (whitelist) и в форму настроек, иначе поле будет теряться.

## 5. Проверка (обязательно)
1. `node --check public/app.js` — без ошибок.
2. `grep -nE "escapeHtml|innerHTML" public/app.js` — пусто; `grep -c "function applyConfig" public/app.js` → `1`.
3. Браузер, ширина 360 и 390 px; `theme` = `glass`, `bold`, `app` и без `theme`:
   - нет горизонтальной прокрутки, элементы шапки не наезжают друг на друга;
   - иконка Telegram — самолётик;
   - блок «Преимущества» виден, если `advantages` не пуст, и скрыт, если пуст;
   - услуга → «Добавить» → чип и строка «Итого ориентировочно: от … ₽»;
   - в консоли нет ошибок. Норма: 404 на `/api/logo`, если логотипа нет; без темы — предупреждение о неиспользованном preload шрифтов.
4. XSS: временно `"advantages": [{"title": "<img src=x onerror=alert(1)>", "text": "t"}]` → заголовок виден как текст, alert не появляется. Верни config.
5. Загрузка: DevTools → Network → Slow 3G → страница появляется сразу в своей теме, текст «Ремонт мебели…» не мелькает. Временно переименуй config.json → страница появляется с сообщением об ошибке настроек.
6. Тестовая заявка с фото отправляется и приходит, как раньше.

## Отчёт
Изменённые файлы; результат каждого пункта раздела 5; пропущенные шаги с причиной.
