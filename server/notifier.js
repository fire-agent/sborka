'use strict';

// Модуль фоновых уведомлений менеджера при создании новой заявки
// Поддерживает Telegram, MAX (через platform-api.max.ru) и WhatsApp (через Green-API)

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// ---------- Константы ----------

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// ---------- Проверка конфигурации ----------

function hasEnv(key) {
    return key && String(key).trim() !== '';
}

// Считывает конфиг из public/config.json
function readConfig(configPath) {
    let raw;
    try {
        raw = fs.readFileSync(configPath, 'utf8');
    } catch (e) {
        console.error('notifier: не удалось прочитать config.json из ' + configPath);
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error('notifier: ошибка JSON в config.json');
        return null;
    }
}

// Получает настройки из переменных окружения
function getNotificationsConfig(configPath) {
    const config = readConfig(configPath);
    const notifications = config ? config.notifications : null;

    return {
        telegram: {
            enabled: notifications && notifications.telegram === true,
            botToken: process.env.TELEGRAM_BOT_TOKEN || '',
            chatId: process.env.TELEGRAM_CHAT_ID || ''
        },
        max: {
            enabled: notifications && notifications.max === true,
            botToken: process.env.MAX_BOT_TOKEN || '',
            chatId: process.env.MAX_CHAT_ID || ''
        },
        whatsapp: {
            enabled: notifications && notifications.whatsapp === true,
            apiUrl: process.env.GREEN_API_URL || 'https://api.green-api.com',
            idInstance: process.env.GREEN_API_ID_INSTANCE || '',
            apiTokenInstance: process.env.GREEN_API_TOKEN || '',
            chatId: process.env.WHATSAPP_CHAT_ID || ''
        }
    };
}

// ---------- Формирование сообщения ----------

// Формирует текст уведомления о новой заявке
function formatMessage(request) {
    const lines = [];
    lines.push('📋 <b>Новая заявка</b>');
    lines.push('');
    lines.push('<b>Услуга:</b> ' + (request.service || '-'));
    lines.push('<b>Цена от:</b> ' + (request.priceFrom ? request.priceFrom + ' ₽' : 'уточняется'));
    lines.push('<b>Имя:</b> ' + (request.name || '-'));
    lines.push('<b>Телефон:</b> ' + (request.phone || '-'));
    if (request.address) {
        lines.push('<b>Адрес:</b> ' + request.address);
    }
    if (request.description) {
        lines.push('');
        lines.push('<b>Описание:</b>');
        // Ограничиваем описание, чтобы не превысить лимит Telegram (4096 символов)
        const desc = request.description.substring(0, 1000);
        lines.push('<pre>' + desc + '</pre>');
    }
    return lines.join('\n');
}

// ---------- Отправка уведомлений ----------

// Отправляет сообщение в Telegram через Bot API
async function sendTelegram(botToken, chatId, text) {
    if (!hasEnv(botToken)) {
        console.log('Telegram: пропущено — не задан TELEGRAM_BOT_TOKEN в .env');
        return { ok: false, reason: 'no_token' };
    }
    if (!hasEnv(chatId)) {
        console.log('Telegram: пропущено — не задан TELEGRAM_CHAT_ID в .env');
        return { ok: false, reason: 'no_chat_id' };
    }
    
    console.log('Telegram: отправка уведомления в chat_id=' + chatId);
    const url = 'https://api.telegram.org/bot' + encodeURIComponent(botToken) + '/sendMessage';
    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    });
    
    return new Promise(function (resolve) {
        const bodyLength = Buffer.byteLength(postData);
        const req = https.request(url, {
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(bodyLength)
            }
        }, function (res) {
            let data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                console.log('Telegram: ответ API (' + res.statusCode + '): ' + data.substring(0, 200));
                try {
                    const result = JSON.parse(data);
                    if (result.ok) {
                        console.log('Telegram: ✓ уведомление отправлено (message_id=' + (result.result ? result.result.message_id : '?') + ')');
                        resolve({ ok: true });
                    } else {
                        console.error('Telegram: ✗ ошибка API — ' + (result.description || 'неизвестная ошибка'));
                        resolve({ ok: false, error: result.description });
                    }
                } catch (e) {
                    console.error('Telegram: ✗ не удалось распарсить ответ API');
                    resolve({ ok: false, error: 'Не удалось разобрать ответ API Telegram.' });
                }
            });
        });
        req.on('error', function (e) {
            console.error('Telegram: ✗ сетевая ошибка — ' + e.message);
            resolve({ ok: false, error: 'Сетевая ошибка при отправке сообщения в Telegram.' });
        });
        req.on('timeout', function () {
            req.destroy();
            console.error('Telegram: ✗ таймаут запроса');
            resolve({ ok: false, error: 'Превышено время ожидания ответа от Telegram (15 секунд).' });
        });
        req.setTimeout(15000); // 15 секунд
        req.write(postData);
        req.end();
    });
}

