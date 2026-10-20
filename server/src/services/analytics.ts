import type { PrismaClient } from '@prisma/client';
import { daysInMonth } from '../lib/billing.js';
import { addDays, monthDateRange, monthsBetween } from '../lib/dates.js';
import { allocatePayment, monthLedger } from '../lib/ledger.js';
import type { LedgerLoader } from './ledger.js';

/** Собираемость в процентах с одним знаком; null, если ничего не начислено. */
const rate = (collected: number, due: number) => (due > 0 ? Math.round((collected / due) * 1000) / 10 : null);

export function createAnalyticsService(db: PrismaClient, load: LedgerLoader) {
  /**
   * Для каждого ученика: месяц первого прихода в центр и месяц ухода
   * (последний учебный день последнего участия; null — если ещё учится).
   */
  async function lifecycle() {
    const [bounds, open] = await Promise.all([
      db.enrollment.groupBy({ by: ['studentId'], _min: { joinedOn: true }, _max: { leftOn: true } }),
      db.enrollment.groupBy({ by: ['studentId'], where: { leftOn: null } }),
    ]);
    const studying = new Set(open.map((o) => o.studentId));
    return bounds.map((b) => ({
      firstMonth: b._min.joinedOn!.slice(0, 7),
      leftMonth: studying.has(b.studentId) || !b._max.leftOn ? null : addDays(b._max.leftOn, -1).slice(0, 7),
    }));
  }

  return {
    /** Динамика по месяцам: деньги и движение учеников. */
    async summary(from: string, to: string) {
      const [{ enrollments, payments }, life] = await Promise.all([load(from, to), lifecycle()]);

      const months = monthsBetween(from, to).map((month) => {
        const m = { due: 0, paid: 0, collected: 0, debt: 0, overpaid: 0, active: 0, debtors: 0 };
        for (const e of monthLedger(enrollments, payments, month).values()) {
          m.due += e.due;
          m.paid += e.paid;
          m.collected += Math.min(e.paid, e.due);
          m.debt += Math.max(e.due - e.paid, 0);
          m.overpaid += Math.max(e.paid - e.due, 0);
          if (e.lines.length > 0) m.active += 1;
          if (e.due > e.paid) m.debtors += 1;
        }
        return {
          month,
          due: m.due,
          paid: m.paid,
          collected: m.collected,
          debt: m.debt,
          overpaid: m.overpaid,
          collectionRate: rate(m.collected, m.due),
          activeStudents: m.active,
          newStudents: life.filter((l) => l.firstMonth === month).length,
          leftStudents: life.filter((l) => l.leftMonth === month).length,
          debtors: m.debtors,
        };
      });

      const sum = (key: 'due' | 'paid' | 'collected' | 'debt' | 'overpaid' | 'newStudents' | 'leftStudents') =>
        months.reduce((s, m) => s + m[key], 0);
      const totals = {
        due: sum('due'),
        paid: sum('paid'),
        collected: sum('collected'),
        debt: sum('debt'),
        overpaid: sum('overpaid'),
        collectionRate: rate(sum('collected'), sum('due')),
        newStudents: sum('newStudents'),
        leftStudents: sum('leftStudents'),
      };
      return { from, to, months, totals };
    },

    /**
     * Срез по предметам и группам за месяц. Оплата ученика делится между его группами
     * пропорционально начислениям; переплата и оплаты без групп — в «не распределено».
     */
    async breakdown(month: string) {
      const { enrollments, payments } = await load(month, month);
      const groups = new Map<
        number,
        { groupId: number; name: string; subjectId: number; subjectName: string; students: Set<number>; due: number; paid: number }
      >();
      let unallocated = 0;
      let paidTotal = 0;

      for (const e of monthLedger(enrollments, payments, month).values()) {
        const { shares, unallocated: rest } = allocatePayment(e);
        unallocated += rest;
        paidTotal += e.paid;
        e.lines.forEach((line, i) => {
          let g = groups.get(line.groupId);
          if (!g) {
            g = { ...line, students: new Set(), due: 0, paid: 0 };
            groups.set(line.groupId, g);
          }
          g.students.add(e.studentId);
          g.due += line.charge;
          g.paid += shares[i];
        });
      }

      const groupRows = [...groups.values()];
      const subjects = [...new Set(groupRows.map((g) => g.subjectId))].map((subjectId) => {
        const list = groupRows.filter((g) => g.subjectId === subjectId).sort((a, b) => b.due - a.due);
        const due = list.reduce((s, g) => s + g.due, 0);
        const paid = list.reduce((s, g) => s + g.paid, 0);
        return {
          subjectId,
          name: list[0].subjectName,
          students: new Set(list.flatMap((g) => [...g.students])).size,
          due,
          paid,
          debt: due - paid,
          collectionRate: rate(paid, due),
          groups: list.map((g) => ({
            groupId: g.groupId,
            name: g.name,
            students: g.students.size,
            due: g.due,
            paid: g.paid,
            debt: g.due - g.paid,
            collectionRate: rate(g.paid, g.due),
          })),
        };
      });
      subjects.sort((a, b) => b.due - a.due);

      const due = subjects.reduce((s, x) => s + x.due, 0);
      const debt = subjects.reduce((s, x) => s + x.debt, 0);
      return {
        month,
        totals: { due, paid: paidTotal, debt, unallocated, collectionRate: rate(paidTotal - unallocated, due) },
        subjects,
      };
    },

    /** Оплаты по дням месяца (все дни, включая пустые). */
    async daily(month: string) {
      const { from } = monthDateRange(month);
      const rows = await db.payment.groupBy({
        by: ['date'],
        where: { date: { gte: from, lt: monthDateRange(month).to } },
        _sum: { amount: true },
        _count: true,
      });
      const byDate = new Map(rows.map((r) => [r.date, { amount: r._sum.amount ?? 0, count: r._count }]));
      const days = Array.from({ length: daysInMonth(month) }, (_, i) => {
        const date = addDays(from, i);
        return { date, ...(byDate.get(date) ?? { amount: 0, count: 0 }) };
      });
      return {
        month,
        total: days.reduce((s, d) => s + d.amount, 0),
        count: days.reduce((s, d) => s + d.count, 0),
        days,
      };
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
