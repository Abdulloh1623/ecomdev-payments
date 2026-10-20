import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { createBot } from './bot.js';
import { config } from './config.js';
import { createServices } from './services/index.js';

const db = new PrismaClient();
const app = await buildApp({ db, timezone: config.timezone, webDist: config.webDist, logger: true });

await app.listen({ port: config.port, host: config.host });
app.log.info(`Swagger: http://localhost:${config.port}/docs`);

let bot: ReturnType<typeof createBot> | undefined;
if (config.botToken) {
  bot = createBot({
    token: config.botToken,
    adminIds: config.adminIds,
    services: createServices(db, config.timezone),
    timezone: config.timezone,
    log: app.log,
  });
  if (config.adminIds.length === 0) app.log.warn('ADMIN_IDS пуст — бот будет отвечать всем «доступ запрещён»');
  // Ошибка бота (например, неверный токен) не должна останавливать API
  bot
    .start({ onStart: (me) => app.log.info(`Telegram-бот @${me.username} запущен`) })
    .catch((err) => app.log.error({ err }, 'Telegram-бот не запустился'));
} else {
  app.log.warn('TELEGRAM_BOT_TOKEN не задан — бот не запущен, API работает');
}

async function shutdown() {
  await bot?.stop();
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
