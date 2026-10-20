import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { zonedStartOfDay } from '../src/lib/dates.js';

export const TZ = 'Asia/Tashkent';

/** Поднимает приложение на тестовой БД и чистит таблицы перед каждым тестом. */
export function setupTestApp() {
  const db = new PrismaClient();
  const ctx = {} as { app: Awaited<ReturnType<typeof buildApp>>; db: PrismaClient };

  beforeAll(async () => {
    ctx.app = await buildApp({ db, timezone: TZ });
    ctx.db = db;
  });
  beforeEach(async () => {
    await db.payment.deleteMany();
    await db.student.deleteMany();
  });
  afterAll(async () => {
    await ctx.app.close();
    await db.$disconnect();
  });

  return ctx;
}

let counter = 0;

/** Создаёт ученика напрямую в БД — так можно задать дату записи и удаления. */
export function makeStudent(
  db: PrismaClient,
  overrides: { monthlyFee?: number; createdOn?: string; deletedOn?: string; name?: string } = {},
) {
  counter += 1;
  return db.student.create({
    data: {
      name: overrides.name ?? `Ученик ${counter}`,
      phone: '+998901234567',
      group: 'A1',
      monthlyFee: overrides.monthlyFee ?? 500_000,
      createdAt: zonedStartOfDay(overrides.createdOn ?? '2026-01-01', TZ),
      deletedAt: overrides.deletedOn ? zonedStartOfDay(overrides.deletedOn, TZ) : null,
    },
  });
}

export function pay(db: PrismaClient, studentId: number, amount: number, date: string) {
  return db.payment.create({ data: { studentId, amount, date } });
}
