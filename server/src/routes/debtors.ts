import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { currentMonth } from '../lib/dates.js';
import { debtorsReport, errorBody, month } from '../schemas.js';
import type { Services } from '../services/index.js';

export const debtorRoutes: FastifyPluginAsyncZod<{ services: Services; timezone: string }> = async (
  app,
  { services, timezone },
) => {
  app.get(
    '/debtors',
    {
      schema: {
        tags: ['Должники'],
        summary: 'Должники за месяц',
        description:
          'Ученики, заплатившие за месяц меньше своей месячной суммы, и размер долга. Без month — текущий месяц.',
        querystring: z.object({ month: month.optional().describe('YYYY-MM') }),
        response: { 200: debtorsReport, 400: errorBody },
      },
    },
    async (req) => services.debtors.report(req.query.month ?? currentMonth(timezone)),
  );
};
