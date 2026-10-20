import { describe, expect, it } from 'vitest';
import { currentMonth } from '../src/lib/dates.js';
import { makeGroup, makeStudent, pay, setupTestApp, TZ } from './helpers.js';

const t = setupTestApp();

async function debtors(month?: string) {
  const res = await t.app.inject({ method: 'GET', url: month ? `/debtors?month=${month}` : '/debtors' });
  return { status: res.statusCode, body: res.json() };
}

const ids = (list: { id: number }[]) => list.map((d) => d.id);

describe('GET /debtors', () => {
  it('ученик без оплат должен цену группы за полный месяц', async () => {
    const g = await makeGroup(t.db, { price: 400_000 });
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    const { status, body } = await debtors('2026-03');
    expect(status).toBe(200);
    expect(body.debtors).toEqual([
      expect.objectContaining({ id: s.id, code: `ST-${String(s.id).padStart(4, '0')}`, due: 400_000, paid: 0, debt: 400_000 }),
    ]);
    expect(body.debtors[0].groups).toEqual([
      expect.objectContaining({ groupId: g.id, price: 400_000, days: 31, charge: 400_000 }),
    ]);
  });

  it('несколько групп — начисления суммируются', async () => {
    const a = await makeGroup(t.db, { price: 500_000 });
    const b = await makeGroup(t.db, { price: 400_000 });
    await makeStudent(t.db, { groups: [{ groupId: a.id }, { groupId: b.id }] });
    const { body } = await debtors('2026-03');
    expect(body.debtors[0]).toMatchObject({ due: 900_000, debt: 900_000 });
    expect(body.debtors[0].groups).toHaveLength(2);
  });

  it('частичная оплата — долг равен остатку, несколько оплат суммируются', async () => {
    const g = await makeGroup(t.db, { price: 500_000 });
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    await pay(t.db, s.id, 100_000, '2026-03-02');
    await pay(t.db, s.id, 150_000, '2026-03-20');
    expect((await debtors('2026-03')).body.debtors[0]).toMatchObject({ paid: 250_000, debt: 250_000 });
  });

  it('полная оплата и переплата — не должник; переплата не переносится', async () => {
    const g = await makeGroup(t.db, { price: 500_000 });
    const full = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    const over = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    await pay(t.db, full.id, 500_000, '2026-03-10');
    await pay(t.db, over.id, 1_000_000, '2026-03-10');
    expect((await debtors('2026-03')).body.count).toBe(0);
    expect(ids((await debtors('2026-04')).body.debtors).sort()).toEqual([full.id, over.id].sort());
  });

  it('оплата относится к месяцу по дате: границы месяца', async () => {
    const g = await makeGroup(t.db, { price: 300_000 });
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id }] });
    await pay(t.db, s.id, 100_000, '2026-02-28');
    await pay(t.db, s.id, 100_000, '2026-03-01');
    await pay(t.db, s.id, 100_000, '2026-03-31');
    await pay(t.db, s.id, 100_000, '2026-04-01');
    expect((await debtors('2026-03')).body.debtors[0]).toMatchObject({ paid: 200_000, debt: 100_000 });
  });

  it('пришёл в середине месяца — начисление пропорционально дням', async () => {
    const g = await makeGroup(t.db, { price: 310_000 });
    await makeStudent(t.db, { groups: [{ groupId: g.id, joinedOn: '2026-03-16' }] });
    // 16 дней из 31
    const line = (await debtors('2026-03')).body.debtors[0].groups[0];
    expect(line).toMatchObject({ days: 16, charge: 160_000 });
    expect((await debtors('2026-02')).body.count).toBe(0);
    expect((await debtors('2026-04')).body.debtors[0].due).toBe(310_000);
  });

  it('ушёл в середине месяца — день ухода не оплачивается, дальше не начисляется', async () => {
    const g = await makeGroup(t.db, { price: 310_000 });
    await makeStudent(t.db, { groups: [{ groupId: g.id, leftOn: '2026-03-11' }] });
    expect((await debtors('2026-03')).body.debtors[0].groups[0]).toMatchObject({ days: 10, charge: 100_000 });
    expect((await debtors('2026-04')).body.count).toBe(0);
  });

  it('перевод между группами в середине месяца — две строки начислений', async () => {
    const from = await makeGroup(t.db, { price: 310_000 });
    const to = await makeGroup(t.db, { price: 620_000 });
    await makeStudent(t.db, {
      groups: [
        { groupId: from.id, leftOn: '2026-03-21' },
        { groupId: to.id, joinedOn: '2026-03-21' },
      ],
    });
    const d = (await debtors('2026-03')).body.debtors[0];
    // 20 дней × 10 000 + 11 дней × 20 000
    expect(d.due).toBe(200_000 + 220_000);
  });

  it('цена берётся по истории: действует с fromMonth, самая ранняя — и для прошлых месяцев', async () => {
    const g = await makeGroup(t.db, {
      prices: [
        ['2026-02', 400_000],
        ['2026-04', 450_000],
      ],
    });
    await makeStudent(t.db, { groups: [{ groupId: g.id, joinedOn: '2025-12-01' }] });
    const due = async (m: string) => (await debtors(m)).body.debtors[0].due;
    expect(await due('2025-12')).toBe(400_000);
    expect(await due('2026-03')).toBe(400_000);
    expect(await due('2026-04')).toBe(450_000);
    expect(await due('2026-09')).toBe(450_000);
  });

  it('ученик без групп в отчёт не попадает', async () => {
    await makeStudent(t.db);
    expect((await debtors('2026-03')).body.count).toBe(0);
  });

  it('удалённый ученик виден в месяцах, когда учился, с флагом deleted', async () => {
    const g = await makeGroup(t.db);
    const s = await makeStudent(t.db, { groups: [{ groupId: g.id, leftOn: '2026-03-15' }], deletedOn: '2026-03-15' });
    expect((await debtors('2026-03')).body.debtors).toEqual([expect.objectContaining({ id: s.id, deleted: true })]);
    expect((await debtors('2026-04')).body.count).toBe(0);
  });

  it('сортировка по убыванию долга, итоги считаются', async () => {
    const cheap = await makeGroup(t.db, { price: 100_000 });
    const pricey = await makeGroup(t.db, { price: 900_000 });
    const small = await makeStudent(t.db, { groups: [{ groupId: cheap.id }] });
    const big = await makeStudent(t.db, { groups: [{ groupId: pricey.id }] });
    const { body } = await debtors('2026-03');
    expect(ids(body.debtors)).toEqual([big.id, small.id]);
    expect(body).toMatchObject({ month: '2026-03', count: 2, totalDebt: 1_000_000 });
  });

  it('без month — текущий месяц', async () => {
    expect((await debtors()).body.month).toBe(currentMonth(TZ));
  });

  it.each(['2026-13', '2026-3', '26-03', 'abc', '2026-03-01'])('некорректный month=%s → 400', async (month) => {
    const { status, body } = await debtors(month);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
