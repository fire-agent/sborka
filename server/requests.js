'use strict';

// Обработчик POST /api/requests: проверяет форму, сохраняет фото и заявку, защищает от спама.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseMultipart } = require('./multipart');

// ---------- Константы ----------

const MAX_BODY_BYTES = 22 * 1024 * 1024;      // 5 фото по 4 МБ + запас на текстовые поля
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;       // максимум на одно фото
const MAX_SERVICES = 7;
const MAX_CONFIG_SERVICES = 30;
const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const BODY_TIMEOUT_MS = 60 * 1000;             // таймаут чтения тела
const RATE_LIMIT_MAX = 10;                     // максимум заявок с одного IP
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;   // за 10 минут

const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
};

const NOTIFICATION_CHANNELS = ['telegram', 'max', 'whatsapp'];

// ---------- Лимит запросов по IP ----------

const rateMap = new Map(); // ip -> массив времён (Date.now)

function cleanupRateMap() {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    for (const [ip, times] of rateMap) {
        const fresh = times.filter(function (t) { return t > cutoff; });
        if (fresh.length === 0) rateMap.delete(ip);
        else rateMap.set(ip, fresh);
    }
}

// Раз в 5 минут чистим устаревшие записи; .unref() не мешает остановке сервера
setInterval(cleanupRateMap, 5 * 60 * 1000).unref();

function checkRateLimit(ip) {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    let times = rateMap.get(ip);
    if (!times) {
        times = [];
    } else {
        times = times.filter(function (t) { return t > cutoff; });
    }

    if (times.length >= RATE_LIMIT_MAX) {
        const retryAfter = Math.max(1, Math.ceil((times[0] + RATE_LIMIT_WINDOW_MS - now) / 1000));
        return { allowed: false, retryAfter: retryAfter };
    }

    times.push(now);
    rateMap.set(ip, times);

    // Чтобы память не росла без ограничений
    if (rateMap.size > 10000) {
        cleanupRateMap();
        if (rateMap.size > 10000) {
            let oldestKey = null;
            let oldestTime = Infinity;
            for (const [k, v] of rateMap) {
                if (v[0] < oldestTime) {
                    oldestTime = v[0];
                    oldestKey = k;
                }
            }
            if (oldestKey !== null) rateMap.delete(oldestKey);
        }
    }

    return { allowed: true, retryAfter: 0 };
}

function getClientIp(req, trustProxy) {
    let ip = null;
    if (trustProxy) {
        const xff = req.headers['x-forwarded-for'];
        if (typeof xff === 'string' && xff.trim() !== '') {
            const parts = xff.split(',');
            ip = parts[parts.length - 1].trim();
        }
    }
    if (!ip) {
        ip = req.socket && req.socket.remoteAddress;
    }
    return ip || 'unknown';
}

// ---------- Ответы ----------

function sendJsonExtra(res, status, data, extraHeaders) {
    res.writeHead(status, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    }, SECURITY_HEADERS, extraHeaders || {}));
    res.end(JSON.stringify(data));
}

// ---------- Чтение тела ----------

function respondTooLarge(res, req) {
    res.writeHead(413, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'close'
    }, SECURITY_HEADERS));
    res.end(JSON.stringify({ ok: false, error: 'Запрос слишком большой.' }));
    res.on('finish', function () {
        if (req) req.destroy();
    });
}

function readBody(req, res) {
    const contentLength = req.headers['content-length'];
    if (contentLength !== undefined) {
        const n = parseInt(contentLength, 10);
        if (!Number.isNaN(n) && n > MAX_BODY_BYTES) {
            respondTooLarge(res, req);
            return Promise.resolve({ ok: false });
        }
    }

    return new Promise(function (resolve) {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        let settled = false;

        const timeout = setTimeout(function () {
            if (settled) return;
            settled = true;
            removeListeners();
            sendJsonExtra(res, 408, { ok: false, error: 'Запрос слишком долгий. Попробуйте ещё раз.' });
            res.on('finish', function () { req.destroy(); });
            resolve({ ok: false });
        }, BODY_TIMEOUT_MS);

        function removeListeners() {
            clearTimeout(timeout);
            req.removeListener('data', onData);
            req.removeListener('end', onEnd);
            req.removeListener('error', onError);
            req.removeListener('aborted', onAborted);
            req.removeListener('close', onClose);
        }

        function settle(result) {
            if (settled) return;
            settled = true;
            removeListeners();
            resolve(result);
        }

        function onData(chunk) {
            if (tooLarge) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                tooLarge = true;
                respondTooLarge(res, req);
                settle({ ok: false });
                return;
            }
            chunks.push(chunk);
        }

        function onEnd() {
            settle({ ok: true, body: Buffer.concat(chunks) });
        }

        function onError() {
            settle({ ok: false });
        }

        function onAborted() {
            settle({ ok: false });
        }

        function onClose() {
            settle({ ok: false });
        }

        req.on('data', onData);
        req.on('end', onEnd);
        req.on('error', onError);
        req.on('aborted', onAborted);
        req.on('close', onClose);
    });
}

