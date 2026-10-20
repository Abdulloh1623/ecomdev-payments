import type { PrismaClient } from '@prisma/client';
import { activeDays, daysInMonth, priceForMonth, proratedCharge } from '../lib/billing.js';
import { monthDateRange } from '../lib/dates.js';
import { studentCode } from '../lib/studentCode.js';

export interface ChargeLine {
  groupId: number;
  name: string;
  subjectName: string;
  price: number;
  days: number;
  charge: number;
}

export interface Debtor {
  id: number;
  code: string;
  name: string;
  phone: string;
  due: number;
  paid: number;
  debt: number;
  deleted: boolean;
  groups: ChargeLine[];
}

export interface DebtorsReport {
  month: string;
  count: number;
  totalDebt: number;
  debtors: Debtor[];
}

export function createDebtorService(db: PrismaClient) {
  /** Начисления за месяц по участиям в группах, сгруппированные по ученикам. */
  async function charges(month: string, studentId?: number): Promise<Map<number, ChargeLine[]>> {
    const { from, to } = monthDateRange(month);
    const enrollments = await db.enrollment.findMany({
      where: {
        studentId,
        joinedOn: { lt: to },
        OR: [{ leftOn: null }, { leftOn: { gt: from } }],
      },
      orderBy: [{ joinedOn: 'asc' }, { id: 'asc' }],
      include: {
        group: {
          select: { id: true, name: true, subject: { select: { name: true } }, prices: { select: { amount: true, fromMonth: true } } },
        },
      },
    });

    const total = daysInMonth(month);
    const byStudent = new Map<number, ChargeLine[]>();
    for (const e of enrollments) {
      const price = priceForMonth(e.group.prices, month);
      const days = activeDays(e.joinedOn, e.leftOn, month);
      if (days === 0) continue;
      const lines = byStudent.get(e.studentId) ?? [];
      lines.push({
        groupId: e.group.id,
        name: e.group.name,
        subjectName: e.group.subject.name,
        price,
        days,
        charge: proratedCharge(price, days, total),
      });
      byStudent.set(e.studentId, lines);
    }
    return byStudent;
  }

  async function paidByStudent(month: string, studentIds: number[]) {
    const { from, to } = monthDateRange(month);
    const sums = await db.payment.groupBy({
      by: ['studentId'],
      where: { date: { gte: from, lt: to }, studentId: { in: studentIds } },
      _sum: { amount: true },
    });
    return new Map(sums.map((s) => [s.studentId, s._sum.amount ?? 0]));
  }

  return {
    /**
     * Должники за месяц: начислено по группам (пропорционально дням участия, по цене этого месяца)
     * больше, чем оплачено в этом месяце. Оплата относится к месяцу по своей дате, переплата не переносится.
     */
    async report(month: string): Promise<DebtorsReport> {
      const byStudent = await charges(month);
      const ids = [...byStudent.keys()];
      const [students, paidBy] = await Promise.all([
        db.student.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true, deletedAt: true } }),
        paidByStudent(month, ids),
      ]);

      const debtors = students
        .map((s) => {
          const groups = byStudent.get(s.id) ?? [];
          const due = groups.reduce((sum, g) => sum + g.charge, 0);
          const paid = paidBy.get(s.id) ?? 0;
          return {
            id: s.id,
            code: studentCode(s.id),
            name: s.name,
            phone: s.phone,
            due,
            paid,
            debt: due - paid,
            deleted: s.deletedAt !== null,
            groups,
          };
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

    /** Начислено, оплачено и остаток долга ученика за месяц (для ответа бота). */
    async studentMonth(studentId: number, month: string) {
      const lines = (await charges(month, studentId)).get(studentId) ?? [];
      const due = lines.reduce((sum, g) => sum + g.charge, 0);
      const paid = (await paidByStudent(month, [studentId])).get(studentId) ?? 0;
      return { due, paid, debt: Math.max(due - paid, 0) };
    },
  };
}
