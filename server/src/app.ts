import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppError } from './errors.js';
import { debtorRoutes } from './routes/debtors.js';
import { paymentRoutes } from './routes/payments.js';
import { studentRoutes } from './routes/students.js';
import { createServices } from './services/index.js';

export interface AppOptions {
  db: PrismaClient;
  timezone: string;
  webDist?: string;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp({ db, timezone, webDist, logger = false }: AppOptions) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Единый формат ошибок: { error: { code, message, details? } }
  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Некорректные данные запроса',
          details: err.validation.map((v) => ({ path: v.instancePath, message: v.message })),
        },
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    // Ошибки Fastify уровня клиента (битый JSON и т. п.)
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: { code: err.code ?? 'BAD_REQUEST', message: err.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервера' } });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: `Маршрут ${req.method} ${req.url} не найден` } }),
  );

  await app.register(cors);
  await app.register(swagger, {
    openapi: { info: { title: 'Учёт оплат учебного центра', version: '1.0.0' } },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  const services = createServices(db, timezone);
  await app.register(studentRoutes, { services });
  await app.register(paymentRoutes, { services });
  await app.register(debtorRoutes, { services, timezone });

  if (webDist && existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist });
  }

  return app;
}
