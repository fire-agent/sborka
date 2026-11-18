FROM node:22-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости ( production только)
RUN npm ci --omit=dev

# Копируем остальные файлы
COPY server/ ./server/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Создаём папку для данных (они будут монтироваться как том)
RUN mkdir -p /app/data/photos

# Экспортируем порт
EXPOSE 3000

# Запускаем сервер
CMD ["node", "server/index.js"]
