# Шаг 3.2. База данных на встроенном node:sqlite

## Цель
Подготовить хранилище заявок: файл базы `DATA_DIR/app.db`, три таблицы (`requests`, `photos`, `notifications`) и модуль `server/db.js` с небольшим набором готовых функций. Приём заявок по сети (`POST /api/requests`), загрузка фото, кабинет и отправка уведомлений в этом шаге НЕ делаются. Они подключатся к функциям модуля в следующих шагах.

## Ограничения (из PROJECT.md и шага 3.1)
- Никаких npm-зависимостей. Используем только встроенный `node:sqlite` (в Node >= 22.13 работает без флага). В `package.json` не должно быть `dependencies` и `devDependencies`.
- Не менять `public/`, `furniture/`, `PROJECT.md`, `TASK.md`, `.env.example`, `.gitignore`, `plans/step-3.1-server-skeleton.md`.
- Не вписывать секреты ни в какие файлы.
- Делать только этот шаг: новых адресов (маршрутов) в сервере не добавлять.
- Код простой, `'use strict'`, CommonJS (`require`), короткие комментарии на русском, без лишних абстракций.
- Все запросы к базе только с параметрами (`?`). Никакой склейки строк с данными пользователя в SQL.

## Файлы
| Файл | Что сделать |
|---|---|
| `server/db.js` | Создать |
| `server/index.js` | Минимально изменить: открыть базу при запуске и закрыть при остановке |
| `scripts/check-db.js` | Создать: самопроверка базы одной командой |
| `package.json` | Добавить в `scripts` строку `"check:db": "node scripts/check-db.js"`. Остальное не менять |
| `README.md` | Добавить раздел «База данных и её проверка». Остальной текст не менять |

## Схема базы
Время везде хранится как текст в формате ISO в UTC (`new Date().toISOString()`).

### Таблица `requests` (заявки)
| Колонка | Тип и правила |
|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `created_at` | `TEXT NOT NULL` |
| `name` | `TEXT NOT NULL DEFAULT ''` (имя клиента, необязательно) |
| `phone` | `TEXT NOT NULL` |
| `service` | `TEXT NOT NULL DEFAULT ''` (название услуги на момент заявки) |
| `price_from` | `INTEGER` (может быть `NULL`) |
| `description` | `TEXT NOT NULL` |
| `status` | `TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done','cancelled'))` |

Индексы: `requests(created_at)`, `requests(status)`.

### Таблица `photos` (фото заявки)
| Колонка | Тип и правила |
|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `request_id` | `INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE` |
| `position` | `INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5)` (номер фото, не больше 5 на заявку) |
| `file_name` | `TEXT NOT NULL` (только имя файла внутри `DATA_DIR/photos`, без папок и без путей) |
| `created_at` | `TEXT NOT NULL` |

Правила: `UNIQUE (request_id, position)`. Индекс по `photos(request_id)`.

### Таблица `notifications` (уведомления менеджеру)
| Колонка | Тип и правила |
|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `request_id` | `INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE` |
| `channel` | `TEXT NOT NULL CHECK (channel IN ('telegram','max','whatsapp'))` |
| `status` | `TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed'))` |
| `attempts` | `INTEGER NOT NULL DEFAULT 0` |
| `last_error` | `TEXT` (короткий текст последней ошибки, без токенов и ключей) |
| `created_at` | `TEXT NOT NULL` |
| `sent_at` | `TEXT` |

Правила: `UNIQUE (request_id, channel)`. Индекс по `notifications(status)`.

### Версия схемы
Использовать `PRAGMA user_version`. Если `user_version` равен 0, создать все таблицы и индексы одной транзакцией и поставить `user_version = 1`. Если уже 1, ничего не создавать и не стирать. Если больше 1 (база от более новой программы), выдать понятную ошибку и не работать. Данные существующей базы при повторном запуске сохраняются.

## server/db.js
Подключение: `const { DatabaseSync } = require('node:sqlite');`

