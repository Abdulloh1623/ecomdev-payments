import type { Prisma, PrismaClient } from '@prisma/client';
import { conflict, notFound } from '../errors.js';
import { priceForMonth } from '../lib/billing.js';
import { currentMonth } from '../lib/dates.js';
import { studentCode } from '../lib/studentCode.js';
import type { GroupInput, GroupUpdate } from '../schemas.js';

const groupInclude = {
  subject: { select: { name: true } },
  prices: { orderBy: { fromMonth: 'asc' } },
  _count: { select: { enrollments: { where: { leftOn: null } } } },
} as const satisfies Prisma.GroupInclude;

type GroupRow = Prisma.GroupGetPayload<{ include: typeof groupInclude }>;

const toDto = (g: GroupRow, month: string) => ({
  id: g.id,
  subjectId: g.subjectId,
  subjectName: g.subject.name,
  name: g.name,
  teacher: g.teacher,
  schedule: g.schedule,
  monthlyPrice: priceForMonth(g.prices, month),
  studentCount: g._count.enrollments,
  createdAt: g.createdAt.toISOString(),
});

// Пустая строка в необязательном поле — то же, что «очистить»
const cleanText = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);

export function createGroupService(db: PrismaClient, timezone: string) {
  const month = () => currentMonth(timezone);

  async function findActive(id: number) {
    const g = await db.group.findFirst({
      where: { id, deletedAt: null, subject: { deletedAt: null } },
      include: groupInclude,
    });
    if (!g) throw notFound('Группа');
    return g;
  }

  async function assertSubject(subjectId: number) {
    const s = await db.subject.findFirst({ where: { id: subjectId, deletedAt: null }, select: { id: true } });
    if (!s) throw notFound('Предмет');
  }

  async function assertUniqueName(subjectId: number, name: string, exceptId?: number) {
    const same = await db.group.findMany({ where: { subjectId, deletedAt: null }, select: { id: true, name: true } });
    if (same.some((g) => g.id !== exceptId && g.name.toLowerCase() === name.toLowerCase())) {
      throw conflict(`Группа «${name}» уже есть в этом предмете`);
    }
  }

  async function get(id: number) {
    const g = await findActive(id);
    const enrollments = await db.enrollment.findMany({
      where: { groupId: id, leftOn: null },
      orderBy: { student: { name: 'asc' } },
      include: { student: { select: { id: true, name: true, phone: true } } },
    });
    return {
      ...toDto(g, month()),
      prices: g.prices.map((p) => ({ amount: p.amount, fromMonth: p.fromMonth })),
      students: enrollments.map((e) => ({
        id: e.student.id,
        code: studentCode(e.student.id),
        name: e.student.name,
        phone: e.student.phone,
        joinedOn: e.joinedOn,
      })),
    };
  }

  return {
    get,

    async list(filter: { subjectId?: number } = {}) {
      const rows = await db.group.findMany({
        where: { deletedAt: null, subject: { deletedAt: null }, subjectId: filter.subjectId },
        orderBy: [{ subject: { name: 'asc' } }, { name: 'asc' }],
        include: groupInclude,
      });
      const m = month();
      return rows.map((g) => toDto(g, m));
    },

    async create(input: GroupInput) {
      await assertSubject(input.subjectId);
      await assertUniqueName(input.subjectId, input.name);
      const g = await db.group.create({
        data: {
          subjectId: input.subjectId,
          name: input.name,
          teacher: cleanText(input.teacher),
          schedule: cleanText(input.schedule),
          prices: { create: { amount: input.monthlyPrice, fromMonth: month() } },
        },
      });
      return get(g.id);
    },

    async update(id: number, input: GroupUpdate) {
      const current = await findActive(id);
      const subjectId = input.subjectId ?? current.subjectId;
      if (input.subjectId !== undefined) await assertSubject(input.subjectId);
      if (input.name !== undefined || input.subjectId !== undefined) {
        await assertUniqueName(subjectId, input.name ?? current.name, id);
      }

      await db.$transaction(async (tx) => {
        await tx.group.update({
          where: { id },
          data: {
            subjectId: input.subjectId,
            name: input.name,
            teacher: cleanText(input.teacher),
            schedule: cleanText(input.schedule),
          },
        });
        if (input.monthlyPrice !== undefined) {
          const fromMonth = input.priceFrom ?? month();
          await tx.groupPrice.upsert({
            where: { groupId_fromMonth: { groupId: id, fromMonth } },
            create: { groupId: id, fromMonth, amount: input.monthlyPrice },
            update: { amount: input.monthlyPrice },
          });
        }
      });
      return get(id);
    },

    /** Удалить можно только группу без учеников; история участия сохраняется. */
    async remove(id: number) {
      const g = await findActive(id);
      if (g._count.enrollments > 0) {
        throw conflict(`В группе есть ученики (${g._count.enrollments}) — сначала переведите их`);
      }
      await db.group.update({ where: { id }, data: { deletedAt: new Date() } });
    },
  };
}
