'use strict';

// Хранилище заявок на встроенном node:sqlite (без сторонних библиотек).
// Все функции синхронные. Модуль держит одно открытое соединение.
// Все запросы только с параметрами (?), данные пользователя в SQL не склеиваются.

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 2;
const MAX_PHOTOS = 5;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;
const DEFAULT_PENDING_LIMIT = 20;
const MAX_ERROR_LENGTH = 300;

const STATUSES = ['new', 'in_progress', 'done', 'cancelled'];
const CHANNELS = ['telegram', 'max', 'whatsapp'];

let db = null;
let dbPath = null;
let stmts = null;

// ---------- Схема ----------

const SCHEMA_SQL = `
CREATE TABLE requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    phone       TEXT NOT NULL,
    service     TEXT NOT NULL DEFAULT '',
    price_from  INTEGER,
    base_price  REAL,
    discount_value REAL,
    discount_type TEXT CHECK (discount_type IN ('percent','fixed')),
    final_price REAL,
    manager_note TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','in_progress','done','cancelled'))
);
CREATE INDEX idx_requests_created_at ON requests(created_at);
CREATE INDEX idx_requests_status ON requests(status);

CREATE TABLE photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL CHECK (position BETWEEN 1 AND 5),
    file_name   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (request_id, position)
);
CREATE INDEX idx_photos_request_id ON photos(request_id);

CREATE TABLE notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id  INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    channel     TEXT NOT NULL CHECK (channel IN ('telegram','max','whatsapp')),
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','sent','failed')),
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT,
    created_at  TEXT NOT NULL,
    sent_at     TEXT,
    UNIQUE (request_id, channel)
);
CREATE INDEX idx_notifications_status ON notifications(status);
`;

// Выполняет fn в транзакции: при ошибке откатывает и пробрасывает ошибку дальше
function inTransaction(fn) {
    db.exec('BEGIN');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (e) {
        try {
            db.exec('ROLLBACK');
        } catch (rollbackError) {
            // Откат мог уже выполниться самой базой, ошибку откатa не скрываем от исходной
        }
        throw e;
    }
}

// Создаёт таблицы при первом запуске, проверяет версию схемы
// Проверяет, есть ли колонка в таблице
function hasColumn(tableName, columnName) {
    const rows = db.prepare('PRAGMA table_info(' + tableName + ')').all();
    return rows.some(function (row) {
        return row.name === columnName;
    });
}

// Добавляет колонку, если её ещё нет. Имена таблицы и определение — только из кода.
function addColumnIfMissing(tableName, columnName, definition) {
    if (hasColumn(tableName, columnName)) {
        return;
    }
    db.exec('ALTER TABLE ' + tableName + ' ADD COLUMN ' + columnName + ' ' + definition);
}

// Миграция существующей базы до текущей версии схемы
function migrateFrom(version) {
    if (version < 2) {
        addColumnIfMissing('requests', 'base_price', 'REAL');
        addColumnIfMissing('requests', 'discount_value', 'REAL');
        addColumnIfMissing('requests', 'discount_type', "TEXT CHECK (discount_type IN ('percent','fixed'))");
        addColumnIfMissing('requests', 'final_price', 'REAL');
        addColumnIfMissing('requests', 'manager_note', "TEXT NOT NULL DEFAULT ''");
    }
}

// Создаёт таблицы при первом запуске, проверяет версию схемы
function applySchema() {
    const version = db.prepare('PRAGMA user_version').get().user_version;

    if (version > SCHEMA_VERSION) {
        throw new Error('База создана более новой версией программы (версия схемы ' + version + ')');
    }
    if (version === SCHEMA_VERSION) {
        return;
    }

    inTransaction(function () {
        if (version === 0) {
            db.exec(SCHEMA_SQL);
        } else {
            migrateFrom(version);
        }
        db.exec('PRAGMA user_version = ' + SCHEMA_VERSION);
    });
}