### Открытие базы
- Файл: `path.join(dataDir, 'app.db')`.
- После открытия: `PRAGMA foreign_keys = ON;`, `PRAGMA busy_timeout = 5000;` и `PRAGMA journal_mode = WAL;` (WAL пробовать в `try`, при ошибке тихо продолжать с режимом по умолчанию).
- Подготовленные запросы (`db.prepare`) можно создавать один раз после открытия и хранить в переменных модуля.
- Транзакции вручную: `db.exec('BEGIN')`, `db.exec('COMMIT')`, при ошибке `db.exec('ROLLBACK')` и повторный `throw`. Встроенной обёртки для транзакций в node:sqlite нет, поэтому сделать маленькую внутреннюю функцию `inTransaction(fn)`.

### Экспортируемые функции
Все синхронные (node:sqlite синхронный). Модуль хранит одно открытое соединение.

| Функция | Что делает |
|---|---|
| `initDb(dataDir)` | Открывает базу, применяет схему, возвращает полный путь к файлу базы. Повторный вызов не открывает вторую базу |
| `closeDb()` | Закрывает базу, если открыта |
| `createRequest({ name, phone, service, priceFrom, description, photoFiles, channels })` | В ОДНОЙ транзакции: добавляет заявку со статусом `new`, фото из `photoFiles` (массив имён файлов, позиции 1, 2, 3…) и уведомления `pending` для каждого канала из `channels` (массив из `telegram`, `max`, `whatsapp`, может быть пустым). Возвращает `id` заявки |
| `getRequest(id)` | Возвращает заявку с полем `photos` (массив `{ position, fileName }` по порядку) и полем `notifications` (массив `{ channel, status, attempts, lastError, sentAt }`). Если нет, возвращает `null` |
| `listRequests({ status, limit, offset })` | Список заявок от новых к старым (`ORDER BY created_at DESC, id DESC`). `status` необязателен. `limit` по умолчанию 50, максимум 200. `offset` по умолчанию 0. В каждой заявке есть `photoCount` (число фото). Возвращает `{ items, total }`, где `total` считается с учётом фильтра по статусу |
| `setRequestStatus(id, status)` | Меняет статус, проверяет значение по списку `new`, `in_progress`, `done`, `cancelled`. Возвращает `true`, если заявка найдена, иначе `false` |
| `getPendingNotifications(limit)` | Уведомления со статусом `pending` вместе с данными заявки (id, телефон, имя, услуга, цена, описание, число фото) от старых к новым. `limit` по умолчанию 20 |
| `markNotificationSent(id)` | Ставит `status = 'sent'`, `attempts = attempts + 1`, `sent_at = сейчас`, `last_error = NULL` |
| `markNotificationFailed(id, errorText, giveUp)` | Увеличивает `attempts`, пишет `last_error` (обрезать до 300 символов). Если `giveUp` истина, ставит `status = 'failed'`, иначе оставляет `pending` |

