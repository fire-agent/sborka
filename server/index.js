try { process.loadEnvFile(); } catch {}
'use strict';

// Простой сервер без сторонних библиотек: только встроенные модули Node.js.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const { createRequestsHandler } = require('./requests');
const { createAuthManager } = require('./auth');
const { getNotificationsConfig, notifyNewRequest } = require('./notifier');
const { parseMultipart } = require('./multipart');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// ---------- Настройки ----------

// Загружает .env из корня проекта. Если файла нет, работаем без него.
function loadEnv() {
    const envPath = path.join(ROOT_DIR, '.env');
    if (!fs.existsSync(envPath)) return;
    try {
        process.loadEnvFile(envPath);
    } catch (e) {
        // Значения в журнал не выводим
        console.error('Не удалось прочитать файл .env. Проверьте его содержимое.');
        process.exit(1);
    }
}

loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 3000;
// Относительный путь считаем от корня проекта, а не от текущей папки терминала
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const BRANDING_DIR = path.join(DATA_DIR, 'branding');
// Доверяем ли заголовку X-Forwarded-For: true только за доверенным прокси (Amvera)
const TRUST_PROXY_RAW = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
const TRUST_PROXY = TRUST_PROXY_RAW === 'true' || TRUST_PROXY_RAW === '1';
// Общий пароль менеджера из .env
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Максимальный размер логотипа: 2 МБ
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// Лимит тела запроса на загрузку логотипа (2 МБ файл + запас на multipart-обёртку)
const MAX_LOGO_BODY_BYTES = 3 * 1024 * 1024;

// Менеджер авторизации: сессии в памяти, HttpOnly-куки и защита от перебора
const auth = createAuthManager({
    adminPassword: ADMIN_PASSWORD,
    trustProxy: TRUST_PROXY
});

// Создаёт папки для данных и фото
function prepareDataDirs() {
    try {
        fs.mkdirSync(PHOTOS_DIR, { recursive: true });
        fs.mkdirSync(BRANDING_DIR, { recursive: true });
    } catch (e) {
        console.error('Не удалось создать папку данных: ' + DATA_DIR);
        console.error(e.message);
        process.exit(1);
    }
}

// ---------- Ответы ----------

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
};

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
};

// Отправляет короткий текстовый ответ
function sendText(res, status, text) {
    res.writeHead(status, Object.assign({
        'Content-Type': 'text/plain; charset=utf-8'
    }, SECURITY_HEADERS));
    res.end(text);
}

function sendJson(res, status, data) {
    res.writeHead(status, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }, SECURITY_HEADERS));
    res.end(JSON.stringify(data));
}

// ---------- Раздача файлов из public/ ----------

// Превращает адрес в безопасный путь внутри public/. Возвращает null, если путь недопустим.
function resolvePublicPath(pathname) {
    let decoded;
    try {
        decoded = decodeURIComponent(pathname);
    } catch (e) {
        return { error: 400 };
    }

    if (decoded.indexOf('\0') !== -1) {
        return { error: 400 };
    }

    // Не отдаём файлы и папки, имя которых начинается с точки
    const parts = decoded.split(/[\\/]+/);
    for (const part of parts) {
        if (part.startsWith('.')) {
            return { error: 404 };
        }
    }

    const relative = (decoded === '/' || decoded === '') ? 'index.html' : decoded;
    const fullPath = path.resolve(PUBLIC_DIR, '.' + path.sep + relative);

    // Путь должен оставаться внутри public/
    if (fullPath !== PUBLIC_DIR && !fullPath.startsWith(PUBLIC_DIR + path.sep)) {
        return { error: 404 };
    }

    return { fullPath: fullPath };
}

function serveStatic(req, res, pathname) {
    const resolved = resolvePublicPath(pathname);
    if (resolved.error) {
        sendText(res, resolved.error, resolved.error === 400 ? 'Неверный адрес' : 'Не найдено');
        return;
    }

    fs.stat(resolved.fullPath, function (err, stat) {
        if (err || !stat.isFile()) {
            sendText(res, 404, 'Не найдено');
            return;
        }

        const ext = path.extname(resolved.fullPath).toLowerCase();
        res.writeHead(200, Object.assign({
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache'
        }, SECURITY_HEADERS));

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(resolved.fullPath);
        stream.on('error', function (e) {
            console.error('Ошибка чтения файла:', e.message);
            res.destroy();
        });
        stream.pipe(res);
    });
}

