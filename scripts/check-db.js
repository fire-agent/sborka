'use strict';

// Самопроверка базы данных.
// Создаёт временную папку, проверяет все функции, удаляет временную папку.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../server/db');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-check-db-'));
let tempDataDir;

// Вызывает fn и проверяет, что выбрасывается ошибка с заданным сообщением
function expectError(fn, message) {
    let ok = false;
    try {
        fn();
    } catch (e) {
        ok = true;
        assert.ok(e.message.includes(message), 'Ожидалось сообщение "' + message + '", получено: ' + e.message);
    }
    assert.ok(ok, 'Ожидалась ошибка, но функция выполнилась без ошибок');
}

// Проверка шагов
try {
    // 1. initDb создаёт файл app.db
    tempDataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(tempDataDir);
    const dbPath = db.initDb(tempDataDir);
    assert.strictEqual(dbPath, path.join(tempDataDir, 'app.db'));
    assert.strictEqual(fs.existsSync(dbPath), true);
    console.log('OK: initDb создаёт файл app.db');

    // Проверим, что таблицы и индексы созданы
    const connection = new (require('node:sqlite').DatabaseSync)(dbPath);
    const tables = connection.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence' ORDER BY name").all();
    assert.strictEqual(tables.length, 3, 'Ожидаются 3 таблицы');
    const tableNames = tables.map(t => t.name).sort();
    assert.deepStrictEqual(tableNames, ['notifications', 'photos', 'requests'], 'Имена таблиц');
    const indices = connection.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name").all();
    assert.strictEqual(indices.length, 4, 'Ожидаются 4 индекса');
    const indexNames = indices.map(i => i.name).sort();
    assert.deepStrictEqual(indexNames, ['idx_notifications_status', 'idx_photos_request_id', 'idx_requests_created_at', 'idx_requests_status'], 'Имена индексов');
    connection.close();
    console.log('OK: создание таблиц и индексов');

    // 2. Повторный запуск initDb после closeDb не стирает данные
    db.closeDb();
    db.initDb(tempDataDir);
    const now1 = new Date().toISOString();
    const id1 = db.createRequest({
        phone: '+79001234567',
        description: 'Тестовая заявка 1',
        channels: []
    });
    assert.ok(id1 > 0, 'Заявка должна иметь id > 0');
    db.closeDb();

    db.initDb(tempDataDir);
    const req1 = db.getRequest(id1);
    assert.ok(req1 !== null, 'Заявка должна остаться после закрытия и повторного открытия');
    assert.strictEqual(req1.id, id1);
    assert.strictEqual(req1.phone, '+79001234567');
    console.log('OK: повторный запуск initDb не стирает данные');

    // 3. createRequest с 2 фото и каналами telegram, max
    const now2 = new Date().toISOString();
    const id2 = db.createRequest({
        name: 'Иван',
        phone: '+79007654321',
        service: 'Ремонт кухни',
        priceFrom: 5000,
        description: 'Нужно заменить фасады',
        photoFiles: ['f1.jpg', 'f2.png'],
        channels: ['telegram', 'max']
    });
    const req2 = db.getRequest(id2);
    assert.strictEqual(req2.id, id2);
    assert.strictEqual(req2.name, 'Иван');
    assert.strictEqual(req2.phone, '+79007654321');
    assert.strictEqual(req2.service, 'Ремонт кухни');
    assert.strictEqual(req2.priceFrom, 5000);
    assert.strictEqual(req2.description, 'Нужно заменить фасады');
    assert.strictEqual(req2.status, 'new');
    assert.strictEqual(req2.photos.length, 2);
    assert.strictEqual(req2.photos[0].position, 1);
    assert.strictEqual(req2.photos[0].fileName, 'f1.jpg');
    assert.strictEqual(req2.photos[1].position, 2);
    assert.strictEqual(req2.photos[1].fileName, 'f2.png');
    assert.strictEqual(req2.notifications.length, 2);
    const notif2 = req2.notifications.sort((a, b) => a.channel.localeCompare(b.channel));
    assert.strictEqual(notif2[0].channel, 'max');
    assert.strictEqual(notif2[0].status, 'pending');
    assert.strictEqual(notif2[0].attempts, 0);
    assert.strictEqual(notif2[1].channel, 'telegram');
    assert.strictEqual(notif2[1].status, 'pending');
    assert.strictEqual(notif2[1].attempts, 0);
    console.log('OK: createRequest с фото и каналами');

    // 4. Заявка без услуги и без цены создаётся
    const id3 = db.createRequest({
        phone: '+79001112233',
        description: 'Без цены',
        channels: []
    });
    const req3 = db.getRequest(id3);
    assert.strictEqual(req3.service, '');
    assert.strictEqual(req3.priceFrom, null);
    console.log('OK: заявка без услуги и без цены');

    // 5. Ошибки: пустой телефон, пустое описание, 6 фото, имя файла ../x.jpg, неизвестный канал, отрицательная цена
    const beforeCount = db.listRequests({}).total;
    expectError(function () {
        db.createRequest({ phone: '', description: 'x', channels: [] });
    }, 'Не указан телефон');
    expectError(function () {
        db.createRequest({ phone: '1', description: '', channels: [] });
    }, 'Не заполнено описание');
    expectError(function () {
        db.createRequest({ phone: '1', description: 'x', photoFiles: ['a', 'b', 'c', 'd', 'e', 'f'], channels: [] });
    }, 'Не больше 5 фото');
    expectError(function () {
        db.createRequest({ phone: '1', description: 'x', photoFiles: ['../x.jpg'], channels: [] });
    }, 'Недопустимое имя файла фото');
    expectError(function () {
        db.createRequest({ phone: '1', description: 'x', channels: ['viber'] });
    }, 'Неизвестный канал');
    expectError(function () {
        db.createRequest({ phone: '1', description: 'x', priceFrom: -100, channels: [] });
    }, 'Цена должна быть целым числом не меньше 0');
    assert.strictEqual(db.listRequests({}).total, beforeCount, 'База не должна содержать полузаявок');
    console.log('OK: ошибки валидации и транзакция откатывается');

    // 6. listRequests возвращает от новых к старым, фильтр по статусу и total верны
    const listAll = db.listRequests({});
    assert.strictEqual(listAll.items.length, 3);
    assert.strictEqual(listAll.total, 3);
    assert.strictEqual(listAll.items[0].id, id3);
    assert.strictEqual(listAll.items[1].id, id2);
    assert.strictEqual(listAll.items[2].id, id1);

    // Добавим заявку со статусом done
    db.setRequestStatus(id1, 'done');
    const listDone = db.listRequests({ status: 'done', limit: 10, offset: 0 });
    assert.strictEqual(listDone.items.length, 1);
    assert.strictEqual(listDone.items[0].id, id1);
    assert.strictEqual(listDone.total, 1);

    // limit больше 200 обрезается до 200
    const listBigLimit = db.listRequests({ limit: 1000 });
    assert.strictEqual(listBigLimit.items.length, 3);
    console.log('OK: listRequests с сортировкой, фильтром и лимитами');

    // 7. setRequestStatus меняет статус, неверный статус даёт ошибку, несуществующий id даёт false
    assert.strictEqual(db.setRequestStatus(id2, 'in_progress'), true);
    assert.strictEqual(db.getRequest(id2).status, 'in_progress');
    expectError(function () {
        db.setRequestStatus(id2, 'unknown');
    }, 'Неизвестный статус');
    assert.strictEqual(db.setRequestStatus(99999, 'done'), false);
    console.log('OK: setRequestStatus');

    // 8. getPendingNotifications, markNotificationSent, markNotificationFailed
    // Примечание: getRequest возвращает уведомления без id, используем getPendingNotifications для получения id
    const pending = db.getPendingNotifications(10);
    assert.strictEqual(pending.length, 2);
    const notifMax = pending.find(n => n.channel === 'max');
    assert.ok(notifMax !== undefined);
    const notifId = notifMax.id;

    // markNotificationSent с giveUp = false
    assert.strictEqual(db.markNotificationSent(notifId), true);
    // После markNotificationSent уведомление меняет статус, проверяем через getRequest
    const reqSent = db.getRequest(id2);
    const notifSent = reqSent.notifications.find(n => n.channel === 'max');
    assert.ok(notifSent !== undefined);
    assert.strictEqual(notifSent.status, 'sent');
    assert.strictEqual(notifSent.attempts, 1);
    assert.ok(notifSent.sentAt !== undefined);
    // Используем notifId из getPendingNotifications для дальнейших операций
    const notifTelegramId = pending.find(n => n.channel === 'telegram').id;
    assert.ok(notifTelegramId !== undefined, 'id telegram уведомления должен быть найден');

    // markNotificationFailed с giveUp = false: остаётся pending, attempts = 1, ошибка записана
    assert.strictEqual(db.markNotificationFailed(notifTelegramId, 'Ошибка сети', false), true);
    const reqRetry = db.getRequest(id2);
    const notifRetry = reqRetry.notifications.find(n => n.channel === 'telegram');
    assert.strictEqual(notifRetry.status, 'pending');
    assert.strictEqual(notifRetry.attempts, 1);
    assert.strictEqual(notifRetry.lastError, 'Ошибка сети');

    // markNotificationFailed с giveUp = true: статус failed, attempts = 2, ошибка перезаписана
    assert.strictEqual(db.markNotificationFailed(notifTelegramId, 'Нет связи', true), true);
    const reqFailGiveUp = db.getRequest(id2);
    const notifFailGiveUp = reqFailGiveUp.notifications.find(n => n.channel === 'telegram');
    assert.strictEqual(notifFailGiveUp.status, 'failed');
    assert.strictEqual(notifFailGiveUp.attempts, 2);
    assert.strictEqual(notifFailGiveUp.lastError, 'Нет связи');

    console.log('OK: getPendingNotifications, markNotificationSent, markNotificationFailed');

    // 9. SQL-инъекция: описание с "); DROP TABLE requests;--" сохраняется как обычный текст
    const injectionId = db.createRequest({
        phone: '+79009998877',
        description: "'); DROP TABLE requests;--",
        channels: []
    });
    const reqInjection = db.getRequest(injectionId);
    assert.strictEqual(reqInjection.id, injectionId);
    assert.strictEqual(reqInjection.description, "'); DROP TABLE requests;--");
    assert.strictEqual(db.listRequests({}).total, 4, 'Таблица requests не должна быть удалена');
    console.log('OK: SQL-инъекция заблокирована');

} finally {
    // Закрыть базу и удалить временную папку
    try {
        db.closeDb();
    } catch (e) {
        // ignore
    }
    try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
        // ignore
    }
}

console.log('Все проверки базы пройдены');
process.exit(0);
