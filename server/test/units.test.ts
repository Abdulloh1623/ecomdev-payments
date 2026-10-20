import { describe, expect, it } from 'vitest';
import { parsePayArgs, splitMessage } from '../src/bot.js';
import { activeDays, daysInMonth, priceForMonth, proratedCharge } from '../src/lib/billing.js';
import { toCsv } from '../src/lib/csv.js';
import { allocatePayment } from '../src/lib/ledger.js';
import { isValidDate, monthDateRange, todayIn, zonedStartOfDay } from '../src/lib/dates.js';
import { parseStudentRef, studentCode } from '../src/lib/studentCode.js';

describe('даты', () => {
  it('isValidDate отсекает несуществующие даты', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-04-31')).toBe(false);
    expect(isValidDate('2026-4-01')).toBe(false);
  });

  it('диапазон месяца, в т. ч. декабрь', () => {
    expect(monthDateRange('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });

  it('начало дня в часовом поясе', () => {
    expect(zonedStartOfDay('2026-03-01', 'Asia/Tashkent').toISOString()).toBe('2026-02-28T19:00:00.000Z');
    expect(zonedStartOfDay('2026-03-01', 'UTC').toISOString()).toBe('2026-03-01T00:00:00.000Z');
    // Летнее время: в Берлине 1 апреля уже UTC+2
    expect(zonedStartOfDay('2026-04-01', 'Europe/Berlin').toISOString()).toBe('2026-03-31T22:00:00.000Z');
  });

  it('«сегодня» зависит от часового пояса', () => {
    const lateEveningUtc = new Date('2026-03-31T20:30:00Z');
    expect(todayIn('UTC', lateEveningUtc)).toBe('2026-03-31');
    expect(todayIn('Asia/Tashkent', lateEveningUtc)).toBe('2026-04-01');
  });
});

describe('начисления', () => {
  it('дней в месяце', () => {
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2024-02')).toBe(29);
    expect(daysInMonth('2026-03')).toBe(31);
  });

  it('дни участия: пересечение [joinedOn, leftOn) с месяцем', () => {
    expect(activeDays('2026-01-01', null, '2026-03')).toBe(31);
    expect(activeDays('2026-03-16', null, '2026-03')).toBe(16);
    expect(activeDays('2026-01-01', '2026-03-11', '2026-03')).toBe(10);
    expect(activeDays('2026-03-05', '2026-03-06', '2026-03')).toBe(1);
    expect(activeDays('2026-04-01', null, '2026-03')).toBe(0);
    expect(activeDays('2026-01-01', '2026-03-01', '2026-03')).toBe(0);
  });

  it('цена по истории', () => {
    const prices = [
      { fromMonth: '2026-04', amount: 450 },
      { fromMonth: '2026-02', amount: 400 },
    ];
    expect(priceForMonth(prices, '2025-06')).toBe(400);
    expect(priceForMonth(prices, '2026-03')).toBe(400);
    expect(priceForMonth(prices, '2026-04')).toBe(450);
    expect(priceForMonth([], '2026-04')).toBe(0);
  });

  it('пропорция с округлением; полный месяц — ровно цена', () => {
    expect(proratedCharge(500_000, 31, 31)).toBe(500_000);
    expect(proratedCharge(500_000, 10, 31)).toBe(161_290);
    expect(proratedCharge(1, 1, 3)).toBe(0);
  });
});

describe('распределение оплаты по группам', () => {
  const line = (charge: number) => ({ groupId: charge, name: '', subjectId: 1, subjectName: '', price: charge, days: 1, charge });

  it('пропорционально начислениям, сумма долей равна распределённой', () => {
    const e = { studentId: 1, lines: [line(1), line(1), line(1)], due: 3, paid: 2 };
    const { shares, unallocated } = allocatePayment(e);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(2);
    expect(unallocated).toBe(0);
  });

  it('переплата не распределяется; без групп — всё не распределено', () => {
    expect(allocatePayment({ studentId: 1, lines: [line(500)], due: 500, paid: 700 })).toEqual({
      shares: [500],
      unallocated: 200,
    });
    expect(allocatePayment({ studentId: 1, lines: [], due: 0, paid: 50 })).toEqual({ shares: [], unallocated: 50 });
  });
});

describe('CSV', () => {
  it('BOM, «;», экранирование кавычек и разделителей', () => {
    expect(toCsv(['a', 'b'], [['x;y', 'say "hi"'], [1, null], [29.7, '1.5']])).toBe(
      '﻿a;b\r\n"x;y";"say ""hi"""\r\n1;\r\n29,7;1.5\r\n',
    );
  });
});

describe('код ученика', () => {
  it('формат и разбор', () => {
    expect(studentCode(2)).toBe('ST-0002');
    expect(studentCode(12345)).toBe('ST-12345');
    for (const raw of ['ST-0002', 'st-2', 'ST2', '2', ' 0002 ']) expect(parseStudentRef(raw)).toBe(2);
    for (const raw of ['', 'ST-', 'ST-0', '0', 'abc', 'ST-2a', '-2']) expect(parseStudentRef(raw)).toBeNull();
  });
});

describe('бот: разбор /pay', () => {
  it.each([
    ['ST-0003 500000', { ok: true, studentId: 3, amount: 500_000 }],
    ['3 500000', { ok: true, studentId: 3, amount: 500_000 }],
    ['  st-3   500 000 ', { ok: true, studentId: 3, amount: 500_000 }],
  ])('"%s" — корректно', (raw, expected) => {
    expect(parsePayArgs(raw)).toEqual(expected);
  });

  it.each(['', '3', 'abc 100', '3 -100', '3 10.5', '0 100', 'ST-0 100', '3 0', '3 9999999999'])(
    '"%s" — ошибка',
    (raw) => {
      expect(parsePayArgs(raw).ok).toBe(false);
    },
  );
});

describe('бот: разбиение сообщений', () => {
  it('короткий текст — одно сообщение', () => {
    expect(splitMessage('a\nb', 10)).toEqual(['a\nb']);
  });

  it('длинный текст делится по строкам и не превышает лимит', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `строка ${i}`);
    const chunks = splitMessage(lines.join('\n'), 40);
    expect(chunks.every((c) => c.length <= 40)).toBe(true);
    expect(chunks.join('\n')).toBe(lines.join('\n'));
  });
});