// ---------- Настройки ----------

function readConfig(configPath) {
    let raw;
    try {
        raw = fs.readFileSync(configPath, 'utf8');
    } catch (e) {
        throw new Error('Не удалось прочитать настройки');
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error('Ошибка в настройках (JSON)');
    }
}

// Читает демо-конфиг по имени (furniture, windows, cleaning)
function readDemoConfig(demoName) {
    const demoPath = path.join(__dirname, '..', 'public', 'configs', demoName + '.json');
    return readConfig(demoPath);
}

function extractServices(config) {
    const services = [];
    if (Array.isArray(config.services)) {
        for (const item of config.services) {
            if (!item || typeof item !== 'object') continue;
            const name = typeof item.name === 'string' ? item.name.trim() : '';
            if (!name) continue;
            let priceFrom = null;
            if (typeof item.priceFrom === 'number' && Number.isFinite(item.priceFrom) && item.priceFrom >= 0) {
                priceFrom = Math.round(item.priceFrom);
            }
            services.push({ name: name, priceFrom: priceFrom });
        }
    }
    return services.slice(0, MAX_CONFIG_SERVICES);
}

function extractChannels(config) {
    const channels = [];
    const n = config.notifications;
    if (n && typeof n === 'object') {
        for (const ch of NOTIFICATION_CHANNELS) {
            if (n[ch] === true) channels.push(ch);
        }
    }
    return channels;
}

// ---------- Проверка текста ----------

// Удаляет управляющие символы (кроме \n и \t) и обрезает края
function cleanField(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
}

// Имя: подряд идущие пробелы и переводы строк заменяются одним пробелом
function cleanName(value) {
    return cleanField(value).replace(/\s+/g, ' ');
}

// ---------- Телефон ----------

function isRussianPhone(value) {
    if (/[^+\d()\s-]/.test(value)) return false;
    if ((value.match(/\+/g) || []).length > 1) return false;
    if (value.indexOf('+') > 0) return false;

    const openIdx = value.indexOf('(');
    const closeIdx = value.indexOf(')');
    if (openIdx !== -1 || closeIdx !== -1) {
        const secondOpen = value.indexOf('(', openIdx + 1);
        const secondClose = value.indexOf(')', closeIdx + 1);
        const inner = value.substring(openIdx + 1, closeIdx);
        if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx ||
            inner.length === 0 || secondOpen !== -1 || secondClose !== -1) {
            return false;
        }
    }

    const cleaned = value.replace(/[\s()-]/g, '');
    if (cleaned.length === 12 && cleaned.indexOf('+7') === 0) return true;
    if (cleaned.length === 11 && (cleaned[0] === '7' || cleaned[0] === '8')) return true;
    return false;
}

// Приводит телефон к виду +7XXXXXXXXXX
function normalizePhone(value) {
    const cleaned = value.replace(/[\s()-]/g, '');
    if (cleaned.length === 12 && cleaned.indexOf('+7') === 0) return cleaned;
    if (cleaned.length === 11) return '+7' + cleaned.slice(1);
    return cleaned;
}

// ---------- Фото ----------

function detectImageType(data) {
    if (!data || data.length < 12) return null;
    if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
        return { ext: '.jpg' };
    }
    if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47 &&
        data[4] === 0x0D && data[5] === 0x0A && data[6] === 0x1A && data[7] === 0x0A) {
        return { ext: '.png' };
    }
    if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
        return { ext: '.webp' };
    }
    return null;
}

async function cleanupFiles(photosDir, names) {
    for (const name of names) {
        try {
            await fs.promises.unlink(path.join(photosDir, name));
        } catch (e) {
            // Ошибку удаления игнорируем
        }
    }
}

// ---------- Обработчик ----------