// Подготавливаем запросы один раз после открытия
function prepareStatements() {
    stmts = {
        insertRequest: db.prepare(
            'INSERT INTO requests (created_at, name, phone, service, price_from, description, status) ' +
            "VALUES (?, ?, ?, ?, ?, ?, 'new')"
        ),
        insertPhoto: db.prepare(
            'INSERT INTO photos (request_id, position, file_name, created_at) VALUES (?, ?, ?, ?)'
        ),
        insertNotification: db.prepare(
            "INSERT INTO notifications (request_id, channel, status, attempts, created_at) " +
            "VALUES (?, ?, 'pending', 0, ?)"
        ),
        getRequest: db.prepare(
            'SELECT id, created_at, name, phone, service, price_from, description, status, ' +
            'base_price, discount_value, discount_type, final_price, manager_note ' +
            'FROM requests WHERE id = ?'
        ),
        getPhotos: db.prepare(
            'SELECT position, file_name FROM photos WHERE request_id = ? ORDER BY position'
        ),
        getPhotoFileNames: db.prepare(
            'SELECT file_name FROM photos WHERE request_id = ? ORDER BY position'
        ),
        getNotifications: db.prepare(
            'SELECT channel, status, attempts, last_error, sent_at FROM notifications ' +
            'WHERE request_id = ? ORDER BY id'
        ),
        listAll: db.prepare(
            'SELECT r.id, r.created_at, r.name, r.phone, r.service, r.price_from, r.base_price, ' +
            'r.discount_value, r.discount_type, r.final_price, r.manager_note, r.description, r.status, ' +
            '(SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count ' +
            'FROM requests r ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?'
        ),
        listByStatus: db.prepare(
            'SELECT r.id, r.created_at, r.name, r.phone, r.service, r.price_from, r.base_price, ' +
            'r.discount_value, r.discount_type, r.final_price, r.manager_note, r.description, r.status, ' +
            '(SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count ' +
            'FROM requests r WHERE r.status = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?'
        ),
        countAll: db.prepare('SELECT COUNT(*) AS total FROM requests'),
        countByStatus: db.prepare('SELECT COUNT(*) AS total FROM requests WHERE status = ?'),
        listAllWithSearch: db.prepare(
            'SELECT r.id, r.created_at, r.name, r.phone, r.service, r.price_from, r.base_price, ' +
            'r.discount_value, r.discount_type, r.final_price, r.manager_note, r.description, r.status, ' +
            '(SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count ' +
            'FROM requests r WHERE (r.phone LIKE ? OR r.name LIKE ?) ' +
            'ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?'
        ),
        listByStatusWithSearch: db.prepare(
            'SELECT r.id, r.created_at, r.name, r.phone, r.service, r.price_from, r.base_price, ' +
            'r.discount_value, r.discount_type, r.final_price, r.manager_note, r.description, r.status, ' +
            '(SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count ' +
            'FROM requests r WHERE r.status = ? AND (r.phone LIKE ? OR r.name LIKE ?) ' +
            'ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?'
        ),
        countAllWithSearch: db.prepare(
            'SELECT COUNT(*) AS total FROM requests WHERE (phone LIKE ? OR name LIKE ?)'
        ),
        countByStatusWithSearch: db.prepare(
            'SELECT COUNT(*) AS total FROM requests WHERE status = ? AND (phone LIKE ? OR name LIKE ?)'
        ),
        setStatus: db.prepare('UPDATE requests SET status = ? WHERE id = ?'),
        deleteRequestById: db.prepare('DELETE FROM requests WHERE id = ?'),
        pending: db.prepare(
            'SELECT n.id AS notification_id, n.request_id, n.channel, n.attempts, ' +
            'r.phone, r.name, r.service, r.price_from, r.description, r.created_at, ' +
            '(SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count ' +
            "FROM notifications n JOIN requests r ON r.id = n.request_id " +
            "WHERE n.status = 'pending' ORDER BY n.created_at ASC, n.id ASC LIMIT ?"
        ),
        markSent: db.prepare(
            "UPDATE notifications SET status = 'sent', attempts = attempts + 1, " +
            'sent_at = ?, last_error = NULL WHERE id = ?'
        ),
        markFailedRetry: db.prepare(
            'UPDATE notifications SET attempts = attempts + 1, last_error = ? WHERE id = ?'
        ),
        markFailedGiveUp: db.prepare(
            "UPDATE notifications SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?"
        )
    };
}

