import type { PrismaClient } from '@prisma/client';
import { monthDateRange } from '../lib/dates.js';
import type { EnrollmentRow, PaymentRow } from '../lib/ledger.js';

/** Загружает участия и оплаты, пересекающиеся с месяцами [fromMonth, toMonth]. */
export function createLedgerLoader(db: PrismaClient) {
  return async function load(fromMonth: string, toMonth: string, studentId?: number) {
    const from = monthDateRange(fromMonth).from;
    const to = monthDateRange(toMonth).to;

    const [enrollments, payments] = await Promise.all([
      db.enrollment.findMany({
        where: { studentId, joinedOn: { lt: to }, OR: [{ leftOn: null }, { leftOn: { gt: from } }] },
        orderBy: [{ joinedOn: 'asc' }, { id: 'asc' }],
        select: {
          studentId: true,
          joinedOn: true,
          leftOn: true,
          group: {
            select: {
              id: true,
              name: true,
              subjectId: true,
              subject: { select: { name: true } },
              prices: { select: { amount: true, fromMonth: true } },
            },
          },
        },
      }),
      db.payment.findMany({
        where: { studentId, date: { gte: from, lt: to } },
        select: { studentId: true, amount: true, date: true },
      }),
    ]);

    const rows: EnrollmentRow[] = enrollments.map((e) => ({
      studentId: e.studentId,
      joinedOn: e.joinedOn,
      leftOn: e.leftOn,
      group: {
        id: e.group.id,
        name: e.group.name,
        subjectId: e.group.subjectId,
        subjectName: e.group.subject.name,
        prices: e.group.prices,
      },
    }));
    return { enrollments: rows, payments: payments as PaymentRow[] };
  };
}

export type LedgerLoader = ReturnType<typeof createLedgerLoader>;