// ---------- Авторизация: вспомогательные функции ----------

function sendJsonExtra(res, status, data, extraHeaders) {
    res.writeHead(status, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }, SECURITY_HEADERS, extraHeaders || {}));
    res.end(JSON.stringify(data));
}

function setAdminCookie(res, sessionId, maxAgeSeconds) {
    res.setHeader('Set-Cookie', auth.COOKIE_NAME + '=' + encodeURIComponent(sessionId) +
        '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAgeSeconds);
}

function clearAdminCookie(res) {
    res.setHeader('Set-Cookie', auth.COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

function sendRedirect(res, location) {
    res.writeHead(302, Object.assign({
        'Location': location,
        'Cache-Control': 'no-store'
    }, SECURITY_HEADERS));
    res.end();
}

// Проверяет, что имя файла фото безопасно: без путей, без '..' и без скрытых файлов.
function isValidPhotoName(name) {
    if (typeof name !== 'string' || name === '') {
        return false;
    }
    if (name.indexOf('\0') !== -1) {
        return false;
    }
    if (name === '.' || name === '..') {
        return false;
    }
    if (name.indexOf('/') !== -1 || name.indexOf('\\') !== -1) {
        return false;
    }
    if (name.startsWith('.')) {
        return false;
    }
    return true;
}

// Отдаёт защищённое фото из data/photos. Используется только для авторизованных менеджеров.
function servePhoto(req, res, fileName) {
    if (!isValidPhotoName(fileName)) {
        sendText(res, 400, 'Неверное имя файла');
        return;
    }

    const fullPath = path.join(PHOTOS_DIR, fileName);
    if (fullPath !== PHOTOS_DIR && !fullPath.startsWith(PHOTOS_DIR + path.sep)) {
        sendText(res, 400, 'Неверное имя файла');
        return;
    }

    fs.stat(fullPath, function (err, stat) {
        if (err || !stat.isFile()) {
            sendText(res, 404, 'Не найдено');
            return;
        }

        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, Object.assign({
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'private, max-age=300'
        }, SECURITY_HEADERS));

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(fullPath);
        stream.on('error', function (e) {
            console.error('Ошибка чтения фото:', e.message);
            res.destroy();
        });
        stream.pipe(res);
    });
}

// Удаляет физические файлы фотографий. Ошибки не должны ломать удаление заявки.
async function removePhotoFiles(names) {
    for (const name of names) {
        if (!isValidPhotoName(name)) {
            continue;
        }
        try {
            await fs.promises.unlink(path.join(PHOTOS_DIR, name));
        } catch (e) {
            // Файл мог отсутствовать — это не ошибка бизнес-логики
        }
    }
}

// ---------- Логотип компании ----------

// Проверяет сигнатуру файла и возвращает { ext, mime } или null.
// Разрешены только JPEG, PNG и WebP; SVG и прочие форматы отклоняются.
function detectImageType(data) {
    if (!Buffer.isBuffer(data) || data.length < 12) {
        return null;
    }
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
        return { ext: '.jpg', mime: 'image/jpeg' };
    }
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
        data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) {
        return { ext: '.png', mime: 'image/png' };
    }
    if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
        return { ext: '.webp', mime: 'image/webp' };
    }
    return null;
}

// Возвращает имена файлов логотипа в папке branding (без скрытых и опасных имён).
function listLogoFiles() {
    try {
        return fs.readdirSync(BRANDING_DIR).filter(isValidPhotoName);
    } catch (e) {
        return [];
    }
}

// Удаляет все файлы логотипа из папки branding. Ошибки удаления игнорируются.
async function clearBrandingDir() {
    for (const name of listLogoFiles()) {
        try {
            await fs.promises.unlink(path.join(BRANDING_DIR, name));
        } catch (e) {
            // Файл мог отсутствовать — это не ошибка бизнес-логики
        }
    }
}

