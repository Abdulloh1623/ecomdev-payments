import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorBody, idParams, payment, student, studentInput, studentUpdate } from '../schemas.js';
import type { Services } from '../services/index.js';

export const studentRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/students',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Список учеников',
        querystring: z.object({ group: z.string().optional().describe('Фильтр по группе') }),
        response: { 200: z.array(student) },
      },
    },
    async (req) => services.students.list(req.query),
  );

  app.post(
    '/students',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Создать ученика',
        body: studentInput,
        response: { 201: student, 400: errorBody },
      },
    },
    async (req, reply) => reply.code(201).send(await services.students.create(req.body)),
  );

  app.get(
    '/students/:id',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Ученик по id',
        params: idParams,
        response: { 200: student, 404: errorBody },
      },
    },
    async (req) => services.students.get(req.params.id),
  );

  app.patch(
    '/students/:id',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Изменить ученика (любые поля)',
        params: idParams,
        body: studentUpdate,
        response: { 200: student, 400: errorBody, 404: errorBody },
      },
    },
    async (req) => services.students.update(req.params.id, req.body),
  );

  app.delete(
    '/students/:id',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Удалить ученика (мягкое удаление, оплаты сохраняются)',
        params: idParams,
        response: { 204: z.null().describe('Удалён'), 404: errorBody },
      },
    },
    async (req, reply) => {
      await services.students.remove(req.params.id);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/students/:id/payments',
    {
      schema: {
        tags: ['Оплаты'],
        summary: 'Оплаты ученика',
        params: idParams,
        response: { 200: z.array(payment), 404: errorBody },
      },
    },
    async (req) => services.payments.listByStudent(req.params.id),
  );
};
