# Техническое задание (Шаг 3.4): Подключение клиентской формы к серверу

Этот документ описывает изменения, необходимые для интеграции клиентской части с сервером по отправке заявок (`POST /api/requests`).

## Вносимые изменения

### 1. Изменения в HTML ([`public/index.html`](public/index.html))
- Добавить скрытую ловушку для спам-ботов (honeypot):
  ```html
  <div style="display:none !important;">
      <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
  </div>
  ```
- Переименовать кнопку проверки `<button type="button" id="checkBtn">` в `<button type="button" id="submitBtn">Отправить заявку</button>`.
- Добавить обязательный чекбокс согласия на обработку персональных данных (152-ФЗ) перед кнопкой отправки:
  ```html
  <div class="field checkbox-field">
      <label class="checkbox-label">
          <input type="checkbox" id="agreement" checked required>
          <span>Согласен на <a href="privacy.html" target="_blank">обработку персональных данных</a></span>
      </label>
  </div>
  ```

### 2. Изменения в CSS ([`public/styles.css`](public/styles.css))
- Стилизовать чекбокс и его подпись для аккуратного отображения на мобильных устройствах:
  ```css
  .checkbox-field {
      margin-top: 8px;
  }
  .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 14px;
      font-weight: normal;
      cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-top: 2px;
      cursor: pointer;
  }
  .checkbox-label a {
      color: var(--primary);
      text-decoration: underline;
  }
  .checkbox-label a:hover {
      text-decoration: none;
  }
  ```
- Добавить стилизацию для состояния загрузки кнопки (анимация или изменение прозрачности, отключение курсора):
  ```css
  button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
  }
  ```

### 3. Автоматическое сжатие фотографий на стороне клиента ([`public/app.js`](public/app.js))
При выборе файлов пользователем, перед добавлением в массив `photos`, каждое изображение должно сжиматься с помощью HTML5 Canvas:
- Максимальный размер по длинной стороне: **1600px**.
- Формат: **JPEG**.
- Качество: **0.82**.
- Реализация асинхронного сжатия:
  ```javascript
  function compressImage(file) {
      return new Promise(function (resolve) {
          if (!file.type.startsWith('image/')) {
              resolve(file); // Возвращаем как есть, если это не картинка (хотя валидатор отфильтрует)
              return;
          }
          var reader = new FileReader();
          reader.onload = function (e) {
              var img = new Image();
              img.onload = function () {
                  var canvas = document.createElement('canvas');
                  var ctx = canvas.getContext('2d');
                  
                  var width = img.width;
                  var height = img.height;
                  var maxDim = 1600;
                  
                  if (width > maxDim || height > maxDim) {
                      if (width > height) {
                          height = Math.round((height * maxDim) / width);
                          width = maxDim;
                      } else {
                          width = Math.round((width * maxDim) / height);
                          height = maxDim;
                      }
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  ctx.drawImage(img, 0, 0, width, height);
                  
                  canvas.toBlob(function (blob) {
                      if (!blob) {
                          resolve(file);
                          return;
                      }
                      // Создаём новый File на основе Blob, сохраняя оригинальное имя
                      var compressedFile = new File([blob], file.name, {
                          type: 'image/jpeg',
                          lastModified: Date.now()
                      });
                      resolve(compressedFile);
                  }, 'image/jpeg', 0.82);
              };
              img.src = e.target.result;
          };
          reader.readAsDataURL(file);
      });
  }
  ```
- В `addFiles` обрабатывать файлы через `Promise.all` или последовательно, чтобы дождаться сжатия всех изображений перед обновлением интерфейса. В процессе сжатия можно временно блокировать интерфейс или выводить статус "Сжатие изображений...".

### 4. Изменение логики отправки ([`public/app.js`](public/app.js))
- Переименовать `handleCheck` в функцию отправки (например, `handleSubmit`).
- Обновить валидацию: проверить, отмечен ли чекбокс согласия `#agreement`. Если не отмечен, выводить ошибку.
- Если валидация пройдена:
  - Заблокировать кнопку отправки, изменить её текст (например, на "Отправка...").
  - Собрать `FormData`:
    - Текстовые поля: `name`, `contact`, `description`.
    - Скрытое поле-ловушка `website` (значение из инпута `#website`).
    - Выбранная услуга `service` (строковое название услуги из конфигурации, а не индекс).
    - Файлы изображений `photos` под ключом `photos` (сервер ожидает массив файлов).
  - Отправить `POST /api/requests` запрос.
  - При успехе (HTTP 200/201):
    - Очистить поля формы (имя, телефон, описание, сбросить селект услуги).
    - Очистить массив `photos`, обновить превью и счетчик.
    - Показать красивое сообщение об успехе с номером созданной заявки (из ответа сервера).
  - При ошибке:
    - Показать понятное сообщение об ошибке, полученное от сервера (или общее сообщение, если сервер недоступен).
  - Разблокировать кнопку отправки и восстановить её первоначальный текст.

### 5. Создание страницы политики конфиденциальности ([`public/privacy.html`](public/privacy.html))
- Простой HTML-шаблон в едином стиле сайта (цвета, шрифты, шапка и подвал).
- Автоматически подгружать `config.json` на этой странице и динамически подставлять:
  - Название компании (в заголовок и текст политики).
  - Телефон и контакты для связи в текст политики и подвал.
- Шаблонный текст согласия на обработку персональных данных (в соответствии с 152-ФЗ РФ): сбор имени, телефона, описания проблемы и фотографий исключительно с целью обработки заявки и связи по вопросам ремонта/услуг.

---

## План разработки (TODO)

1. [ ] Добавить элементы в [`public/index.html`](public/index.html) (ловушка `website`, чекбокс согласия 152-ФЗ, переименовать кнопку).
2. [ ] Обновить стили [`public/styles.css`](public/styles.css) (чекбокс, ссылка, состояние disabled для кнопок).
3. [ ] Создать страницу [`public/privacy.html`](public/privacy.html) с динамической загрузкой данных из `config.json`.
4. [ ] Реализовать функцию `compressImage` в [`public/app.js`](public/app.js) для сжатия фото на Canvas перед добавлением в массив.
5. [ ] Обновить обработчик выбора файлов в [`public/app.js`](public/app.js), добавив асинхронную стадию сжатия с индикацией.
6. [ ] Реализовать функцию `handleSubmit` в [`public/app.js`](public/app.js): сбор `FormData`, отправка на `POST /api/requests`, блокировка интерфейса, обработка успехов/ошибок и сброс формы.
7. [ ] Протестировать отправку формы с реального браузера, проверив сжатие картинок и корректность записи в БД.