// Отдаёт текущий файл логотипа публично. Если логотипа нет — 404.
function serveLogo(req, res) {
    const files = listLogoFiles();
    if (files.length === 0) {
        sendText(res, 404, 'Логотип не загружен');
        return;
    }

    const fullPath = path.join(BRANDING_DIR, files[0]);
    fs.stat(fullPath, function (err, stat) {
        if (err || !stat.isFile()) {
            sendText(res, 404, 'Логотип не загружен');
            return;
        }

        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, Object.assign({
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': 'no-cache'
        }, SECURITY_HEADERS));

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(fullPath);
        stream.on('error', function (e) {
            console.error('Ошибка чтения логотипа:', e.message);
            res.destroy();
        });
        stream.pipe(res);
    });
}

// Читает тело запроса на загрузку логотипа с ограничением размера.
function readLogoUploadBody(req, res) {
    return new Promise(function (resolve) {
        const chunks = [];
        let size = 0;
        let settled = false;

        function settle(result) {
            if (settled) return;
            settled = true;
            resolve(result);
        }

        req.on('data', function (chunk) {
            if (settled) return;
            size += chunk.length;
            if (size > MAX_LOGO_BODY_BYTES) {
                sendJson(res, 413, { ok: false, error: 'Файл слишком большой. Максимум 2 МБ.' });
                settle({ ok: false });
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', function () {
            settle({ ok: true, body: Buffer.concat(chunks) });
        });
        req.on('error', function () { settle({ ok: false }); });
        req.on('aborted', function () { settle({ ok: false }); });
        req.on('close', function () { settle({ ok: false }); });
    });
}

// Читает маленькое JSON-тело (например, { "password": "..." }) и парсит его.
function readJsonBody(req) {
    return new Promise(function (resolve) {
        const chunks = [];
        let size = 0;
        let settled = false;

        function done(value) {
            if (settled) return;
            settled = true;
            resolve(value);
        }

        req.on('data', function (chunk) {
            size += chunk.length;
            if (size <= 10000) {
                chunks.push(chunk);
            }
        });
        req.on('end', function () {
            if (size > 10000) {
                done(null);
                return;
            }
            let text;
            try {
                text = Buffer.concat(chunks).toString('utf8');
                done(JSON.parse(text));
            } catch (e) {
                done(null);
            }
        });
        req.on('error', function () { done(null); });
        req.on('aborted', function () { done(null); });
        req.on('close', function () { done(null); });
    });
}

// ---------- Маршрутизация ----------

async function handleRequest(req, res) {
    let pathname;
    try {
        pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (e) {
        sendText(res, 400, 'Неверный адрес');
        return;
    }

    if (pathname === '/api/health') {
        sendJson(res, 200, { ok: true });
        return;
    }

    if (pathname === '/api/logo') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendText(res, 405, 'Метод не поддерживается');
            return;
        }
        serveLogo(req, res);
        return;
    }

    // ---------- Админ-маршруты ----------

    if (pathname === '/api/admin/login') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        const body = await readJsonBody(req);
        const password = (body && typeof body.password === 'string') ? body.password : '';
        const result = auth.login(req, password);
        if (!result.ok) {
            const extra = result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {};
            sendJsonExtra(res, result.status, { ok: false, error: result.error }, extra);
            return;
        }
        setAdminCookie(res, result.sessionId, auth.SESSION_MAX_AGE_SECONDS);
        sendJson(res, 200, { ok: true });
        return;
    }

    if (pathname === '/api/admin/logout') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        auth.logout(req);
        clearAdminCookie(res);
        sendJson(res, 200, { ok: true });
        return;
    }

    if (pathname === '/api/admin/status') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        const session = auth.checkSession(req);
        sendJson(res, 200, { ok: true, authenticated: !!session, configured: auth.isConfigured() });
        return;
    }

    // ---------- Защищённые API кабинета менеджера ----------

    if (pathname === '/api/admin/summary') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const summaryUrl = new URL(req.url, 'http://localhost');
        const status = summaryUrl.searchParams.get('status') || '';
        const search = summaryUrl.searchParams.get('search') || '';
        try {
            const summary = db.getSummary({ status: status, search: search });
            sendJson(res, 200, { ok: true, summary: summary });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
    }

    if (pathname === '/api/admin/requests') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const listUrl = new URL(req.url, 'http://localhost');
        const status = listUrl.searchParams.get('status') || '';
        const search = listUrl.searchParams.get('search') || '';
        const limit = parseInt(listUrl.searchParams.get('limit'), 10);
        const offset = parseInt(listUrl.searchParams.get('offset'), 10);
        try {
            const result = db.listRequests({
                status: status,
                search: search,
                limit: Number.isInteger(limit) ? limit : undefined,
                offset: Number.isInteger(offset) ? offset : undefined
            });
            sendJson(res, 200, { ok: true, items: result.items, total: result.total });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
    }

    if (pathname === '/api/admin/clients') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const clientsUrl = new URL(req.url, 'http://localhost');
        const search = clientsUrl.searchParams.get('search') || '';
        const limit = parseInt(clientsUrl.searchParams.get('limit'), 10);
        const offset = parseInt(clientsUrl.searchParams.get('offset'), 10);
        try {
            const items = db.getClients({
                search: search,
                limit: Number.isInteger(limit) ? limit : undefined,
                offset: Number.isInteger(offset) ? offset : undefined
            });
            const total = db.getClientsCount({ search: search });
            sendJson(res, 200, { ok: true, items: items, total: total });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
    }

    const statusMatch = pathname.match(/^\/api\/admin\/requests\/(\d+)\/status$/);
    if (statusMatch) {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const id = parseInt(statusMatch[1], 10);
        const body = await readJsonBody(req);
        const newStatus = (body && typeof body.status === 'string') ? body.status.trim() : '';
        if (!newStatus) {
            sendJson(res, 400, { ok: false, error: 'Не указан статус заявки' });
            return;
        }
        try {
            const updated = db.setRequestStatus(id, newStatus);
            if (!updated) {
                sendJson(res, 404, { ok: false, error: 'Заявка не найдена' });
                return;
            }
            sendJson(res, 200, { ok: true });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
    }

    const deleteMatch = pathname.match(/^\/api\/admin\/requests\/(\d+)\/delete$/);
    if (deleteMatch) {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const id = parseInt(deleteMatch[1], 10);
        try {
            const result = db.deleteRequest(id);
            if (!result.deleted) {
                sendJson(res, 404, { ok: false, error: 'Заявка не найдена' });
                return;
            }
            await removePhotoFiles(result.photoFileNames);
            sendJson(res, 200, { ok: true });
        } catch (e) {
            console.error('Ошибка удаления заявки:', e);
            sendJson(res, 500, { ok: false, error: 'Не удалось удалить заявку' });
        }
        return;
    }

    if (pathname === '/api/admin/request/update') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const body = await readJsonBody(req);
        if (!body || typeof body !== 'object') {
            sendJson(res, 400, { ok: false, error: 'Неверный формат данных' });
            return;
        }
        const id = (body.id === undefined || body.id === null) ? NaN : Number(body.id);
        if (!Number.isInteger(id) || id <= 0) {
            sendJson(res, 400, { ok: false, error: 'Укажите корректный id заявки' });
            return;
        }
        try {
            const updated = db.updateRequestPricing(id, body);
            if (!updated) {
                sendJson(res, 404, { ok: false, error: 'Заявка не найдена' });
                return;
            }
            sendJson(res, 200, { ok: true });
        } catch (e) {
            sendJson(res, 400, { ok: false, error: e.message });
        }
        return;
    }

    if (pathname === '/api/admin/photos') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        const photoUrl = new URL(req.url, 'http://localhost');
        const fileName = photoUrl.searchParams.get('file') || '';
        servePhoto(req, res, fileName);
        return;
    }

    if (pathname === '/api/admin/logo') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }

        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i);
        if (!/^multipart\/form-data\b/i.test(contentType) || !boundaryMatch) {
            sendJson(res, 415, { ok: false, error: 'Запрос должен быть формой multipart/form-data.' });
            return;
        }
        const boundary = boundaryMatch[1] !== undefined ? boundaryMatch[1] : boundaryMatch[2];

        const read = await readLogoUploadBody(req, res);
        if (!read.ok) return;

        let parsed;
        try {
            parsed = parseMultipart(read.body, boundary);
        } catch (e) {
            sendJson(res, 400, { ok: false, error: 'Не удалось разобрать форму.' });
            return;
        }

        const files = parsed.files;
        if (files.length === 0) {
            sendJson(res, 400, { ok: false, error: 'Файл логотипа не найден.' });
            return;
        }

        const file = files[0];
        if (file.data.length > MAX_LOGO_BYTES) {
            sendJson(res, 413, { ok: false, error: 'Файл слишком большой. Максимум 2 МБ.' });
            return;
        }

        const imageType = detectImageType(file.data);
        if (!imageType) {
            sendJson(res, 400, { ok: false, error: 'Логотип должен быть в формате JPEG, PNG или WebP.' });
            return;
        }

        try {
            await clearBrandingDir();
            await fs.promises.writeFile(path.join(BRANDING_DIR, 'logo' + imageType.ext), file.data);
            sendJson(res, 200, { ok: true });
        } catch (e) {
            console.error('Ошибка сохранения логотипа:', e);
            sendJson(res, 500, { ok: false, error: 'Не удалось сохранить логотип.' });
        }
        return;
    }

    if (pathname === '/api/admin/logo/delete') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { ok: false, error: 'Метод не поддерживается' });
            return;
        }
        if (!auth.checkSession(req)) {
            sendJson(res, 401, { ok: false, error: 'Необходима авторизация' });
            return;
        }
        try {
            await clearBrandingDir();
            sendJson(res, 200, { ok: true });
        } catch (e) {
            console.error('Ошибка удаления логотипа:', e);
            sendJson(res, 500, { ok: false, error: 'Не удалось удалить логотип.' });
        }
        return;
    }

    if (pathname === '/admin/login') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendText(res, 405, 'Метод не поддерживается');
            return;
        }
        if (auth.checkSession(req)) {
            sendRedirect(res, '/admin');
            return;
        }
        serveStatic(req, res, '/admin/login.html');
        return;
    }

    if (pathname === '/admin' || pathname === '/admin/') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            sendText(res, 405, 'Метод не поддерживается');
            return;
        }
        if (!auth.checkSession(req)) {
            sendRedirect(res, '/admin/login');
            return;
        }
        serveStatic(req, res, '/admin/index.html');
        return;
    }

    if (pathname === '/api/requests') {
        if (req.method === 'POST') {
            return requestsHandler(req, res);
        }
        res.writeHead(405, Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Allow': 'POST'
        }, SECURITY_HEADERS));
        res.end(JSON.stringify({ ok: false, error: 'Метод не поддерживается' }));
        return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Метод не поддерживается');
        return;
    }

    if (pathname.startsWith('/api/')) {
        sendText(res, 404, 'Не найдено');
        return;
    }

    // Файлы кабинета (кроме ресурсов страницы входа) доступны только авторизованным.
    if (pathname.startsWith('/admin/')) {
        const loginAssets = ['/admin/login.html', '/admin/login.css', '/admin/login.js'];
        if (loginAssets.indexOf(pathname) === -1 && !auth.checkSession(req)) {
            sendRedirect(res, '/admin/login');
            return;
        }
    }

    serveStatic(req, res, pathname);
}