function requireDb() {
    if (!db) {
        throw new Error('База данных не открыта');
    }
}

// ---------- Открытие и закрытие ----------

// Открывает базу в dataDir/app.db и применяет схему. Возвращает путь к файлу базы.
function initDb(dataDir) {
    const filePath = path.join(dataDir, 'app.db');

    if (db) {
        // Если уже открыта, но путь другой - закрываем и открываем новую
        if (dbPath !== filePath) {
            closeDb();
        } else {
            // Путь тот же, просто возвращаем
            return dbPath;
        }
    }

    const connection = new DatabaseSync(filePath);
    db = connection;
    dbPath = filePath;

    try {
        db.exec('PRAGMA foreign_keys = ON');
        db.exec('PRAGMA busy_timeout = 5000');
        try {
            db.exec('PRAGMA journal_mode = WAL');
        } catch (e) {
            // WAL не получился, работаем в режиме по умолчанию
        }
        applySchema();
        prepareStatements();
    } catch (e) {
        closeDb();
        throw e;
    }

    return dbPath;
}

// Закрывает базу, если она открыта
function closeDb() {
    if (db) {
        try {
            db.close();
        } finally {
            db = null;
            dbPath = null;
            stmts = null;
        }
    }
}

// ---------- Преобразования строк ----------

// Строка базы (без прототипа) -> обычный объект в camelCase
function toRequest(row) {
    return {
        id: row.id,
        createdAt: row.created_at,
        name: row.name,
        phone: row.phone,
        service: row.service,
        priceFrom: row.price_from,
        basePrice: row.base_price ?? null,
        discountValue: row.discount_value ?? null,
        discountType: row.discount_type ?? null,
        finalPrice: row.final_price ?? null,
        managerNote: row.manager_note ?? '',
        description: row.description,
        status: row.status
    };
}

// Ограничивает целое число диапазоном, при неверном значении берёт запасное
function toInt(value, fallback, min, max) {
    const n = Number(value);
    if (value === undefined || value === null || !Number.isInteger(n)) {
        return fallback;
    }
    return Math.min(Math.max(n, min), max);
}

// ---------- Проверка входных данных createRequest ----------

