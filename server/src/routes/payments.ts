import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorBody, payment, paymentInput } from '../schemas.js';
import type { Services } from '../services/index.js';

export const paymentRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.post(
    '/payments',
    {
      schema: {
        tags: ['Оплаты'],
        summary: 'Добавить оплату',
        body: paymentInput,
        response: { 201: payment, 400: errorBody, 404: errorBody },
      },
    },
    async (req, reply) => reply.code(201).send(await services.payments.create(req.body)),
  );

  app.get(
    '/payments',
    {
      schema: {
        tags: ['Оплаты'],
        summary: 'Оплаты по ученику (то же, что /students/:id/payments)',
        querystring: z.object({ studentId: z.coerce.number().int().positive() }),
        response: { 200: z.array(payment), 400: errorBody, 404: errorBody },
      },
    },
    async (req) => services.payments.listByStudent(req.query.studentId),
  );
};