function onRequest(req, res) {
    Promise.resolve()
        .then(function () {
            return handleRequest(req, res);
        })
        .catch(function (e) {
            // Подробности только в консоль, клиент их не видит
            console.error('Ошибка обработки запроса:', e);
            if (!res.headersSent) {
                sendText(res, 500, 'Внутренняя ошибка сервера');
            } else {
                res.destroy();
            }
        });
}

// ---------- Запуск ----------

prepareDataDirs();

// Открытие базы данных
let dbPath;
try {
    dbPath = db.initDb(DATA_DIR);
} catch (e) {
    console.error('Не удалось открыть базу данных: ' + e.message);
    process.exit(1);
}

// Обработчик приёма заявок
const configPath = path.join(PUBLIC_DIR, 'config.json');
const requestsHandler = createRequestsHandler({
    photosDir: PHOTOS_DIR,
    configPath: configPath,
    trustProxy: TRUST_PROXY,
    sendJson: sendJson,
    db: db,
    notifyNewRequest: notifyNewRequest,
    configPathForNotifications: configPath
});

const server = http.createServer(onRequest);
server.listen(PORT, function () {
    console.log('Сервер запущен: http://localhost:' + PORT + ', данные: ' + DATA_DIR);
    console.log('База данных: ' + dbPath);
});

// ---------- Остановка ----------

function shutdown() {
    server.close(function () {
        db.closeDb();
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
