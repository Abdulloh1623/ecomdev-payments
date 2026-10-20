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
    await db.enrollment.deleteMany();
    await db.groupPrice.deleteMany();
    await db.group.deleteMany();
    await db.subject.deleteMany();
    await db.student.deleteMany();
  });
  afterAll(async () => {
    await ctx.app.close();
    await db.$disconnect();
  });

  return ctx;
}

let counter = 0;

/** Группа в новом предмете. prices: [fromMonth, amount][]; по умолчанию одна цена с 2026-01. */
export async function makeGroup(db: PrismaClient, opts: { price?: number; prices?: [string, number][]; name?: string } = {}) {
  counter += 1;
  const subject = await db.subject.create({ data: { name: `Предмет ${counter}` } });
  const prices = opts.prices ?? [['2026-01', opts.price ?? 500_000]];
  return db.group.create({
    data: {
      subjectId: subject.id,
      name: opts.name ?? `Группа ${counter}`,
      prices: { create: prices.map(([fromMonth, amount]) => ({ fromMonth, amount })) },
    },
  });
}

interface Membership {
  groupId: number;
  joinedOn?: string;
  leftOn?: string;
}

/** Ученик напрямую в БД: можно задать даты участия в группах и удаления. */
export function makeStudent(db: PrismaClient, opts: { groups?: Membership[]; deletedOn?: string; name?: string } = {}) {
  counter += 1;
  return db.student.create({
    data: {
      name: opts.name ?? `Ученик ${counter}`,
      phone: '+998901234567',
      deletedAt: opts.deletedOn ? zonedStartOfDay(opts.deletedOn, TZ) : null,
      enrollments: {
        create: (opts.groups ?? []).map((g) => ({
          groupId: g.groupId,
          joinedOn: g.joinedOn ?? '2026-01-01',
          leftOn: g.leftOn ?? null,
        })),
      },
    },
  });
}

export function pay(db: PrismaClient, studentId: number, amount: number, date: string) {
  return db.payment.create({ data: { studentId, amount, date } });
}