// Отправляет сообщение в MAX через platform-api.max.ru
async function sendMAX(botToken, chatId, text) {
    if (!hasEnv(botToken)) {
        console.log('MAX: пропущено — не задан MAX_BOT_TOKEN в .env');
        return { ok: false, reason: 'no_token' };
    }
    if (!hasEnv(chatId)) {
        console.log('MAX: пропущено — не задан MAX_CHAT_ID в .env');
        return { ok: false, reason: 'no_chat_id' };
    }
    
    console.log('MAX: отправка уведомления в chat_id=' + chatId);
    const url = 'https://platform-api.max.ru/v1/sendMessage';
    const postData = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
    });
    
    return new Promise(function (resolve) {
        const bodyLength = Buffer.byteLength(postData);
        const req = https.request(url, {
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(bodyLength),
                'Authorization': 'Bearer ' + botToken
            }
        }, function (res) {
            let data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                console.log('MAX: ответ API (' + res.statusCode + '): ' + data.substring(0, 200));
                try {
                    const result = JSON.parse(data);
                    if (result.ok) {
                        console.log('MAX: ✓ уведомление отправлено (message_id=' + (result.result ? result.result.message_id : '?') + ')');
                        resolve({ ok: true });
                    } else {
                        console.error('MAX: ✗ ошибка API — ' + (result.description || 'неизвестная ошибка'));
                        resolve({ ok: false, error: result.description });
                    }
                } catch (e) {
                    console.error('MAX: ✗ не удалось распарсить ответ API');
                    resolve({ ok: false, error: 'Не удалось разобрать ответ API MAX.' });
                }
            });
        });
        req.on('error', function (e) {
            console.error('MAX: ✗ сетевая ошибка — ' + e.message);
            resolve({ ok: false, error: 'Сетевая ошибка при отправке сообщения в MAX.' });
        });
        req.on('timeout', function () {
            req.destroy();
            console.error('MAX: ✗ таймаут запроса');
            resolve({ ok: false, error: 'Превышено время ожидания ответа от MAX (15 секунд).' });
        });
        req.setTimeout(15000); // 15 секунд
        req.write(postData);
        req.end();
    });
}

