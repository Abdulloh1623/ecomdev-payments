const money = new Intl.NumberFormat('ru-RU');

export const fmtMoney = (n: number) => money.format(n);

const pad = (n: number) => String(n).padStart(2, '0');

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const currentMonth = () => today().slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
}

export function fmtDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

/** Оставляет только цифры: «500 000» → 500000. */
export function parseAmount(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
