FROM node:24-slim

# OpenSSL нужен движку Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY server/prisma/schema.prisma server/prisma/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/app.db
VOLUME /data
EXPOSE 3000

# Миграции при старте; демо-данные — только в пустую БД и только при SEED_DEMO=1
CMD ["sh", "-c", "npm run db:deploy -w server && if [ \"$SEED_DEMO\" = 1 ]; then npm run db:seed -w server; fi && npm start"]