function cleanText(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function validateNewRequest(data) {
    const input = data || {};

    const phone = cleanText(input.phone);
    if (!phone) {
        throw new Error('Не указан телефон');
    }

    const description = cleanText(input.description);
    if (!description) {
        throw new Error('Не заполнено описание');
    }

    let priceFrom = null;
    if (input.priceFrom !== undefined && input.priceFrom !== null) {
        if (!Number.isInteger(input.priceFrom) || input.priceFrom < 0) {
            throw new Error('Цена должна быть целым числом не меньше 0');
        }
        priceFrom = input.priceFrom;
    }

    const photoFiles = input.photoFiles === undefined || input.photoFiles === null ? [] : input.photoFiles;
    if (!Array.isArray(photoFiles)) {
        throw new Error('Список фото должен быть массивом');
    }
    if (photoFiles.length > MAX_PHOTOS) {
        throw new Error('Не больше ' + MAX_PHOTOS + ' фото на заявку');
    }
    for (const fileName of photoFiles) {
        if (typeof fileName !== 'string' || fileName.trim() === '' ||
            fileName.indexOf('/') !== -1 || fileName.indexOf('\\') !== -1 ||
            fileName.indexOf('..') !== -1) {
            throw new Error('Недопустимое имя файла фото');
        }
    }

    const channels = input.channels === undefined || input.channels === null ? [] : input.channels;
    if (!Array.isArray(channels)) {
        throw new Error('Список каналов должен быть массивом');
    }
    const seen = new Set();
    for (const channel of channels) {
        if (CHANNELS.indexOf(channel) === -1) {
            throw new Error('Неизвестный канал уведомлений');
        }
        if (seen.has(channel)) {
            throw new Error('Канал уведомлений указан повторно');
        }
        seen.add(channel);
    }

    return {
        name: cleanText(input.name),
        phone: phone,
        service: cleanText(input.service),
        priceFrom: priceFrom,
        description: description,
        photoFiles: photoFiles,
        channels: channels
    };
}

// ---------- Заявки ----------

// Создаёт заявку, фото и уведомления в одной транзакции. Возвращает id заявки.
function createRequest(data) {
    requireDb();
    const r = validateNewRequest(data);
    const now = new Date().toISOString();

    return inTransaction(function () {
        const result = stmts.insertRequest.run(now, r.name, r.phone, r.service, r.priceFrom, r.description);
        const id = Number(result.lastInsertRowid);

        r.photoFiles.forEach(function (fileName, index) {
            stmts.insertPhoto.run(id, index + 1, fileName, now);
        });
        r.channels.forEach(function (channel) {
            stmts.insertNotification.run(id, channel, now);
        });

        return id;
    });
}

// Возвращает заявку с фото и уведомлениями или null
function getRequest(id) {
    requireDb();
    const row = stmts.getRequest.get(id);
    if (!row) {
        return null;
    }

    const request = toRequest(row);
    request.photos = stmts.getPhotos.all(id).map(function (p) {
        return { position: p.position, fileName: p.file_name };
    });
    request.notifications = stmts.getNotifications.all(id).map(function (n) {
        return {
            channel: n.channel,
            status: n.status,
            attempts: n.attempts,
            lastError: n.last_error,
            sentAt: n.sent_at
        };
    });
    return request;
}

// Список заявок от новых к старым: { items, total }
function listRequests(options) {
    requireDb();
    const opts = options || {};
    const limit = toInt(opts.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const offset = toInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER);

    const hasStatus = opts.status !== undefined && opts.status !== null && opts.status !== '';
    const search = cleanText(opts.search);
    const hasSearch = search.length > 0;
    const like = '%' + search + '%';

    if (hasStatus && STATUSES.indexOf(opts.status) === -1) {
        throw new Error('Неизвестный статус заявки');
    }

    let rows;
    let total;

    if (hasStatus && hasSearch) {
        rows = stmts.listByStatusWithSearch.all(opts.status, like, like, limit, offset);
        total = stmts.countByStatusWithSearch.get(opts.status, like, like).total;
    } else if (hasStatus) {
        rows = stmts.listByStatus.all(opts.status, limit, offset);
        total = stmts.countByStatus.get(opts.status).total;
    } else if (hasSearch) {
        rows = stmts.listAllWithSearch.all(like, like, limit, offset);
        total = stmts.countAllWithSearch.get(like, like).total;
    } else {
        rows = stmts.listAll.all(limit, offset);
        total = stmts.countAll.get().total;
    }

    const items = rows.map(function (row) {
        const item = toRequest(row);
        item.photoCount = row.photo_count;
        item.photos = stmts.getPhotoFileNames.all(row.id).map(function (p) {
            return { fileName: p.file_name };
        });
        return item;
    });
    return { items: items, total: total };
}

// ---------- Сводка и клиенты ----------

// Строит WHERE из фильтров status/search. Возвращает { where, values }.
function buildWhere(status, search) {
    const conditions = [];
    const values = [];

    if (status !== undefined && status !== null && status !== '') {
        if (STATUSES.indexOf(status) === -1) {
            throw new Error('Неизвестный статус заявки');
        }
        conditions.push('status = ?');
        values.push(status);
    }

    const q = cleanText(search);
    if (q.length > 0) {
        conditions.push('(phone LIKE ? OR name LIKE ?)');
        const like = '%' + q + '%';
        values.push(like, like);
    }

    return {
        where: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '',
        values: values
    };
}

// Сводка по заявкам: счётчики статусов и выручка по выполненным заявкам.
function getSummary(options) {
    requireDb();
    const opts = options || {};
    const filter = buildWhere(opts.status, opts.search);
    const sql =
        'SELECT ' +
        'COUNT(*) AS total, ' +
        "COALESCE(SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END), 0) AS count_new, " +
        "COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0) AS count_in_progress, " +
        "COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS count_done, " +
        "COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS count_cancelled, " +
        "COALESCE(SUM(CASE WHEN status = 'done' THEN final_price ELSE 0 END), 0) AS revenue " +
        'FROM requests' + filter.where;
    const row = db.prepare(sql).get(...filter.values);
    return {
        total: Number(row.total),
        countNew: Number(row.count_new),
        countInProgress: Number(row.count_in_progress),
        countDone: Number(row.count_done),
        countCancelled: Number(row.count_cancelled),
        revenue: Number(row.revenue)
    };
}

// Список клиентов, сгруппированных по телефону (для вкладки «Заказчики»).
function getClients(options) {
    requireDb();
    const opts = options || {};
    const limit = toInt(opts.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
    const offset = toInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const search = cleanText(opts.search);
    const values = [];

    let sql =
        'SELECT phone, MAX(name) AS name, COUNT(*) AS request_count, ' +
        'MAX(created_at) AS last_request_at, ' +
        'COALESCE(SUM(final_price), 0) AS total_spent, ' +
        'MIN(created_at) AS first_request_at ' +
        'FROM requests';
    if (search.length > 0) {
        sql += ' GROUP BY phone HAVING phone LIKE ? OR MAX(name) LIKE ?';
        const like = '%' + search + '%';
        values.push(like, like);
    } else {
        sql += ' GROUP BY phone';
    }
    sql += ' ORDER BY MAX(created_at) DESC LIMIT ? OFFSET ?';
    values.push(limit, offset);

    return db.prepare(sql).all(...values).map(function (row) {
        return {
            phone: row.phone,
            name: row.name || '',
            requestCount: Number(row.request_count),
            lastRequestAt: row.last_request_at,
            totalSpent: Number(row.total_spent),
            firstRequestAt: row.first_request_at
        };
    });
}

// Число уникальных клиентов (по телефону) с учётом поиска.
function getClientsCount(options) {
    requireDb();
    const opts = options || {};
    const search = cleanText(opts.search);
    const values = [];
    let sql;

    if (search.length > 0) {
        sql = 'SELECT COUNT(*) AS total FROM (' +
            'SELECT phone FROM requests GROUP BY phone ' +
            'HAVING phone LIKE ? OR MAX(name) LIKE ?' +
            ')';
        const like = '%' + search + '%';
        values.push(like, like);
    } else {
        sql = 'SELECT COUNT(DISTINCT phone) AS total FROM requests';
    }

    return Number(db.prepare(sql).get(...values).total);
}

// Меняет статус заявки. true, если заявка найдена.
function setRequestStatus(id, status) {
    requireDb();
    if (STATUSES.indexOf(status) === -1) {
        throw new Error('Неизвестный статус заявки');
    }
    const result = stmts.setStatus.run(status, id);
    return result.changes > 0;
}

// ---------- Обновление цены и заметки менеджера ----------

// Приводит необязательное число к конечному неотрицательному числу или null.
function toOptionalPrice(value, label) {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
        throw new Error(label + ' должен быть неотрицательным числом');
    }
    return n;
}

// Приводит заметку менеджера к строке без лишних пробелов (пустая строка — «нет заметки»).
function cleanManagerNote(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return String(value).trim();
}

// Соответствие полей данных и колонок таблицы (белый список)
const UPDATE_COLUMNS = {
    basePrice: 'base_price',
    discountValue: 'discount_value',
    discountType: 'discount_type',
    finalPrice: 'final_price',
    managerNote: 'manager_note'
};

// Проверяет данные обновления и возвращает объект только с переданными полями.
function validateUpdateRequest(data) {
    const input = data || {};
    const update = {};

    if (Object.prototype.hasOwnProperty.call(input, 'basePrice')) {
        update.basePrice = toOptionalPrice(input.basePrice, 'Базовая цена');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'discountValue')) {
        update.discountValue = toOptionalPrice(input.discountValue, 'Скидка');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'discountType')) {
        if (input.discountType === undefined || input.discountType === null || input.discountType === '') {
            update.discountType = null;
        } else if (input.discountType === 'percent' || input.discountType === 'fixed') {
            update.discountType = input.discountType;
        } else {
            throw new Error('Тип скидки должен быть "percent" или "fixed"');
        }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'finalPrice')) {
        update.finalPrice = toOptionalPrice(input.finalPrice, 'Итоговая сумма');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'managerNote')) {
        update.managerNote = cleanManagerNote(input.managerNote);
    }

    if (Object.keys(update).length === 0) {
        throw new Error('Нет полей для обновления');
    }

    return update;
}

