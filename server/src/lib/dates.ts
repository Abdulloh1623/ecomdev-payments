// Месяц — строка YYYY-MM, дата оплаты — строка YYYY-MM-DD.
// Такие строки сравниваются лексикографически так же, как хронологически.

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Проверяет, что строка — реально существующая дата (например, не 2026-02-30). */
export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Месяцы от from до to включительно. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from; m <= to; m = nextMonth(m)) months.push(m);
  return months;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Диапазон дат месяца [from, to) для фильтрации оплат. */
export function monthDateRange(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${nextMonth(month)}-01` };
}

/** Сегодняшняя дата YYYY-MM-DD в часовом поясе tz. */
export function todayIn(tz: string, now: Date = new Date()): string {
  // Локаль en-CA форматирует дату как YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

export function currentMonth(tz: string, now: Date = new Date()): string {
  return todayIn(tz, now).slice(0, 7);
}

function tzOffsetMs(instant: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Момент начала дня YYYY-MM-DD в часовом поясе tz (для сравнения с createdAt/deletedAt). */
export function zonedStartOfDay(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Второй проход учитывает переход на летнее время в самой точке
  const firstGuess = utcMidnight - tzOffsetMs(new Date(utcMidnight), tz);
  return new Date(utcMidnight - tzOffsetMs(new Date(firstGuess), tz));
}
