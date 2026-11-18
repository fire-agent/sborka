# Deep Link подключение Telegram/MAX + WhatsApp в уведомлениях

## Этап 1: Бэкенд (server/)

### [`server/notifier.js`](../server/notifier.js)
**Функция `formatMessage`** (строки 68–87)
- Добавить после строки 75 ссылку WhatsApp:
```js
if (request.phone) {
  var digits = request.phone.replace(/\D/g, '');
  if (digits) {
    lines.push('<a href="https://wa.me/' + digits + '">📱 Написать в WhatsApp</a>');
  }
}
```

### [`server/index.js`](../server/index.js)

**Новый маршрут `POST /api/admin/deeplink/request`** (после строки 826)
- Принимает `{ channel: 'telegram' | 'max' }`
- Генерирует случайный код (8 символов, A-Za-z0-9)
- Сохраняет в памяти `{ code, channel, createdAt }` с TTL 5 мин
- Возвращает `{ ok: true, code, deepLink }`
  - Telegram: `https://t.me/{BOT_USERNAME}?start={code}`
  - MAX: `https://max.ru/{BOT_USERNAME}?start={code}`

**Новый маршрут `GET /api/admin/deeplink/poll`** (после предыдущего)
- Принимает `?code=...`
- Проверяет наличие кода (не истёк, не использован)
- Вызывает getUpdates для Telegram / MAX API
- Ищет `/start {code}` в обновлениях
- При совпадении:
  - Извлекает `chat.id`
  - Обновляет `.env`: записывает `TELEGRAM_CHAT_ID` / `MAX_CHAT_ID`
  - Записывает `config.json`: `notifications.telegram: true` / `notifications.max: true`
  - Шлёт приветствие: «✓ Канал подключён»
  - Удаляет код из памяти
  - Возвращает `{ ok: true, connected: true }`
- Если не найдено: `{ ok: true, connected: false }`

**Вспомогательные функции**
- `generateCode()` — криптослучайная строка 8 символов
- `cleanupExpiredCodes()` — чистка кодов старше 5 мин
- `updateEnvChatId(channel, chatId)` — запись `{CHANNEL}_CHAT_ID=...` в `.env`
- `enableNotificationChannel(channel)` — включение канала в `config.json`
- Поллинг getUpdates:
  - Telegram: `GET https://api.telegram.org/bot{TOKEN}/getUpdates?offset={offset}`
  - MAX: `GET https://platform-api.max.ru/v1/getUpdates` + `Authorization: Bearer {TOKEN}`

**Переменные окружения** (добавить в `.env.example` строки):
```
TELEGRAM_BOT_USERNAME=
MAX_BOT_USERNAME=
```

---

## Этап 2: Фронтенд админки (public/admin/)

### [`public/admin/index.html`](../public/admin/index.html)

**Секция Telegram** (строки 114–122, заменить):
```html
<div class="channel-card">
  <div class="channel-header">
    <span class="channel-icon">💬</span>
    <span class="channel-name">Telegram</span>
    <label class="toggle"><input type="checkbox" id="notifTelegram"><span class="toggle-slider"></span></label>
  </div>
  <button type="button" class="deeplink-btn" id="deeplinkTelegram">Подключить в 1 клик</button>
  <details class="manual-setup">
    <summary>Ручная настройка / свой бот</summary>
    <label>Bot Token <input type="text" id="manualTelegramToken"></label>
    <label>Chat ID <input type="text" id="manualTelegramChatId"></label>
    <button type="button" class="save-btn" id="saveManualTelegram">Сохранить</button>
  </details>
  <button type="button" class="test-btn" id="testTelegram">Отправить тест</button>
  <span id="testTelegramStatus" class="test-status"></span>
</div>
```

**Секция MAX** (строки 124–132, аналогично)

### [`public/admin/index.js`](../public/admin/index.js)

**Новые элементы** (функция `init`, после строки 98):
```js
el.deeplinkTelegram = document.getElementById('deeplinkTelegram');
el.deeplinkMax = document.getElementById('deeplinkMax');
// ...listeners
el.deeplinkTelegram.addEventListener('click', function() { startDeepLink('telegram'); });
el.deeplinkMax.addEventListener('click', function() { startDeepLink('max'); });
```

**Функция `startDeepLink(channel)`** (добавить):
1. `POST /api/admin/deeplink/request` → получить `code`, `deepLink`
2. `window.open(deepLink, '_blank')`
3. Показать статус: «Откройте бота и нажмите START…»
4. Запустить polling каждые 2 сек:
   - `GET /api/admin/deeplink/poll?code={code}`
   - Если `connected: true`:
     - Остановить polling
     - Показать «✓ Подключено»
     - Перезагрузить `loadNotifications()`
   - Если прошло 5 мин → остановить, показать «Время истекло»

**Функция `saveManualCredentials(channel)`** (добавить):
- Собрать `token`, `chatId` из полей
- Записать в `.env` через новый маршрут `POST /api/admin/manual-credentials`
- Показать статус

**Новый маршрут бэкенда `POST /api/admin/manual-credentials`**:
- Принимает `{ channel, token, chatId }`
- Записывает в `.env`: `{CHANNEL}_BOT_TOKEN=...`, `{CHANNEL}_CHAT_ID=...`
- Возвращает `{ ok: true }`

---

## Итого

**Бэкенд**:
- [`server/notifier.js`](../server/notifier.js): функция `formatMessage` — добавить ссылку WhatsApp
- [`server/index.js`](../server/index.js):
  - `POST /api/admin/deeplink/request` — генерация кода
  - `GET /api/admin/deeplink/poll` — поллинг getUpdates
  - `POST /api/admin/manual-credentials` — ручной ввод токенов
  - Вспомогательные функции (генерация кода, обновление `.env`, `config.json`)

**Фронтенд**:
- [`public/admin/index.html`](../public/admin/index.html): кнопки Deep Link + спойлер ручной настройки
- [`public/admin/index.js`](../public/admin/index.js): логика `startDeepLink`, `saveManualCredentials`, polling

**Конфигурация**:
- [`.env.example`](./.env.example): добавить `TELEGRAM_BOT_USERNAME`, `MAX_BOT_USERNAME`
