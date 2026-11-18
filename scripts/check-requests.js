'use strict';

// Самопроверка приёма заявок: запускает сервер во временной папке и прогоняет проверки.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const db = require('../server/db');
const { parseMultipart } = require('../server/multipart');

const ROOT = path.resolve(__dirname, '..');

let tmpDir;
let tempDataDir;
let child = null;
let serverOutput = '';
let port;
let baseUrl;
let ipCounter = 0;

function nextIp() {
    ipCounter += 1;
    return '10.0.0.' + ipCounter;
}

function ok(msg) { console.log('OK: ' + msg); }

function findFreePort() {
    return new Promise(function (resolve, reject) {
        const srv = net.createServer();
        srv.on('error', reject);
        srv.listen(0, function () {
            const p = srv.address().port;
            srv.close(function () { resolve(p); });
        });
    });
}

function waitForHealth() {
    return new Promise(function (resolve, reject) {
        const deadline = Date.now() + 10000;
        (function poll() {
            if (Date.now() > deadline) {
                reject(new Error('Сервер не запустился. Вывод: ' + serverOutput));
                return;
            }
            fetch(baseUrl + '/api/health')
                .then(function (res) {
                    if (res.ok) resolve();
                    else setTimeout(poll, 100);
                })
                .catch(function () { setTimeout(poll, 100); });
        })();
    });
}

function spawnServer() {
    child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
        env: Object.assign({}, process.env, {
            PORT: String(port),
            DATA_DIR: tempDataDir,
            TRUST_PROXY: 'true'
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', function (d) { serverOutput += d; });
    child.stderr.on('data', function (d) { serverOutput += d; });
    child.on('error', function (e) { serverOutput += e.message; });
}

// Собирает multipart-тело из текстовых полей и файлов (для прямых проверок разбора)
function buildMultipart(boundary, parts) {
    const CRLF = '\r\n';
    const chunks = [];
    for (const p of parts) {
        let head = '--' + boundary + CRLF;
        head += 'Content-Disposition: form-data; name="' + p.field + '"';
        if (p.data !== undefined) {
            head += '; filename="' + (p.filename || '') + '"' + CRLF;
            head += 'Content-Type: ' + (p.contentType || 'application/octet-stream') + CRLF + CRLF;
            chunks.push(Buffer.from(head, 'utf8'));
            chunks.push(p.data);
            chunks.push(Buffer.from(CRLF));
        } else {
            head += CRLF + CRLF;
            chunks.push(Buffer.from(head, 'utf8'));
            chunks.push(Buffer.from(p.value, 'utf8'));
            chunks.push(Buffer.from(CRLF));
        }
    }
    chunks.push(Buffer.from('--' + boundary + '--' + CRLF));
    return Buffer.concat(chunks);
}

// Отправляет заявку через форму
async function postForm(fields, files, ip) {
    const form = new FormData();
    for (const f of fields) {
        if (Array.isArray(f[1])) {
            for (const v of f[1]) form.append(f[0], v);
        } else {
            form.append(f[0], f[1]);
        }
    }
    for (const f of files) {
        form.append('photos', new Blob([f.data], { type: f.type }), f.name);
    }
    const headers = {};
    if (ip) headers['X-Forwarded-For'] = ip;
    const res = await fetch(baseUrl + '/api/requests', { method: 'POST', body: form, headers: headers });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json: json, headers: res.headers };
}

function countRequests() {
    return db.listRequests({ limit: 200 }).total;
}

function photosDir() {
    return path.join(tempDataDir, 'photos');
}

function listPhotoFiles() {
    const dir = photosDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir);
}

function expectFormError(result, field) {
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.json.ok, false);
    if (field) assert.strictEqual(result.json.field, field);
}

