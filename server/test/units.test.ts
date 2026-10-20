import { describe, expect, it } from 'vitest';
import { parsePayArgs, splitMessage } from '../src/bot.js';
import { isValidDate, monthDateRange, todayIn, zonedStartOfDay } from '../src/lib/dates.js';

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

describe('бот: разбор /pay', () => {
  it.each([
    ['3 500000', { ok: true, studentId: 3, amount: 500_000 }],
    ['  3   500 000 ', { ok: true, studentId: 3, amount: 500_000 }],
  ])('"%s" — корректно', (raw, expected) => {
    expect(parsePayArgs(raw)).toEqual(expected);
  });

  it.each(['', '3', 'abc 100', '3 -100', '3 10.5', '0 100', '3 0', '3 9999999999'])('"%s" — ошибка', (raw) => {
    expect(parsePayArgs(raw).ok).toBe(false);
  });
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
