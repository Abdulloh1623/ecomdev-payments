import type { PrismaClient } from '@prisma/client';
import { monthDateRange, zonedStartOfDay } from '../lib/dates.js';

export interface Debtor {
  id: number;
  name: string;
  phone: string;
  group: string;
  monthlyFee: number;
  paid: number;
  debt: number;
  deleted: boolean;
}

export interface DebtorsReport {
  month: string;
  count: number;
  totalDebt: number;
  debtors: Debtor[];
}

export function createDebtorService(db: PrismaClient, timezone: string) {
  return {
    /**
     * Должники за месяц: ученики, заплатившие в этом месяце меньше своей месячной суммы.
     * Оплата относится к месяцу по своей дате. Учитываются ученики, которые уже были
     * записаны в этом месяце и не были удалены до его начала. Переплата не переносится.
     */
    async report(month: string): Promise<DebtorsReport> {
      const { from, to } = monthDateRange(month);
      const monthStart = zonedStartOfDay(from, timezone);
      const nextMonthStart = zonedStartOfDay(to, timezone);

      const students = await db.student.findMany({
        where: {
          createdAt: { lt: nextMonthStart },
          OR: [{ deletedAt: null }, { deletedAt: { gte: monthStart } }],
        },
        select: { id: true, name: true, phone: true, group: true, monthlyFee: true, deletedAt: true },
      });

      const sums = await db.payment.groupBy({
        by: ['studentId'],
        where: { date: { gte: from, lt: to }, studentId: { in: students.map((s) => s.id) } },
        _sum: { amount: true },
      });
      const paidBy = new Map(sums.map((s) => [s.studentId, s._sum.amount ?? 0]));

      const debtors = students
        .map(({ deletedAt, ...s }) => {
          const paid = paidBy.get(s.id) ?? 0;
          return { ...s, paid, debt: s.monthlyFee - paid, deleted: deletedAt !== null };
        })
        .filter((d) => d.debt > 0)
        .sort((a, b) => b.debt - a.debt || a.id - b.id);

      return {
        month,
        count: debtors.length,
        totalDebt: debtors.reduce((sum, d) => sum + d.debt, 0),
        debtors,
      };
    },

    /** Сколько ученик заплатил за месяц и сколько ещё должен (для ответа бота). */
    async balance(studentId: number, monthlyFee: number, month: string) {
      const { from, to } = monthDateRange(month);
      const agg = await db.payment.aggregate({
        where: { studentId, date: { gte: from, lt: to } },
        _sum: { amount: true },
      });
      const paid = agg._sum.amount ?? 0;
      return { paid, debt: Math.max(monthlyFee - paid, 0) };
    },
  };
}