function createRequestsHandler(options) {
    const photosDir = options.photosDir;
    const configPath = options.configPath;
    const trustProxy = options.trustProxy;
    const sendJson = options.sendJson;
    const db = options.db;
    const notifyNewRequest = options.notifyNewRequest;
    const configPathForNotifications = options.configPathForNotifications;

    function respondError(res, status, error, field) {
        const data = { ok: false, error: error };
        if (field) data.field = field;
        sendJson(res, status, data);
    }

    return async function handleRequests(req, res) {
        // 1. Лимит запросов по IP (до чтения тела)
        const ip = getClientIp(req, trustProxy);
        const rate = checkRateLimit(ip);
        if (!rate.allowed) {
            sendJsonExtra(res, 429, { ok: false, error: 'Слишком много заявок с вашего адреса. Попробуйте через несколько минут.' }, {
                'Retry-After': String(rate.retryAfter)
            });
            return;
        }

        // 2. Проверка Content-Type и boundary
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]{1,70})"|([^;\s]{1,70}))/i);
        if (!/^multipart\/form-data\b/i.test(contentType) || !boundaryMatch) {
            respondError(res, 415, 'Запрос должен быть формой multipart/form-data.');
            return;
        }
        const boundary = boundaryMatch[1] !== undefined ? boundaryMatch[1] : boundaryMatch[2];

        // 3–4. Чтение тела с ограничением размера и таймаутом
        const read = await readBody(req, res);
        if (!read.ok) return; // уже ответили 413/408 или клиент оборвал соединение

        // 5. Разбор формы
        let parsed;
        try {
            parsed = parseMultipart(read.body, boundary);
        } catch (e) {
            respondError(res, 400, 'Не удалось разобрать форму. Обновите страницу и попробуйте ещё раз.');
            return;
        }
        const fields = parsed.fields;
        const files = parsed.files;

        // 6. Ловушка для роботов: у человека это поле всегда пустое
        if (fields.website !== undefined && String(fields.website).trim() !== '') {
            sendJson(res, 201, { ok: true });
            return;
        }

        // 7. Настройки
        let config;
        let isDemoConfig = false;
        // Проверяем, есть ли параметр demo в запросе
        const demoRaw = fields.demo;
        if (demoRaw !== undefined) {
            const demoName = cleanField(typeof demoRaw === 'string' ? demoRaw : '');
            if (demoName && (demoName === 'windows' || demoName === 'furniture' || demoName === 'cleaning')) {
                try {
                    config = readDemoConfig(demoName);
                    isDemoConfig = true;
                } catch (e) {
                    // Если демо-конфиг не найден, используем основной
                    try {
                        config = readConfig(configPath);
                    } catch (e2) {
                        console.error('Ошибка чтения настроек: ' + e2.message);
                        respondError(res, 503, 'Настройки временно недоступны. Попробуйте позже.');
                        return;
                    }
                }
            } else {
                // Неверное значение demo, используем основной конфиг
                try {
                    config = readConfig(configPath);
                } catch (e2) {
                    console.error('Ошибка чтения настроек: ' + e2.message);
                    respondError(res, 503, 'Настройки временно недоступны. Попробуйте позже.');
                    return;
                }
            }
        } else {
            try {
                config = readConfig(configPath);
            } catch (e) {
                console.error('Ошибка чтения настроек: ' + e.message);
                respondError(res, 503, 'Настройки временно недоступны. Попробуйте позже.');
                return;
            }
        }
        const services = extractServices(config);
        const channels = extractChannels(config);

        // 8. Текстовые поля и услуга
        const name = cleanName(fields.name !== undefined ? fields.name : '');
        if (name.length > MAX_NAME_LENGTH) {
            respondError(res, 400, 'Имя слишком длинное.', 'name');
            return;
        }

        const phoneRaw = cleanField(fields.phone !== undefined ? fields.phone : '');
        if (!phoneRaw || !isRussianPhone(phoneRaw)) {
            respondError(res, 400, 'Укажите российский телефон в формате +7 999 999-99-99', 'phone');
            return;
        }
        const phone = normalizePhone(phoneRaw);

        const description = cleanField(fields.description !== undefined ? fields.description : '');
        if (!description) {
            respondError(res, 400, 'Опишите, что нужно сделать.', 'description');
            return;
        }
        if (description.length > MAX_DESCRIPTION_LENGTH) {
            respondError(res, 400, 'Описание слишком длинное. Максимум 2000 символов.', 'description');
            return;
        }

        let service = '';
        let priceFrom = null;
        if (services.length > 0) {
            const raw = fields.service !== undefined ? fields.service : null;
            const chosenNames = [];

            if (Array.isArray(raw)) {
                for (const value of raw) {
                    const name = cleanField(value);
                    if (name) chosenNames.push(name);
                }
            } else if (typeof raw === 'string') {
                const name = cleanField(raw);
                if (name) chosenNames.push(name);
            }

            if (chosenNames.length === 0) {
                respondError(res, 400, 'Выберите хотя бы одну услугу из списка.', 'service');
                return;
            }
            if (chosenNames.length > MAX_SERVICES) {
                respondError(res, 400, 'Можно выбрать не больше ' + MAX_SERVICES + ' услуг.', 'service');
                return;
            }

            const seen = new Set();
            let totalPrice = 0;
            let hasUnknownPrice = false;

            for (const name of chosenNames) {
                const found = services.find(function (s) { return s.name === name; });
                if (!found) {
                    respondError(res, 400, 'Выберите услугу из списка.', 'service');
                    return;
                }
                if (seen.has(found.name)) {
                    respondError(res, 400, 'Услуга указана несколько раз.', 'service');
                    return;
                }
                seen.add(found.name);

                if (found.priceFrom === null) {
                    hasUnknownPrice = true;
                } else {
                    totalPrice += found.priceFrom;
                }
            }

            service = Array.from(seen).join(', ');
            priceFrom = hasUnknownPrice ? null : totalPrice;
        }

        // 9. Проверка фото
        const photoFiles = [];
        for (const file of files) {
            if (file.field !== 'photos') {
                respondError(res, 400, 'Неизвестное поле с файлом.', 'photos');
                return;
            }
            // Пустые части (без имени или нулевого размера) пропускаем
            if (file.filename === undefined || file.filename === '' || file.data.length === 0) {
                continue;
            }
            photoFiles.push(file);
        }

        if (photoFiles.length > MAX_PHOTOS) {
            respondError(res, 400, 'Можно приложить не больше 5 фото.', 'photos');
            return;
        }

        const validPhotos = [];
        for (const file of photoFiles) {
            if (file.data.length > MAX_PHOTO_BYTES) {
                respondError(res, 413, 'Фото слишком большое. Максимум 4 МБ на одно фото.');
                return;
            }
            const detected = detectImageType(file.data);
            if (!detected) {
                respondError(res, 400, 'Фото должно быть в формате JPEG, PNG или WebP.', 'photos');
                return;
            }
            validPhotos.push({ data: file.data, ext: detected.ext });
        }

        // 10. Запись фото, затем заявки; при ошибке — откат файлов
        const writtenNames = [];
        try {
            for (const photo of validPhotos) {
                const fileName = crypto.randomBytes(16).toString('hex') + photo.ext;
                await fs.promises.writeFile(path.join(photosDir, fileName), photo.data, { flag: 'wx' });
                writtenNames.push(fileName);
            }
        } catch (e) {
            console.error('Ошибка записи фото: ' + e.message);
            await cleanupFiles(photosDir, writtenNames);
            respondError(res, 500, 'Не удалось сохранить заявку. Попробуйте позже.');
            return;
        }

        let id;
        try {
            id = db.createRequest({
                name: name,
                phone: phone,
                service: service,
                priceFrom: priceFrom,
                description: description,
                photoFiles: writtenNames,
                channels: channels
            });
        } catch (e) {
            console.error('Ошибка сохранения заявки: ' + e.message);
            await cleanupFiles(photosDir, writtenNames);
            respondError(res, 500, 'Не удалось сохранить заявку. Попробуйте позже.');
            return;
        }

        sendJson(res, 201, { ok: true });
        console.log('Заявка №' + id + ' принята, фото: ' + writtenNames.length);
        
        // Асинхронная отправка уведомлений во все включённые каналы (не блокирует ответ клиенту)
        if (notifyNewRequest && typeof notifyNewRequest === 'function') {
            // Используем демо-конфиг если он был загружен, иначе основной
            const configForNotifications = isDemoConfig ? config : readConfig(configPathForNotifications);
            // Загружаем конфиг, чтобы получить список включённых каналов
            try {
                const enabledChannels = extractChannels(configForNotifications);
                notifyNewRequest({
                    id: id,
                    name: name,
                    phone: phone,
                    service: service,
                    priceFrom: priceFrom,
                    description: description,
                    address: '',
                    channels: enabledChannels
                }, configPathForNotifications).catch(function () {
                    // Ошибки уведомлений не критичны
                });
            } catch (e) {
                // Если не удалось прочитать конфиг, уведомления не отправляем
                console.warn('Не удалось загрузить конфиг для уведомлений: ' + e.message);
            }
        }
    };
}

module.exports = { createRequestsHandler: createRequestsHandler };
