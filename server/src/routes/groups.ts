import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorBody, group, groupDetail, groupInput, groupUpdate, idParams } from '../schemas.js';
import type { Services } from '../services/index.js';

export const groupRoutes: FastifyPluginAsyncZod<{ services: Services }> = async (app, { services }) => {
  app.get(
    '/groups',
    {
      schema: {
        tags: ['Группы'],
        summary: 'Список групп',
        querystring: z.object({ subjectId: z.coerce.number().int().positive().optional().describe('Фильтр по предмету') }),
        response: { 200: z.array(group) },
      },
    },
    async (req) => services.groups.list(req.query),
  );

  app.post(
    '/groups',
    {
      schema: {
        tags: ['Группы'],
        summary: 'Создать группу в предмете',
        body: groupInput,
        response: { 201: groupDetail, 400: errorBody, 404: errorBody, 409: errorBody },
      },
    },
    async (req, reply) => reply.code(201).send(await services.groups.create(req.body)),
  );

  app.get(
    '/groups/:id',
    {
      schema: {
        tags: ['Группы'],
        summary: 'Группа: история цен и текущие ученики',
        params: idParams,
        response: { 200: groupDetail, 404: errorBody },
      },
    },
    async (req) => services.groups.get(req.params.id),
  );

  app.patch(
    '/groups/:id',
    {
      schema: {
        tags: ['Группы'],
        summary: 'Изменить группу; новая цена действует с priceFrom (по умолчанию — текущий месяц)',
        params: idParams,
        body: groupUpdate,
        response: { 200: groupDetail, 400: errorBody, 404: errorBody, 409: errorBody },
      },
    },
    async (req) => services.groups.update(req.params.id, req.body),
  );

  app.delete(
    '/groups/:id',
    {
      schema: {
        tags: ['Группы'],
        summary: 'Удалить группу (только без учеников)',
        params: idParams,
        response: { 204: z.null().describe('Удалена'), 404: errorBody, 409: errorBody },
      },
    },
    async (req, reply) => {
      await services.groups.remove(req.params.id);
      return reply.code(204).send(null);
    },
  );
};
