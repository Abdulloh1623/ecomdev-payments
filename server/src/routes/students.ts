import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { notFound } from '../errors.js';
import { parseStudentRef } from '../lib/studentCode.js';
import { errorBody, payment, student, studentInput, studentRefParams, studentUpdate } from '../schemas.js';
import type { Services } from '../services/index.js';

/** В пути можно передать id или код ученика: /students/2 или /students/ST-0002. */
function studentId(raw: string): number {
  const id = parseStudentRef(raw);
  if (!id) throw notFound('Ученик');
  return id;
}

export const studentRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/students',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Список учеников',
        querystring: z.object({
          groupId: z.coerce.number().int().positive().optional().describe('Только ученики группы'),
          subjectId: z.coerce.number().int().positive().optional().describe('Только ученики предмета'),
        }),
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
        summary: 'Создать ученика и записать в одну или несколько групп',
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
        summary: 'Ученик по id или коду',
        params: studentRefParams,
        response: { 200: student, 404: errorBody },
      },
    },
    async (req) => services.students.get(studentId(req.params.id)),
  );

  app.patch(
    '/students/:id',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Изменить ученика; groupIds — новый полный список групп',
        params: studentRefParams,
        body: studentUpdate,
        response: { 200: student, 400: errorBody, 404: errorBody },
      },
    },
    async (req) => services.students.update(studentId(req.params.id), req.body),
  );

  app.delete(
    '/students/:id',
    {
      schema: {
        tags: ['Ученики'],
        summary: 'Удалить ученика (мягко: выбывает из групп, оплаты сохраняются)',
        params: studentRefParams,
        response: { 204: z.null().describe('Удалён'), 404: errorBody },
      },
    },
    async (req, reply) => {
      await services.students.remove(studentId(req.params.id));
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/students/:id/payments',
    {
      schema: {
        tags: ['Оплаты'],
        summary: 'Оплаты ученика',
        params: studentRefParams,
        response: { 200: z.array(payment), 404: errorBody },
      },
    },
    async (req) => services.payments.listByStudent(studentId(req.params.id)),
  );
};