// Отправляет сообщение в WhatsApp через Green-API
async function sendWhatsApp(apiUrl, idInstance, apiTokenInstance, chatId, text) {
    if (!hasEnv(idInstance)) {
        console.log('WhatsApp: пропущено — не задан GREEN_API_ID_INSTANCE в .env');
        return { ok: false, reason: 'no_id_instance' };
    }
    if (!hasEnv(apiTokenInstance)) {
        console.log('WhatsApp: пропущено — не задан GREEN_API_TOKEN в .env');
        return { ok: false, reason: 'no_token' };
    }
    if (!hasEnv(chatId)) {
        console.log('WhatsApp: пропущено — не задан WHATSAPP_CHAT_ID в .env');
        return { ok: false, reason: 'no_chat_id' };
    }
    
    // Green-API использует формат chatId@c.us
    const recipient = chatId.includes('@') ? chatId : chatId + '@c.us';
    const url = apiUrl + '/waInstance' + idInstance + '/SendMessage/' + apiTokenInstance;
    const postData = JSON.stringify({
        chatId: recipient,
        message: text
    });
    
    console.log('WhatsApp: отправка уведомления в ' + recipient);
    
    return new Promise(function (resolve) {
        const bodyLength = Buffer.byteLength(postData);
        const req = https.request(url, {
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': String(bodyLength)
            }
        }, function (res) {
            let data = '';
            res.on('data', function (chunk) { data += chunk; });
            res.on('end', function () {
                console.log('WhatsApp: ответ API (' + res.statusCode + '): ' + data.substring(0, 200));
                try {
                    const result = JSON.parse(data);
                    if (result.idMessage) {
                        console.log('WhatsApp: ✓ уведомление отправлено (idMessage=' + result.idMessage + ')');
                        resolve({ ok: true });
                    } else {
                        console.error('WhatsApp: ✗ ошибка API — ' + data);
                        resolve({ ok: false, error: 'WhatsApp вернул ошибку: сообщение не было отправлено.' });
                    }
                } catch (e) {
                    console.error('WhatsApp: ✗ не удалось распарсить ответ API');
                    resolve({ ok: false, error: 'Не удалось разобрать ответ API WhatsApp.' });
                }
            });
        });
        req.on('error', function (e) {
            console.error('WhatsApp: ✗ сетевая ошибка — ' + e.message);
            resolve({ ok: false, error: 'Сетевая ошибка при отправке сообщения в WhatsApp.' });
        });
        req.on('timeout', function () {
            req.destroy();
            console.error('WhatsApp: ✗ таймаут запроса');
            resolve({ ok: false, error: 'Превышено время ожидания ответа от WhatsApp (15 секунд).' });
        });
        req.setTimeout(15000); // 15 секунд
        req.write(postData);
        req.end();
    });
}

// ---------- Главная функция ----------

// Отправляет уведомления во все включённые каналы (асинхронно, без блокировки)
async function notifyNewRequest(request, configPath) {
    if (!configPath) {
        console.warn('notifier: не передан путь к config.json');
        return;
    }
    
    const config = getNotificationsConfig(configPath);
    const message = formatMessage(request);
    
    console.log('notifier: начало отправки уведомлений...');
    
    const tasks = [];
    
    // Telegram
    if (config.telegram.enabled) {
        console.log('notifier: Telegram включён в config.json');
        tasks.push(sendTelegram(config.telegram.botToken, config.telegram.chatId, message));
    } else {
        console.log('notifier: Telegram пропущен (не включён в config.json)');
    }
    
    // MAX
    if (config.max.enabled) {
        console.log('notifier: MAX включён в config.json');
        tasks.push(sendMAX(config.max.botToken, config.max.chatId, message));
    } else {
        console.log('notifier: MAX пропущен (не включён в config.json)');
    }
    
    // WhatsApp
    if (config.whatsapp.enabled) {
        console.log('notifier: WhatsApp включён в config.json');
        tasks.push(sendWhatsApp(
            config.whatsapp.apiUrl,
            config.whatsapp.idInstance,
            config.whatsapp.apiTokenInstance,
            config.whatsapp.chatId,
            message
        ));
    } else {
        console.log('notifier: WhatsApp пропущен (не включён в config.json)');
    }
    
    if (tasks.length === 0) {
        console.log('notifier: ни один канал не включён — уведомления не отправляются');
        return;
    }
    
    // Выполняем все запросы параллельно
    Promise.allSettled(tasks).then(function (results) {
        for (let i = 0; i < tasks.length; i++) {
            const status = results[i].status;
            // Логирование уже внутри send* функций
        }
    }).catch(function (e) {
        console.error('notifier: ошибка при отправке уведомлений — ' + e.message);
    });
}

// ---------- Экспорт ----------

module.exports = {
    getNotificationsConfig: getNotificationsConfig,
    notifyNewRequest: notifyNewRequest,
    formatMessage: formatMessage,
    readConfig: readConfig,
    sendTelegram: sendTelegram,
    sendMAX: sendMAX,
    sendWhatsApp: sendWhatsApp
};
