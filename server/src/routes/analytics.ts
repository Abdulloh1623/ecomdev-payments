import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { toCsv } from '../lib/csv.js';
import { currentMonth, monthsBetween, shiftMonth } from '../lib/dates.js';
import { analyticsBreakdown, analyticsDaily, analyticsSummary, errorBody, month, summaryQuery } from '../schemas.js';
import type { Services } from '../services/index.js';

const MAX_MONTHS = 24;
const monthQuery = z.object({ month: month.optional().describe('YYYY-MM; по умолчанию — текущий') });

const csvHeaders = (filename: string) => ({
  'content-type': 'text/csv; charset=utf-8',
  'content-disposition': `attachment; filename="${filename}"`,
});

export const analyticsRoutes: FastifyPluginAsyncZod<{ services: Services; timezone: string }> = async (
  app,
  { services, timezone },
) => {
  const { analytics } = services;

  function range(q: { from?: string; to?: string }) {
    const to = q.to ?? currentMonth(timezone);
    const from = q.from ?? shiftMonth(to, -5);
    if (from > to) throw badRequest('from не может быть позже to');
    if (monthsBetween(from, to).length > MAX_MONTHS) throw badRequest(`Период — не больше ${MAX_MONTHS} месяцев`);
    return { from, to };
  }

  app.get(
    '/analytics/summary',
    {
      schema: {
        tags: ['Аналитика'],
        summary: 'Динамика по месяцам: начислено, оплачено, долг, собираемость, движение учеников',
        querystring: summaryQuery,
        response: { 200: analyticsSummary, 400: errorBody },
      },
    },
    async (req) => {
      const { from, to } = range(req.query);
      return analytics.summary(from, to);
    },
  );

  app.get(
    '/analytics/summary.csv',
    { schema: { tags: ['Аналитика'], summary: 'Динамика по месяцам в CSV (Excel)', querystring: summaryQuery } },
    async (req, reply) => {
      const { from, to } = range(req.query);
      const s = await analytics.summary(from, to);
      const csv = toCsv(
        ['Месяц', 'Начислено', 'Оплачено', 'В счёт начислений', 'Переплата', 'Долг', 'Собираемость, %', 'Активных', 'Новых', 'Ушли', 'Должников'],
        s.months.map((m) => [
          m.month, m.due, m.paid, m.collected, m.overpaid, m.debt, m.collectionRate,
          m.activeStudents, m.newStudents, m.leftStudents, m.debtors,
        ]),
      );
      return reply.headers(csvHeaders(`summary_${from}_${to}.csv`)).send(csv);
    },
  );

  app.get(
    '/analytics/breakdown',
    {
      schema: {
        tags: ['Аналитика'],
        summary: 'Срез по предметам и группам за месяц; оплата делится пропорционально начислениям',
        querystring: monthQuery,
        response: { 200: analyticsBreakdown, 400: errorBody },
      },
    },
    async (req) => analytics.breakdown(req.query.month ?? currentMonth(timezone)),
  );

  app.get(
    '/analytics/breakdown.csv',
    { schema: { tags: ['Аналитика'], summary: 'Срез по предметам и группам в CSV (Excel)', querystring: monthQuery } },
    async (req, reply) => {
      const m = req.query.month ?? currentMonth(timezone);
      const b = await analytics.breakdown(m);
      const rows: (string | number | null)[][] = b.subjects.flatMap((s) => [
        [s.name, 'Итого по предмету', s.students, s.due, s.paid, s.debt, s.collectionRate],
        ...s.groups.map((g) => [s.name, g.name, g.students, g.due, g.paid, g.debt, g.collectionRate]),
      ]);
      rows.push(['Не распределено', '', null, null, b.totals.unallocated, null, null]);
      rows.push(['Всего', '', null, b.totals.due, b.totals.paid, b.totals.debt, b.totals.collectionRate]);
      const csv = toCsv(['Предмет', 'Группа', 'Учеников', 'Начислено', 'Оплачено', 'Долг', 'Собираемость, %'], rows);
      return reply.headers(csvHeaders(`breakdown_${m}.csv`)).send(csv);
    },
  );

  app.get(
    '/analytics/daily',
    {
      schema: {
        tags: ['Аналитика'],
        summary: 'Оплаты по дням месяца',
        querystring: monthQuery,
        response: { 200: analyticsDaily, 400: errorBody },
      },
    },
    async (req) => analytics.daily(req.query.month ?? currentMonth(timezone)),
  );
};
