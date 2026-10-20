import 'dotenv/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function parseIds(raw: string | undefined): number[] {
  return (raw ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Tashkent',
  botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  adminIds: parseIds(process.env.ADMIN_IDS),
  // Собранный фронтенд (web/dist) раздаётся сервером, если он есть
  webDist: process.env.WEB_DIST ?? resolve(here, '../../web/dist'),
};

// Падаем при старте, а не на первом запросе, если часовой пояс указан с ошибкой
new Intl.DateTimeFormat('en-US', { timeZone: config.timezone });
