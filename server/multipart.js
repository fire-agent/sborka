'use strict';

// Разбор тела multipart/form-data без сторонних библиотек.
// Возвращает текстовые поля и файлы; бинарные данные не трогает.

const CRLF = Buffer.from('\r\n');
const CRLFCRLF = Buffer.from('\r\n\r\n');

// Извлекает параметр вида name="value" или name=value из заголовка
function extractParam(value, paramName) {
    const re = new RegExp('(?:^|;)\\s*' + paramName + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))', 'i');
    const m = value.match(re);
    if (!m) return undefined;
    return m[1] !== undefined ? m[1] : m[2];
}

// Разбирает блок заголовков одной части формы
function parsePartHeaders(headerText) {
    const lines = headerText.split('\r\n');
    let disposition = '';
    let contentType = '';
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const name = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (name === 'content-disposition') disposition = value;
        else if (name === 'content-type') contentType = value;
    }

    if (!disposition || !/^form-data\b/i.test(disposition)) {
        throw new Error('Нет заголовка Content-Disposition form-data');
    }

    const name = extractParam(disposition, 'name');
    if (!name) {
        throw new Error('Часть формы без имени поля');
    }

    const filename = extractParam(disposition, 'filename');
    return { name: name, filename: filename, contentType: contentType };
}

function parseMultipart(body, boundary, limits) {
    if (!Buffer.isBuffer(body)) {
        throw new Error('Форма должна быть буфером');
    }

    const opts = Object.assign({
        maxParts: 20,
        maxHeaderBytes: 4096,
        maxFieldBytes: 10000
    }, limits || {});

    const delimiter = Buffer.from('\r\n--' + boundary);
    // Считаем, что тело начинается с \r\n — тогда первый разделитель ищется единообразно
    const searchBuf = Buffer.concat([CRLF, body]);

    const fields = Object.create(null);
    const files = [];

    let pos = 0;
    let partCount = 0;

    while (true) {
        const delIdx = searchBuf.indexOf(delimiter, pos);
        if (delIdx === -1) {
            throw new Error('Форма не завершена');
        }

        const afterDel = delIdx + delimiter.length;
        if (afterDel + 2 > searchBuf.length) {
            throw new Error('Форма не завершена');
        }

        // Закрывающий маркер --boundary--
        if (searchBuf[afterDel] === 0x2d && searchBuf[afterDel + 1] === 0x2d) {
            return { fields: fields, files: files };
        }

        // После разделителя должны идти заголовки части
        if (searchBuf[afterDel] !== 0x0d || searchBuf[afterDel + 1] !== 0x0a) {
            throw new Error('Неверный формат формы');
        }

        partCount += 1;
        if (partCount > opts.maxParts) {
            throw new Error('Слишком много частей формы');
        }

        const headersStart = afterDel + 2;
        const headerEnd = searchBuf.indexOf(CRLFCRLF, headersStart);
        if (headerEnd === -1) {
            throw new Error('Не найдены заголовки части');
        }
        if (headerEnd - headersStart > opts.maxHeaderBytes) {
            throw new Error('Заголовки части слишком длинные');
        }

        const part = parsePartHeaders(searchBuf.toString('utf8', headersStart, headerEnd));

        const dataStart = headerEnd + CRLFCRLF.length;
        const nextDel = searchBuf.indexOf(delimiter, dataStart);
        if (nextDel === -1) {
            throw new Error('Форма не завершена');
        }

        const data = searchBuf.subarray(dataStart, nextDel);

        if (part.filename !== undefined) {
            // Файловая часть: бинарные данные сохраняем как есть (копия, чтобы не держать весь буфер)
            files.push({
                field: part.name,
                filename: part.filename,
                contentType: part.contentType,
                data: Buffer.from(data)
            });
        } else {
            if (data.length > opts.maxFieldBytes) {
                throw new Error('Текстовое поле слишком длинное');
            }
            const value = data.toString('utf8');
            if (!(part.name in fields)) {
                fields[part.name] = value;
            } else {
                // Повторяющееся поле превращаем в массив (множественный выбор услуг)
                if (Array.isArray(fields[part.name])) {
                    fields[part.name].push(value);
                } else {
                    fields[part.name] = [fields[part.name], value];
                }
            }
        }

        pos = nextDel;
    }
}

module.exports = { parseMultipart: parseMultipart };
