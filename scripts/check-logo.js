'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

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

function waitForHealth(baseUrl, child, output) {
    return new Promise(function (resolve, reject) {
        const deadline = Date.now() + 10000;
        (function poll() {
            if (Date.now() > deadline) {
                reject(new Error('Server not started: ' + output));
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

async function main() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-check-logo-'));
    const dataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(dataDir);

    const port = await findFreePort();
    const baseUrl = 'http://127.0.0.1:' + port;

    let output = '';
    const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
        env: Object.assign({}, process.env, {
            PORT: String(port),
            DATA_DIR: dataDir,
            ADMIN_PASSWORD: 'secret123'
        }),
        stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', function (d) { output += d; });
    child.stderr.on('data', function (d) { output += d; });

    try {
        await waitForHealth(baseUrl, child, output);

        // 1. Логотип отсутствует -> 404
        const r404 = await fetch(baseUrl + '/api/logo');
        assert.strictEqual(r404.status, 404, 'GET /api/logo без логотипа должен дать 404');

        // 2. POST /api/admin/logo без сессии -> 401
        const form401 = new FormData();
        form401.append('logo', new Blob([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0])], { type: 'image/jpeg' }), 'x.jpg');
        const r401 = await fetch(baseUrl + '/api/admin/logo', { method: 'POST', body: form401 });
        assert.strictEqual(r401.status, 401, 'POST /api/admin/logo без сессии должен дать 401');

        // 3. Вход менеджера
        const loginRes = await fetch(baseUrl + '/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: 'secret123' })
        });
        assert.strictEqual(loginRes.status, 200, 'Логин должен пройти');
        const cookie = loginRes.headers.get('set-cookie').split(';')[0];

        // 4. Удаление без логотипа -> ok true
        const del1 = await fetch(baseUrl + '/api/admin/logo/delete', { method: 'POST', headers: { Cookie: cookie } });
        assert.strictEqual(del1.status, 200);
        assert.deepStrictEqual(await del1.json(), { ok: true });

        // 5. Загрузка SVG -> 400
        const svgForm = new FormData();
        svgForm.append('logo', new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')], { type: 'image/svg+xml' }), 'logo.svg');
        const rSvg = await fetch(baseUrl + '/api/admin/logo', { method: 'POST', body: svgForm, headers: { Cookie: cookie } });
        assert.strictEqual(rSvg.status, 400, 'SVG должен быть отклонён');

        // 6. Загрузка JPEG -> 200
        const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(64, 1)]);
        const jpegForm = new FormData();
        jpegForm.append('logo', new Blob([JPEG], { type: 'image/jpeg' }), 'company.jpg');
        const rUpload = await fetch(baseUrl + '/api/admin/logo', { method: 'POST', body: jpegForm, headers: { Cookie: cookie } });
        assert.strictEqual(rUpload.status, 200, 'JPEG должен сохраниться');
        assert.deepStrictEqual(await rUpload.json(), { ok: true });

        // 7. GET /api/logo возвращает файл и заголовки
        const rLogo = await fetch(baseUrl + '/api/logo');
        assert.strictEqual(rLogo.status, 200);
        assert.strictEqual(rLogo.headers.get('content-type'), 'image/jpeg');
        assert.strictEqual(rLogo.headers.get('cache-control'), 'no-cache');
        const logoBuf = Buffer.from(await rLogo.arrayBuffer());
        assert.ok(logoBuf.equals(JPEG), 'GET /api/logo должен вернуть исходные байты');

        // 8. Повторная загрузка PNG заменяет старый файл
        const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(32, 2)]);
        const pngForm = new FormData();
        pngForm.append('logo', new Blob([PNG], { type: 'image/png' }), 'logo.png');
        const rUpload2 = await fetch(baseUrl + '/api/admin/logo', { method: 'POST', body: pngForm, headers: { Cookie: cookie } });
        assert.strictEqual(rUpload2.status, 200);
        const rLogo2 = await fetch(baseUrl + '/api/logo');
        assert.strictEqual(rLogo2.headers.get('content-type'), 'image/png');
        const brandingFiles = fs.readdirSync(path.join(dataDir, 'branding'));
        assert.strictEqual(brandingFiles.length, 1, 'Должен остаться ровно один файл логотипа');

        // 9. Удаление -> ok true, затем 404
        const del2 = await fetch(baseUrl + '/api/admin/logo/delete', { method: 'POST', headers: { Cookie: cookie } });
        assert.strictEqual(del2.status, 200);
        assert.deepStrictEqual(await del2.json(), { ok: true });
        const r404b = await fetch(baseUrl + '/api/logo');
        assert.strictEqual(r404b.status, 404, 'После удаления GET /api/logo должен дать 404');

        console.log('Все проверки логотипа пройдены');
    } finally {
        try {
            if (child.exitCode === null && child.signalCode === null) {
                child.kill();
                await new Promise(function (resolve) {
                    const t = setTimeout(resolve, 2000);
                    child.once('exit', function () { clearTimeout(t); resolve(); });
                });
            }
        } catch (e) {}
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
}

main().catch(function (e) {
    console.error('Проверка не пройдена: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