### Правила проверки внутри функций
- `createRequest`: `phone` и `description` после `trim()` не пустые; `name` и `service` по умолчанию пустая строка; `priceFrom` должно быть целым числом `>= 0` или `null`/не задано; `photoFiles` не больше 5 штук; каждое имя файла не пустое и не содержит `/`, `\` и `..` (хранится только имя файла); `channels` только из допустимых значений, без повторов.
- При нарушении выбрасывать `Error` с понятным текстом на русском (например, «Не больше 5 фото на заявку»). Сам вызывающий код (маршрут) будет превращать это в ответ клиенту позже.
- Длину текстов здесь не ограничивать: это сделает проверка входных данных в шаге приёма заявок.
- Функции чтения возвращают обычные объекты с именами в `camelCase` (`createdAt`, `priceFrom`, `fileName`, `lastError`, `sentAt`, `photoCount`), а не строки в стиле базы. Результаты `node:sqlite` приходят с прототипом `null`, поэтому копировать в обычные объекты.

## Изменения в server/index.js (минимально)
1. Подключить `const db = require('./db');`.
2. После `prepareDataDirs()` и до `server.listen` вызвать `db.initDb(DATA_DIR)` внутри `try`. При ошибке вывести в консоль понятное сообщение («Не удалось открыть базу данных: …») и завершиться с кодом 1. Токены и значения `.env` в сообщение не попадают.
3. После строки «Сервер запущен…» вывести ещё одну строку: `База данных: <полный путь к app.db>`.
4. Корректное закрытие: на `SIGINT` и `SIGTERM` закрыть HTTP-сервер, вызвать `db.closeDb()` и завершить процесс кодом 0.
5. Остальное в файле не менять: маршруты, раздачу файлов, заголовки и сообщения остаются как есть.

## scripts/check-db.js (самопроверка)
Один скрипт, запускается командой `npm run check:db`. Без внешних библиотек, использует `node:assert`, `node:fs`, `node:os`, `node:path` и `../server/db.js`.

1. Создать временную папку через `fs.mkdtempSync` в `os.tmpdir()`. Реальную папку `data/` не трогать.
2. Проверить по шагам и вывести по строке `OK: …` на каждую проверку:
   - `initDb` создаёт файл `app.db`;
   - повторный запуск `initDb` после `closeDb` не стирает данные (создать заявку, закрыть, открыть, найти её);
   - `createRequest` с 2 фото и каналами `telegram`, `max` возвращает `id`, `getRequest` отдаёт заявку, 2 фото по порядку и 2 уведомления `pending`;
   - заявка без услуги и без цены создаётся (`priceFrom` равно `null`);
   - ошибки: пустой телефон, пустое описание, 6 фото, имя файла `../x.jpg`, неизвестный канал, отрицательная цена. Во всех случаях исключение, а в базе после этого не появляется «полузаявок» (проверить, что число заявок не выросло, значит откат работает);
   - `listRequests` возвращает от новых к старым, фильтр по статусу и `total` верны, `limit` больше 200 обрезается до 200;
   - `setRequestStatus` меняет статус, неверный статус даёт ошибку, несуществующий `id` даёт `false`;
   - `getPendingNotifications`, `markNotificationSent`, `markNotificationFailed` (сначала `giveUp = false` остаётся `pending` с `attempts = 1`, затем `giveUp = true` даёт `failed`);
   - SQL-инъекция: заявка с описанием `'); DROP TABLE requests;--` сохраняется как обычный текст, таблица на месте.
3. В конце закрыть базу и удалить временную папку (`fs.rmSync(..., { recursive: true, force: true })`), даже если проверка упала (`try/finally`).
4. При успехе вывести «Все проверки базы пройдены» и завершиться кодом 0. При ошибке вывести, какая проверка не прошла, и завершиться кодом 1.

## Раздел в README «База данных и её проверка»
Коротко и простыми словами:
1. Заявки хранятся в файле `data/app.db` (на сервере `/data/app.db`). Файл создаётся сам при запуске `npm start`.
2. Это файл с данными клиентов: его нельзя выкладывать в интернет и в репозиторий (папка `data/` уже исключена).
3. Чтобы проверить, что база работает, выполнить в терминале `npm run check:db`. Должна появиться строка «Все проверки базы пройдены».
4. Если в консоли появляется жёлтое предупреждение про `SQLite is an experimental feature`, это нормально: оно не мешает работе.
5. Чтобы начать с чистой базы на компьютере, остановить сервер и удалить файлы `app.db`, `app.db-wal`, `app.db-shm` в папке `data/`.

## Готово, когда
- `npm start` запускается без установки пакетов, в консоли есть строки «Сервер запущен: …» и «База данных: …», в `data/` появился файл `app.db`.
- Форма на `http://localhost:3000` и `/api/health` работают как раньше.
- `npm run check:db` печатает «Все проверки базы пройдены».
- Повторный запуск `npm start` не стирает данные.
- Остановка сервера через Ctrl+C проходит без ошибок.
- Новых npm-пакетов и новых адресов сервера нет. `public/`, `furniture/`, `.env.example`, `.gitignore` не изменены.