// Обновляет базовую цену, скидку, итоговую сумму и заметку менеджера.
// data может содержать только часть полей. Возвращает true, если заявка найдена.
function updateRequestPricing(id, data) {
    requireDb();
    const update = validateUpdateRequest(data);

    const assignments = [];
    const values = [];
    for (const key of Object.keys(update)) {
        assignments.push(UPDATE_COLUMNS[key] + ' = ?');
        values.push(update[key]);
    }
    values.push(id);

    const sql = 'UPDATE requests SET ' + assignments.join(', ') + ' WHERE id = ?';
    const result = db.prepare(sql).run(...values);
    return result.changes > 0;
}

// Удаляет заявку и возвращает имена файлов фотографий для физической очистки.
// Возвращает { deleted: boolean, photoFileNames: string[] }.
function deleteRequest(id) {
    requireDb();
    const photoFileNames = stmts.getPhotoFileNames.all(id).map(function (row) {
        return row.file_name;
    });

    const deleted = inTransaction(function () {
        const result = stmts.deleteRequestById.run(id);
        return result.changes > 0;
    });

    return {
        deleted: deleted,
        photoFileNames: photoFileNames
    };
}

// ---------- Уведомления ----------

// Уведомления в ожидании вместе с данными заявки, от старых к новым
function getPendingNotifications(limit) {
    requireDb();
    const n = toInt(limit, DEFAULT_PENDING_LIMIT, 1, MAX_LIST_LIMIT);
    return stmts.pending.all(n).map(function (row) {
        return {
            id: row.notification_id,
            requestId: row.request_id,
            channel: row.channel,
            attempts: row.attempts,
            phone: row.phone,
            name: row.name,
            service: row.service,
            priceFrom: row.price_from,
            description: row.description,
            createdAt: row.created_at,
            photoCount: row.photo_count
        };
    });
}

function markNotificationSent(id) {
    requireDb();
    const result = stmts.markSent.run(new Date().toISOString(), id);
    return result.changes > 0;
}

// Увеличивает число попыток и пишет ошибку. При giveUp уведомление получает статус failed.
function markNotificationFailed(id, errorText, giveUp) {
    requireDb();
    const text = String(errorText === undefined || errorText === null ? '' : errorText)
        .slice(0, MAX_ERROR_LENGTH);
    const stmt = giveUp ? stmts.markFailedGiveUp : stmts.markFailedRetry;
    const result = stmt.run(text, id);
    return result.changes > 0;
}

module.exports = {
    initDb,
    closeDb,
    createRequest,
    getRequest,
    listRequests,
    setRequestStatus,
    updateRequestPricing,
    getSummary,
    getClients,
    getClientsCount,
    deleteRequest,
    getPendingNotifications,
    markNotificationSent,
    markNotificationFailed
};
