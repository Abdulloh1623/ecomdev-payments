import type { FastifyBaseLogger } from 'fastify';
import { Bot } from 'grammy';
import { AppError } from './errors.js';
import { currentMonth } from './lib/dates.js';
import { parseStudentRef, studentCode } from './lib/studentCode.js';
import type { Services } from './services/index.js';

const TELEGRAM_LIMIT = 4096;
const MAX_AMOUNT = 1_000_000_000;

const HELP = [
  'Учёт оплат учебного центра',
  '',
  '/debt — должники текущего месяца',
  '/pay <код ученика> <сумма> — внести оплату (дата — сегодня)',
  'Пример: /pay ST-0003 500000 (можно и просто /pay 3 500000)',
].join('\n');

const fmt = (n: number) => n.toLocaleString('ru-RU');

export type PayArgs = { ok: true; studentId: number; amount: number } | { ok: false; error: string };

/** Разбирает аргументы /pay. Ученик — код или id; сумму можно писать с пробелами: /pay ST-0003 500 000. */
export function parsePayArgs(raw: string): PayArgs {
  const usage = 'Формат: /pay <код ученика> <сумма>, например /pay ST-0003 500000';
  const [idPart, ...amountParts] = raw.trim().split(/\s+/).filter(Boolean);
  const amountPart = amountParts.join('');
  if (!idPart || !amountPart) return { ok: false, error: usage };
  const studentId = parseStudentRef(idPart);
  if (!studentId) return { ok: false, error: `Некорректный код ученика «${idPart}». ${usage}` };
  if (!/^\d+$/.test(amountPart)) return { ok: false, error: `Сумма должна быть целым положительным числом. ${usage}` };
  const amount = Number(amountPart);
  if (amount <= 0 || amount > MAX_AMOUNT) return { ok: false, error: `Сумма должна быть от 1 до ${fmt(MAX_AMOUNT)}` };
  return { ok: true, studentId, amount };
}

/** Делит длинный текст по строкам на сообщения не длиннее лимита Telegram. */
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current) {
      chunks.push(current);
      current = line.slice(0, limit);
    } else {
      current = candidate.slice(0, limit);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

interface BotOptions {
  token: string;
  adminIds: number[];
  services: Services;
  timezone: string;
  log: FastifyBaseLogger;
}

export function createBot({ token, adminIds, services, timezone, log }: BotOptions) {
  const bot = new Bot(token);

  // Бот показывает персональные данные и меняет оплаты — доступ только администраторам
  bot.use(async (ctx, next) => {
    const id = ctx.from?.id;
    if (id !== undefined && adminIds.includes(id)) return next();
    await ctx.reply(`Доступ запрещён. Ваш Telegram ID: ${id ?? 'неизвестен'} — его нужно добавить в ADMIN_IDS.`);
  });

  bot.command(['start', 'help'], (ctx) => ctx.reply(HELP));

  bot.command('debt', async (ctx) => {
    const report = await services.debtors.report(currentMonth(timezone));
    if (report.count === 0) return ctx.reply(`За ${report.month} должников нет.`);

    const lines = report.debtors.map(
      (d, i) =>
        `${i + 1}. ${d.code} ${d.name} (${d.groups.map((g) => g.name).join(', ')}) — долг ${fmt(d.debt)} из ${fmt(d.due)}`,
    );
    const text = [`Должники за ${report.month}: ${report.count}, общий долг ${fmt(report.totalDebt)}`, '', ...lines].join(
      '\n',
    );
    for (const chunk of splitMessage(text)) await ctx.reply(chunk);
  });

  bot.command('pay', async (ctx) => {
    const args = parsePayArgs(ctx.match);
    if (!args.ok) return ctx.reply(args.error);

    try {
      const payment = await services.payments.create({ studentId: args.studentId, amount: args.amount });
      const student = await services.students.get(payment.studentId);
      const month = payment.date.slice(0, 7);
      const { debt } = await services.debtors.studentMonth(student.id, month);
      const status = debt > 0 ? `Остаток долга за ${month}: ${fmt(debt)}.` : `За ${month} оплачено полностью.`;
      return ctx.reply(
        `Оплата внесена: ${studentCode(student.id)} ${student.name}, ${fmt(payment.amount)} (${payment.date}).\n${status}`,
      );
    } catch (err) {
      if (err instanceof AppError) return ctx.reply(err.message);
      throw err;
    }
  });

  bot.catch(async ({ ctx, error }) => {
    log.error({ err: error }, 'Ошибка в обработчике бота');
    await ctx.reply('Произошла ошибка, попробуйте позже.').catch(() => undefined);
  });

  return bot;
}
