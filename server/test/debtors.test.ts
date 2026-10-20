import { describe, expect, it } from 'vitest';
import { currentMonth } from '../src/lib/dates.js';
import { makeStudent, pay, setupTestApp, TZ } from './helpers.js';

const t = setupTestApp();

async function debtors(month?: string) {
  const res = await t.app.inject({ method: 'GET', url: month ? `/debtors?month=${month}` : '/debtors' });
  return { status: res.statusCode, body: res.json() };
}

describe('GET /debtors', () => {
  it('ученик без оплат должен всю месячную сумму', async () => {
    const s = await makeStudent(t.db, { monthlyFee: 400_000 });
    const { status, body } = await debtors('2026-03');
    expect(status).toBe(200);
    expect(body.debtors).toEqual([expect.objectContaining({ id: s.id, monthlyFee: 400_000, paid: 0, debt: 400_000 })]);
  });

  it('частичная оплата — долг равен остатку, несколько оплат суммируются', async () => {
    const s = await makeStudent(t.db, { monthlyFee: 500_000 });
    await pay(t.db, s.id, 100_000, '2026-03-02');
    await pay(t.db, s.id, 150_000, '2026-03-20');
    const { body } = await debtors('2026-03');
    expect(body.debtors[0]).toMatchObject({ paid: 250_000, debt: 250_000 });
  });

  it('полная оплата и переплата — не должник', async () => {
    const full = await makeStudent(t.db, { monthlyFee: 500_000 });
    const over = await makeStudent(t.db, { monthlyFee: 500_000 });
    await pay(t.db, full.id, 500_000, '2026-03-10');
    await pay(t.db, over.id, 700_000, '2026-03-10');
    const { body } = await debtors('2026-03');
    expect(body.count).toBe(0);
    expect(body.debtors).toEqual([]);
  });

  it('переплата не переносится на следующий месяц', async () => {
    const s = await makeStudent(t.db, { monthlyFee: 500_000 });
    await pay(t.db, s.id, 1_000_000, '2026-03-10');
    const { body } = await debtors('2026-04');
    expect(body.debtors[0]).toMatchObject({ id: s.id, paid: 0, debt: 500_000 });
  });

  it('оплата относится к месяцу по дате: границы месяца', async () => {
    const s = await makeStudent(t.db, { monthlyFee: 300_000 });
    await pay(t.db, s.id, 100_000, '2026-02-28'); // прошлый месяц
    await pay(t.db, s.id, 100_000, '2026-03-01'); // первый день
    await pay(t.db, s.id, 100_000, '2026-03-31'); // последний день
    await pay(t.db, s.id, 100_000, '2026-04-01'); // следующий месяц
    const { body } = await debtors('2026-03');
    expect(body.debtors[0]).toMatchObject({ paid: 200_000, debt: 100_000 });
  });

  it('ученик, записанный позже месяца, в отчёт не попадает', async () => {
    await makeStudent(t.db, { createdOn: '2026-04-15' });
    expect((await debtors('2026-03')).body.count).toBe(0);
    expect((await debtors('2026-04')).body.count).toBe(1);
  });

  it('удалённый до начала месяца не попадает, удалённый в течение месяца — попадает', async () => {
    await makeStudent(t.db, { deletedOn: '2026-02-20' });
    const leftInMarch = await makeStudent(t.db, { deletedOn: '2026-03-15' });
    expect((await debtors('2026-03')).body.debtors.map((d: { id: number }) => d.id)).toEqual([leftInMarch.id]);
    expect((await debtors('2026-04')).body.count).toBe(0);
  });

  it('сортировка по убыванию долга, итоги считаются', async () => {
    const small = await makeStudent(t.db, { monthlyFee: 100_000 });
    const big = await makeStudent(t.db, { monthlyFee: 900_000 });
    const { body } = await debtors('2026-03');
    expect(body.debtors.map((d: { id: number }) => d.id)).toEqual([big.id, small.id]);
    expect(body).toMatchObject({ month: '2026-03', count: 2, totalDebt: 1_000_000 });
  });

  it('без month — текущий месяц', async () => {
    const { body } = await debtors();
    expect(body.month).toBe(currentMonth(TZ));
  });

  it.each(['2026-13', '2026-3', '26-03', 'abc', '2026-03-01'])('некорректный month=%s → 400', async (month) => {
    const { status, body } = await debtors(month);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
