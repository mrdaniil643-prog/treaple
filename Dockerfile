FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/app/data/mt.db

# Внешних зависимостей нет: копируем только то, что нужно серверу
COPY package.json package-lock.json ./
COPY server ./server
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "--no-warnings", "server/index.js", "--prod"]
