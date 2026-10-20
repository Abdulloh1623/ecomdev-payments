// Месячная ведомость: начисления по группам и оплаты каждого ученика. Чистые функции без БД —
// на них построены и отчёт должников, и аналитика, поэтому цифры везде совпадают.
import { activeDays, daysInMonth, priceForMonth, proratedCharge, type PricePoint } from './billing.js';
import { monthDateRange } from './dates.js';

export interface EnrollmentRow {
  studentId: number;
  joinedOn: string;
  leftOn: string | null;
  group: { id: number; name: string; subjectId: number; subjectName: string; prices: PricePoint[] };
}

export interface PaymentRow {
  studentId: number;
  amount: number;
  date: string;
}

export interface ChargeLine {
  groupId: number;
  name: string;
  subjectId: number;
  subjectName: string;
  price: number;
  days: number;
  charge: number;
}

export interface StudentMonth {
  studentId: number;
  lines: ChargeLine[];
  due: number;
  paid: number;
}

/** Ведомость за месяц: ученики с начислениями и/или оплатами в этом месяце. */
export function monthLedger(enrollments: EnrollmentRow[], payments: PaymentRow[], month: string) {
  const total = daysInMonth(month);
  const { from, to } = monthDateRange(month);
  const ledger = new Map<number, StudentMonth>();
  const entry = (studentId: number) => {
    let e = ledger.get(studentId);
    if (!e) ledger.set(studentId, (e = { studentId, lines: [], due: 0, paid: 0 }));
    return e;
  };

  for (const en of enrollments) {
    const days = activeDays(en.joinedOn, en.leftOn, month);
    if (days === 0) continue;
    const price = priceForMonth(en.group.prices, month);
    const charge = proratedCharge(price, days, total);
    const e = entry(en.studentId);
    e.lines.push({
      groupId: en.group.id,
      name: en.group.name,
      subjectId: en.group.subjectId,
      subjectName: en.group.subjectName,
      price,
      days,
      charge,
    });
    e.due += charge;
  }

  for (const p of payments) {
    if (p.date >= from && p.date < to) entry(p.studentId).paid += p.amount;
  }
  return ledger;
}

/**
 * Делит оплату ученика между его группами пропорционально начислениям.
 * Распределяется не больше начисленного; остаток (переплата) возвращается отдельно.
 * Сумма долей всегда равна распределённой сумме (остаток от округления — последней группе).
 */
export function allocatePayment(e: StudentMonth): { shares: number[]; unallocated: number } {
  const allocatable = Math.min(e.paid, e.due);
  const shares = e.lines.map(() => 0);
  if (allocatable > 0) {
    let rest = allocatable;
    e.lines.forEach((line, i) => {
      const share = i === e.lines.length - 1 ? rest : Math.floor((allocatable * line.charge) / e.due);
      shares[i] = share;
      rest -= share;
    });
  }
  return { shares, unallocated: e.paid - allocatable };
}
