import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError, notFound } from '../errors.js';
import { priceForMonth } from '../lib/billing.js';
import { currentMonth, todayIn } from '../lib/dates.js';
import { studentCode } from '../lib/studentCode.js';
import type { StudentInput, StudentUpdate } from '../schemas.js';

type Tx = Prisma.TransactionClient;

const studentInclude = {
  enrollments: {
    where: { leftOn: null },
    orderBy: [{ joinedOn: 'asc' }, { id: 'asc' }],
    include: { group: { include: { subject: { select: { name: true } }, prices: true } } },
  },
} as const satisfies Prisma.StudentInclude;

type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

function toDto(s: StudentRow, month: string) {
  const groups = s.enrollments.map((e) => ({
    id: e.group.id,
    name: e.group.name,
    subjectId: e.group.subjectId,
    subjectName: e.group.subject.name,
    monthlyPrice: priceForMonth(e.group.prices, month),
    joinedOn: e.joinedOn,
  }));
  return {
    id: s.id,
    code: studentCode(s.id),
    name: s.name,
    phone: s.phone,
    monthlyFee: groups.reduce((sum, g) => sum + g.monthlyPrice, 0),
    groups,
    createdAt: s.createdAt.toISOString(),
  };
}
export type StudentDto = ReturnType<typeof toDto>;

/**
 * Закрывает участия в группах с даты `on`. Участие, которое ещё не началось
 * (joinedOn >= on), просто удаляется — иначе получился бы пустой интервал.
 */
export async function closeEnrollments(tx: Tx, where: Prisma.EnrollmentWhereInput, on: string) {
  await tx.enrollment.deleteMany({ where: { ...where, leftOn: null, joinedOn: { gte: on } } });
  await tx.enrollment.updateMany({ where: { ...where, leftOn: null }, data: { leftOn: on } });
}

/** Проверяет, что все группы существуют и не удалены (вместе с предметом). */
async function assertGroupsAvailable(tx: Tx, ids: number[]) {
  const found = await tx.group.findMany({
    where: { id: { in: ids }, deletedAt: null, subject: { deletedAt: null } },
    select: { id: true },
  });
  const missing = ids.filter((id) => !found.some((g) => g.id === id));
  if (missing.length) {
    throw new AppError(400, 'INVALID_GROUP', `Группа не найдена или удалена: ${missing.join(', ')}`);
  }
}

export function createStudentService(db: PrismaClient, timezone: string) {
  const today = () => todayIn(timezone);

  async function getActive(client: Tx | PrismaClient, id: number) {
    const student = await client.student.findFirst({ where: { id, deletedAt: null }, include: studentInclude });
    if (!student) throw notFound('Ученик');
    return toDto(student, currentMonth(timezone));
  }

  return {
    async list(filter: { groupId?: number; subjectId?: number } = {}): Promise<StudentDto[]> {
      const enrollment: Prisma.EnrollmentWhereInput = { leftOn: null };
      if (filter.groupId) enrollment.groupId = filter.groupId;
      if (filter.subjectId) enrollment.group = { subjectId: filter.subjectId };

      const rows = await db.student.findMany({
        where: {
          deletedAt: null,
          ...(filter.groupId || filter.subjectId ? { enrollments: { some: enrollment } } : {}),
        },
        orderBy: { id: 'asc' },
        include: studentInclude,
      });
      const month = currentMonth(timezone);
      return rows.map((s) => toDto(s, month));
    },

    get: (id: number) => getActive(db, id),

    async create(input: StudentInput): Promise<StudentDto> {
      const groupIds = [...new Set(input.groupIds)];
      const joinedOn = input.joinedOn ?? today();
      return db.$transaction(async (tx) => {
        await assertGroupsAvailable(tx, groupIds);
        const student = await tx.student.create({ data: { name: input.name, phone: input.phone } });
        await tx.enrollment.createMany({
          data: groupIds.map((groupId) => ({ studentId: student.id, groupId, joinedOn })),
        });
        return getActive(tx, student.id);
      });
    },

    async update(id: number, input: StudentUpdate): Promise<StudentDto> {
      return db.$transaction(async (tx) => {
        const current = await getActive(tx, id);
        if (input.name !== undefined || input.phone !== undefined) {
          await tx.student.update({ where: { id }, data: { name: input.name, phone: input.phone } });
        }

        if (input.groupIds) {
          const on = input.effectiveOn ?? today();
          const wanted = [...new Set(input.groupIds)];
          const currentIds = current.groups.map((g) => g.id);
          const removed = currentIds.filter((g) => !wanted.includes(g));
          const added = wanted.filter((g) => !currentIds.includes(g));

          if (removed.length) await closeEnrollments(tx, { studentId: id, groupId: { in: removed } }, on);
          if (added.length) {
            await assertGroupsAvailable(tx, added);
            await tx.enrollment.createMany({ data: added.map((groupId) => ({ studentId: id, groupId, joinedOn: on })) });
          }
        }
        return getActive(tx, id);
      });
    },

    /** Мягкое удаление: ученик выбывает из всех групп сегодняшним днём, оплаты остаются. */
    async remove(id: number): Promise<void> {
      await db.$transaction(async (tx) => {
        const { count } = await tx.student.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
        if (count === 0) throw notFound('Ученик');
        await closeEnrollments(tx, { studentId: id }, today());
      });
    },
  };
}
