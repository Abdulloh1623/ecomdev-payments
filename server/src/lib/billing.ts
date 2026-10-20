// Расчёт суммы к оплате за месяц: чистые функции без БД.
import { monthDateRange } from './dates.js';

export interface PricePoint {
  amount: number;
  fromMonth: string;
}

/**
 * Цена группы в месяце: последняя запись с fromMonth <= month.
 * Самая ранняя цена действует и для всех месяцев до неё.
 */
export function priceForMonth(prices: PricePoint[], month: string): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  let price = sorted[0].amount;
  for (const p of sorted) {
    if (p.fromMonth <= month) price = p.amount;
    else break;
  }
  return price;
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

export function daysInMonth(month: string): number {
  const { from, to } = monthDateRange(month);
  return dayNumber(to) - dayNumber(from);
}

/** Сколько дней месяца ученик состоял в группе: пересечение [joinedOn, leftOn) с месяцем. */
export function activeDays(joinedOn: string, leftOn: string | null, month: string): number {
  const { from, to } = monthDateRange(month);
  const start = joinedOn > from ? joinedOn : from;
  const end = leftOn && leftOn < to ? leftOn : to;
  return Math.max(0, dayNumber(end) - dayNumber(start));
}

/** Начисление за месяц пропорционально дням; полный месяц — ровно цена. */
export function proratedCharge(price: number, days: number, totalDays: number): number {
  return Math.round((price * days) / totalDays);
}
