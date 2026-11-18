'use strict';

// Авторизация менеджера: сессии в памяти, HttpOnly-куки и защита от перебора пароля.
// Без сторонних библиотек — только встроенные модули Node.js.

const crypto = require('node:crypto');

const COOKIE_NAME = 'admin_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000);
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 минут

// ---------- Безопасное сравнение паролей ----------
// Сравниваем хеши одинаковой длины, чтобы не раскрывать пароль по времени ответа.
function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

// ---------- Создание менеджера авторизации ----------

function createAuthManager(options) {
    const opts = options || {};
    const adminPassword = String(opts.adminPassword || '');
    const trustProxy = opts.trustProxy === true;

    const sessions = new Map(); // sessionId -> { id, createdAt, expiresAt }
    const attempts = new Map(); // ip -> { count, windowStart, blockedUntil }

    // Раз в 5 минут удаляем устаревшие сессии и попытки. unref() не мешает остановке.
    setInterval(cleanup, 5 * 60 * 1000).unref();

    function cleanup() {
        const now = Date.now();
        for (const [id, session] of sessions) {
            if (now > session.expiresAt) {
                sessions.delete(id);
            }
        }
        for (const [ip, rec] of attempts) {
            if (rec.blockedUntil && now > rec.blockedUntil) {
                attempts.delete(ip);
            } else if (now - rec.windowStart >= LOGIN_WINDOW_MS) {
                attempts.delete(ip);
            }
        }
    }

    // ---------- Cookies ----------

    function parseCookies(req) {
        const list = {};
        const header = req && req.headers && req.headers.cookie;
        if (!header || typeof header !== 'string') {
            return list;
        }
        header.split(';').forEach(function (part) {
            const eq = part.indexOf('=');
            if (eq === -1) {
                return;
            }
            const name = part.slice(0, eq).trim();
            if (!name) {
                return;
            }
            let value = part.slice(eq + 1).trim();
            try {
                value = decodeURIComponent(value);
            } catch (e) {
                // Оставляем значение как есть, если его не удалось декодировать
            }
            list[name] = value;
        });
        return list;
    }

    function getSessionId(req) {
        return parseCookies(req)[COOKIE_NAME] || null;
    }

    // ---------- IP-адрес клиента ----------

    function getClientIp(req) {
        let ip = null;
        if (trustProxy) {
            const xff = req.headers['x-forwarded-for'];
            if (typeof xff === 'string' && xff.trim() !== '') {
                const parts = xff.split(',');
                ip = parts[0].trim();
            }
        }
        if (!ip && req.socket) {
            ip = req.socket.remoteAddress;
        }
        return ip || 'unknown';
    }

    // ---------- Сессии ----------

    function createSession() {
        const now = Date.now();
        return {
            id: crypto.randomBytes(32).toString('hex'),
            createdAt: now,
            expiresAt: now + SESSION_MAX_AGE_MS
        };
    }

    // Возвращает объект сессии, если кука действительна, иначе null.
    function checkSession(req) {
        const sessionId = getSessionId(req);
        if (!sessionId) {
            return null;
        }
        const session = sessions.get(sessionId);
        if (!session) {
            return null;
        }
        if (Date.now() > session.expiresAt) {
            sessions.delete(sessionId);
            return null;
        }
        return session;
    }

    // ---------- Ограничение попыток входа ----------

    function checkLoginRate(ip) {
        const now = Date.now();
        const rec = attempts.get(ip);
        if (!rec) {
            return { allowed: true };
        }

        if (rec.blockedUntil && now < rec.blockedUntil) {
            return {
                allowed: false,
                retryAfter: Math.max(1, Math.ceil((rec.blockedUntil - now) / 1000))
            };
        }

        if (now - rec.windowStart >= LOGIN_WINDOW_MS) {
            attempts.delete(ip);
            return { allowed: true };
        }

        if (rec.count >= MAX_LOGIN_ATTEMPTS) {
            rec.blockedUntil = now + LOGIN_WINDOW_MS;
            attempts.set(ip, rec);
            return {
                allowed: false,
                retryAfter: Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000))
            };
        }

        return { allowed: true };
    }

    function recordLoginFailure(ip) {
        const now = Date.now();
        let rec = attempts.get(ip);
        if (!rec || now - rec.windowStart >= LOGIN_WINDOW_MS) {
            rec = { count: 0, windowStart: now, blockedUntil: 0 };
        }
        rec.count += 1;
        if (rec.count >= MAX_LOGIN_ATTEMPTS) {
            rec.blockedUntil = now + LOGIN_WINDOW_MS;
        }
        attempts.set(ip, rec);
    }

    function resetLoginFailures(ip) {
        attempts.delete(ip);
    }

    // ---------- Вход и выход ----------

    function isConfigured() {
        return adminPassword.trim().length > 0;
    }

    // Проверяет пароль и при успехе создаёт сессию.
    // Возвращает { ok, sessionId?, status?, error?, retryAfter? }.
    function login(req, password) {
        if (!isConfigured()) {
            return {
                ok: false,
                status: 503,
                error: 'Вход заблокирован: на сервере не задан пароль администратора (ADMIN_PASSWORD).'
            };
        }

        const ip = getClientIp(req);
        const rate = checkLoginRate(ip);
        if (!rate.allowed) {
            return {
                ok: false,
                status: 429,
                retryAfter: rate.retryAfter,
                error: 'Слишком много попыток входа. Попробуйте через ' + rate.retryAfter + ' сек.'
            };
        }

        if (!safeEqual(String(password || ''), adminPassword)) {
            recordLoginFailure(ip);
            return { ok: false, status: 401, error: 'Неверный пароль.' };
        }

        resetLoginFailures(ip);
        const session = createSession();
        sessions.set(session.id, session);
        return { ok: true, sessionId: session.id };
    }

    // Удаляет сессию по куке из запроса. Возвращает id удалённой сессии или null.
    function logout(req) {
        const sessionId = getSessionId(req);
        if (sessionId) {
            sessions.delete(sessionId);
        }
        return sessionId;
    }

    return {
        COOKIE_NAME: COOKIE_NAME,
        SESSION_MAX_AGE_SECONDS: SESSION_MAX_AGE_SECONDS,
        isConfigured: isConfigured,
        checkSession: checkSession,
        login: login,
        logout: logout,
        getClientIp: getClientIp,
        getSessionId: getSessionId,
        parseCookies: parseCookies
    };
}

module.exports = {
    createAuthManager
};