async function main() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-check-requests-'));
    tempDataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(tempDataDir);

    port = await findFreePort();
    baseUrl = 'http://127.0.0.1:' + port;

    spawnServer();
    await waitForHealth();
    db.initDb(tempDataDir);

    const configRes = await fetch(baseUrl + '/config.json');
    assert.strictEqual(configRes.status, 200, 'Настройки должны отдаваться сервером');
    const config = await configRes.json();

    const services = (Array.isArray(config.services) ? config.services : [])
        .filter(function (s) { return s && typeof s === 'object' && typeof s.name === 'string' && s.name.trim() !== ''; })
        .map(function (s) {
            return {
                name: s.name.trim(),
                priceFrom: (typeof s.priceFrom === 'number' && Number.isFinite(s.priceFrom) && s.priceFrom >= 0) ? Math.round(s.priceFrom) : null
            };
        });
    if (services.length === 0) {
        throw new Error('В настройках нет ни одной услуги — проверку приёма заявок выполнить нельзя');
    }
    const service = services[0];

    const enabledChannels = ['telegram', 'max', 'whatsapp'].filter(function (ch) {
        return config.notifications && config.notifications[ch] === true;
    });

    // ---------- Тестовые файлы (в памяти) ----------
    const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(20, 1)]);
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(20, 2)]);
    const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), Buffer.alloc(20, 3)]);
    const FAKE = Buffer.from('hello world, not an image', 'utf8');
    const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(20, 5)]);
    const BIG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(4 * 1024 * 1024 + 1, 4)]);

    // ---------- Прямые проверки разбора multipart ----------

    // 1. Поля и файл разбираются, русский текст не портится
    {
        const boundary = '----pwaTest1';
        const body = buildMultipart(boundary, [
            { field: 'name', value: 'Привет мир' },
            { field: 'doc', filename: 'a.txt', contentType: 'text/plain', data: Buffer.from('abc', 'utf8') }
        ]);
        const p = parseMultipart(body, boundary);
        assert.strictEqual(p.fields.name, 'Привет мир');
        assert.strictEqual(p.files.length, 1);
        assert.strictEqual(p.files[0].filename, 'a.txt');
        assert.strictEqual(p.files[0].data.toString('utf8'), 'abc');
        ok('multipart разбирает поля и файл, русский текст не портится');
    }

    // 2. Бинарные данные с \r\n-- не обрезаются
    {
        const boundary = '----pwaTest2';
        const data = Buffer.concat([Buffer.from('AAAA', 'latin1'), Buffer.from('\r\n--', 'latin1'), Buffer.from('BBBB', 'latin1')]);
        const body = buildMultipart(boundary, [
            { field: 'photos', filename: 'x.bin', contentType: 'application/octet-stream', data: data }
        ]);
        const p = parseMultipart(body, boundary);
        assert.strictEqual(p.files.length, 1);
        assert.ok(p.files[0].data.equals(data), 'Бинарные данные файла должны сохраниться без обрезки');
        ok('multipart не обрезает бинарные данные с похожим на разделитель содержимым');
    }

    // 3. Обрезанное тело без закрывающего маркера даёт ошибку
    {
        const boundary = '----pwaTest3';
        const body = Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="x"\r\n\r\nhello\r\n', 'utf8');
        assert.throws(function () { parseMultipart(body, boundary); }, /Форма не завершена/);
        ok('multipart отклоняет тело без закрывающего маркера');
    }

    // 4. Больше 20 частей даёт ошибку
    {
        const boundary = '----pwaTest4';
        const parts = [];
        for (let i = 0; i < 21; i++) parts.push({ field: 'f' + i, value: 'v' + i });
        const body = buildMultipart(boundary, parts);
        assert.throws(function () { parseMultipart(body, boundary); }, /Слишком много частей/);
        ok('multipart отклоняет больше 20 частей');
    }

    // 5. Поле __proto__ не ломает результат
    {
        const boundary = '----pwaTest5';
        const body = buildMultipart(boundary, [
            { field: '__proto__', value: 'evil' },
            { field: 'name', value: 'ok' }
        ]);
        const p = parseMultipart(body, boundary);
        assert.strictEqual(Object.getPrototypeOf(p.fields), null);
        assert.strictEqual(p.fields.__proto__, 'evil');
        assert.strictEqual(p.fields.name, 'ok');
        ok('multipart безопасно обрабатывает поле __proto__');
    }

    // ---------- Приём заявки по сети ----------

    const phoneRaw = '+7 900 111-22-33';
    const phoneNormal = '+79001112233';

    // 6. Верная заявка с 2 фото
    let firstId;
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const result = await postForm(
            [['name', 'Иван Петров'], ['phone', phoneRaw], ['service', service.name], ['description', 'Нужно починить']],
            [
                { name: 'a.jpg', type: 'image/jpeg', data: JPEG },
                { name: 'b.png', type: 'image/png', data: PNG }
            ],
            ip
        );
        assert.strictEqual(result.status, 201);
        assert.deepStrictEqual(result.json, { ok: true });
        assert.strictEqual(countRequests(), before + 1);
        const list = db.listRequests({ limit: 200 });
        firstId = list.items[0].id;
        const req = db.getRequest(firstId);
        assert.strictEqual(req.name, 'Иван Петров');
        assert.strictEqual(req.phone, phoneNormal);
        assert.strictEqual(req.service, service.name);
        assert.strictEqual(req.priceFrom, service.priceFrom);
        assert.strictEqual(req.photos.length, 2);
        assert.ok(/^[0-9a-f]{32}\.jpg$/.test(req.photos[0].fileName));
        assert.ok(/^[0-9a-f]{32}\.png$/.test(req.photos[1].fileName));
        assert.strictEqual(fs.readFileSync(path.join(photosDir(), req.photos[0].fileName)).equals(JPEG), true);
        assert.strictEqual(fs.readFileSync(path.join(photosDir(), req.photos[1].fileName)).equals(PNG), true);
        assert.strictEqual(listPhotoFiles().length, filesBefore + 2);
        ok('верная заявка с 2 фото сохраняется (телефон, услуга, цена, фото)');
    }

    // 7. Поле priceFrom от клиента игнорируется
    {
        const ip = nextIp();
        const result = await postForm(
            [['phone', phoneRaw], ['service', service.name], ['description', 'Тест цены'], ['priceFrom', '1']],
            [{ name: 'c.jpg', type: 'image/jpeg', data: JPEG }],
            ip
        );
        assert.strictEqual(result.status, 201);
        const req = db.getRequest(db.listRequests({ limit: 200 }).items[0].id);
        assert.strictEqual(req.priceFrom, service.priceFrom);
        ok('цена берётся из настроек, а не из формы клиента');
    }

    // 7a. Несколько услуг: сумма цен и строка через запятую
    {
        const ip = nextIp();
        const first = services[0];
        const second = services[1] || services[0];
        const result = await postForm(
            [['phone', phoneRaw], ['service', [first.name, second.name]], ['description', 'Несколько услуг']],
            [],
            ip
        );
        assert.strictEqual(result.status, 201);
        const req = db.getRequest(db.listRequests({ limit: 200 }).items[0].id);
        assert.strictEqual(req.service, first.name + ', ' + second.name);
        assert.strictEqual(req.priceFrom, first.priceFrom + second.priceFrom);
        ok('несколько услуг сохраняются строкой через запятую, цена суммируется');
    }

    // 7b. Дубликат услуги отклоняется
    {
        const ip = nextIp();
        const before = countRequests();
        const result = await postForm(
            [['phone', phoneRaw], ['service', [services[0].name, services[0].name]], ['description', 'x']],
            [],
            ip
        );
        expectFormError(result, 'service');
        assert.strictEqual(countRequests(), before);
        ok('повторяющаяся услуга отклоняется');
    }

    // 7c. Неизвестная услуга в массиве отклоняется
    {
        const ip = nextIp();
        const before = countRequests();
        const result = await postForm(
            [['phone', phoneRaw], ['service', [services[0].name, 'Нет такой услуги']], ['description', 'x']],
            [],
            ip
        );
        expectFormError(result, 'service');
        assert.strictEqual(countRequests(), before);
        ok('неизвестная услуга в массиве отклоняется');
    }

    // 7d. 8 услуг отклоняется
    {
        const ip = nextIp();
        const before = countRequests();
        const eight = [];
        for (let i = 0; i < 8; i++) eight.push(services[i % services.length].name);
        const result = await postForm(
            [['phone', phoneRaw], ['service', eight], ['description', 'x']],
            [],
            ip
        );
        expectFormError(result, 'service');
        assert.strictEqual(countRequests(), before);
        ok('больше 7 услуг отклоняется');
    }

    // 8. Заявка без фото
    {
        const ip = nextIp();
        const result = await postForm(
            [['phone', phoneRaw], ['service', service.name], ['description', 'Без фото']],
            [],
            ip
        );
        assert.strictEqual(result.status, 201);
        const req = db.getRequest(db.listRequests({ limit: 200 }).items[0].id);
        assert.strictEqual(req.photos.length, 0);
        ok('заявка без фото принимается');
    }

    // 9. WebP принимается
    {
        const ip = nextIp();
        const result = await postForm(
            [['phone', phoneRaw], ['service', service.name], ['description', 'WebP']],
            [{ name: 'd.webp', type: 'image/webp', data: WEBP }],
            ip
        );
        assert.strictEqual(result.status, 201);
        const req = db.getRequest(db.listRequests({ limit: 200 }).items[0].id);
        assert.strictEqual(req.photos.length, 1);
        assert.ok(/\.webp$/.test(req.photos[0].fileName));
        ok('заявка с WebP принимается с расширением .webp');
    }

    // 10. Уведомления для включённых каналов
    {
        const req = db.getRequest(firstId);
        if (enabledChannels.length === 0) {
            assert.strictEqual(req.notifications.length, 0);
        } else {
            for (const ch of enabledChannels) {
                const n = req.notifications.find(function (x) { return x.channel === ch; });
                assert.ok(n !== undefined, 'Должно быть уведомление для канала ' + ch);
                assert.strictEqual(n.status, 'pending');
            }
        }
        ok('уведомления создаются только для включённых каналов');
    }

    // 11. Имя файла от клиента не влияет на путь
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const result = await postForm(
            [['phone', phoneRaw], ['service', service.name], ['description', 'Path']],
            [{ name: '../../evil.png', type: 'image/png', data: PNG }],
            ip
        );
        assert.strictEqual(result.status, 201);
        assert.strictEqual(countRequests(), before + 1);
        const req = db.getRequest(db.listRequests({ limit: 200 }).items[0].id);
        assert.ok(/^[0-9a-f]{32}\.png$/.test(req.photos[0].fileName));
        const outside = fs.readdirSync(path.dirname(photosDir())).filter(function (f) { return f.indexOf('evil') !== -1; });
        assert.strictEqual(outside.length, 0, 'Файл с именем клиента не должен появиться');
        assert.strictEqual(listPhotoFiles().length, filesBefore + 1);
        ok('имя файла от клиента не влияет на путь сохранения');
    }

    // 12. Ошибки 400 с правильным полем, без записи
    {
        const ip = nextIp();
        const cases = [
            { fields: [['phone', ''], ['service', service.name], ['description', 'x']], field: 'phone', name: 'пустой телефон' },
            { fields: [['phone', 'abc'], ['service', service.name], ['description', 'x']], field: 'phone', name: 'плохой телефон' },
            { fields: [['phone', phoneRaw], ['service', service.name], ['description', '']], field: 'description', name: 'пустое описание' },
            { fields: [['phone', phoneRaw], ['service', service.name], ['description', 'x'.repeat(2001)]], field: 'description', name: 'описание длиннее 2000' },
            { fields: [['phone', phoneRaw], ['name', 'а'.repeat(101)], ['service', service.name], ['description', 'x']], field: 'name', name: 'имя длиннее 100' },
            { fields: [['phone', phoneRaw], ['description', 'x']], field: 'service', name: 'не выбрана услуга' },
            { fields: [['phone', phoneRaw], ['service', 'Нет такой услуги'], ['description', 'x']], field: 'service', name: 'услуги нет в списке' }
        ];
        for (const c of cases) {
            const before = countRequests();
            const filesBefore = listPhotoFiles().length;
            const result = await postForm(c.fields, [], ip);
            expectFormError(result, c.field);
            assert.strictEqual(countRequests(), before, 'Заявка не должна записаться: ' + c.name);
            assert.strictEqual(listPhotoFiles().length, filesBefore, 'Файл не должен появиться: ' + c.name);
        }
        ok('ошибки 400 с полем и без записи в базу/на диск');
    }

    // 13. 6 фото — 400
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const files = [];
        for (let i = 0; i < 6; i++) files.push({ name: 'p' + i + '.jpg', type: 'image/jpeg', data: JPEG });
        const result = await postForm([['phone', phoneRaw], ['service', service.name], ['description', 'x']], files, ip);
        expectFormError(result, 'photos');
        assert.strictEqual(countRequests(), before);
        assert.strictEqual(listPhotoFiles().length, filesBefore);
        ok('6 фото отклоняются');
    }

    // 14. Фальшивое фото и GIF отклоняются
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const r1 = await postForm([['phone', phoneRaw], ['service', service.name], ['description', 'x']],
            [{ name: 'evil.jpg', type: 'image/jpeg', data: FAKE }], ip);
        expectFormError(r1, 'photos');
        const r2 = await postForm([['phone', phoneRaw], ['service', service.name], ['description', 'x']],
            [{ name: 'g.gif', type: 'image/gif', data: GIF }], ip);
        expectFormError(r2, 'photos');
        assert.strictEqual(countRequests(), before);
        assert.strictEqual(listPhotoFiles().length, filesBefore);
        ok('фальшивое фото и GIF отклоняются');
    }

    // 15. Фото больше 4 МБ — 413
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const result = await postForm([['phone', phoneRaw], ['service', service.name], ['description', 'x']],
            [{ name: 'big.jpg', type: 'image/jpeg', data: BIG }], ip);
        assert.strictEqual(result.status, 413);
        assert.strictEqual(result.json.ok, false);
        assert.strictEqual(countRequests(), before);
        assert.strictEqual(listPhotoFiles().length, filesBefore);
        ok('фото больше 4 МБ отклоняется с 413');
    }

    // 16. Тело больше лимита — 413
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        let status = null;
        try {
            const form = new FormData();
            form.append('phone', phoneRaw);
            form.append('service', service.name);
            form.append('description', 'x'.repeat(23 * 1024 * 1024));
            const res = await fetch(baseUrl + '/api/requests', {
                method: 'POST',
                body: form,
                headers: { 'X-Forwarded-For': ip }
            });
            status = res.status;
            await res.text();
        } catch (e) {
            // Соединение могло закрыться до чтения ответа — допустимо для этой проверки
        }
        if (status !== null) assert.strictEqual(status, 413);
        assert.strictEqual(countRequests(), before, 'Тело больше лимита не должно сохранить заявку');
        assert.strictEqual(listPhotoFiles().length, filesBefore, 'Тело больше лимита не должно сохранить файл');
        ok('тело больше лимита отклоняется с 413');
    }

    // 17. Не multipart и multipart без boundary — 415
    {
        const ip = nextIp();
        const r1 = await fetch(baseUrl + '/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
            body: JSON.stringify({ phone: '1' })
        });
        assert.strictEqual(r1.status, 415);
        await r1.text();

        const r2 = await fetch(baseUrl + '/api/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/form-data', 'X-Forwarded-For': ip },
            body: 'hello'
        });
        assert.strictEqual(r2.status, 415);
        await r2.text();
        ok('не multipart и multipart без boundary отклоняются с 415');
    }

    // 18. GET /api/requests — 405 + Allow
    {
        const res = await fetch(baseUrl + '/api/requests');
        assert.strictEqual(res.status, 405);
        assert.strictEqual(res.headers.get('allow'), 'POST');
        await res.text();
        ok('GET /api/requests даёт 405 с Allow: POST');
    }

    // 19. Ловушка website
    {
        const ip = nextIp();
        const before = countRequests();
        const filesBefore = listPhotoFiles().length;
        const result = await postForm(
            [['phone', phoneRaw], ['service', service.name], ['description', 'x'], ['website', 'http://spam.example']],
            [],
            ip
        );
        assert.strictEqual(result.status, 201);
        assert.deepStrictEqual(result.json, { ok: true });
        assert.strictEqual(countRequests(), before);
        assert.strictEqual(listPhotoFiles().length, filesBefore);
        ok('ловушка website отвечает как успех, но ничего не сохраняет');
    }

    // 20. Лимит запросов по IP
    {
        const ip1 = nextIp();
        for (let i = 0; i < 10; i++) {
            const r = await postForm([['phone', ''], ['description', 'x']], [], ip1);
            assert.notStrictEqual(r.status, 429, 'Первые 10 запросов не должны давать 429');
        }
        const limited = await postForm([['phone', phoneRaw], ['description', 'x']], [], ip1);
        assert.strictEqual(limited.status, 429);
        assert.strictEqual(limited.json.ok, false);
        const retry = parseInt(limited.headers.get('retry-after'), 10);
        assert.ok(retry >= 1, 'Retry-After должен быть >= 1');

        const ip2 = nextIp();
        const other = await postForm([['phone', ''], ['description', 'x']], [], ip2);
        assert.notStrictEqual(other.status, 429, 'С другого IP запрос должен проходить');
        ok('лимит запросов по IP работает');
    }

    // 21. Нет осиротевших файлов
    {
        const reqs = db.listRequests({ limit: 200 }).items;
        let dbPhotos = 0;
        for (const r of reqs) {
            const full = db.getRequest(r.id);
            for (const p of full.photos) {
                dbPhotos += 1;
                assert.ok(fs.existsSync(path.join(photosDir(), p.fileName)), 'Файл фото должен существовать');
            }
        }
        assert.strictEqual(listPhotoFiles().length, dbPhotos, 'Число файлов на диске должно совпадать с числом фото в базе');
        ok('файлы на диске соответствуют фото в базе (нет сирот)');
    }

    // 22. Раздача файлов не сломана
    {
        const rootRes = await fetch(baseUrl + '/');
        assert.strictEqual(rootRes.status, 200);
        await rootRes.text();

        const healthRes = await fetch(baseUrl + '/api/health');
        assert.strictEqual(healthRes.status, 200);
        assert.deepStrictEqual(await healthRes.json(), { ok: true });

        const unknownRes = await fetch(baseUrl + '/api/unknown');
        assert.strictEqual(unknownRes.status, 404);
        await unknownRes.text();
        ok('раздача файлов и health работают');
    }

    console.log('Все проверки приёма заявок пройдены');
}

async function cleanup() {
    if (child) {
        try {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill();
                await new Promise(function (resolve) {
                    const t = setTimeout(resolve, 2000);
                    child.once('exit', function () { clearTimeout(t); resolve(); });
                });
            }
        } catch (e) {
            // ignore
        }
    }
    try { db.closeDb(); } catch (e) { /* ignore */ }
    if (tmpDir) {
        await new Promise(function (r) { setTimeout(r, 100); });
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
}

main()
    .then(function () {
        return cleanup().then(function () { process.exit(0); });
    })
    .catch(function (e) {
        console.error('Проверка не пройдена: ' + (e && e.message ? e.message : e));
        return cleanup().then(function () { process.exit(1); });
    });
