import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorBody, idParams, subject, subjectInput } from '../schemas.js';
import type { Services } from '../services/index.js';

export const subjectRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/subjects',
    { schema: { tags: ['Предметы'], summary: 'Список предметов', response: { 200: z.array(subject) } } },
    async () => services.subjects.list(),
  );

  app.post(
    '/subjects',
    {
      schema: {
        tags: ['Предметы'],
        summary: 'Создать предмет',
        body: subjectInput,
        response: { 201: subject, 400: errorBody, 409: errorBody },
      },
    },
    async (req, reply) => reply.code(201).send(await services.subjects.create(req.body)),
  );

  app.get(
    '/subjects/:id',
    {
      schema: { tags: ['Предметы'], summary: 'Предмет', params: idParams, response: { 200: subject, 404: errorBody } },
    },
    async (req) => services.subjects.get(req.params.id),
  );

  app.patch(
    '/subjects/:id',
    {
      schema: {
        tags: ['Предметы'],
        summary: 'Переименовать предмет',
        params: idParams,
        body: subjectInput,
        response: { 200: subject, 400: errorBody, 404: errorBody, 409: errorBody },
      },
    },
    async (req) => services.subjects.update(req.params.id, req.body),
  );

  app.delete(
    '/subjects/:id',
    {
      schema: {
        tags: ['Предметы'],
        summary: 'Удалить предмет (только без групп)',
        params: idParams,
        response: { 204: z.null().describe('Удалён'), 404: errorBody, 409: errorBody },
      },
    },
    async (req, reply) => {
      await services.subjects.remove(req.params.id);
      return reply.code(204).send(null);
    },
  );
};
