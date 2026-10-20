import type { PrismaClient } from '@prisma/client';
import { monthLedger, type ChargeLine } from '../lib/ledger.js';
import { studentCode } from '../lib/studentCode.js';
import type { LedgerLoader } from './ledger.js';

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

export function createDebtorService(db: PrismaClient, load: LedgerLoader) {
  return {
    /**
     * Должники за месяц: начислено по группам (пропорционально дням участия, по цене этого месяца)
     * больше, чем оплачено в этом месяце. Оплата относится к месяцу по своей дате, переплата не переносится.
     */
    async report(month: string): Promise<DebtorsReport> {
      const { enrollments, payments } = await load(month, month);
      const owing = [...monthLedger(enrollments, payments, month).values()].filter((e) => e.due > e.paid);
      const students = await db.student.findMany({
        where: { id: { in: owing.map((e) => e.studentId) } },
        select: { id: true, name: true, phone: true, deletedAt: true },
      });
      const byId = new Map(students.map((s) => [s.id, s]));

      const debtors = owing
        .map((e) => {
          const s = byId.get(e.studentId)!;
          return {
            id: s.id,
            code: studentCode(s.id),
            name: s.name,
            phone: s.phone,
            due: e.due,
            paid: e.paid,
            debt: e.due - e.paid,
            deleted: s.deletedAt !== null,
            groups: e.lines,
          };
        })
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
      const { enrollments, payments } = await load(month, month, studentId);
      const e = monthLedger(enrollments, payments, month).get(studentId);
      const due = e?.due ?? 0;
      const paid = e?.paid ?? 0;
      return { due, paid, debt: Math.max(due - paid, 0) };
    },
  };
}
